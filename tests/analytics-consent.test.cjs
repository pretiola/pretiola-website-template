const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const helpers = require('../static/js/analytics.js');
const source = fs.readFileSync(path.join(__dirname, '../static/js/analytics.js'), 'utf8');
const now = 1800000000000;
const siteConfig = {
  measurementId: 'G-TEST12345',
  productionHosts: ['example.com', 'www.example.com'],
  allowAdvertising: true,
  excludedPaths: ['/account.html']
};
const choice = (value, time = now) => ({ version: 1, choice: value, time });
const encoded = (value) => `${helpers.cookieName}=${encodeURIComponent(JSON.stringify(value))}`;

function browser({ url = 'https://example.com/sample.html?email=secret@example.com#private',
  cookie = '', gpc = false, referrer = 'https://example.com/private?email=secret@example.com',
  blockedCookies = false, config = siteConfig, blockedChannel = false } = {}) {
  let currentTime = now;
  const cookies = new Map(cookie.split(';').filter(Boolean).map((part) => part.trim().split('=')));
  const listeners = {};
  const timers = new Map();
  const appended = [];
  let timerId = 0;
  let reloads = 0;
  let doc;
  const node = (attributes = {}) => ({
    hidden: false, ...attributes, listeners: {},
    addEventListener(name, handler) { this.listeners[name] = handler; },
    getAttribute(name) { return this[name]; },
    focus() { doc.activeElement = this; },
    click() { this.listeners.click?.({ preventDefault() {} }); }
  });
  const choices = ['rejected', 'analytics', 'advertising'].map((value) => node({ 'data-consent-choice': value }));
  const settings = node({ hidden: true });
  const close = node();
  const status = node();
  const gpcMessage = node();
  const heading = node();
  const dialog = node({
    open: false,
    show() { this.open = true; this.modality = 'nonmodal'; },
    close() { this.open = false; },
    querySelector(selector) { return selector === '#privacy-title' ? heading : null; }
  });
  const controls = {
    '[data-consent-choice]': choices, '[data-privacy-open]': [settings], '[data-privacy-close]': [close],
    '[data-privacy-status]': [status], '[data-privacy-gpc]': [gpcMessage],
    '[data-privacy-advertising]': [choices[2]]
  };
  doc = {
    readyState: 'complete', referrer, body: {}, hidden: false,
    head: { appendChild(element) { appended.push(element); } },
    getElementById(id) { return id === 'privacy-dialog' ? dialog : null; },
    querySelectorAll(selector) { return controls[selector] || []; },
    createElement(tag) { return { tag }; },
    addEventListener(name, callback) { listeners[name] = callback; },
    contains() { return true; }
  };
  doc.activeElement = doc.body;
  Object.defineProperty(doc, 'cookie', {
    get() { if (blockedCookies) throw new Error('Blocked'); return [...cookies].map(([k, v]) => `${k}=${v}`).join('; '); },
    set(value) {
      if (blockedCookies) throw new Error('Blocked');
      const [pair, ...attributes] = value.split(';');
      const equals = pair.indexOf('=');
      const key = pair.slice(0, equals);
      if (attributes.some((part) => /max-age=0$/i.test(part.trim()))) cookies.delete(key);
      else cookies.set(key, pair.slice(equals + 1));
    }
  });
  const location = new URL(url);
  location.reload = () => { reloads += 1; };
  const window = {
    document: doc, location, navigator: { globalPrivacyControl: gpc }, siteAnalytics: config,
    addEventListener(name, callback) { listeners[name] = callback; },
    setTimeout(callback, delay) { timers.set(++timerId, { callback, delay }); return timerId; },
    clearTimeout(id) { timers.delete(id); }
  };
  const broadcasts = [];
  let channelListener;
  window.BroadcastChannel = class {
    constructor() { if (blockedChannel) throw new Error('Blocked'); }
    addEventListener(name, callback) { channelListener = callback; }
    postMessage(value) { broadcasts.push(value); }
  };
  class Clock extends Date { static now() { return currentTime; } }
  vm.runInNewContext(source, { window, Date: Clock, URL, console });
  return {
    window, doc, dialog, heading, settings, close, status, gpcMessage, appended, cookies, timers, listeners, choices, broadcasts,
    receiveBroadcast() { channelListener?.(); },
    choose(value) { choices.find((button) => button['data-consent-choice'] === value).click(); },
    commands() { return window.dataLayer.map((args) => Array.from(args)); },
    reloads() { return reloads; },
    advance(milliseconds) { currentTime += milliseconds; [...timers.values()][0]?.callback(); }
  };
}

