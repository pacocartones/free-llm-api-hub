/* Free LLM API Hub — embeddable widget.
   Drop this on any page:
     <div id="flh-widget" data-count="6" data-modality="text" data-category="ongoing" data-sort="recommended"></div>
     <script src="https://freellmapihub.com/widget.js" async></script>
   Optional attributes:
     data-count     how many providers to show, 1-20 (default 6)
     data-modality  only this modality: text, audio, embeddings, image, vision, ocr, rerank
     data-category  only this category: "ongoing" or "trial" (default: both)
     data-sort      an explorer sort key: recommended (default), name, category,
                    free_tier, notes, verified
   Renders a compact, always-current list of top verified free APIs, linking back.
   Self-contained: inline styles only, no dependency on the host page's CSS. */
(function () {
  var el = document.getElementById('flh-widget') || document.querySelector('[data-flh-widget]');
  if (!el) return;
  var SITE = 'https://freellmapihub.com';
  var count = Math.max(1, Math.min(20, parseInt(el.getAttribute('data-count') || '6', 10)));
  var modality = el.getAttribute('data-modality');
  var category = el.getAttribute('data-category');
  if (category !== 'ongoing' && category !== 'trial') category = null;
  // The same keys the explorer offers; anything else falls back to the default.
  var SORT_KEYS = ['recommended', 'name', 'category', 'free_tier', 'notes', 'verified'];
  var sort = el.getAttribute('data-sort');
  if (SORT_KEYS.indexOf(sort) === -1) sort = 'recommended';
  // Direction per key: 'recommended' ignores it (the comparator is always
  // best-first); ascending reads best-first for name/category and for the
  // free-type taxonomy (permanent tiers rank first); 'verified' reads
  // newest-first, and rows with no date sink either way.
  var SORT_DIRS = { recommended: 1, name: 1, category: 1, free_tier: 1, notes: 1, verified: -1 };
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };

  // Ranking must come from the ONE source of truth: shared-rules.js is generated
  // by the build from scripts/lib/rules.mjs — the same recScore the explorer and
  // the server render use. The widget used to keep its own copy of recScore and
  // it drifted (the card/phone penalties went missing), so a provider with a
  // required card/phone ranked HIGHER here than anywhere else on the site. No
  // second copy: load shared-rules.js like any other script (no eval, so host
  // CSPs that ban eval stay happy) and use window.FLLM_RULES.recScore.
  // The sort order is the same story: the widget sorts with the explorer's own
  // comparator from shared-sort.js (window.FLLM_SORT), not a local re-implementation.
  var loadScript = function (src) {
    return new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = src;
      s.onload = resolve;
      s.onerror = function () { reject(new Error(src + ' failed to load')); };
      (document.head || document.documentElement).appendChild(s);
    });
  };

  var rulesReady = (window.FLLM_RULES && typeof window.FLLM_RULES.recScore === 'function'
    ? Promise.resolve()
    : loadScript(SITE + '/shared-rules.js'))
    .then(function () {
      if (!(window.FLLM_RULES && typeof window.FLLM_RULES.recScore === 'function')) {
        throw new Error('shared-rules.js loaded but FLLM_RULES.recScore is missing');
      }
    })
    // shared-sort.js reads window.FLLM_RULES at load time, so it loads after rules.
    .then(function () {
      if (window.FLLM_SORT && typeof window.FLLM_SORT.comparator === 'function') return;
      return loadScript(SITE + '/shared-sort.js').then(function () {
        if (!(window.FLLM_SORT && typeof window.FLLM_SORT.comparator === 'function')) {
          throw new Error('shared-sort.js loaded but FLLM_SORT.comparator is missing');
        }
      });
    });

  var fail = function () {
    el.innerHTML = '<div style="font:13px sans-serif;color:#888">Could not load the Free LLM API Hub widget.</div>';
  };

  rulesReady
    .then(function () {
      return fetch(SITE + '/providers.json').then(function (r) { if (!r.ok) throw new Error('providers.json failed'); return r.json(); });
    })
    .then(function (d) {
      var compare = window.FLLM_SORT.comparator;
      var list = d.providers
        .filter(function (p) { return p.verified && (!modality || (p.modalities || []).indexOf(modality) >= 0) && (!category || p.category === category); })
        .sort(function (a, b) { return compare(sort, SORT_DIRS[sort], a, b); })
        .slice(0, count);
      var box = 'font:14px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",Inter,Roboto,sans-serif;color:#d8e2dc;background:#0f1512;border:1px solid #232c25;border-radius:10px;padding:14px 16px;max-width:440px;box-sizing:border-box';
      var html = '<div style="' + box + '">';
      html += '<div style="font-weight:700;font-size:12px;color:#3fce8f;letter-spacing:.08em;text-transform:uppercase;margin-bottom:10px">Free LLM API Hub · top free APIs</div>';
      list.forEach(function (p) {
        html += '<div style="padding:7px 0;border-top:1px solid #1d2a22">' +
          '<a href="' + SITE + '/p/' + esc(p.slug) + '" target="_blank" rel="noopener" style="color:#d8e2dc;text-decoration:none;font-weight:600">' + esc(p.name) + '</a>' +
          '<div style="color:#808f87;font-size:12px">' + esc((p.free_tier || '').slice(0, 72)) + '</div></div>';
      });
      html += '<a href="' + SITE + '/" target="_blank" rel="noopener" style="display:inline-block;margin-top:10px;font-size:12px;color:#3fce8f;text-decoration:none">' + list.length + ' of ' + d.providers.length + ' verified · see all →</a>';
      html += '</div>';
      el.innerHTML = html;
    })
    .catch(fail);
})();

