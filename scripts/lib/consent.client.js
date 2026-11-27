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
    // cookie_flags: the _ga/_gcl cookies gtag writes are Secure and SameSite=Lax (gtag's default sets neither); a cookie
    // written from JavaScript cannot be HttpOnly.
    window.gtag('config', ID, { allow_google_signals: f.allow_google_signals, allow_ad_personalization_signals: f.allow_ad_personalization_signals, cookie_flags: 'SameSite=Lax;Secure' });
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
    if (s.analytics) pageEvents();
  }

  var CSS = '.consent-banner{position:fixed;left:16px;right:16px;bottom:16px;z-index:1000;max-width:660px;margin:0 auto;' +
    'max-height:calc(100vh - 32px);overflow:auto;' +
    'background:var(--panel-2,#251c18);color:var(--text,#fbf1ec);border:1px solid var(--border,#352822);border-radius:12px;' +
    'padding:16px 18px;box-shadow:0 8px 30px rgba(0,0,0,.35);font-size:.9rem;line-height:1.5}' +
    '.consent-banner p{margin:0 0 12px}.consent-banner p a{text-decoration:underline;text-underline-offset:2px}' +
    '.consent-banner .consent-title{font-weight:700;margin-bottom:4px}' +
    '.consent-actions{display:flex;flex-wrap:wrap;gap:10px}.consent-actions .btn{flex:1 1 140px;justify-content:center}' +
    '.consent-banner [hidden],.consent-banner[hidden]{display:none}' +
    '.consent-cats{list-style:none;margin:0 0 14px;padding:0;display:grid;gap:10px}' +
    '.consent-cat{display:flex;gap:14px;align-items:flex-start;justify-content:space-between;padding:10px 12px;' +
    'border:1px solid var(--border,#352822);border-radius:9px;background:var(--panel,#211915)}' +
    '.consent-cat .consent-cat-name{margin:0;color:var(--text,#fbf1ec);font-weight:700;font-size:.9rem}' +
    '.consent-cat .consent-cat-desc{margin:2px 0 0;color:var(--muted,#c2a89e);font-size:.84rem}' +
    '.consent-switch{flex:0 0 auto;display:inline-flex;align-items:center;gap:8px;background:none;border:0;padding:4px;font:inherit;' +
    'font-size:.8rem;color:var(--text,#fbf1ec);cursor:pointer}' +
    '.consent-switch .track{position:relative;width:40px;height:22px;border-radius:11px;border:1px solid var(--control-border,#7a645b);' +
    'background:var(--panel-2,#251c18);transition:background .15s}' +
    '.consent-switch .knob{position:absolute;top:2px;left:2px;width:16px;height:16px;border-radius:50%;background:var(--muted,#c2a89e);transition:left .15s}' +
    '.consent-switch[aria-checked="true"] .track{background:var(--accent,#ffb25c);border-color:var(--accent,#ffb25c)}' +
    '.consent-switch[aria-checked="true"] .knob{left:20px;background:var(--accent-ink,#17110f)}' +
    '.consent-switch .state{min-width:2.2em;text-align:left}' +
    '@media (prefers-reduced-motion: reduce){.consent-switch .track,.consent-switch .knob{transition:none}}' +
    '.consent-link{background:none;border:0;padding:0;font:inherit;color:var(--accent,#ffb25c);cursor:pointer}' +
    '.consent-link:hover{text-decoration:underline}' +
    // Phones: a compact bar (at most 120px tall at 390px wide). Same texts and the same three answers: the title runs into
    // the explanation, which keeps three lines and scrolls (it is focusable, so it scrolls from the keyboard too), and the
    // three buttons share one row.
    '@media (max-width:600px){.consent-banner{left:8px;right:8px;bottom:8px;padding:8px 10px;border-radius:10px;font-size:.75rem;line-height:1.35}' +
    '.consent-text{max-height:4.05em;overflow:auto;margin:0 0 7px}.consent-text p{display:inline;margin:0}' +
    '.consent-banner .consent-title{margin:0 .35em 0 0}' +
    '.consent-actions{gap:6px;flex-wrap:nowrap}.consent-actions .btn{flex:1 1 0;min-width:0;padding:6px 4px;min-height:32px;font-size:.74rem;border-radius:7px}' +
    '.consent-cats{gap:6px;margin-bottom:8px}.consent-cat{padding:6px 8px}.consent-cat .consent-cat-desc{font-size:.72rem}}';

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
      '<div class="consent-text" tabindex="0"><p class="consent-title" id="consent-title">Cookies</p>' +
      '<p id="consent-desc">May we use Google cookies for analytics and, separately, for advertising and personalised measurement (Google signals)? Nothing is sent to Google unless you allow at least one of them. You can change your choice any time under “Cookie settings” at the bottom of every page. <a href="/legal/privacy">Privacy policy</a></p></div>' +
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
    // Escape closes the panel without changing anything, and focus goes back to "Cookie settings". Only once a choice
    // is stored: on a first visit the banner stays until the visitor picks one of the three answers.
    banner.addEventListener('keydown', function (e) {
      if (e.key !== 'Escape' || !readChoice()) return;
      if (e.preventDefault) e.preventDefault();
      hide();
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

  // ---------- product events ----------
  // Sent ONLY while the analytics category is granted (track() is a no-op otherwise, and before gtag.js has loaded).
  // Every parameter comes from a fixed list or a validated slug; the one free text, the site's own search box, is
  // normalised, truncated to 60 characters and dropped when it looks like personal data. Outbound clicks and file
  // downloads are still measured by GA's enhanced measurement; these events carry the provider-specific detail under
  // their own names. History changes (the explorer rewrites its URL on every keystroke) never send a page_view: that
  // enhanced-measurement option is off in the GA4 stream.
  var SLUG = /^[a-z0-9][a-z0-9-]{0,63}$/;
  var LINK_TYPES = ['docs', 'keys', 'website', 'playground', 'models', 'limits_source', 'data_policy'];
  var CHIPS = { 'f-nocard': 'no_card', 'f-nophone': 'no_phone', 'f-commercial': 'commercial', 'f-text': 'text_only', 'f-notrain': 'no_training', 'f-openai': 'openai_compatible', 'f-verified': 'verified' };
  var CATEGORIES = ['all', 'ongoing', 'trial'];
  var SORT_KEYS = ['recommended', 'name', 'category', 'free_tier', 'notes', 'verified'];
  var DOWNLOAD = /^\/((providers\.(json|csv))|(api\/v1\/[a-z0-9._-]+\.(json|yaml))|(llms(-full)?\.txt)|(badge-[a-z]+\.json))$/;
  var SNIPPET_KINDS = ['embed', 'badge', 'citation'];
  // Links to this project's GitHub repository (stars, issues, contributing): repo_click with where the link sits. A link can
  // name its place (data-repo-location, from the fixed list); otherwise the site header or footer it sits in, or a
  // contribution link (the /contributing/ and /submit/ pages, issue forms, discussions, pull requests, forks), else content.
  var REPO_PATH = /^\/pacocartones\/free-llm-api-hub(\/|$)/i;
  var REPO_LOCATIONS = ['header', 'footer', 'contribute', 'content'];
  var CONTRIBUTE_PAGE = /^\/(contributing|submit)(\/|\.html|$)/;
  var CONTRIBUTE_TARGET = /^\/[^/]+\/[^/]+\/((issues\/new|discussions|pulls?|fork|compare)(\/|$)|blob\/[^/]+\/CONTRIBUTING\.md$)/i;
  var SEARCH_IDLE_MS = 1500;
  // /find/ (site/find.js) reports a finished wizard as a DOM event; only these values pass (lib/find.mjs USES, CONSTRAINTS).
  var WIZARD_USES = ['any', 'chat', 'code', 'embeddings', 'speech', 'image', 'ocr'];
  var WIZARD_FILTERS = ['card', 'phone', 'commercial', 'train', 'openai'];
  var pageSent = false;
  var lastSearch = '';
  var searchTimer = null;

  function track(name, params) {
    if (!current.analytics || !loaded || typeof window.gtag !== 'function') return false;
    window.gtag('event', name, params);
    return true;
  }

  // Page-level events, once per page view, as soon as analytics is granted.
  function pageEvents() {
    if (pageSent || !current.analytics || !loaded) return;
    pageSent = true;
    var path = String(location.pathname || '/').replace(/\/index\.html$/, '/');
    var m = /^\/compare\/([a-z0-9-]+-vs-[a-z0-9-]+)\/?$/.exec(path);
    if (m) track('compare_view', { pair: m[1].slice(0, 100) });
    else if (/^\/compare\/?$/.test(path)) {
      var q = /[?&]compare=([^&#]*)/.exec(location.search || '');
      var slugs = q ? decodeURIComponent(q[1]).split(',').filter(function (s) { return SLUG.test(s); }).slice(0, 4) : [];
      if (slugs.length >= 2) track('compare_view', { pair: slugs.join(',').slice(0, 100) });
    }
    var c = /^\/collections\/([a-z0-9-]+?)(\.html)?$/.exec(path);
    if (c && c[1] !== 'index') track('collection_view', { collection: c[1] });
  }

  function normaliseSearch(v) {
    var t = String(v || '').replace(/\s+/g, ' ').trim().toLowerCase().slice(0, 60).trim();
    if (!t || /@/.test(t) || /\d{6,}/.test(t)) return '';
    return t;
  }
  function flushSearch() {
    if (searchTimer) { clearTimeout(searchTimer); searchTimer = null; }
    var box = document.getElementById('q');
    var term = box ? normaliseSearch(box.value) : '';
    if (!term || term === lastSearch) return;
    if (track('site_search', { search_term: term })) lastSearch = term;
  }

  function repoLocation(a, url) {
    var declared = a.getAttribute('data-repo-location');
    if (declared && REPO_LOCATIONS.indexOf(declared) !== -1) return declared;
    if (a.closest('.site-header')) return 'header';
    if (a.closest('.site-footer')) return 'footer';
    if (CONTRIBUTE_PAGE.test(String(location.pathname || '/')) || CONTRIBUTE_TARGET.test(url.pathname)) return 'contribute';
    return 'content';
  }

  function onClick(e) {
    var t = e.target;
    if (!t || !t.closest) return;
    var a = t.closest('a[href]');
    if (a) {
      var link = a.getAttribute('data-link');
      var provider = a.getAttribute('data-provider');
      if (link && provider && LINK_TYPES.indexOf(link) !== -1 && SLUG.test(provider)) {
        track('outbound_provider_click', { provider: provider, link_type: link });
      }
      var url;
      try { url = new URL(a.getAttribute('href'), location.href); } catch (err) { url = null; }
      if (url && url.hostname === location.hostname && DOWNLOAD.test(url.pathname)) {
        track('api_download', { file: url.pathname.slice(1) });
      }
      if (url && (url.hostname === 'github.com' || url.hostname === 'www.github.com') && REPO_PATH.test(url.pathname)) {
        track('repo_click', { location: repoLocation(a, url) });
      }
      return;
    }
    var copy = t.closest('.pre-copy, .api-copy');
    if (copy) {
      var kind = 'api_url';
      if (copy.classList.contains('pre-copy')) {
        var pre = copy.closest('pre');
        // A block can name its kind (data-snippet, from a fixed list): the citations and badges of /embed/.
        var declared = pre ? pre.getAttribute('data-snippet') : null;
        var code = pre ? (pre.querySelector('code') || pre).textContent : '';
        var head = String(code || '').replace(/^\s+/, '');
        kind = SNIPPET_KINDS.indexOf(declared) !== -1 ? declared
          : /^curl\b/.test(head) ? 'curl'
          : /^(from|import)\s/.test(head) ? 'python'
          : /^(export|set)\s+[A-Z][A-Z0-9_]*=/.test(head) ? 'env_key'
          : /^<(script|iframe|a|img|div)\b/i.test(head) ? 'embed'
          : 'other';
      }
      track('copy_snippet', { snippet: kind });
      return;
    }
    var cat = t.closest('#cat button[data-cat]');
    if (cat) {
      var v = cat.getAttribute('data-cat');
      if (CATEGORIES.indexOf(v) !== -1) track('explorer_filter', { filter_name: 'category', filter_value: v });
      return;
    }
    // Sorting by a column header: the explorer's own handler runs first, so aria-sort already holds the new order.
    var th = t.closest('thead th[data-key]');
    if (th) {
      var key = th.getAttribute('data-key');
      var dir = th.getAttribute('aria-sort') === 'ascending' ? 'asc' : 'desc';
      if (SORT_KEYS.indexOf(key) !== -1) track('explorer_sort', { sort_key: key, sort_dir: dir });
    }
  }

  function onChange(e) {
    var t = e.target;
    if (!t || !t.id) return;
    if (CHIPS[t.id]) { track('explorer_filter', { filter_name: CHIPS[t.id], filter_value: t.checked ? 'on' : 'off' }); return; }
    if (t.id === 'modality') {
      if (/^[a-z]{1,20}$/.test(t.value)) track('explorer_filter', { filter_name: 'modality', filter_value: t.value });
      return;
    }
    if (t.id === 'sortSel') {
      var p = String(t.value).split(':');
      if (SORT_KEYS.indexOf(p[0]) !== -1) track('explorer_sort', { sort_key: p[0], sort_dir: p[1] === '-1' ? 'desc' : 'asc' });
    }
  }

  // wizard_complete: what the visitor builds, which constraints they set (a sorted list from a fixed set, or "none")
  // and how many providers matched. Nothing typed by the visitor; anything outside the lists drops the event.
  function onWizardComplete(e) {
    var d = e && e.detail;
    if (!d || WIZARD_USES.indexOf(d.use) === -1) return;
    var filters = String(d.filters || 'none');
    if (filters !== 'none') {
      var parts = filters.split(',');
      for (var i = 0; i < parts.length; i++) if (WIZARD_FILTERS.indexOf(parts[i]) === -1 || parts.indexOf(parts[i]) !== i) return;
    }
    var n = d.results;
    if (typeof n !== 'number' || n !== Math.floor(n) || n < 0 || n > 999) return;
    track('wizard_complete', { use: d.use, filters: filters, result_count: n });
  }

  function listen() {
    document.addEventListener('fllm:wizard-complete', onWizardComplete);
    document.addEventListener('click', onClick);
    // Middle-click opens a provider link in a new tab without a click event.
    document.addEventListener('auxclick', function (e) { if (e.button === 1) onClick(e); });
    document.addEventListener('change', onChange);
    // The search box: sent after 1.5 s without typing, or at once on Enter or when it loses focus; an identical
    // consecutive query is sent once.
    document.addEventListener('input', function (e) {
      if (!e.target || e.target.id !== 'q') return;
      if (searchTimer) clearTimeout(searchTimer);
      searchTimer = setTimeout(flushSearch, SEARCH_IDLE_MS);
    });
    document.addEventListener('keydown', function (e) { if (e.target && e.target.id === 'q' && e.key === 'Enter') flushSearch(); });
    document.addEventListener('focusout', function (e) { if (e.target && e.target.id === 'q') flushSearch(); });
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
    listen();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
