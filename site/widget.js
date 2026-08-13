/* Free LLM API Hub — embeddable widget.
   Drop this on any page:
     <div id="flh-widget" data-count="6" data-modality="text"></div>
     <script src="https://freellmapihub.com/widget.js" async></script>
   Renders a compact, always-current list of top verified free APIs, linking back.
   Self-contained: inline styles only, no dependency on the host page's CSS. */
(function () {
  var el = document.getElementById('flh-widget') || document.querySelector('[data-flh-widget]');
  if (!el) return;
  var SITE = 'https://freellmapihub.com';
  var count = Math.max(1, Math.min(20, parseInt(el.getAttribute('data-count') || '6', 10)));
  var modality = el.getAttribute('data-modality');
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };

  // Ranking must come from the ONE source of truth: shared-rules.js is generated
  // by the build from scripts/lib/rules.mjs — the same recScore the explorer and
  // the server render use. The widget used to keep its own copy of recScore and
  // it drifted (the card/phone penalties went missing), so a provider with a
  // required card/phone ranked HIGHER here than anywhere else on the site. No
  // second copy: load shared-rules.js like any other script (no eval, so host
  // CSPs that ban eval stay happy) and use window.FLLM_RULES.recScore.
  var rulesReady = new Promise(function (resolve, reject) {
    if (window.FLLM_RULES && typeof window.FLLM_RULES.recScore === 'function') { resolve(); return; }
    var s = document.createElement('script');
    s.src = SITE + '/shared-rules.js';
    s.onload = function () {
      if (window.FLLM_RULES && typeof window.FLLM_RULES.recScore === 'function') resolve();
      else reject(new Error('shared-rules.js loaded but FLLM_RULES.recScore is missing'));
    };
    s.onerror = function () { reject(new Error('shared-rules.js failed to load')); };
    (document.head || document.documentElement).appendChild(s);
  });

  var fail = function () {
    el.innerHTML = '<div style="font:13px sans-serif;color:#888">Could not load the Free LLM API Hub widget.</div>';
  };

  rulesReady
    .then(function () {
      return fetch(SITE + '/providers.json').then(function (r) { if (!r.ok) throw new Error('providers.json failed'); return r.json(); });
    })
    .then(function (d) {
      var score = window.FLLM_RULES.recScore;
      var list = d.providers
        .filter(function (p) { return p.verified && (!modality || (p.modalities || []).indexOf(modality) >= 0); })
        .sort(function (a, b) { return score(b) - score(a); })
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
