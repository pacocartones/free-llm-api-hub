/* Shared site behaviour: theme toggle, live GitHub star count, "/" to focus search.
   Loaded on every page. Theme is also set inline in <head> to avoid a flash. */
(function () {
  var root = document.documentElement;

  // --- theme toggle (initial value already applied inline in <head>) ---
  var toggle = document.getElementById('themeToggle');
  if (toggle) {
    toggle.addEventListener('click', function () {
      var next = root.getAttribute('data-theme') === 'light' ? 'dark' : 'light';
      root.setAttribute('data-theme', next);
      try { localStorage.setItem('theme', next); } catch (e) {}
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

  // --- "/" focuses the search box (when present and not already typing) ---
  document.addEventListener('keydown', function (e) {
    if (e.key !== '/' || e.metaKey || e.ctrlKey || e.altKey) return;
    var t = e.target, tag = (t && t.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'textarea' || (t && t.isContentEditable)) return;
    var s = document.getElementById('search');
    if (s) { e.preventDefault(); s.focus(); }
  });

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
})();
