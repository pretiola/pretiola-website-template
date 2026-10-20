# October 2026 template sync

Compared the template's initial `5b6b14a` scaffolding with:

- [Sr. Dolores Foundation at `0454a94`](https://github.com/pretiola/srdolores-foundation.it/tree/0454a944d19223add0db47e1ac4c40041e5b952a), October 15, 2026.
- [Trading Kitchen at `b1cc1da`](https://github.com/pretiola/tradingkitchen/tree/b1cc1daa8c320db1f95f52513af76dc64074a043), October 20, 2026.

The table records transferable behavior. Implementations were adapted to this
Rust/Tera template rather than copied with site-specific configuration.

| Area | Source and adaptation |
| --- | --- |
| Shared rendering | Foundation `130aecd` fixed missing homepage context on `/index.html`. Both aliases here use one renderer, including canonical URL and newsletter context. |
| Navigation and galleries | Foundation's September mobile navigation and progressive-access work informed the keyboard toggle, persistent no-JS links, manual gallery controls and native dialog. The template retains its existing `data-gallery` API without adding Splide. |
| Image pipeline | Foundation `04ad3cd`/`0d2680a` added grouped images; Trading Kitchen `a086ba6` adds orientation-aware responsive builds and caching. This template accepts nested sources, checks output collisions and verifies cached output hashes. It keeps fixed public 400/800/1200-width filenames rather than adopting Trading Kitchen's HTML rewriting and fingerprinted asset pipeline. |
| Privacy | Foundation `5219af3`/`58de673` introduced explicit choices and stable reading position. Trading Kitchen `c09b9df`/`f0226be` supplies the newer consent lifecycle and focus treatment. This template adds empty configuration, explicit production hosts, optional advertising, and encoded-path exclusion tests. |
| Newsletter | Trading Kitchen `a000c09` uses Buttondown's native form. The template renders it only for a configured `BUTTONDOWN_USERNAME`; it copies no account or subscriber details. |
| Discovery | Trading Kitchen's deployment work ties canonical domain, sitemap and Search Console together. A single validated `SITE_URL` now controls page canonical metadata, robots.txt and sitemap URLs here. Partials cannot become public pages, and home is listed once. |
| Build and release | Trading Kitchen runs asset tests and builds in CI with Node 24 and `npm ci`. This template now does the same alongside Rust tests, uses locked builds, and skips Fly deployment until `FLY_APP_NAME` is configured. Sharp is updated to 0.35.5 and the npm lockfile is refreshed. |

Not transferred: charity donations, payment/QR data, liturgical MCP/API calls,
recipient names, Foundation media and branding; recipes, nutrition, economic
calculators, recipe-specific structured data, homepage-grid image scheduling;
live analytics IDs, subscriber endpoints, DNS verification tokens, provider
agreements or assertions that external accounts are configured. Search Console,
GA administration, Google Signals activation, Buttondown delivery and domain
setup are deployment steps documented for each new site.

The privacy and terms pages remain explicitly labeled setup placeholders. New
sites must replace those with their own disclosures before enabling services.
