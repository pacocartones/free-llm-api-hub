/* Shared site behaviour: theme toggle, "/" to focus search.
   Loaded on every page. Theme is also set inline in <head> to avoid a flash. */
(function () {
  var root = document.documentElement;

  // --- theme toggle (initial value already applied inline in <head>) ---
  var toggle = document.getElementById('themeToggle');
  if (toggle) {
    // The button is named "Light theme" and aria-pressed says whether it is on, so a screen reader hears the state
    // ("Light theme, toggle button, not pressed"), not a name that fits both states (WCAG 4.1.2).
    var syncPressed = function () { toggle.setAttribute('aria-pressed', root.getAttribute('data-theme') === 'light' ? 'true' : 'false'); };
    syncPressed();
    toggle.addEventListener('click', function () {
      var next = root.getAttribute('data-theme') === 'light' ? 'dark' : 'light';
      root.setAttribute('data-theme', next);
      try { localStorage.setItem('theme', next); } catch (e) {}
      syncPressed();
    });
  }

  // The GitHub star count is written into the pages at build time (data/repo-stats.json); the client makes no GitHub call.

  // --- API endpoint rows: clipboard success is announced only after completion ---
  document.querySelectorAll('.api-copy').forEach(function (btn) {
    var status = btn.parentElement.querySelector('.api-copy-status');
    // The provider page's "Copy base URL" keeps its own label and failure hint (data-label, data-copy-fail).
    var label = btn.getAttribute('data-label') || 'Copy';
    var failText = btn.getAttribute('data-copy-fail') || 'Copy failed. Copy the endpoint link address manually.';
    btn.addEventListener('click', async function () {
      if (btn.getAttribute('aria-disabled') === 'true') return;
      btn.setAttribute('aria-disabled', 'true');
      btn.textContent = label;
      btn.classList.remove('copied');
      status.textContent = '';
      try {
        if (!navigator.clipboard || !navigator.clipboard.writeText) throw new Error('Clipboard unavailable');
        await navigator.clipboard.writeText(btn.getAttribute('data-api-url'));
        btn.textContent = 'Copied';
        btn.classList.add('copied');
        status.textContent = 'URL copied.';
      } catch (e) {
        btn.textContent = label;
        btn.classList.remove('copied');
        status.textContent = failText;
      } finally {
        btn.setAttribute('aria-disabled', 'false');
      }
    });
  });

  // --- copy button on every code block (quickstarts, embed snippets) ---
  // One short, visually hidden status line announces the result; the button itself is not a live region.
  var copyStatus = null;
  var announceCopy = function (text) {
    // Announcing is best effort: it must never turn a successful copy into a failure.
    try {
      if (!copyStatus) {
        if (!document.body) return;
        var region = document.createElement('span');
        region.className = 'sr-only';
        region.setAttribute('role', 'status');
        document.body.appendChild(region);
        copyStatus = region;
      }
      copyStatus.textContent = text;
    } catch (e) { /* no status line: the button text still reports the result */ }
  };
  document.querySelectorAll('pre').forEach(function (pre) {
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'pre-copy';
    btn.textContent = 'Copy';
    btn.setAttribute('aria-label', 'Copy code to clipboard');
    btn.addEventListener('click', async function () {
      if (btn.getAttribute('aria-disabled') === 'true') return;
      btn.setAttribute('aria-disabled', 'true');
      btn.textContent = 'Copy';
      btn.title = '';
      btn.setAttribute('aria-label', 'Copy code to clipboard');
      btn.classList.remove('copied');
      try {
        if (!navigator.clipboard || !navigator.clipboard.writeText) throw new Error('Clipboard unavailable');
        var code = pre.querySelector('code') || pre;
        await navigator.clipboard.writeText(code.innerText);
        btn.textContent = 'Copied';
        btn.setAttribute('aria-label', 'Code copied to clipboard');
        btn.classList.add('copied');
        announceCopy('Code copied.');
      } catch (e) {
        btn.textContent = 'Copy failed';
        btn.title = 'Select the code and copy it manually.';
        btn.setAttribute('aria-label', 'Copy failed. ' + btn.title);
        announceCopy('Copy failed. Select the code and copy it manually.');
      } finally {
        btn.setAttribute('aria-disabled', 'false');
      }
    });
    pre.appendChild(btn);
  });

  // --- "/" focuses the search box on pages that have one (not while typing elsewhere) ---
  var search = document.getElementById('q');
  if (search) {
    document.addEventListener('keydown', function (e) {
      if (e.key !== '/' || e.ctrlKey || e.metaKey || e.altKey || e.defaultPrevented) return;
      var t = e.target;
      var tag = t && t.tagName ? t.tagName.toLowerCase() : '';
      if (tag === 'input' || tag === 'textarea' || tag === 'select' || (t && t.isContentEditable)) return;
      e.preventDefault();
      search.focus();
    });
  }

  // --- mobile nav toggle (collapse only after the controls are ready) ---
  var navToggle = document.getElementById('navToggle');
  var header = document.querySelector('.site-header');
  var primaryNav = document.getElementById('primary-nav');
  if (navToggle && header && primaryNav) {
    var setNav = function (open) {
      header.classList.toggle('nav-open', open);
      navToggle.setAttribute('aria-expanded', open ? 'true' : 'false');
      navToggle.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
    };
    navToggle.addEventListener('click', function (e) {
      e.stopPropagation();
      var open = !header.classList.contains('nav-open');
      setNav(open);
      // The menu comes before the toggle in the page, but opens below it: without this, Tab from the toggle would
      // skip the links that just appeared (WCAG 2.4.3). Escape (below) brings focus back to the toggle.
      if (open) { var first = primaryNav.querySelector('a, summary'); if (first) first.focus(); }
    });
    primaryNav.addEventListener('click', function (e) {
      if (e.target.closest('a')) setNav(false);
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && header.classList.contains('nav-open')) { setNav(false); navToggle.focus(); }
    });
    document.addEventListener('click', function (e) {
      if (header.classList.contains('nav-open') && !e.target.closest('.site-header')) setNav(false);
    });
    header.classList.add('nav-ready');
  }

  // --- the menu's Providers group (a <details>): Escape or a click outside closes it. It opens and works without this. ---
  var navGroups = document.querySelectorAll('.nav-group');
  if (navGroups.length) {
    var closeGroups = function (keep) {
      for (var i = 0; i < navGroups.length; i++) if (navGroups[i] !== keep) navGroups[i].removeAttribute('open');
    };
    document.addEventListener('click', function (e) { closeGroups(e.target && e.target.closest ? e.target.closest('.nav-group') : null); });
    document.addEventListener('keydown', function (e) {
      if (e.key !== 'Escape') return;
      // Focus on a link inside the group would be left on a hidden element: return it to the group's summary (WCAG 2.4.3).
      for (var i = 0; i < navGroups.length; i++) {
        var g = navGroups[i];
        if (g.open && g.contains(document.activeElement) && document.activeElement.tagName !== 'SUMMARY') {
          var s = g.querySelector('summary');
          g.removeAttribute('open');
          if (s) s.focus();
        }
      }
      closeGroups(null);
    });
  }

  // --- dated banner: leaves the page after its data-until day (UTC, inclusive) ---
  var banner = document.getElementById('event-banner');
  if (banner) {
    // The cutoff is midnight at the start of the day after data-until, so the whole last day shows it.
    var cutoff = Date.parse((banner.getAttribute('data-until') || '') + 'T00:00:00Z') + 24 * 60 * 60 * 1000;
    if (!isNaN(cutoff) && Date.now() >= cutoff) banner.remove();
  }

  // --- data-policy page: how old the weekly report of the quoted pages is, counted when the page is opened ---
  var chk = document.querySelector('.dp-check[data-ran-at]');
  if (chk && chk.getAttribute('data-ran-at')) {
    var ran = Date.parse(chk.getAttribute('data-ran-at'));
    if (!isNaN(ran)) {
      var days = Math.max(0, Math.floor((Date.now() - ran) / 86400000));
      var level = days >= 15 ? 'red' : days >= 8 ? 'amber' : 'ok';
      var age = chk.querySelector('.dp-age'); var lv = chk.querySelector('.dp-level');
      if (age) age.textContent = days + (days === 1 ? ' day old' : ' days old');
      if (lv) lv.textContent = level === 'red' ? 'The report has not been renewed for more than two weeks.' : level === 'amber' ? 'The report has not been renewed for more than a week.' : 'The report is up to date.';
      chk.setAttribute('data-level', level);
    }
  }

})();