const plain = (value) => JSON.parse(JSON.stringify(value));
const configs = (state) => state.commands().filter((command) => command[0] === 'config').map((command) => command[2]);
const latestConsent = (state) => plain(state.commands().filter((command) => command[0] === 'consent').at(-1)[2]);

test('only valid versioned, finite, current decisions survive cookie parsing', () => {
  assert.deepEqual(helpers.parseChoice(encoded(choice('analytics')), now), choice('analytics'));
  for (const invalid of [
    choice('analytics', now + 1), choice('analytics', now - helpers.lifetime), choice('analytics', -1),
    choice('other'), { ...choice('analytics'), version: 2 }, { ...choice('analytics'), time: '1800000000000' },
    { ...choice('analytics'), time: null }
  ]) assert.equal(helpers.parseChoice(encoded(invalid), now), null);
  assert.equal(helpers.validChoice(choice('analytics', NaN), now), false);
  assert.equal(helpers.validChoice(choice('analytics', Infinity), now), false);
  assert.equal(helpers.parseChoice('site_privacy=%broken', now), null);
  assert.equal(helpers.parseChoice('', now), null);
});

test('unknown choices fail closed and GPC caps advertising at analytics', () => {
  assert.equal(helpers.effectiveChoice('advertising', true, true), 'analytics');
  assert.equal(helpers.effectiveChoice('advertising', false, false), 'analytics');
  assert.equal(helpers.effectiveChoice('advertising', false, true), 'advertising');
  assert.equal(helpers.effectiveChoice('invalid', false), 'rejected');
  assert.deepEqual(helpers.consentFor('invalid'), helpers.consentFor('rejected'));
});

test('empty, missing, or invalid site configuration stays entirely disabled', () => {
  for (const config of [undefined, {}, { measurementId: 'G-TEST12345' },
    { measurementId: 'G-TEST12345', productionHosts: ['https://example.com'] },
    { measurementId: '<script>', productionHosts: ['example.com'] }]) {
    const state = browser({ config: config === undefined ? null : config });
    assert.equal(state.appended.length, 0);
    assert.equal(state.dialog.open, false);
    assert.equal(state.settings.hidden, true);
    assert.equal(state.window.gtag, undefined);
    assert.equal(state.cookies.size, 0);
  }
});

test('the committed template configuration has analytics disabled', () => {
  const window = {};
  const configSource = fs.readFileSync(path.join(__dirname, '../static/js/analytics-config.js'), 'utf8');
  vm.runInNewContext(configSource, { window });
  const state = browser({ config: window.siteAnalytics });
  assert.equal(helpers.normalizeConfig(window.siteAnalytics).enabled, false);
  assert.equal(state.dialog.open, false);
  assert.equal(state.appended.length, 0);
  assert.equal(state.cookies.size, 0);
});

test('advertising is opt-in configuration and saved advertising consent is downgraded', () => {
  const config = { ...siteConfig, allowAdvertising: false };
  const state = browser({ config, cookie: encoded(choice('advertising')) });
  assert.equal(state.choices[2].hidden, true);
  assert.deepEqual(latestConsent(state), helpers.consentFor('analytics'));
  assert.equal(configs(state)[0].allow_google_signals, false);
  assert.equal(helpers.parseChoice(state.doc.cookie, now).choice, 'analytics');
  state.choose('advertising');
  assert.equal(helpers.parseChoice(state.doc.cookie, now).choice, 'analytics');
  assert.equal(helpers.normalizeConfig({ ...siteConfig, allowAdvertising: 'true' }).allowAdvertising, false);
});

