// consent.client.js — the analytics consent banner. The build copies it to site/consent.js ONLY when GA_MEASUREMENT_ID is
// set (see lib/analytics.mjs), with the measurement ID written in place of the placeholder below; with no ID the site ships
// neither this file nor any reference to it.
//
// Nothing from Google loads until the visitor presses Accept. The choice is kept in localStorage (no cookie of ours);
// Reject means no request to Google, ever. "Cookie settings" in the footer reopens the banner, and rejecting after an
// earlier Accept turns tracking off on the spot and deletes the Google Analytics cookies.
(function () {
  'use strict';
  var ID = '__GA_MEASUREMENT_ID__';
  var KEY = 'analytics-consent';
  var loaded = false;
  var opener = null;

  function readChoice() { try { return localStorage.getItem(KEY); } catch (e) { return null; } }
  function saveChoice(v) { try { localStorage.setItem(KEY, v); } catch (e) { /* private mode: the choice holds for this page only */ } }

  function loadAnalytics() {
    if (loaded) return;
    loaded = true;
    window['ga-disable-' + ID] = false;
    window.dataLayer = window.dataLayer || [];
    window.gtag = function () { window.dataLayer.push(arguments); };
    // Consent Mode v2: analytics only; every advertising signal stays denied.
    window.gtag('consent', 'default', { analytics_storage: 'granted', ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied' });
    window.gtag('set', 'ads_data_redaction', true);
    window.gtag('js', new Date());
    // GA4 does not log or store IP addresses; Google signals and ad personalisation are off.
    window.gtag('config', ID, { allow_google_signals: false, allow_ad_personalization_signals: false });
    var s = document.createElement('script');
    s.async = true;
    s.src = 'https://www.googletagmanager.com/gtag/js?id=' + encodeURIComponent(ID);
    document.head.appendChild(s);
  }

  function stopAnalytics() {
    window['ga-disable-' + ID] = true;
    if (loaded && window.gtag) window.gtag('consent', 'update', { analytics_storage: 'denied' });
    // Delete the Google Analytics cookies (_ga, _ga_<container>) on this host and its parent domain.
    var host = location.hostname;
    var domains = ['', host, '.' + host, '.' + host.replace(/^www\./, '')];
    document.cookie.split(';').forEach(function (c) {
      var name = c.split('=')[0].trim();
      if (!/^_ga(_|$)/.test(name)) return;
      domains.forEach(function (d) {
        document.cookie = name + '=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/' + (d ? '; domain=' + d : '');
      });
    });
  }

  var CSS = '.consent-banner{position:fixed;left:16px;right:16px;bottom:16px;z-index:1000;max-width:640px;margin:0 auto;' +
    'background:var(--panel-2,#131b17);color:var(--text,#d8e2dc);border:1px solid var(--border,#1d2a22);border-radius:12px;' +
    'padding:16px 18px;box-shadow:0 8px 30px rgba(0,0,0,.35);font-size:.9rem;line-height:1.5}' +
    '.consent-banner p{margin:0 0 12px}.consent-banner p a{text-decoration:underline;text-underline-offset:2px}.consent-banner .consent-title{font-weight:700;margin-bottom:4px}' +
    '.consent-actions{display:flex;flex-wrap:wrap;gap:10px}.consent-actions .btn{flex:1 1 140px;justify-content:center}' +
    '.consent-banner[hidden]{display:none}' +
    '.consent-link{background:none;border:0;padding:0;font:inherit;color:var(--accent,#3fce8f);cursor:pointer}' +
    '.consent-link:hover{text-decoration:underline}';

  var banner = null;
  function build() {
    var style = document.createElement('style');
    style.textContent = CSS;
    document.head.appendChild(style);
    banner = document.createElement('section');
    banner.className = 'consent-banner';
    banner.id = 'consent-banner';
    banner.setAttribute('aria-labelledby', 'consent-title');
    banner.hidden = true;
    banner.innerHTML =
      '<p class="consent-title" id="consent-title">Analytics cookies</p>' +
      '<p id="consent-desc">May we use Google Analytics to count visits and see which pages help? It sets cookies and sends usage data to Google only if you accept. You can change your mind any time under “Cookie settings” at the bottom of every page. <a href="/legal/privacy">Privacy policy</a></p>' +
      '<div class="consent-actions">' +
      '<button type="button" class="btn ghost" data-consent="denied">Reject</button>' +
      '<button type="button" class="btn ghost" data-consent="granted">Accept</button>' +
      '</div>';
    banner.setAttribute('aria-describedby', 'consent-desc');
    // Right after the skip link: keyboard users reach the choice before the page content. It is fixed to the bottom of
    // the viewport, so it moves nothing on the page (no layout shift).
    var skip = document.querySelector('.skip-link');
    if (skip && skip.parentNode) skip.parentNode.insertBefore(banner, skip.nextSibling);
    else document.body.insertBefore(banner, document.body.firstChild);
    banner.addEventListener('click', function (e) {
      var b = e.target.closest && e.target.closest('[data-consent]');
      if (b) choose(b.getAttribute('data-consent'));
    });
  }

  function show(focus) {
    if (!banner) build();
    banner.hidden = false;
    if (focus) banner.querySelector('[data-consent]').focus();
  }

  function hide() {
    if (!banner) return;
    var hadFocus = banner.contains(document.activeElement);
    banner.hidden = true;
    if (hadFocus && opener) opener.focus();
    opener = null;
  }

  function choose(v) {
    saveChoice(v);
    if (v === 'granted') loadAnalytics(); else stopAnalytics();
    hide();
  }

  function init() {
    var choice = readChoice();
    if (choice === 'granted') loadAnalytics();
    else if (choice !== 'denied') show(false);
    var links = document.querySelectorAll('[data-consent-open]');
    for (var i = 0; i < links.length; i++) {
      var wrap = links[i].closest('.consent-settings');
      if (wrap) wrap.hidden = false;
      links[i].addEventListener('click', function (e) { opener = e.currentTarget; show(true); });
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
