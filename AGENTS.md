# Pretiola template maintenance

This is a reusable Actix-web/Tera/Tailwind template. Keep site-specific content,
account IDs, newsletter usernames, domains, DNS tokens and credentials out of it.
Optional integrations must remain disabled until the new site's operator configures them.

- Public pages: top-level `templates/{slug}.html`; fragments: `templates/partials/`.
- Include the shared head, navigation and footer on every page. The footer owns privacy controls.
- Read `docs/analytics.md` before changing consent behavior. Do not add an unconditional Google tag.
- `SITE_URL` is the canonical origin; never derive canonical URLs from request headers.
- Edit `static/css/styles.css` and regenerate `static/css/tailwind.css`.
- Images are generated under ignored `static/pictures/optimized/`. Preserve truthful width descriptors.
- Use regular links/forms as a fallback when adding JavaScript enhancements.
- Verify with `npm ci`, `npm test`, `cargo fmt --check`, and
  `cargo test --locked -- --test-threads=1`. Run `cargo clippy --locked --all-targets -- -D warnings`
  for Rust changes.
- Account-level Analytics, Search Console, Buttondown, DNS and hosting setup is separate from a code change.
- See `docs/template-sync.md` for the source repositories and deliberate scope of this sync.
