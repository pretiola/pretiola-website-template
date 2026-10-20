# Pretiola Website Template

A Rust/Actix-web starter with Tera pages, Tailwind CSS, responsive images, optional consent-based Google Analytics, and optional Buttondown signup. Docker and Fly.io deployment are included.

## Run locally

Install stable Rust and Node.js 24 or later, then:

```sh
npm ci
npm test
cargo test --locked -- --test-threads=1
SITE_URL=http://localhost:8080 cargo run --locked
```

Open <http://localhost:8080>. `npm test` runs the JavaScript regression tests and builds CSS and images. Rust integration tests start real servers; run them sequentially to limit worker usage. After editing CSS or images, run `npm run build` again. Templates are loaded when the server starts.

## Configure a new site

| Setting | Default | Purpose |
| --- | --- | --- |
| `PORT` | `8080` | Server port |
| `SITE_URL` | `https://example.com` | Public HTTP(S) origin for canonical links, sitemap and robots.txt |
| `BUTTONDOWN_USERNAME` | empty | Show the newsletter form for this Buttondown newsletter |
| `RUST_LOG` | `info` | Server log level |

Set environment variables in your shell or deployment configuration. `cargo run` does not load `.env` files automatically. Docker Compose accepts `.env` values; see [.env.example](.env.example). `SITE_URL` must be an origin without a path, query, fragment or credentials. Invalid configuration stops startup. Requests cannot override the canonical origin via the Host header.

Replace the site name, sample content, image, and legal placeholders before launch. The bundled privacy and terms pages are setup prompts, not a completed policy for your organization.

### Analytics and privacy

Analytics is off by default. Configure the site's own measurement ID and exact production hosts in [static/js/analytics-config.js](static/js/analytics-config.js). No Google request or consent cookie is created with the default settings. The shared privacy controls support rejection, analytics-only consent, an optional advertising choice, withdrawal, expiry, Global Privacy Control and cross-tab updates.

Read [the analytics guide](docs/analytics.md) before enabling it. Google Analytics, Signals, retention, enhanced measurement and Search Console account settings require separate setup; a repository deploy does not configure those services.

### Newsletter

Set `BUTTONDOWN_USERNAME` to your newsletter's username (letters, digits, underscores and hyphens). The homepage then includes [the shared form](templates/partials/newsletter.html). Without that setting, no signup form is rendered. It uses Buttondown's [native HTML POST integration](https://docs.buttondown.com/building-your-subscriber-base), so it works without JavaScript and lets the provider handle confirmation and validation. No API key is needed in this repository.

Configure the newsletter's sender, confirmation workflow, public contact information and tracking settings in Buttondown. Update the privacy page to describe your actual use. Test delivery with an address whose owner has agreed to the test; the automated tests never subscribe anyone. Newsletter signup does not depend on analytics consent.

## Add pages and shared content

Create `templates/{slug}.html` using a bundled page as a starting point. Use ASCII letters, digits, hyphens and underscores in page names. Top-level pages automatically appear at `/{slug}.html` and in `/sitemap.xml`. Both `/` and `/index.html` render the homepage, but canonical links and the sitemap use `/`.

Keep reusable fragments under `templates/partials/` (or prefix a top-level helper with `_`). Nested templates, underscore helpers, `navbar.html` and `footer.html` are excluded from public page routes and the sitemap. Include `partials/head.html`, `navbar.html` and `footer.html` on each page to retain canonical metadata, navigation and privacy controls.

Every page receives `page_name`, `current_year`, `site_url`, `canonical_url` and `buttondown_username`. Missing pages return 404; a failure while rendering an existing page returns 500 and is logged.

Navigation stays usable without JavaScript. With JavaScript, mobile navigation has a keyboard-operable toggle and Escape closes the menu.

## Images and styling

Add images to `static/pictures/` and run `npm run build:images`. Nested directories are supported: `events/visit.jpg` produces `events_visit_400w`, `_800w` and `_1200w` in WebP and JPEG. A matching `_sharpen` source takes precedence. Ambiguous output names fail the build instead of overwriting another image.

The pipeline honors camera orientation, preserves exact widths for existing `srcset` descriptors, and caches unchanged outputs with source, settings and output hashes. These fixed sizes can enlarge small originals; supply a source at least 1200 pixels wide for the largest variant. Generated files and their cache manifest stay in the ignored `static/pictures/optimized/` directory. Clear that directory for a fully clean rebuild.

```html
<picture>
  <source type="image/webp"
    srcset="/pictures/optimized/events_visit_400w.webp 400w, /pictures/optimized/events_visit_800w.webp 800w, /pictures/optimized/events_visit_1200w.webp 1200w"
    sizes="(max-width: 640px) 100vw, 800px">
  <img src="/pictures/optimized/events_visit_800w.jpg"
    srcset="/pictures/optimized/events_visit_400w.jpg 400w, /pictures/optimized/events_visit_800w.jpg 800w, /pictures/optimized/events_visit_1200w.jpg 1200w"
    sizes="(max-width: 640px) 100vw, 800px"
    width="800" height="600" loading="lazy" decoding="async"
    alt="Describe the photograph">
</picture>
```

Use dimensions matching the image's aspect ratio. Keep the main above-the-fold image eager; use `loading="lazy"` for later images. Edit `static/css/styles.css`, then run `npm run build:css`. Commit the regenerated `static/css/tailwind.css` with style changes.

The existing `data-gallery` API supports manual carousel controls, keyboard navigation, slide announcements and a native dialog lightbox. Wrap images in normal links with `class="gallery-image-link"` for full-size access without JavaScript. Galleries remain a visible list until initialized. See [the gallery example](docs/gallery.html).

## Deploy

For local Docker:

```sh
docker compose up --build
```

For Fly.io:

1. Create your own Fly app and update `app` in `fly.toml`.
2. Set `SITE_URL` to its public HTTPS origin and, if used, `BUTTONDOWN_USERNAME` in `[env]` or your deployment environment.
3. Add the GitHub repository variable `FLY_APP_NAME` and secret `FLY_API_TOKEN` for that app.
4. Push to `main`. CI tests the integrations, builds assets, checks Rust formatting and runs the server tests before deployment.

Deployment is skipped while `FLY_APP_NAME` is empty. New template copies can run CI without access to a Fly account. Docker uses Node.js 24, `npm ci` and locked Cargo builds. HTTPS is enforced by the supplied Fly configuration.

Set up DNS and certificates for the actual host, then verify the homepage, `/privacy.html`, `/robots.txt` and `/sitemap.xml`. For Search Console, verify the new site's own property and submit that sitemap; do not reuse another site's verification token. Check analytics and newsletter behavior on the final domain after external account setup.

## Project map

- `src/`: site configuration, shared rendering and routing.
- `templates/`: public pages and shared fragments.
- `static/`: first-party CSS, scripts and source images.
- `scripts/optimize-images.js`: responsive image build and cache.
- `tests/`: Rust HTTP tests and JavaScript integration regressions.
- `docs/`: analytics setup, gallery example and [sync provenance](docs/template-sync.md).
