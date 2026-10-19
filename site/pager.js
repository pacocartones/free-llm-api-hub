// pager.js — paging for long lists (the change history of a provider page). Progressive enhancement: without JavaScript the whole
// list is shown; with it, `<ul data-pager="5">` shows 5 rows at a time with Previous and Next buttons. It never touches the URL
// (no history entry, no hash, no query), so the page the visitor shares is the page they opened.
(function () {
  // The rows of page `page` (0-based) of `total` rows, `size` per page: { from, to, pages, page }, `to` exclusive.
  function pageWindow(total, page, size) {
    var n = Math.max(0, Math.floor(total)), s = Math.max(1, Math.floor(size));
    var pages = Math.max(1, Math.ceil(n / s));
    var p = Math.min(Math.max(0, Math.floor(page) || 0), pages - 1);
    return { from: p * s, to: Math.min(n, (p + 1) * s), pages: pages, page: p };
  }
  if (typeof module !== 'undefined' && module.exports) module.exports = { pageWindow: pageWindow };
  if (typeof document === 'undefined') return;
  function enhance(list) {
    var size = parseInt(list.getAttribute('data-pager'), 10);
    var items = Array.prototype.slice.call(list.children);
    if (!(size > 0) || items.length <= size) return;
    var nav = document.createElement('nav');
    nav.className = 'pager';
    nav.setAttribute('aria-label', 'Change history pages');
    var prev = document.createElement('button');
    var next = document.createElement('button');
    var status = document.createElement('span');
    prev.type = 'button'; next.type = 'button';
    prev.textContent = '← Newer'; next.textContent = 'Older →';
    prev.className = 'pager-btn'; next.className = 'pager-btn';
    status.className = 'pager-status';
    status.setAttribute('aria-live', 'polite');
    nav.appendChild(prev); nav.appendChild(status); nav.appendChild(next);
    list.parentNode.insertBefore(nav, list.nextSibling);
    var page = 0;
    function show() {
      var w = pageWindow(items.length, page, size);
      page = w.page;
      items.forEach(function (li, i) { li.hidden = i < w.from || i >= w.to; });
      status.textContent = (w.from + 1) + '–' + w.to + ' of ' + items.length;
      prev.disabled = page === 0;
      next.disabled = page === w.pages - 1;
    }
    prev.addEventListener('click', function () { page -= 1; show(); });
    next.addEventListener('click', function () { page += 1; show(); });
    show();
  }
  Array.prototype.forEach.call(document.querySelectorAll('[data-pager]'), enhance);
})();