test('URLs exclude queries/fragments and referrers exclude private paths', () => {
  assert.equal(helpers.safeLocation('https://example.com/page?email=private#private'), 'https://example.com/page');
  assert.equal(helpers.safeReferrer('https://example.com/private?email=private#private'), 'https://example.com');
  for (const url of ['javascript:alert(1)', 'data:text/plain,private', 'invalid']) {
    assert.equal(helpers.safeLocation(url), '');
    assert.equal(helpers.safeReferrer(url), '');
  }
});

test('first visit and dismissal send no Google requests and keep a nonmodal banner', () => {
  const state = browser();
  assert.equal(state.appended.length, 0);
  assert.equal(state.dialog.open, true);
  assert.equal(state.dialog.modality, 'nonmodal');
  assert.equal(state.doc.activeElement, state.heading);
  assert.equal(state.window['ga-disable-G-TEST12345'], true);
  assert.deepEqual(latestConsent(state), helpers.consentFor('rejected'));
  state.dialog.listeners.keydown({ key: 'Escape', preventDefault() {} });
  assert.equal(state.dialog.open, false);
  assert.equal(state.cookies.has(helpers.cookieName), false);
  state.listeners.pageshow();
  assert.equal(state.dialog.open, false);
  state.settings.click();
  assert.equal(state.dialog.open, true);
});

test('analytics-only opt-in loads once, with sanitized fields and audience features off', () => {
  const state = browser();
  state.choose('analytics');
  assert.equal(state.appended.length, 1);
  assert.match(state.appended[0].src, /^https:\/\/www.googletagmanager.com\/gtag\/js\?id=G-TEST12345$/);
  assert.equal(state.dialog.open, false);
  assert.equal(state.window['ga-disable-G-TEST12345'], false);
  const config = plain(configs(state)[0]);
  assert.equal(config.allow_google_signals, false);
  assert.equal(config.allow_ad_personalization_signals, false);
  assert.equal(config.allow_enhanced_conversions, false);
  assert.equal(config.page_location, 'https://example.com/sample.html');
  assert.equal(config.page_referrer, 'https://example.com');
  assert.equal(config.user_id, null);
  assert.equal(config.user_data, null);
  assert.deepEqual(latestConsent(state), helpers.consentFor('analytics'));
  state.choose('analytics');
  state.listeners.pageshow();
  assert.equal(state.appended.length, 1);
  assert.equal(configs(state).filter((item) => item.send_page_view).length, 1);
});

test('audience opt-in grants all four signals, upgrade does not duplicate pageviews', () => {
  const state = browser();
  state.choose('analytics');
  state.choose('advertising');
  assert.deepEqual(latestConsent(state), helpers.consentFor('advertising'));
  assert.equal(configs(state).at(-1).allow_google_signals, true);
  assert.equal(configs(state).at(-1).send_page_view, false);
  assert.equal(state.appended.length, 1);
  assert.equal(state.reloads(), 0);
});

test('withdrawal and audience downgrade stop tracking, clear cookies and reload', () => {
  for (const next of ['rejected', 'analytics']) {
    const state = browser({ cookie: '_ga=123; _gcl_au=456; unrelated=keep' });
    state.choose('advertising');
    state.cookies.set('_ga_TEST12345', '789');
    state.choose(next);
    assert.equal(state.window['ga-disable-G-TEST12345'], true);
    assert.deepEqual(latestConsent(state), helpers.consentFor('rejected'));
    assert.equal(configs(state).at(-1).send_page_view, false);
    assert.equal(configs(state).at(-1).allow_google_signals, false);
    assert.equal(state.reloads(), 1);
    assert.equal(state.cookies.has('_ga'), false);
    assert.equal(state.cookies.has('_gcl_au'), false);
    assert.equal(state.cookies.has('_ga_TEST12345'), false);
    assert.equal(state.cookies.get('unrelated'), 'keep');
    assert.equal(helpers.parseChoice(state.doc.cookie, now).choice, next);
  }
});

