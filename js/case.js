/* case.js - case study pages: the living lattice runs fixed behind a
 * scrolling document. No lattice-pinned chrome here (cells are viewport
 * fixed, the document is not), so the bar and panels are plain HTML.
 * Mold transitions still work: the background canvas is full-viewport.
 */
(function () {
  'use strict';

  var host = document.getElementById('grid-host');
  if (!host) return;

  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var coarse = window.matchMedia('(hover: none), (pointer: coarse)').matches;
  var arriving = document.documentElement.classList.contains('arriving');
  try {
    arriving = arriving || sessionStorage.getItem('grid-mold') === '1';
    sessionStorage.removeItem('grid-mold');
  } catch (e) { /* private mode */ }

  var sketch;
  try {
    sketch = window.createGridSketch(host, {
      mode: 'landing',
      seed: 1101, // the project's own seed: same identity as its row thumb
      density: 'low', // calmer behind long-form text
      touch: coarse,
      reducedMotion: reduced,
      buildIn: !reduced && !arriving,
      arrive: arriving,
      onArrived: function () { document.documentElement.classList.remove('arriving'); }
    });
  } catch (err) {
    document.documentElement.classList.remove('arriving');
    document.documentElement.classList.add('engine-failed');
    return;
  }
  window.__grid = sketch; // debug handle

  /* ---- section index: scroll-spy + progress ------------------------- */
  (function buildIndex() {
    var host = document.getElementById('case-index');
    var panels = Array.prototype.slice.call(document.querySelectorAll('.case-panel[data-nav]'));
    if (!host || panels.length < 2) return;

    var list = document.createElement('ol');
    list.className = 'ci-list';
    var links = panels.map(function (panel, i) {
      var li = document.createElement('li');
      var a = document.createElement('a');
      a.href = '#' + panel.id;
      a.innerHTML = '<span class="ci-num">' + String(i + 1).padStart(2, '0') + '</span>' +
        '<span class="ci-label">' + panel.dataset.nav + '</span>';
      // native anchors still work; this just adds smooth scroll + no hash
      a.addEventListener('click', function (ev) {
        if (ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.altKey) return;
        ev.preventDefault();
        panel.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' });
      });
      li.appendChild(a);
      list.appendChild(li);
      return a;
    });
    host.appendChild(list);

    var meter = document.createElement('div');
    meter.className = 'ci-meter';
    meter.innerHTML = '<span class="ci-bar"><span class="ci-fill"></span></span>' +
      '<span class="ci-pct">0%</span>';
    host.appendChild(meter);
    var fill = meter.querySelector('.ci-fill');
    var pct = meter.querySelector('.ci-pct');
    host.classList.add('is-ready');

    // the section whose top is closest to a line ~a third down the viewport
    var current = -1;
    function update() {
      var mark = window.innerHeight * 0.33;
      var best = 0, bestDist = Infinity;
      for (var i = 0; i < panels.length; i++) {
        var top = panels[i].getBoundingClientRect().top;
        var dist = Math.abs(top - mark);
        // prefer sections already started over ones still below the mark
        if (top <= mark + 1) { best = i; bestDist = 0; }
        else if (bestDist > 0 && dist < bestDist) { bestDist = dist; best = i; }
      }
      if (best !== current) {
        current = best;
        links.forEach(function (a, j) {
          a.classList.toggle('is-current', j === best);
          if (j === best) a.setAttribute('aria-current', 'true');
          else a.removeAttribute('aria-current');
        });
      }
      var max = document.documentElement.scrollHeight - window.innerHeight;
      var p = max > 0 ? Math.min(1, Math.max(0, window.scrollY / max)) : 1;
      fill.style.setProperty('--p', p.toFixed(4));
      pct.textContent = Math.round(p * 100) + '%';
    }

    var queued = false;
    function onScroll() {
      if (queued) return;
      queued = true;
      requestAnimationFrame(function () { queued = false; update(); });
    }
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    update();
    window.__caseIndex = { update: update }; // debug/test handle
  })();

  // internal links exit through the mold, like the artwork sheets
  document.querySelectorAll('a[href$=".html"]').forEach(function (a) {
    a.addEventListener('click', function (ev) {
      if (ev.defaultPrevented || ev.button !== 0 ||
          ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.altKey) return;
      if (a.getAttribute('aria-current') === 'page') { ev.preventDefault(); return; }
      ev.preventDefault();
      document.body.classList.add('leaving');
      // origin: the clicked link, so the ink spreads from where you pressed
      var r = a.getBoundingClientRect();
      sketch.sweepOut({ x: r.left + r.width / 2, y: r.top + r.height / 2 }, function () {
        window.location.href = a.href;
      });
    });
  });

  // restored from the back-forward cache mid-sweep: start the sheet fresh
  window.addEventListener('pageshow', function (ev) {
    if (ev.persisted) window.location.reload();
  });
})();
