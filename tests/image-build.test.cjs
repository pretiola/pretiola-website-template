const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const sharp = require('sharp');
const { collectImages, selectSources, processImages } = require('../scripts/optimize-images');

async function fixture(t) {
    const inputDir = await fs.mkdtemp(path.join(os.tmpdir(), 'template-images-'));
    t.after(() => fs.rm(inputDir, { recursive: true, force: true }));
    return { inputDir, outputDir: path.join(inputDir, 'optimized'), log() {} };
}

function image(width = 48, height = 32) {
    return sharp({ create: { width, height, channels: 3, background: '#b35e33' } });
}

async function metadata(filename) {
    // Read bytes so libvips cannot reuse a file-loader cache entry after rebuilds.
    return sharp(await fs.readFile(filename)).metadata();
}

test('nested source folders work, sharpened images win, and generated/backup images are excluded', async (t) => {
    const options = await fixture(t);
    await fs.mkdir(path.join(options.inputDir, 'events'));
    await fs.mkdir(options.outputDir);
    await image().jpeg().toFile(path.join(options.inputDir, 'events', 'visit.jpg'));
    await image(64).png().toFile(path.join(options.inputDir, 'events', 'visit_sharpen.png'));
    await fs.writeFile(path.join(options.inputDir, 'visit.orig.jpg'), 'backup');
    await fs.writeFile(path.join(options.outputDir, 'old_400w.jpg'), 'generated');
    const sources = selectSources(await collectImages(options.inputDir, options.outputDir));
    assert.equal(sources.size, 1);
    assert.equal(sources.get('events_visit').relative, path.join('events', 'visit_sharpen.png'));
    const manifest = await processImages(options);
    assert.equal(manifest.images.events_visit.variants.length, 6);
});

test('flattened folder names and ambiguous extensions cannot silently overwrite outputs', () => {
    const source = { basename: 'events_visit', relative: 'events/visit.jpg', identity: 'events/visit', sharpen: false };
    assert.throws(() => selectSources([source, { ...source, identity: 'events_visit', relative: 'events_visit.jpg' }]), /same output name/);
    assert.throws(() => selectSources([source, { ...source, relative: 'events/visit.png' }]), /same output name/);
});

test('EXIF rotation happens before resizing and generated dimensions match srcset widths', async (t) => {
    const options = await fixture(t);
    await image(60, 30).withMetadata({ orientation: 6 }).jpeg().toFile(path.join(options.inputDir, 'portrait.jpg'));
    const manifest = await processImages(options);
    for (const variant of manifest.images.portrait.variants) {
        const actual = await metadata(path.join(options.outputDir, variant.path));
        assert.equal(actual.width, variant.width);
        assert.equal(actual.height, variant.width * 2);
        assert.equal(actual.orientation, undefined);
        assert.match(variant.path, new RegExp(`_${actual.width}w\\.`));
    }
});

test('unchanged builds reuse outputs and changed, missing or corrupt files regenerate', async (t) => {
    const options = await fixture(t);
    const source = path.join(options.inputDir, 'sample.jpg');
    await image().jpeg().toFile(source);
    const first = await processImages(options);
    const output = path.join(options.outputDir, first.images.sample.variants[0].path);
    const marker = new Date('2000-01-01T00:00:00Z');
    await fs.utimes(output, marker, marker);
    await processImages(options);
    assert.equal((await fs.stat(output)).mtimeMs, marker.getTime(), 'cache hit must not rewrite images');
    await fs.writeFile(output, 'corrupted');
    await processImages(options);
    assert.equal((await metadata(output)).width, 400);
    await fs.unlink(output);
    await processImages(options);
    assert.equal((await metadata(output)).width, 400);
    await image(64, 32).jpeg().toFile(source);
    const changed = await processImages(options);
    assert.notEqual(changed.images.sample.key, first.images.sample.key);
    assert.equal((await metadata(output)).height, 200);
});

test('source symlinks are rejected before image generation', async (t) => {
    const options = await fixture(t);
    await fs.symlink(path.join(options.inputDir, 'missing'), path.join(options.inputDir, 'linked.jpg'));
    await assert.rejects(processImages(options), /must not be symlinks/);
});
