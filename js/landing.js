/* landing.js - index only: living grid + tile overlay links.
 * The anchors are real links; the canvas draws only tile chrome. No click
 * handlers anywhere - navigation stays native (tab, middle-click, right-click).
 */
(function () {
  'use strict';

  var host = document.getElementById('grid-host');
  if (!host) return;

  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var coarse = window.matchMedia('(hover: none), (pointer: coarse)').matches;

  var links = {};
  document.querySelectorAll('.tile-link').forEach(function (a) {
    links[a.dataset.tile] = a;
  });

  function insets() {
    // keep tiles clear of the corner chrome
    var narrow = window.innerWidth < 700;
    return narrow
      ? { top: 104, right: 16, bottom: 88, left: 16 }
      : { top: 128, right: 32, bottom: 96, left: 32 };
  }

  var sketch;
  try {
    sketch = window.createGridSketch(host, {
      mode: 'landing',
      seed: 20260706,
      tiles: [{ id: 'work' }, { id: 'art' }, { id: 'about' }],
      insets: insets,
      density: coarse ? 'low' : 'default',
      touch: coarse,
      reducedMotion: reduced,
      buildIn: !reduced,
      onTiles: placeTiles
    });
  } catch (err) {
    // no p5, engine crash: the static CSS tile layout takes over
    document.documentElement.classList.add('engine-failed');
    return;
  }
  window.__grid = sketch; // debug handle (console tinkering, tests)

  function placeTiles(rects) {
    // build + resize only, never per frame; transform = no layout shift
    rects.forEach(function (r) {
      var a = links[r.id];
      if (!a) return;
      a.style.transform = 'translate(' + r.x + 'px,' + r.y + 'px)';
      a.style.width = r.w + 'px';
      a.style.height = r.h + 'px';
    });
    document.body.classList.add('tiles-ready');
  }

  Object.keys(links).forEach(function (id) {
    var a = links[id];
    if (!coarse) {
      a.addEventListener('pointerenter', function () { sketch.setTileHover(id); });
      a.addEventListener('pointerleave', function () { sketch.setTileHover(null); });
    }
    // focus implies inversion, so the dashed paper focus ring always has
    // an ink field to sit on
    a.addEventListener('focus', function () { sketch.setTileHover(id); });
    a.addEventListener('blur', function () { sketch.setTileHover(null); });
  });
})();
