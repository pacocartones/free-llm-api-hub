// consent.client.js — the cookie consent banner. The build copies it to site/consent.js ONLY when GA_MEASUREMENT_ID is
// set (see lib/analytics.mjs), with the measurement ID written in place of the placeholder below; with no ID the site ships
// neither this file nor any reference to it.
//
// Two independent categories, both off until the visitor turns them on:
//   analytics — Google Analytics measurement (analytics_storage);
//   ads       — advertising & personalised measurement (ad_storage, ad_user_data, ad_personalization), which also enables
//               Google signals.
// Nothing from Google loads until at least one category is granted ("basic" consent mode). Consent Mode v2 starts with
// everything denied and is then updated with exactly what was granted. The choice is kept in localStorage (no cookie of
// ours) together with CONSENT_VERSION: bumping it asks every visitor again. "Cookie settings" in the footer reopens the
// choices with their current state; withdrawing a category denies it at once and deletes its cookies.
(function () {
  'use strict';
  var ID = '__GA_MEASUREMENT_ID__';
  var KEY = 'cookie-consent';
  var CONSENT_VERSION = 1;
  var loaded = false;
  var opener = null;
  var current = { analytics: false, ads: false };

  function readChoice() {
    try {
      var c = JSON.parse(localStorage.getItem(KEY) || 'null');
      if (!c || c.v !== CONSENT_VERSION) return null;
      return { analytics: c.analytics === true, ads: c.ads === true };
    } catch (e) { return null; }
  }
  function saveChoice(s) {
    try { localStorage.setItem(KEY, JSON.stringify({ v: CONSENT_VERSION, analytics: s.analytics, ads: s.ads, at: new Date().toISOString().slice(0, 10) })); }
    catch (e) { /* private mode: the choice holds for this page only */ }
  }

  function g(on) { return on ? 'granted' : 'denied'; }
  function consentFor(s) {
    return { analytics_storage: g(s.analytics), ad_storage: g(s.ads), ad_user_data: g(s.ads), ad_personalization: g(s.ads) };
  }
  // Google signals and ad personalisation signals follow the advertising category. With ad_storage denied, ad data is
  // redacted; click identifiers are never passed through URLs.
  function flagsFor(s) {
    return { allow_google_signals: s.ads, allow_ad_personalization_signals: s.ads, ads_data_redaction: !s.ads, url_passthrough: false };
  }

  function deleteCookies(re) {
    var host = location.hostname;
    var domains = ['', host, '.' + host, '.' + host.replace(/^www\./, '')];
    document.cookie.split(';').forEach(function (c) {
      var name = c.split('=')[0].trim();
      if (!re.test(name)) return;
      domains.forEach(function (d) {
        document.cookie = name + '=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/' + (d ? '; domain=' + d : '');
      });
    });
  }
  var ANALYTICS_COOKIES = /^_ga(_|$)/;
  var ADS_COOKIES = /^(_gcl_|_gac_)/;

  function load(s) {
    loaded = true;
    window.dataLayer = window.dataLayer || [];
    window.gtag = function () { window.dataLayer.push(arguments); };
    var f = flagsFor(s);
    window.gtag('consent', 'default', consentFor({ analytics: false, ads: false }));
    window.gtag('consent', 'update', consentFor(s));
    window.gtag('set', 'ads_data_redaction', f.ads_data_redaction);
    window.gtag('set', 'url_passthrough', f.url_passthrough);
    window.gtag('js', new Date());
    window.gtag('config', ID, { allow_google_signals: f.allow_google_signals, allow_ad_personalization_signals: f.allow_ad_personalization_signals });
    var el = document.createElement('script');
    el.async = true;
    el.src = 'https://www.googletagmanager.com/gtag/js?id=' + encodeURIComponent(ID);
    document.head.appendChild(el);
  }

  // Applies a choice: loads gtag.js the first time something is granted, otherwise updates consent and the signal flags;
  // deletes the cookies of every category that is off.
  function apply(s) {
    current = { analytics: s.analytics, ads: s.ads };
    var any = s.analytics || s.ads;
    window['ga-disable-' + ID] = !any;
    if (any && !loaded) load(s);
    else if (loaded) {
      var f = flagsFor(s);
      window.gtag('consent', 'update', consentFor(s));
      window.gtag('set', f);
    }
    if (!s.analytics) deleteCookies(ANALYTICS_COOKIES);
    if (!s.ads) deleteCookies(ADS_COOKIES);
  }

  var CSS = '.consent-banner{position:fixed;left:16px;right:16px;bottom:16px;z-index:1000;max-width:660px;margin:0 auto;' +
    'max-height:calc(100vh - 32px);overflow:auto;' +
    'background:var(--panel-2,#131b17);color:var(--text,#d8e2dc);border:1px solid var(--border,#1d2a22);border-radius:12px;' +
    'padding:16px 18px;box-shadow:0 8px 30px rgba(0,0,0,.35);font-size:.9rem;line-height:1.5}' +
    '.consent-banner p{margin:0 0 12px}.consent-banner p a{text-decoration:underline;text-underline-offset:2px}' +
    '.consent-banner .consent-title{font-weight:700;margin-bottom:4px}' +
    '.consent-actions{display:flex;flex-wrap:wrap;gap:10px}.consent-actions .btn{flex:1 1 140px;justify-content:center}' +
    '.consent-banner [hidden],.consent-banner[hidden]{display:none}' +
    '.consent-cats{list-style:none;margin:0 0 14px;padding:0;display:grid;gap:10px}' +
    '.consent-cat{display:flex;gap:14px;align-items:flex-start;justify-content:space-between;padding:10px 12px;' +
    'border:1px solid var(--border,#1d2a22);border-radius:9px;background:var(--panel,#0f1512)}' +
    '.consent-cat .consent-cat-name{margin:0;color:var(--text,#d8e2dc);font-weight:700;font-size:.9rem}' +
    '.consent-cat .consent-cat-desc{margin:2px 0 0;color:var(--muted,#96a49b);font-size:.84rem}' +
    '.consent-switch{flex:0 0 auto;display:inline-flex;align-items:center;gap:8px;background:none;border:0;padding:4px;font:inherit;' +
    'font-size:.8rem;color:var(--text,#d8e2dc);cursor:pointer}' +
    '.consent-switch .track{position:relative;width:40px;height:22px;border-radius:11px;border:1px solid var(--control-border,#76887e);' +
    'background:var(--panel-2,#131b17);transition:background .15s}' +
    '.consent-switch .knob{position:absolute;top:2px;left:2px;width:16px;height:16px;border-radius:50%;background:var(--muted,#96a49b);transition:left .15s}' +
    '.consent-switch[aria-checked="true"] .track{background:var(--accent,#3fce8f);border-color:var(--accent,#3fce8f)}' +
    '.consent-switch[aria-checked="true"] .knob{left:20px;background:var(--accent-ink,#05140c)}' +
    '.consent-switch .state{min-width:2.2em;text-align:left}' +
    '@media (prefers-reduced-motion: reduce){.consent-switch .track,.consent-switch .knob{transition:none}}' +
    '.consent-link{background:none;border:0;padding:0;font:inherit;color:var(--accent,#3fce8f);cursor:pointer}' +
    '.consent-link:hover{text-decoration:underline}';

  // One category: its name and description label the switch (role="switch", aria-checked). The visible "On"/"Off" text
  // means the state never rests on colour alone; it is hidden from assistive technology, which reads aria-checked.
  function cat(key, name, desc) {
    return '<li class="consent-cat"><div><p class="consent-cat-name" id="consent-' + key + '-name">' + name + '</p>' +
      '<p class="consent-cat-desc" id="consent-' + key + '-desc">' + desc + '</p></div>' +
      '<button type="button" class="consent-switch" role="switch" aria-checked="false" data-cat="' + key + '"' +
      ' aria-labelledby="consent-' + key + '-name" aria-describedby="consent-' + key + '-desc">' +
      '<span class="track" aria-hidden="true"><span class="knob"></span></span><span class="state" aria-hidden="true">Off</span></button></li>';
  }

  var banner = null;
  function build() {
    var style = document.createElement('style');
    style.textContent = CSS;
    document.head.appendChild(style);
    banner = document.createElement('section');
    banner.className = 'consent-banner';
    banner.id = 'consent-banner';
    banner.setAttribute('aria-labelledby', 'consent-title');
    banner.setAttribute('aria-describedby', 'consent-desc');
    banner.hidden = true;
    banner.innerHTML =
      '<p class="consent-title" id="consent-title">Cookies</p>' +
      '<p id="consent-desc">May we use Google cookies for analytics and, separately, for advertising and personalised measurement (Google signals)? Nothing is sent to Google unless you allow at least one of them. You can change your choice any time under “Cookie settings” at the bottom of every page. <a href="/legal/privacy">Privacy policy</a></p>' +
      '<div class="consent-custom" data-view="custom" hidden><ul class="consent-cats">' +
      cat('analytics', 'Analytics', 'Google Analytics counts visits and shows which pages are useful (cookies _ga, _ga_*).') +
      cat('ads', 'Advertising &amp; personalised measurement', 'Lets Google link visits to signed-in Google accounts that allow ad personalisation (Google signals): aggregated demographics, interests and cross-device reports. No ads are shown on this site.') +
      '</ul></div>' +
      '<div class="consent-actions" data-view="main">' +
      '<button type="button" class="btn ghost" data-action="reject">Reject all</button>' +
      '<button type="button" class="btn ghost" data-action="customize">Customize</button>' +
      '<button type="button" class="btn ghost" data-action="accept">Accept all</button>' +
      '</div>' +
      '<div class="consent-actions" data-view="custom" hidden>' +
      '<button type="button" class="btn ghost" data-action="reject">Reject all</button>' +
      '<button type="button" class="btn ghost" data-action="save">Save choices</button>' +
      '<button type="button" class="btn ghost" data-action="accept">Accept all</button>' +
      '</div>';
    // Right after the skip link: keyboard users reach the choice before the page content. It is fixed to the bottom of
    // the viewport, so it moves nothing on the page (no layout shift).
    var skip = document.querySelector('.skip-link');
    if (skip && skip.parentNode) skip.parentNode.insertBefore(banner, skip.nextSibling);
    else document.body.insertBefore(banner, document.body.firstChild);
    banner.addEventListener('click', function (e) {
      var t = e.target.closest && e.target.closest('[data-action],[data-cat]');
      if (!t) return;
      if (t.getAttribute('data-cat')) { setSwitch(t, t.getAttribute('aria-checked') !== 'true'); return; }
      var a = t.getAttribute('data-action');
      if (a === 'accept') choose({ analytics: true, ads: true });
      else if (a === 'reject') choose({ analytics: false, ads: false });
      else if (a === 'customize') view('custom', true);
      else if (a === 'save') choose({ analytics: switchOn('analytics'), ads: switchOn('ads') });
    });
  }

  function switches() { return banner.querySelectorAll('[data-cat]'); }
  function setSwitch(sw, on) {
    sw.setAttribute('aria-checked', on ? 'true' : 'false');
    var st = sw.querySelector('.state');
    if (st) st.textContent = on ? 'On' : 'Off';
  }
  function switchOn(key) {
    var all = switches();
    for (var i = 0; i < all.length; i++) if (all[i].getAttribute('data-cat') === key) return all[i].getAttribute('aria-checked') === 'true';
    return false;
  }
  function view(name, focus) {
    var parts = banner.querySelectorAll('[data-view]');
    for (var i = 0; i < parts.length; i++) parts[i].hidden = parts[i].getAttribute('data-view') !== name;
    var all = switches();
    for (var j = 0; j < all.length; j++) setSwitch(all[j], current[all[j].getAttribute('data-cat')] === true);
    if (focus) {
      var target = name === 'custom' ? all[0] : banner.querySelector('[data-view="main"] [data-action]');
      if (target) target.focus();
    }
  }

  function show(name, focus) {
    if (!banner) build();
    banner.hidden = false;
    view(name, focus);
  }

  function hide() {
    if (!banner) return;
    var hadFocus = banner.contains(document.activeElement);
    banner.hidden = true;
    if (hadFocus && opener) opener.focus();
    opener = null;
  }

  function choose(s) {
    saveChoice(s);
    apply(s);
    hide();
  }

  function init() {
    var choice = readChoice();
    if (choice) apply(choice);
    else show('main', false);
    var links = document.querySelectorAll('[data-consent-open]');
    for (var i = 0; i < links.length; i++) {
      var wrap = links[i].closest('.consent-settings');
      if (wrap) wrap.hidden = false;
      // Reopened from the footer: straight to the two switches, showing the current state.
      links[i].addEventListener('click', function (e) { opener = e.currentTarget; show('custom', true); });
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
