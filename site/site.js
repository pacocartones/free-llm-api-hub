/* Shared site behaviour: theme toggle, live GitHub star count, "/" to focus search.
   Loaded on every page. Theme is also set inline in <head> to avoid a flash. */
(function () {
  var root = document.documentElement;

  // --- theme toggle (initial value already applied inline in <head>) ---
  var toggle = document.getElementById('themeToggle');
  if (toggle) {
    var syncPressed = function () { toggle.setAttribute('aria-pressed', root.getAttribute('data-theme') === 'light' ? 'true' : 'false'); };
    syncPressed();
    toggle.addEventListener('click', function () {
      var next = root.getAttribute('data-theme') === 'light' ? 'dark' : 'light';
      root.setAttribute('data-theme', next);
      try { localStorage.setItem('theme', next); } catch (e) {}
      syncPressed();
    });
  }

  // --- live GitHub star count (cached 6h, graceful fallback) ---
  var starEls = document.querySelectorAll('[data-stars]');
  if (starEls.length) {
    var setStars = function (n) {
      starEls.forEach(function (el) { el.textContent = n; });
    };
    var CK = 'flh_stars', CT = 'flh_stars_at', cached, at = 0;
    try { cached = localStorage.getItem(CK); at = +localStorage.getItem(CT) || 0; } catch (e) {}
    if (cached) setStars(cached);
    if (!cached || Date.now() - at > 6 * 3600 * 1000) {
      fetch('https://api.github.com/repos/pacocartones/free-llm-api-hub')
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (d) {
          if (d && typeof d.stargazers_count === 'number') {
            var n = d.stargazers_count.toLocaleString('en-US');
            setStars(n);
            try { localStorage.setItem(CK, n); localStorage.setItem(CT, String(Date.now())); } catch (e) {}
          }
        })
        .catch(function () {});
    }
  }

  // --- copy button on every code block (quickstarts, embed snippets) ---
  document.querySelectorAll('pre').forEach(function (pre) {
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'pre-copy';
    btn.textContent = 'Copy';
    btn.setAttribute('aria-label', 'Copy code to clipboard');
    btn.addEventListener('click', function () {
      var code = pre.querySelector('code') || pre;
      var text = code.innerText;
      var done = function () { btn.textContent = 'Copied'; btn.classList.add('copied'); setTimeout(function () { btn.textContent = 'Copy'; btn.classList.remove('copied'); }, 1300); };
      if (navigator.clipboard) navigator.clipboard.writeText(text).then(done).catch(done); else done();
    });
    pre.appendChild(btn);
  });

  // --- mobile nav toggle (nav is hidden <=760px until opened) ---
  var navToggle = document.getElementById('navToggle');
  var header = document.querySelector('.site-header');
  var primaryNav = document.getElementById('primary-nav');
  if (navToggle && header) {
    var setNav = function (open) {
      header.classList.toggle('nav-open', open);
      navToggle.setAttribute('aria-expanded', open ? 'true' : 'false');
      navToggle.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
    };
    navToggle.addEventListener('click', function (e) {
      e.stopPropagation();
      setNav(!header.classList.contains('nav-open'));
    });
    if (primaryNav) primaryNav.addEventListener('click', function (e) {
      if (e.target.closest('a')) setNav(false);
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && header.classList.contains('nav-open')) setNav(false);
    });
    document.addEventListener('click', function (e) {
      if (header.classList.contains('nav-open') && !e.target.closest('.site-header')) setNav(false);
    });
  }

  // --- model index search (models/ page): filter rows by their data-s attribute ---
  var mq = document.getElementById('mq');
  if (mq) {
    var mshown = document.getElementById('mshown');
    var mrows = [].slice.call(document.querySelectorAll('.model-table tbody tr'));
    mq.addEventListener('input', function () {
      var v = mq.value.toLowerCase().trim(), n = 0;
      for (var i = 0; i < mrows.length; i++) {
        var ok = !v || mrows[i].getAttribute('data-s').indexOf(v) > -1;
        mrows[i].hidden = !ok;
        if (ok) n++;
      }
      mshown.textContent = n;
    });
  }
})();
