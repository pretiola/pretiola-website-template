/* Basic consent mode: Google's library is loaded only after an explicit opt-in. */
(function (root) {
  'use strict';

  var COOKIE_NAME = 'site_privacy';
  var VERSION = 1;
  var LIFETIME = 180 * 24 * 60 * 60 * 1000;
  var CHOICES = ['rejected', 'analytics', 'advertising'];
  var DENIED = {
    analytics_storage: 'denied', ad_storage: 'denied',
    ad_user_data: 'denied', ad_personalization: 'denied'
  };

  function validChoice(value, now) {
    return !!(value && value.version === VERSION && CHOICES.indexOf(value.choice) !== -1 &&
      typeof value.time === 'number' && Number.isFinite(value.time) && value.time >= 0 &&
      value.time <= now && now - value.time < LIFETIME);
  }

  function parseChoice(cookies, now) {
    var entry = cookies.split(';').map(function (part) { return part.trim(); })
      .find(function (part) { return part.indexOf(COOKIE_NAME + '=') === 0; });
    if (!entry) return null;
    try {
      var value = JSON.parse(decodeURIComponent(entry.slice(COOKIE_NAME.length + 1)));
      return validChoice(value, now) ? value : null;
    } catch (error) { return null; }
  }

  function effectiveChoice(choice, gpc, allowAdvertising) {
    if (CHOICES.indexOf(choice) === -1) return 'rejected';
    return (gpc || !allowAdvertising) && choice === 'advertising' ? 'analytics' : choice;
  }

  function consentFor(choice) {
    return {
      analytics_storage: choice === 'analytics' || choice === 'advertising' ? 'granted' : 'denied',
      ad_storage: choice === 'advertising' ? 'granted' : 'denied',
      ad_user_data: choice === 'advertising' ? 'granted' : 'denied',
      ad_personalization: choice === 'advertising' ? 'granted' : 'denied'
    };
  }

  function safeLocation(value) {
    try { var url = new URL(value); return /^https?:$/.test(url.protocol) ? url.origin + url.pathname : ''; }
    catch (error) { return ''; }
  }

  function safeReferrer(value) {
    try { var url = new URL(value); return /^https?:$/.test(url.protocol) ? url.origin : ''; }
    catch (error) { return ''; }
  }

  function normalizedPath(path) {
    try { return decodeURIComponent(path).replace(/\/+$/, '').toLowerCase(); }
    catch (error) { return null; }
  }

  function normalizeConfig(input) {
    input = input || {};
    var measurementId = typeof input.measurementId === 'string' && /^G-[A-Z0-9]+$/.test(input.measurementId) ?
      input.measurementId : '';
    var productionHosts = Array.isArray(input.productionHosts) ? input.productionHosts.filter(function (host) {
      return typeof host === 'string' && /^[a-z0-9]+(?:[.-][a-z0-9]+)*\.[a-z]{2,}$/i.test(host);
    }).map(function (host) { return host.toLowerCase(); }) : [];
    var excludedPaths = ['/thanks', '/thanks.html'].concat(
      Array.isArray(input.excludedPaths) ? input.excludedPaths.filter(function (path) {
        return typeof path === 'string' && path.charAt(0) === '/';
      }) : []
    ).map(normalizedPath);
    return {
      enabled: !!measurementId && productionHosts.length > 0,
      measurementId: measurementId,
      productionHosts: productionHosts,
      excludedPaths: excludedPaths,
      allowAdvertising: input.allowAdvertising === true
    };
  }

  function trackingAllowed(location, config) {
    var path = normalizedPath(location.pathname);
    return config.enabled && location.protocol === 'https:' &&
      config.productionHosts.indexOf(location.hostname.toLowerCase()) !== -1 &&
      path !== null && config.excludedPaths.indexOf(path) === -1;
  }

  // Pure helpers are exported for consent and URL privacy regression tests.
  if (typeof module === 'object' && module.exports) {
    module.exports = { validChoice: validChoice, parseChoice: parseChoice, effectiveChoice: effectiveChoice,
      consentFor: consentFor, safeLocation: safeLocation, safeReferrer: safeReferrer,
      normalizeConfig: normalizeConfig, trackingAllowed: trackingAllowed,
      lifetime: LIFETIME, cookieName: COOKIE_NAME };
  }
  if (!root || !root.document) return;
  var settings = normalizeConfig(root.siteAnalytics);
  // An untouched template performs no tracking or consent-storage work and shows no banner.
  if (!settings.enabled) return;
  var MEASUREMENT_ID = settings.measurementId;

  var document = root.document;
  var saved = null;
  var active = 'rejected';
  var loaded = false;
  var expiryTimer;
  var dialog;
  var returnFocus;
  var channel;
  var dismissed = false;
  var isProduction = trackingAllowed(root.location, settings);
  root['ga-disable-' + MEASUREMENT_ID] = true;
  root.dataLayer = root.dataLayer || [];
  root.gtag = function () { root.dataLayer.push(arguments); };
  root.gtag('consent', 'default', DENIED);
  root.gtag('set', {
    allow_google_signals: false, allow_ad_personalization_signals: false,
    ads_data_redaction: true, allow_enhanced_conversions: false, url_passthrough: false,
    page_location: safeLocation(root.location.href), page_referrer: safeReferrer(document.referrer)
  });
  root.gtag('set', 'user_data', null);

  function hasGpc() { return root.navigator.globalPrivacyControl === true; }

  function writeChoice(value) {
    var maxAge = Math.max(0, Math.floor((LIFETIME - (Date.now() - value.time)) / 1000));
    try {
      document.cookie = COOKIE_NAME + '=' + encodeURIComponent(JSON.stringify(value)) +
        '; Max-Age=' + maxAge + '; Path=/; SameSite=Lax' + (root.location.protocol === 'https:' ? '; Secure' : '');
    } catch (error) { /* A blocked cookie leaves this explicit choice in memory only. */ }
  }

  function clearChoice() {
    try { document.cookie = COOKIE_NAME + '=; Max-Age=0; Path=/; SameSite=Lax'; } catch (error) {}
  }

  function clearTrackingCookies() {
    var domains = root.location.hostname.split('.');
    var paths = ['/'];
    var segments = root.location.pathname.split('/').filter(Boolean);
    for (var p = 1; p < segments.length; p++) paths.push('/' + segments.slice(0, p).join('/') + '/');
    var cookies;
    try { cookies = document.cookie; } catch (error) { return; }
    cookies.split(';').forEach(function (entry) {
      var name = entry.split('=')[0].trim();
      if (!/^_ga(?:_|$)|^_gid$|^_gat(?:_|$)|^_gcl_|^_gac_|^__gads$|^__gpi$|^__eoi$/.test(name)) return;
      paths.forEach(function (path) {
        try {
          var deletion = name + '=; Max-Age=0; Path=' + path + '; SameSite=Lax';
          document.cookie = deletion;
          for (var d = 0; d < domains.length - 1; d++) {
            document.cookie = deletion + '; Domain=' + domains.slice(d).join('.');
          }
        } catch (error) { /* Inaccessible cookies cannot be cleared by this page. */ }
      });
    });
  }

  function featureConfig(choice) {
    return {
      allow_google_signals: choice === 'advertising',
      allow_ad_personalization_signals: choice === 'advertising',
      allow_enhanced_conversions: false, user_id: null, user_data: null,
      cookie_expires: LIFETIME / 1000, cookie_update: false,
      page_location: safeLocation(root.location.href), page_referrer: safeReferrer(document.referrer)
    };
  }

  function updateStatus() {
    var choice = effectiveChoice(saved ? saved.choice : 'rejected', hasGpc(), settings.allowAdvertising);
    var message = choice === 'advertising' ? 'Analytics and advertising features are on.' :
      (choice === 'analytics' ? 'Analytics are on. Advertising features are off.' : 'Optional analytics and advertising features are off.');
    document.querySelectorAll('[data-privacy-status]').forEach(function (element) { element.textContent = message; });
    document.querySelectorAll('[data-privacy-gpc]').forEach(function (element) { element.hidden = !hasGpc(); });
    document.querySelectorAll('[data-privacy-advertising]').forEach(function (element) {
      element.hidden = !settings.allowAdvertising;
    });
    document.querySelectorAll('[data-privacy-close]').forEach(function (element) { element.hidden = false; });
  }

  function apply(choice) {
    var previous = active;
    active = effectiveChoice(choice, hasGpc(), settings.allowAdvertising);
    var downgrade = loaded && ((previous === 'advertising' && active !== 'advertising') || active === 'rejected');
    // Stop collection before a withdrawal/downgrade, then remove the loaded library by reloading.
    root['ga-disable-' + MEASUREMENT_ID] = !isProduction || active === 'rejected' || downgrade;
    root.gtag('consent', 'update', consentFor(downgrade ? 'rejected' : active));
    root.gtag('set', featureConfig(downgrade ? 'rejected' : active));
    if (downgrade) {
      var stopConfig = featureConfig('rejected');
      stopConfig.send_page_view = false;
      root.gtag('config', MEASUREMENT_ID, stopConfig);
      clearTrackingCookies();
      root.location.reload();
      return;
    }
    if (active === 'rejected') clearTrackingCookies();
    if (!isProduction || active === 'rejected') return;
    if (loaded) {
      if (previous !== active) {
        var updated = featureConfig(active);
        updated.send_page_view = false;
        root.gtag('config', MEASUREMENT_ID, updated);
      }
      return;
    }
    loaded = true;
    root.gtag('js', new Date());
    var config = featureConfig(active);
    config.send_page_view = true;
    root.gtag('config', MEASUREMENT_ID, config);
    var tag = document.createElement('script');
    tag.async = true;
    tag.src = 'https://www.googletagmanager.com/gtag/js?id=' + MEASUREMENT_ID;
    document.head.appendChild(tag);
  }

  function scheduleExpiry() {
    root.clearTimeout(expiryTimer);
    if (!saved) return;
    var remaining = saved.time + LIFETIME - Date.now();
    expiryTimer = root.setTimeout(syncChoice, Math.min(Math.max(remaining, 1), 2147483647));
  }

  function openDialog() {
    if (!dialog || dialog.open) return;
    returnFocus = document.activeElement;
    updateStatus();
    if (typeof dialog.show === 'function') dialog.show();
    else dialog.setAttribute('open', '');
    var heading = dialog.querySelector('#privacy-title');
    if (heading) heading.focus({ preventScroll: true });
  }

  function closeDialog() {
    if (!dialog || !dialog.open) return;
    dismissed = true;
    if (typeof dialog.close === 'function') dialog.close();
    else dialog.removeAttribute('open');
    if (returnFocus && returnFocus !== document.body && document.contains(returnFocus)) {
      returnFocus.focus({ preventScroll: true });
    }
  }

  function syncChoice() {
    var next;
    try { next = parseChoice(document.cookie, Date.now()); } catch (error) { next = null; }
    if (next && next.choice !== effectiveChoice(next.choice, hasGpc(), settings.allowAdvertising)) {
      next = { version: VERSION, choice: 'analytics', time: next.time };
      writeChoice(next);
    }
    saved = next;
    if (!saved) clearChoice();
    updateStatus();
    apply(saved ? saved.choice : 'rejected');
    scheduleExpiry();
    if (!saved && !dismissed) openDialog();
  }

  function choose(choice) {
    if (CHOICES.indexOf(choice) === -1) return;
    saved = { version: VERSION, choice: effectiveChoice(choice, hasGpc(), settings.allowAdvertising), time: Date.now() };
    writeChoice(saved);
    updateStatus();
    closeDialog();
    apply(saved.choice);
    scheduleExpiry();
    if (channel) channel.postMessage('choice-changed');
  }

  function init() {
    dialog = document.getElementById('privacy-dialog');
    document.querySelectorAll('[data-privacy-open]').forEach(function (element) {
      element.hidden = false;
      element.addEventListener('click', openDialog);
    });
    document.querySelectorAll('[data-consent-choice]').forEach(function (element) {
      element.addEventListener('click', function () { choose(element.getAttribute('data-consent-choice')); });
    });
    document.querySelectorAll('[data-privacy-close]').forEach(function (element) {
      element.addEventListener('click', closeDialog);
    });
    if (dialog) {
      dialog.addEventListener('keydown', function (event) {
        if (event.key === 'Escape') { event.preventDefault(); closeDialog(); }
      });
      dialog.addEventListener('cancel', function (event) {
        event.preventDefault();
        closeDialog();
      });
    }
    if (typeof root.BroadcastChannel === 'function') {
      try {
        channel = new root.BroadcastChannel(COOKIE_NAME);
        channel.addEventListener('message', syncChoice);
      } catch (error) { /* Visibility and page events still synchronize when channels are blocked. */ }
    }
    document.addEventListener('visibilitychange', function () { if (!document.hidden) syncChoice(); });
    root.addEventListener('pageshow', syncChoice);
    syncChoice();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
}(typeof window === 'undefined' ? null : window));
