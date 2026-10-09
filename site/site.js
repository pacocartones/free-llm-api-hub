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

  // The GitHub star count is written into the pages at build time (data/repo-stats.json); the client makes no GitHub call.

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

})();
