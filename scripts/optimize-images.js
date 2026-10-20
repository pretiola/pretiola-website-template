const sharp = require('sharp');
const fs = require('node:fs/promises');
const path = require('node:path');
const { createHash } = require('node:crypto');

const INPUT = path.join(__dirname, '../static/pictures');
const WIDTHS = [400, 800, 1200];
const QUALITY = 80;
const PIPELINE_VERSION = 2;
const digest = (value) => createHash('sha256').update(value).digest('hex');

// Nested folders use the same prefix convention as the original pipeline:
// pictures/events/visit.jpg becomes events_visit_800w.jpg.
async function collectImages(inputDir, outputDir, directory = inputDir) {
    const images = [];
    const entries = await fs.readdir(directory, { withFileTypes: true });
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
        const filename = path.join(directory, entry.name);
        if (path.resolve(filename) === path.resolve(outputDir) || entry.name.startsWith('.')) continue;
        if (entry.isSymbolicLink()) throw new Error(`Image sources must not be symlinks: ${filename}`);
        if (entry.isDirectory()) {
            images.push(...await collectImages(inputDir, outputDir, filename));
        } else if (entry.isFile() && /\.(?:jpe?g|png|webp|avif)$/i.test(entry.name) && !/\.orig\./i.test(entry.name)) {
            const relative = path.relative(inputDir, filename);
            const stem = relative.slice(0, -path.extname(relative).length);
            const sharpen = stem.endsWith('_sharpen');
            const identity = sharpen ? stem.slice(0, -'_sharpen'.length) : stem;
            images.push({ filename, relative, identity, basename: identity.split(path.sep).join('_'), sharpen });
        }
    }
    return images;
}

function selectSources(images) {
    const sources = new Map();
    for (const image of images) {
        const existing = sources.get(image.basename);
        // Flattened prefixes must not silently overwrite unrelated images.
        if (existing && (existing.identity !== image.identity || existing.sharpen === image.sharpen)) {
            throw new Error(`Images map to the same output name "${image.basename}": ${existing.relative}, ${image.relative}`);
        }
        if (!existing || image.sharpen) sources.set(image.basename, image);
    }
    return sources;
}

async function cachedVariantsExist(outputDir, variants) {
    if (!Array.isArray(variants) || variants.length !== WIDTHS.length * 2) return false;
    for (const variant of variants) {
        // The manifest is a generated cache, not authority to read other files.
        if (typeof variant.path !== 'string' || path.basename(variant.path) !== variant.path) return false;
        try {
            const content = await fs.readFile(path.join(outputDir, variant.path));
            if (digest(content) !== variant.hash) return false;
        } catch (error) {
            if (error.code !== 'ENOENT') throw error;
            return false;
        }
    }
    return true;
}

async function processImages({ inputDir = INPUT, outputDir = path.join(inputDir, 'optimized'), log = console.log } = {}) {
    const sources = selectSources(await collectImages(inputDir, outputDir));
    await fs.mkdir(outputDir, { recursive: true });
    const manifestFile = path.join(outputDir, '.manifest.json');
    let previous = {};
    try {
        previous = JSON.parse(await fs.readFile(manifestFile, 'utf8'));
    } catch (error) {
        if (error.code !== 'ENOENT' && !(error instanceof SyntaxError)) throw error;
    }
    const settings = { version: PIPELINE_VERSION, widths: WIDTHS, quality: QUALITY, sharp: sharp.versions };
    const manifest = { ...settings, images: Object.create(null) };
    for (const [basename, source] of sources) {
        const input = await fs.readFile(source.filename);
        const key = digest(Buffer.concat([input, Buffer.from(JSON.stringify(settings))]));
        const cached = previous?.images?.[basename];
        if (cached?.key === key && await cachedVariantsExist(outputDir, cached.variants)) {
            manifest.images[basename] = { ...cached, source: source.relative };
            log(`Cached: ${source.relative}`);
            continue;
        }
        log(`Processing: ${source.relative} -> ${basename}`);
        const variants = [];
        for (const width of WIDTHS) {
            for (const format of ['webp', 'jpg']) {
                // Exact widths preserve the public filenames and existing srcset
                // descriptors. Rotate before resizing to honor phone-camera EXIF.
                const pipeline = sharp(input).rotate().resize({ width });
                const encoded = format === 'webp'
                    ? pipeline.webp({ quality: QUALITY })
                    : pipeline.jpeg({ quality: QUALITY });
                const { data, info } = await encoded.toBuffer({ resolveWithObject: true });
                const filename = `${basename}_${width}w.${format}`;
                await fs.writeFile(path.join(outputDir, filename), data);
                variants.push({ path: filename, width: info.width, height: info.height, bytes: data.length, hash: digest(data) });
            }
        }
        manifest.images[basename] = { source: source.relative, key, variants };
    }
    await fs.writeFile(manifestFile, JSON.stringify(manifest, null, 2) + '\n');
    log(`Done. Processed ${sources.size} images.`);
    return manifest;
}

module.exports = { collectImages, selectSources, processImages };

if (require.main === module) {
    processImages().catch((error) => {
        console.error('Fatal error in image optimization:', error);
        process.exitCode = 1;
    });
}