test('GPC blocks new and saved audience consent while permitting basic analytics', () => {
  const state = browser({ gpc: true, cookie: encoded(choice('advertising')) });
  assert.equal(state.gpcMessage.hidden, false);
  assert.deepEqual(latestConsent(state), helpers.consentFor('analytics'));
  assert.equal(configs(state)[0].allow_google_signals, false);
  assert.equal(helpers.parseChoice(state.doc.cookie, now).choice, 'analytics');
  state.choose('advertising');
  assert.deepEqual(latestConsent(state), helpers.consentFor('analytics'));
  assert.equal(helpers.parseChoice(state.doc.cookie, now).choice, 'analytics');
});

test('saved decisions expire in a long-open tab and stale consent cannot load Google', () => {
  const state = browser({ cookie: encoded(choice('analytics', now - helpers.lifetime + 10)) });
  assert.equal(state.appended.length, 1);
  state.advance(11);
  assert.equal(state.reloads(), 1);
  assert.equal(state.window['ga-disable-G-TEST12345'], true);
  assert.equal(state.cookies.has(helpers.cookieName), false);
  const expired = browser({ cookie: encoded(choice('advertising', now - helpers.lifetime)) });
  assert.equal(expired.appended.length, 0);
  assert.equal(expired.dialog.open, true);
});

test('preview and signup-return pages work without loading Google after opt-in', () => {
  for (const url of ['http://localhost:8000/index.html', 'https://preview.example.net/',
    'http://example.com/', 'https://example.com.evil.net/', 'https://example.com/account.html',
    'https://example.com/thanks.html?email=private@example.com', 'https://www.example.com/thanks',
    'https://example.com/THANKS.HTML/', 'https://example.com/th%61nks.html', 'https://example.com/%broken']) {
    const state = browser({ url });
    state.choose('advertising');
    assert.equal(state.appended.length, 0, url);
    assert.equal(state.window['ga-disable-G-TEST12345'], true, url);
    assert.equal(state.dialog.open, false, url);
  }
});

test('cross-tab withdrawals stop collection and changed GPC downgrades advertising', () => {
  const state = browser({ cookie: encoded(choice('advertising')) });
  state.cookies.set(helpers.cookieName, encodeURIComponent(JSON.stringify(choice('rejected'))));
  state.receiveBroadcast();
  assert.deepEqual(latestConsent(state), helpers.consentFor('rejected'));
  assert.equal(state.reloads(), 1);
  const gpc = browser({ cookie: encoded(choice('advertising')) });
  gpc.window.navigator.globalPrivacyControl = true;
  gpc.listeners.visibilitychange();
  assert.equal(helpers.parseChoice(gpc.doc.cookie, now).choice, 'analytics');
  assert.equal(gpc.reloads(), 1);
});

test('blocked broadcast channels do not break controls or visibility synchronization', () => {
  const state = browser({ blockedChannel: true });
  assert.equal(state.dialog.open, true);
  state.choose('analytics');
  assert.equal(state.appended.length, 1);
  state.cookies.set(helpers.cookieName, encodeURIComponent(JSON.stringify(choice('rejected'))));
  state.listeners.pageshow();
  assert.equal(state.reloads(), 1);
});

test('blocked cookie storage fails closed without breaking privacy controls', () => {
  const state = browser({ blockedCookies: true });
  assert.equal(state.appended.length, 0);
  assert.equal(state.dialog.open, true);
  state.choose('rejected');
  assert.equal(state.appended.length, 0);
  assert.equal(state.dialog.open, false);
});
