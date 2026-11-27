/* "Find my free API" (/find/): one question at a time, a live count, then a ranked shortlist.
   Everything that decides WHAT is shown (questions, filters, order, hash, explorer link, result markup) is in
   shared-find.js (window.FLLM_FIND, generated from scripts/lib/find.mjs) and the order comes from shared-rules.js,
   the explorer's own rules. This file only wires the form to them. Answers live in the URL hash, never on a server. */
(function () {
  'use strict';
  var F = window.FLLM_FIND;
  var form = document.getElementById('find-form');
  var dataEl = document.getElementById('find-data');
  if (!F || !form || !dataEl) return;

  var DATA = [];
  try { DATA = JSON.parse(dataEl.textContent).providers || []; } catch (e) { DATA = []; }

  var steps = Array.prototype.slice.call(form.querySelectorAll('fieldset.find-q'));
  var back = document.getElementById('find-back');
  var next = document.getElementById('find-next');
  var skip = document.getElementById('find-skip');
  var error = document.getElementById('find-error');
  var count = document.getElementById('find-count');
  var results = document.getElementById('find-results');
  var heading = document.getElementById('find-results-h');
  var list = document.getElementById('find-list');
  var allBtn = document.getElementById('find-all');
  var empty = document.getElementById('find-empty');
  var maybe = document.getElementById('find-maybe');
  var maybeSum = document.getElementById('find-maybe-sum');
  var maybeList = document.getElementById('find-maybe-list');
  var summary = document.getElementById('find-summary');
  var explorer = document.getElementById('find-explorer');
  var share = document.getElementById('find-share');
  var shareStatus = document.getElementById('find-share-status');
  var edit = document.getElementById('find-edit');

  var SHOW = 5;
  var step = 0;
  var answers = {};
  var showAll = false;
  var done = false;

  var plural = function (n, one, many) { return n + ' ' + (n === 1 ? one : many); };

  function readAnswers() {
    var a = {};
    steps.forEach(function (fs) {
      var c = fs.querySelector('input:checked');
      if (c) a[c.name] = c.value;
    });
    return F.parseHash(F.toHash(a));
  }
  function writeAnswers(a) {
    steps.forEach(function (fs) {
      Array.prototype.forEach.call(fs.querySelectorAll('input'), function (i) { i.checked = a[i.name] === i.value; });
    });
  }
  function syncHash() {
    var h = F.toHash(answers);
    try { history.replaceState(null, '', h ? '#' + h : location.pathname + location.search); } catch (e) { /* file:// or sandboxed */ }
  }

  // The one live region: how many providers confirm every answer, and how many more might.
  function announce(r) {
    count.textContent = F.countText(r.matches.length, r.possible.length, done);
  }

  function showStep(i) {
    step = i;
    steps.forEach(function (fs, k) { fs.hidden = k !== i; });
    back.hidden = i === 0;
    next.textContent = i === steps.length - 1 ? 'Show my shortlist' : 'Next';
    error.textContent = '';
  }
  function focusStep() {
    var fs = steps[step];
    var target = fs.querySelector('input:checked') || fs.querySelector('input');
    (target || fs).focus();
  }

  // Copy buttons for the quickstarts, the same class and behaviour as site.js gives every code block (consent.js counts
  // a click on .pre-copy as copy_snippet, from the code's first word).
  function addCopy(pre) {
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'pre-copy';
    btn.textContent = 'Copy';
    btn.setAttribute('aria-label', 'Copy code to clipboard');
    btn.addEventListener('click', function () {
      var code = pre.querySelector('code') || pre;
      var ok = function () { btn.textContent = 'Copied'; btn.classList.add('copied'); btn.setAttribute('aria-label', 'Code copied to clipboard'); shareStatus.textContent = 'Code copied.'; };
      var fail = function () { btn.textContent = 'Copy failed'; btn.setAttribute('aria-label', 'Copy failed. Select the code and copy it manually.'); shareStatus.textContent = 'Copy failed. Select the code and copy it manually.'; };
      try {
        if (!navigator.clipboard || !navigator.clipboard.writeText) throw new Error('Clipboard unavailable');
        navigator.clipboard.writeText(code.innerText || code.textContent).then(ok, fail);
      } catch (e) { fail(); }
    });
    pre.appendChild(btn);
  }
  function fill(ol, items, offset) {
    ol.innerHTML = items.map(function (p, i) { return F.resultHtml(p, answers, { rank: offset ? i + 1 : 0 }); }).join('');
    Array.prototype.forEach.call(ol.querySelectorAll('pre'), addCopy);
  }

  function render() {
    var r = F.shortlist(DATA, answers);
    announce(r);
    if (!done) return r;
    summary.textContent = F.answersSummary(answers);
    explorer.setAttribute('href', F.explorerHref(answers, '../'));
    var shown = showAll ? r.matches : r.matches.slice(0, SHOW);
    fill(list, shown, true);
    list.hidden = !shown.length;
    allBtn.hidden = showAll || r.matches.length <= SHOW;
    allBtn.textContent = 'Show all ' + r.matches.length;
    empty.hidden = r.matches.length > 0;
    empty.textContent = r.matches.length ? '' : 'No provider confirms every answer. ' +
      (r.possible.length ? 'The ones below might: check what is not stated, or change an answer.' : 'Try changing an answer: a commercial-use or no-training requirement narrows the list the most.');
    maybe.hidden = !r.possible.length;
    maybeSum.textContent = plural(r.possible.length, 'more provider might fit', 'more providers might fit') + ': not stated';
    fill(maybeList, r.possible, false);
    if (!r.matches.length && r.possible.length) maybe.open = true;
    return r;
  }

  function finish(completed) {
    done = true;
    showAll = false;
    form.hidden = true;
    results.hidden = false;
    var r = render();
    heading.focus();
    if (completed) {
      // Analytics only through consent.js, which sends it only while the analytics category is granted.
      try { document.dispatchEvent(new CustomEvent('fllm:wizard-complete', { detail: F.completeEvent(answers, r.matches.length) })); } catch (e) { /* old browser */ }
    }
  }
  function reopen(i) {
    done = false;
    results.hidden = true;
    form.hidden = false;
    showStep(i || 0);
    render();
    focusStep();
  }

  form.addEventListener('change', function () {
    answers = readAnswers();
    error.textContent = '';
    syncHash();
    render();
  });
  form.addEventListener('submit', function (e) {
    e.preventDefault();
    if (step === 0 && !answers.use) {
      error.textContent = 'Pick what you want to build, or choose “Skip to results”.';
      focusStep();
      return;
    }
    if (step < steps.length - 1) { showStep(step + 1); focusStep(); }
    else finish(true);
  });
  back.addEventListener('click', function () { if (step > 0) { showStep(step - 1); focusStep(); } });
  skip.addEventListener('click', function () { finish(true); });
  edit.addEventListener('click', function () { reopen(0); });
  allBtn.addEventListener('click', function () {
    showAll = true;
    render();
    var items = list.querySelectorAll('.find-item');
    var first = items[SHOW] && items[SHOW].querySelector('h3 a');
    if (first) first.focus();
  });
  share.addEventListener('click', function () {
    var ok = function () { shareStatus.textContent = 'Link copied.'; share.textContent = 'Link copied'; };
    var fail = function () { shareStatus.textContent = 'Copy failed. Copy the address from the address bar.'; };
    try {
      if (!navigator.clipboard || !navigator.clipboard.writeText) throw new Error('Clipboard unavailable');
      navigator.clipboard.writeText(location.href).then(ok, fail);
    } catch (e) { fail(); }
  });

  // A shared link (or an edited address) opens straight on the results; a link without "use" opens the questions.
  function fromHash(completed) {
    answers = F.parseHash(location.hash);
    writeAnswers(answers);
    if (answers.use) { finish(completed); return; }
    done = false;
    results.hidden = true;
    form.hidden = false;
    showStep(0);
    render();
  }
  window.addEventListener('hashchange', function () { fromHash(false); });

  form.hidden = false;
  answers = F.parseHash(location.hash);
  writeAnswers(answers);
  if (answers.use) {
    done = true;
    form.hidden = true;
    results.hidden = false;
    render();
  } else {
    showStep(0);
    render();
  }
})();
