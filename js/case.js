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

  var overlays = {};
  document.querySelectorAll('.case-cell').forEach(function (el) {
    overlays[el.dataset.cell] = el;
  });

  // mirrors the engine's own sizing so spans can be whole lattice cells.
  // This page always runs density 'low', so the cell target is scaled.
  var WIDE_MIN = 1240;
  var CELL_TARGET = 190 * 1.2;
  function predict() {
    return {
      cols: Math.min(16, Math.max(2, Math.round(window.innerWidth / CELL_TARGET))),
      rows: Math.min(24, Math.max(1, Math.round(window.innerHeight / CELL_TARGET))),
      wide: window.innerWidth >= WIDE_MIN
    };
  }

  // The document lives in a paper channel cut into the lattice: a full-height
  // reserved column, so scrolling text is always backed by the sheet instead
  // of floating over the drawing. Chrome takes the columns either side, which
  // is also why nothing can scroll underneath it.
  var SIDE = 2; // lattice columns reserved for chrome on each side

  function columns(L) {
    var cols = L ? L.cols : predict().cols;
    // a channel needs the two chrome columns plus at least two of its own
    if (cols < SIDE * 2 + 2) return { channel: false, start: 0, span: cols, cols: cols };
    return { channel: true, start: SIDE, span: cols - SIDE * 2, cols: cols };
  }

  function tileDefs() {
    var L = predict();
    var C = columns(L);
    var defs = [];
    // corner cells are 2 lattice columns each: without a channel the lattice
    // is too coarse for them, and CSS lays them out as a flush top row
    if (C.channel) {
      defs.push({ id: 'wordmark', kind: 'text' });
      defs.push({ id: 'menu', kind: 'text', at: 'tr' });
      defs.push({
        id: 'channel', kind: 'text',
        spanFrac: { x0: C.start / C.cols, x1: (C.start + C.span) / C.cols, y0: 0, y1: 1 }
      });
      // the index sits in the right chrome column, under the menu
      defs.push({
        id: 'index', kind: 'text',
        spanFrac: {
          x0: (C.cols - SIDE) / C.cols, x1: 1,
          y0: 1 / L.rows, y1: Math.min(L.rows, 3) / L.rows
        }
      });
    }
    return defs;
  }

  var sketch;
  try {
    sketch = window.createGridSketch(host, {
      mode: 'landing',
      seed: 1101, // the project's own seed: same identity as its row thumb
      density: 'low', // calmer behind long-form text
      tiles: tileDefs,
      touch: coarse,
      reducedMotion: reduced,
      buildIn: !reduced && !arriving,
      arrive: arriving,
      onArrived: function () { document.documentElement.classList.remove('arriving'); },
      onTiles: placeCells
    });
  } catch (err) {
    document.documentElement.classList.remove('arriving');
    document.documentElement.classList.add('engine-failed');
    return;
  }
  window.__grid = sketch; // debug handle
  // onTiles only fires when the page actually reserved cells; run one pass
  // regardless so the CSS fallbacks and the column alignment always apply
  placeCells([]);

  function placeCells(rects) {
    var placed = {};
    rects.forEach(function (r) {
      var el = overlays[r.id];
      if (!el) return;
      placed[r.id] = true;
      el.style.transform = 'translate(' + r.x + 'px,' + r.y + 'px)';
      el.style.width = r.w + 'px';
      el.style.height = r.h + 'px';
      el.classList.add('is-placed');
    });
    Object.keys(overlays).forEach(function (id) {
      if (placed[id]) return;
      // unplaced cells fall back to their CSS layout: clear the inline
      // geometry so it cannot fight the stylesheet
      var el = overlays[id];
      el.classList.remove('is-placed');
      el.style.transform = '';
      el.style.width = '';
      el.style.height = '';
    });
    document.body.classList.add('tiles-ready');
    alignTries = 0;
    alignSoon();
  }

  // the reading column is not a tile (it outgrows the viewport), so instead
  // its edges are snapped onto the lattice's column lines: the document
  // reads as a continuation of the grid rather than a floating card
  // p5 runs setup() asynchronously, and rebuilds are debounced, so the
  // lattice may not exist yet: retry until it does
  var alignTries = 0;
  function alignSoon() {
    if (alignDocument() || alignTries++ > 12) return;
    setTimeout(alignSoon, 80);
  }

  function alignDocument() {
    var L;
    try { L = sketch.lattice(); } catch (e) { return false; }
    if (!L || !L.cols || !L.cw) return false;
    var root = document.documentElement.style;
    var C = columns(L);
    root.setProperty('--doc-x', Math.round(C.start * L.cw) + 'px');
    root.setProperty('--doc-w', Math.round(C.span * L.cw) + 'px');
    // clear the chrome: a full lattice row when it is canvas-drawn cells,
    // or just the thin flush row of the fallback layout
    root.setProperty('--doc-top', (C.channel ? Math.round(L.ch) : 72) + 'px');
    root.setProperty('--lat-ch', Math.round(L.ch) + 'px');
    document.body.classList.toggle('has-channel', C.channel);
    return true;
  }

  window.addEventListener('resize', function () {
    alignDocument();          // immediate, using the current lattice
    alignTries = 0;
    setTimeout(alignSoon, 260); // again after the engine's debounced rebuild
  });

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
