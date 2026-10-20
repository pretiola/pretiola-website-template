# Optional analytics and privacy controls

Analytics is disabled in a fresh checkout. `static/js/analytics-config.js` has
no measurement ID or production hosts, so the integration does not load Google,
set a preference cookie, or show a consent banner. No account settings are
changed by this repository.

## Enable analytics for a site

1. Replace the privacy-policy placeholders with the actual operator, contact,
   hosting, services, data uses, and retention information for the site.
2. Set `measurementId` to the site's GA4 `G-…` ID and `productionHosts` to the
   exact production hostnames, without a scheme, port, or path:

   ```js
   window.siteAnalytics = {
     measurementId: 'G-YOURACTUALID',
     productionHosts: ['your-domain.com', 'www.your-domain.com'],
     allowAdvertising: false,
     excludedPaths: ['/signup-complete.html']
   };
   ```

3. Add private or form-return paths to `excludedPaths`. Paths are matched
   case-insensitively after percent-decoding, ignoring a trailing slash and query string. `/thanks`
   and `/thanks.html` are always excluded. Host matching is exact, and tracking
   requires HTTPS; local and unlisted preview hosts never load Google.
4. Review the GA property and web-stream settings described below, then verify
   the deployed site before relying on reports.

The shared footer includes `templates/partials/privacy.html` once per page. It
loads the first-party configuration, script, and stylesheet. Keep the deferred
configuration script before the deferred analytics script. Keep the footer's
`data-privacy-open` button so visitors can reopen their choices.

Do not add a second Google tag, Tag Manager container, tracking pixel, remote font,
or preconnect to this integration. Such additions need their own review and
consent handling; this script controls only its own GA tag.

## Behavior

- The initial consent defaults deny all four Google consent signals. The Google
  script is requested only after an explicit analytics or advertising opt-in.
- Reject, dismiss, and Escape leave optional collection off. Dismissal does not
  create a saved decision.
- Analytics-only consent keeps Google Signals and advertising personalization
  disabled. Advertising is offered only when `allowAdvertising` is explicitly
  `true`. Global Privacy Control caps advertising consent at analytics-only.
- Decisions use a versioned, first-party `site_privacy` cookie lasting 180 days.
  Google cookies are also configured for 180 days without renewal on each visit.
  Invalid, future-dated, and expired decisions are discarded.
- Withdrawal or an advertising-to-analytics downgrade immediately disables the
  tag, clears accessible GA/advertising cookies, and reloads to unload it.
  Existing data held by a provider is unaffected.
- Tabs synchronize through BroadcastChannel when available and when a page
  becomes visible again. Long-open tabs also enforce decision expiry.
- Page URLs passed by this script omit queries and fragments. Referrers contain
  only the origin. URL paths and page titles must not contain personal data.
  User-ID, user-provided data, URL passthrough, and enhanced conversions are not
  supplied by this integration.

Increment `VERSION` in `static/js/analytics.js` when the consent scope materially
changes. Reusing the same site or measurement ID does not by itself reset consent.
If separate sites share one hostname, give each a distinct `COOKIE_NAME`; the
preference cookie otherwise applies to the whole host.

## Review the external account settings

The repository cannot configure a Google Analytics account. Review enhanced
measurement before enabling collection: automatic form interactions, search,
outbound links, downloads, videos, and history-change page views can collect
additional fields beyond this script's sanitized page configuration. Disable
unneeded events, automatic user-provided-data collection, and connected tags
that are outside the site's intended data uses. Set and disclose the appropriate
retention settings in the account.

Keep `allowAdvertising: false` unless the site's operator has chosen and
disclosed the additional uses. Switching it on only exposes the visitor's
advertising choice; it does not activate Google Signals or accept provider
agreements in the account. Those are separate configuration steps.

Google documents the [tag privacy controls](https://developers.google.com/tag-platform/security/guides/privacy)
and the fields collected by [enhanced measurement](https://support.google.com/analytics/answer/9216061).
The [page-view guide](https://developers.google.com/analytics/devguides/collection/ga4/views)
explains why history-based page views also need review in the stream settings.

## Verify

Run `node --test tests/analytics-consent.test.cjs`. The tests cover disabled
configuration, all choices, URL sanitization, host/path restrictions, expiry,
GPC, cross-tab withdrawal, blocked storage, and blocked BroadcastChannel access.

In a clean browser profile, check that no request to Google is made on the first
visit, after dismissal, or after rejection. Opt in on the configured HTTPS host
and inspect the network payload and GA Realtime. Reopen choices from the footer,
withdraw, and confirm the tag is gone after the reload. Check narrow layouts,
keyboard focus, and printing. Repeat after changes to external account settings;
the local tests do not execute Google's remote library.

## Source

Adapted from Trading Kitchen's
[consent integration (`c09b9df`)](https://github.com/pretiola/tradingkitchen/commit/c09b9df5944b75c9b783bec9dca2aa3bd00abd0f)
and [privacy heading focus styling (`f0226be`)](https://github.com/pretiola/tradingkitchen/commit/f0226be875aa26a1ab3c3a0a769a43c3f38c66f9).
The template adds disabled defaults, explicit production-host configuration,
an optional advertising UI, and guarded BroadcastChannel initialization.
