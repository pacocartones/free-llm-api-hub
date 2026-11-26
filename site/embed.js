/* /embed/ page: the widget snippet generator and the per-provider badge picker.
   First-party, no dependency, no network request of its own. Without it the page shows the default snippets.
   The preview is the real widget: on each change it gets a fresh #flh-widget and runs widget.js again. */
(function () {
  var SITE = 'https://freellmapihub.com';
  var MODALITIES = ['text', 'vision', 'image', 'audio', 'embeddings', 'rerank', 'ocr'];
  var SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;

  var form = document.getElementById('embed-form');
  var code = document.getElementById('embed-snippet');
  var preview = document.getElementById('embed-preview');
  if (form && code) {
    var options = function () {
      var n = parseInt(form.elements.count.value, 10);
      if (!(n >= 1)) n = 6;
      if (n > 20) n = 20;
      var m = form.elements.modality.value;
      var c = form.elements.category.value;
      return {
        count: n,
        modality: MODALITIES.indexOf(m) !== -1 ? m : '',
        category: c === 'ongoing' || c === 'trial' ? c : ''
      };
    };
    var attrs = function (o) {
      return ['data-count="' + o.count + '"', o.modality ? 'data-modality="' + o.modality + '"' : '', o.category ? 'data-category="' + o.category + '"' : '']
        .filter(Boolean).join(' ');
    };
    var timer = null;
    var render = function () {
      var o = options();
      code.textContent = '<div id="flh-widget" ' + attrs(o) + '></div>\n<script src="' + SITE + '/widget.js" async></script>';
      if (!preview) return;
      clearTimeout(timer);
      timer = setTimeout(function () {
        var old = document.getElementById('flh-widget');
        if (old) old.parentNode.removeChild(old);
        var el = document.createElement('div');
        el.id = 'flh-widget';
        el.setAttribute('data-count', String(o.count));
        if (o.modality) el.setAttribute('data-modality', o.modality);
        if (o.category) el.setAttribute('data-category', o.category);
        preview.appendChild(el);
        var s = document.createElement('script');
        s.src = '../widget.js';
        document.body.appendChild(s);
      }, 250);
    };
    form.addEventListener('input', render);
    form.addEventListener('change', render);
    form.addEventListener('submit', function (e) { e.preventDefault(); render(); });
  }

  var pick = document.getElementById('badge-provider');
  var badge = document.getElementById('badge-snippet');
  var badgeHtml = document.getElementById('badge-snippet-html');
  // The same escaping as htmlEsc in scripts/lib/rows.mjs, so the snippet matches the built page ("W&B" → "W&amp;B").
  var attrEsc = function (s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  };
  if (pick && badge) {
    var show = function () {
      var opt = pick.options[pick.selectedIndex];
      if (!opt || !SLUG.test(opt.value)) return;
      var slug = opt.value;
      var name = opt.textContent;
      var img = 'https://img.shields.io/endpoint?url=' + SITE + '/badges/' + slug + '.json';
      badge.textContent = '[![' + name + ' on Free LLM API Hub](' + img + ')](' + SITE + '/p/' + slug + ')';
      if (badgeHtml) {
        badgeHtml.textContent = '<a href="' + SITE + '/p/' + slug + '"><img src="' + img + '" alt="' + attrEsc(name) + ' on Free LLM API Hub" height="20"></a>';
      }
    };
    var q = /[?&]p=([a-z0-9-]+)/.exec(location.search || '');
    if (q && SLUG.test(q[1])) {
      for (var i = 0; i < pick.options.length; i++) {
        if (pick.options[i].value === q[1]) { pick.selectedIndex = i; show(); break; }
      }
    }
    pick.addEventListener('change', show);
  }
})();
