/* ==========================================================================
 * grid-engine.js - parametric quadtree grid engine (p5 instance mode)
 *
 * Contract:
 *   window.createGridSketch(container, opts) -> handle
 *
 *   opts: {
 *     seed: Number (required, deterministic output per seed),
 *     mode: 'landing' | 'strip' | 'card',
 *     animate: true | false | 'hover',
 *     tiles: [{id}], insets: {top,right,bottom,left} | () => insets,  (landing)
 *     reducedMotion, touch: Boolean,      (env detected by the page layer)
 *     density: 'default' | 'low',
 *     buildIn: Boolean, variant: String,  (variant = card flavor preset)
 *     interactive: Boolean (default true),
 *     onTiles(rects): fired on build + resize ONLY, CSS px, container-relative,
 *     debug: Boolean, tune: {overrides}
 *   }
 *
 *   handle: { getTiles, setTileHover(id|null), setHover(bool), regenerate(seed?),
 *             setDrift(mult), setDebug(bool), setFieldView(bool), destroy, p }
 *
 * Hard rules the pages rely on:
 *   - tile base rects never move after build (hover grow is paint-only)
 *   - pointer is read from p5's window-level mouse tracking, so HTML overlay
 *     anchors do not break the ambient hover ripple
 *   - the engine observes its container size itself (debounced rebuild)
 *   - setTileHover triggers a redraw even under reducedMotion/noLoop
 * ========================================================================== */
(function () {
  'use strict';

  /* ------------------------------------------------------------------ *
   * 1. TUNE - every constant that shapes the composition.               *
   * ------------------------------------------------------------------ */
  var TUNE = {
    // palette
    PAPER: '#ecebe7',
    INK: '#161616',
    GRAY_DARK: '#4c4a45',   // DOT cell fill
    GRAY_MID: '#8a8984',    // hatch lines, tiny-checker fallback fill
    GRAY_LIGHT: '#c9c8c2',  // faint tile grid, tiny-hatch fallback fill
    LINE: '#55534e',        // empty-cell grid strokes (thin pen on paper)
    STROKE_PX: 1,

    // field (values are post-remap 0..1)
    FIELD_FEATURE_FRAC: 0.25, // blob size as a fraction of min(w,h)
    FIELD_FEATURE_PX: 0,      // when > 0, overrides the fraction (strips)
    FBM_OCTAVES: 4,
    FBM_GAIN: 0.5,
    DIAG_SHEAR: 0.35,         // elongates features along the main diagonal
    DIAG_BIAS: 0.10,          // intensity flows corner to corner
    NOISE_REMAP_LO: 0.42,     // contrast stretch: fBm output is center-biased,
    NOISE_REMAP_HI: 0.74,     // asymmetric on purpose: ~half the canvas stays calm
    DRIFT_PER_SEC: 0.008,     // feature-scale change every ~60-90s

    // style thresholds: EMPTY < HATCH < DOT < CHECKER < SOLID
    T_HATCH: 0.55,
    T_DOT: 0.66,
    T_CHECKER: 0.76,
    T_SOLID: 0.86,
    REFINE_THRESHOLDS: [0.55, 0.86], // subdivide on silhouette + solid core edge

    // hysteresis (the anti-flicker core)
    H_SPLIT_ENTER: 0.012,
    H_SPLIT_EXIT: 0.03,       // exit needs more margin than enter (Schmitt)
    SPLIT_MIN_DWELL_MS: 400,  // collapses are dwell-guarded; splits immediate
    H_STYLE: 0.012,
    STYLE_MIN_DWELL_MS: 250,

    // structural caps
    MAX_DEPTH: 6,
    MIN_CELL_PX: 6,
    MAX_LEAVES_SOFT: 4500,
    MAX_LEAVES_HARD: 6000,
    ROOT_BUDGET_FRAC: 0.7,    // base grids may use at most this share of soft cap
    DEGRADE_STEP_MS: 1000,
    DEGRADE_MAX: 3,
    DEGRADE_RECOVER_FRAC: 0.7,
    DEGRADE_RECOVER_CHECKS: 3,

    // hover energy
    HOVER_RADIUS_PX: 170,
    HOVER_MAX_EXTRA_DEPTH: 2,
    ENERGY_ATTACK_TAU_MS: 80,
    ENERGY_DECAY_TAU_MS: 300,
    POP_MAX_PX: 2.5,

    // tiles
    TILE_GROW_PX: 5,
    TILE_HOVER_EASE_MS: 140,
    TILE_GRID_CELL_PX: 28,
    TILE_W_FRAC: 0.26, TILE_W_MIN: 200, TILE_W_MAX: 420,
    TILE_H_FRAC: 0.30, TILE_H_MIN: 120, TILE_H_MAX: 320,
    TILE_STAGGER_FRAC: 0.18,  // vertical stagger between tile slots
    TILE_BAND_MIN_H: 96, TILE_BAND_MAX_H: 140, TILE_BAND_GAP: 12,

    // macro-region partition
    REGION_COUNT_RANGE: [8, 14],
    CELL_FINE: [14, 22],
    CELL_MED: [30, 50],
    CELL_COARSE: [200, 600],
    FORCED_COARSE: 2,         // the largest N regions stay calm

    // environment
    MOBILE_MAX_W: 700,
    MOBILE_CELL_SCALE: 1.4,
    MOBILE_MAX_LEAVES: 2500,
    MOBILE_MAX_DEPTH: 5,
    RESIZE_DEBOUNCE_MS: 200,
    PIXEL_DENSITY_CAP: 2,
    CHECKER_MIN_PX: 12,       // below this, checker renders as a flat gray
    HATCH_MIN_PX: 8,          // below this, hatch renders as a flat light gray
    DT_CLAMP_MS: 100,         // kills the tab-restore time jump
    BUILD_IN_MS: 500,

    // card mode extras
    CARD_T_RETURN_TAU_MS: 400
  };

  // Mode presets narrow budgets and densities for small canvases.
  var MODES = {
    landing: {},
    strip: {
      REGION_COUNT_RANGE: [6, 10],
      CELL_FINE: [7, 10], CELL_MED: [12, 18], CELL_COARSE: [20, 36],
      FORCED_COARSE: 0,
      MAX_DEPTH: 3, MAX_LEAVES_SOFT: 1400, MAX_LEAVES_HARD: 2000,
      FIELD_FEATURE_PX: 220,  // strip height is too small for fractional sizing
      NOISE_REMAP_LO: 0.40, NOISE_REMAP_HI: 0.68, DIAG_BIAS: 0,
      HOVER_RADIUS_PX: 70,
      DRIFT_PER_SEC: 0.012
    },
    card: {
      REGION_COUNT_RANGE: [4, 8],
      FORCED_COARSE: 1,
      MAX_DEPTH: 5, MAX_LEAVES_SOFT: 800, MAX_LEAVES_HARD: 1200,
      FIELD_FEATURE_FRAC: 0.45,
      HOVER_RADIUS_PX: 90,
      DRIFT_PER_SEC: 0.02    // hover animation should visibly breathe
    }
  };

  // Variants: per-piece flavors, mostly for card thumbnails.
  var VARIANTS = {
    quadtree: {},
    dither: {
      T_HATCH: 0.50, T_DOT: 0.58, T_CHECKER: 0.62, T_SOLID: 0.90,
      REFINE_THRESHOLDS: [0.50, 0.62]
    },
    flow: {
      DIAG_SHEAR: 0.85, FIELD_FEATURE_FRAC: 0.32, FBM_OCTAVES: 3
    },
    field: {
      FBM_OCTAVES: 3,
      T_HATCH: 0.50, T_DOT: 0.60, T_CHECKER: 0.70, T_SOLID: 0.78,
      REFINE_THRESHOLDS: [0.78]
    },
    blocks: {
      CELL_FINE: [26, 36], CELL_MED: [48, 72],
      MAX_DEPTH: 3,
      T_HATCH: 0.52, T_DOT: 0.62, T_CHECKER: 0.70, T_SOLID: 0.78,
      REFINE_THRESHOLDS: [0.52, 0.78]
    }
  };

  /* ------------------------------------------------------------------ *
   * 2. utils                                                            *
   * ------------------------------------------------------------------ */
  function mulberry32(seed) {
    var a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function easeOutCubic(t) { var u = 1 - t; return 1 - u * u * u; }

  function merge() {
    var out = {};
    for (var i = 0; i < arguments.length; i++) {
      var src = arguments[i];
      if (!src) continue;
      for (var k in src) if (Object.prototype.hasOwnProperty.call(src, k)) out[k] = src[k];
    }
    return out;
  }

  /* ------------------------------------------------------------------ *
   * 3. noise - own seeded value-noise fBm.                              *
   *    p5's noise table is a module-level singleton shared across ALL   *
   *    instances, so p.noiseSeed() per sketch is unsafe on pages with   *
   *    many sketches (cards). This one is per-instance and exact.       *
   * ------------------------------------------------------------------ */
  function hash3(x, y, z, seed) {
    var h = seed | 0;
    h = Math.imul(h ^ x, 0x27d4eb2d);
    h = Math.imul(h ^ y, 0x165667b1);
    h = Math.imul(h ^ z, 0x9e3779b1);
    h ^= h >>> 15;
    h = Math.imul(h, 0x85ebca6b);
    h ^= h >>> 13;
    return (h >>> 0) / 4294967296;
  }

  function fade(t) { return t * t * (3 - 2 * t); }

  function vnoise(x, y, z, seed) {
    var xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
    var u = fade(x - xi), v = fade(y - yi), w = fade(z - zi);
    var c000 = hash3(xi, yi, zi, seed), c100 = hash3(xi + 1, yi, zi, seed);
    var c010 = hash3(xi, yi + 1, zi, seed), c110 = hash3(xi + 1, yi + 1, zi, seed);
    var c001 = hash3(xi, yi, zi + 1, seed), c101 = hash3(xi + 1, yi, zi + 1, seed);
    var c011 = hash3(xi, yi + 1, zi + 1, seed), c111 = hash3(xi + 1, yi + 1, zi + 1, seed);
    var x00 = c000 + (c100 - c000) * u, x10 = c010 + (c110 - c010) * u;
    var x01 = c001 + (c101 - c001) * u, x11 = c011 + (c111 - c011) * u;
    var y0 = x00 + (x10 - x00) * v, y1 = x01 + (x11 - x01) * v;
    return y0 + (y1 - y0) * w;
  }

  function makeFbm(seed, octaves, gain) {
    var n = Math.max(1, octaves | 0);
    return function (x, y, z) {
      var total = 0, amp = 1, freq = 1, norm = 0;
      for (var i = 0; i < n; i++) {
        total += amp * vnoise(x * freq, y * freq, z * freq, seed + i * 131);
        norm += amp;
        amp *= gain;
        freq *= 2;
      }
      return total / norm;
    };
  }

  /* ------------------------------------------------------------------ *
   * 4. field - remapped, sheared, biased scalar field with slow drift.  *
   * ------------------------------------------------------------------ */
  function makeField(fbm, cfg) {
    var t = 0;
    var k = 1 / cfg.featurePx;
    var span = 1 / (cfg.hi - cfg.lo);
    return {
      getT: function () { return t; },
      setT: function (v) { t = v; },
      advance: function (dtMs) { t += cfg.drift * dtMs / 1000; },
      sample: function (x, y) {
        var u = (x + cfg.shear * y) * k + cfg.ox;
        var v = (y + cfg.shear * x) * k + cfg.oy;
        var n = (fbm(u, v, t) - cfg.lo) * span;
        n += cfg.bias * ((x + y) / cfg.wph - 0.5);
        return n < 0 ? 0 : n > 1 ? 1 : n;
      }
    };
  }

  /* ------------------------------------------------------------------ *
   * 5. partition - seeded BSP into macro-regions with tiered densities. *
   * ------------------------------------------------------------------ */
  function makeRegions(w, h, rng, T, cellScale, softCap) {
    var rects = [{ x: 0, y: 0, w: w, h: h, ok: true }];
    var target = Math.round(lerp(T.REGION_COUNT_RANGE[0], T.REGION_COUNT_RANGE[1], rng()));
    var minSide = T.CELL_MED[1] * cellScale * 2;
    var guard = 0;

    while (rects.length < target && guard++ < 64) {
      var candidates = [], weights = [], total = 0;
      for (var i = 0; i < rects.length; i++) {
        var r = rects[i];
        if (r.ok && Math.min(r.w, r.h) >= 2 * minSide) {
          var a = Math.pow(r.w * r.h, 1.5); // prefer big rects, keep variety
          candidates.push(r); weights.push(a); total += a;
        } else {
          r.ok = false;
        }
      }
      if (!candidates.length) break;

      var pick = rng() * total, idx = 0;
      for (; idx < candidates.length - 1; idx++) { pick -= weights[idx]; if (pick <= 0) break; }
      var c = candidates[idx];
      var vertical = c.w > 1.15 * c.h ? true : c.h > 1.15 * c.w ? false : rng() < 0.5;
      var cut = Math.round(lerp(0.33, 0.67, rng()) * (vertical ? c.w : c.h));
      var at = rects.indexOf(c), a1, b1;
      if (vertical) {
        a1 = { x: c.x, y: c.y, w: cut, h: c.h, ok: true };
        b1 = { x: c.x + cut, y: c.y, w: c.w - cut, h: c.h, ok: true };
      } else {
        a1 = { x: c.x, y: c.y, w: c.w, h: cut, ok: true };
        b1 = { x: c.x, y: c.y + cut, w: c.w, h: c.h - cut, ok: true };
      }
      rects.splice(at, 1, a1, b1);
    }

    // tier assignment: biggest regions stay coarse/calm; the rest come from
    // a shuffled deck of ~40% fine / 40% medium / 20% coarse, min 2 fine
    rects.sort(function (r1, r2) { return r2.w * r2.h - r1.w * r1.h; });
    var forced = Math.min(T.FORCED_COARSE, rects.length);
    var remaining = rects.length - forced;
    var deck = [];
    var nFine = Math.max(Math.min(2, remaining), Math.round(remaining * 0.4));
    var nMed = Math.round(remaining * 0.4);
    for (var d = 0; d < remaining; d++) deck.push(d < nFine ? 'fine' : d < nFine + nMed ? 'medium' : 'coarse');
    for (var s = deck.length - 1; s > 0; s--) {
      var j = Math.floor(rng() * (s + 1));
      var tmp = deck[s]; deck[s] = deck[j]; deck[j] = tmp;
    }

    var regions = [];
    for (var q = 0; q < rects.length; q++) {
      var rect = rects[q];
      var tier = q < forced ? 'coarse' : deck[q - forced];
      var range = tier === 'fine' ? T.CELL_FINE : tier === 'medium' ? T.CELL_MED : T.CELL_COARSE;
      regions.push({
        x: rect.x, y: rect.y, w: rect.w, h: rect.h,
        tier: tier,
        targetCell: lerp(range[0], range[1], rng()) * cellScale,
        roots: null, cols: 0, rows: 0
      });
    }

    // base grids; a bounded guard keeps root count inside the leaf budget
    // (roots are the floor of leafCount - degrade cannot remove them)
    var rootBudget = Math.max(64, Math.floor(softCap * T.ROOT_BUDGET_FRAC));
    for (var attempt = 0; attempt < 2; attempt++) {
      var totalRoots = 0;
      for (var g = 0; g < regions.length; g++) {
        var reg = regions[g];
        reg.cols = Math.max(1, Math.round(reg.w / reg.targetCell));
        reg.rows = Math.max(1, Math.round(reg.h / reg.targetCell));
        totalRoots += reg.cols * reg.rows;
      }
      if (totalRoots <= rootBudget) break;
      var scale = Math.sqrt(totalRoots / rootBudget);
      for (var g2 = 0; g2 < regions.length; g2++) regions[g2].targetCell *= scale;
    }
    return regions;
  }

  /* ------------------------------------------------------------------ *
   * 6. tiles - navigation rectangles the field flows around.            *
   * ------------------------------------------------------------------ */
  function makeTile(id, x, y, w, h) {
    return {
      id: id,
      rect: { x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(h) },
      hovered: false,
      hoverT: 0
    };
  }

  function resolveTiles(w, h, defs, insets, rng, T, stacked) {
    var ax = insets.left, ay = insets.top;
    var aw = Math.max(40, w - insets.left - insets.right);
    var ah = Math.max(40, h - insets.top - insets.bottom);
    var n = defs.length, i;
    var tiles = [];

    if (stacked) {
      var bh = clamp((ah - (n - 1) * T.TILE_BAND_GAP) / (n + 1), T.TILE_BAND_MIN_H, T.TILE_BAND_MAX_H);
      var totalH = n * bh + (n - 1) * T.TILE_BAND_GAP;
      var y0 = ay + Math.max(0, (ah - totalH) / 2);
      for (i = 0; i < n; i++) tiles.push(makeTile(defs[i].id, ax, y0 + i * (bh + T.TILE_BAND_GAP), aw, bh));
      return tiles;
    }

    var slotW = aw / n;
    for (i = 0; i < n; i++) {
      var tw = clamp(T.TILE_W_FRAC * aw, T.TILE_W_MIN, Math.min(T.TILE_W_MAX, slotW - 24));
      var th = clamp(T.TILE_H_FRAC * ah, T.TILE_H_MIN, Math.min(T.TILE_H_MAX, ah - 24));
      var jx = (rng() * 2 - 1) * 0.05 * slotW;
      var jy = (rng() * 2 - 1) * T.TILE_STAGGER_FRAC * ah;
      var cx = ax + (i + 0.5) * slotW + jx;
      var cy = ay + ah * 0.55 + jy;
      var x = clamp(cx - tw / 2, ax + i * slotW + 8, ax + (i + 1) * slotW - tw - 8);
      var y = clamp(cy - th / 2, ay, ay + ah - th);
      tiles.push(makeTile(defs[i].id, x, y, tw, th));
    }
    return tiles;
  }

  function rectInTiles(n, tiles) {
    for (var i = 0; i < tiles.length; i++) {
      var r = tiles[i].rect;
      if (n.x >= r.x && n.y >= r.y && n.x + n.w <= r.x + r.w && n.y + n.h <= r.y + r.h) return true;
    }
    return false;
  }

  /* ------------------------------------------------------------------ *
   * 7. quadtree - persistent nodes, reclassified every frame.           *
   *    Hysteresis state and hover energy live on the nodes; that is     *
   *    what keeps the piece breathing instead of strobing.              *
   * ------------------------------------------------------------------ */
  var STYLE_EMPTY = 0, STYLE_HATCH = 1, STYLE_DOT = 2, STYLE_CHECKER = 3, STYLE_SOLID = 4;

  function makeNode(x, y, w, h, depth) {
    return {
      x: x, y: y, w: w, h: h, depth: depth,
      children: null,
      style: STYLE_EMPTY,
      lastStyleChangeMs: 0,
      lastSplitChangeMs: 0,
      energy: 0,
      occluded: false
    };
  }

  function styleFor(v, T) {
    if (v >= T.T_SOLID) return STYLE_SOLID;
    if (v >= T.T_CHECKER) return STYLE_CHECKER;
    if (v >= T.T_DOT) return STYLE_DOT;
    if (v >= T.T_HATCH) return STYLE_HATCH;
    return STYLE_EMPTY;
  }

  // move ONE band per change, gated by margin + dwell: ramps, never pops
  function classifyLeafStyle(n, v, S) {
    var T = S.tune;
    var target = styleFor(v, T);
    if (S.initialPass) { n.style = target; return; }
    if (target === n.style) return;
    var up = target > n.style;
    var boundary = S.bounds[up ? n.style : n.style - 1];
    if (Math.abs(v - boundary) > T.H_STYLE && S.nowMs - n.lastStyleChangeMs > T.STYLE_MIN_DWELL_MS) {
      n.style += up ? 1 : -1;
      n.lastStyleChangeMs = S.nowMs;
    }
  }

  function crossMargin(vMin, vMax, thresholds) {
    var best = -Infinity;
    for (var i = 0; i < thresholds.length; i++) {
      var t = thresholds[i];
      var d = (vMax - t) < (t - vMin) ? (vMax - t) : (t - vMin); // >0: straddles t
      if (d > best) best = d;
    }
    return best;
  }

  function splitNode(n, S) {
    var hw = n.w / 2, hh = n.h / 2, d = n.depth + 1;
    var kids = [
      makeNode(n.x, n.y, hw, hh, d),
      makeNode(n.x + hw, n.y, hw, hh, d),
      makeNode(n.x, n.y + hh, hw, hh, d),
      makeNode(n.x + hw, n.y + hh, hw, hh, d)
    ];
    for (var i = 0; i < 4; i++) {
      var k = kids[i];
      k.energy = n.energy;
      k.style = n.style;
      k.lastStyleChangeMs = n.lastStyleChangeMs;
      k.lastSplitChangeMs = S.nowMs;
      k.occluded = S.tiles.length ? rectInTiles(k, S.tiles) : false;
    }
    n.children = kids;
    n.lastSplitChangeMs = S.nowMs;
  }

  // corners (c00,c10,c01,c11) are passed down so each node samples only its
  // center (leaf) or center + 4 edge midpoints (internal): ~2.4x fewer samples
  function updateNode(n, S, c00, c10, c01, c11) {
    if (n.occluded) return;
    var T = S.tune;

    // hover energy: gaussian target, eased attack/decay, relaxes in place
    var target = 0;
    if (S.pointerOn) {
      var dx = n.x + n.w / 2 - S.px, dy = n.y + n.h / 2 - S.py;
      var d2 = dx * dx + dy * dy, R = T.HOVER_RADIUS_PX;
      if (d2 < 6.25 * R * R) target = Math.exp(-d2 / (0.5 * R * R));
    }
    if (target > 0 || n.energy > 0) {
      var tau = target > n.energy ? T.ENERGY_ATTACK_TAU_MS : T.ENERGY_DECAY_TAU_MS;
      n.energy += (target - n.energy) * (1 - Math.exp(-S.dt / tau));
      if (n.energy < 0.001) n.energy = 0; else S.anyEnergy = true;
    }
    var hoverDepth = n.energy >= 0.2 ? Math.round(n.energy * T.HOVER_MAX_EXTRA_DEPTH) : 0;

    var vc = S.field.sample(n.x + n.w / 2, n.y + n.h / 2);
    var vMin = c00, vMax = c00;
    if (c10 < vMin) vMin = c10; if (c10 > vMax) vMax = c10;
    if (c01 < vMin) vMin = c01; if (c01 > vMax) vMax = c01;
    if (c11 < vMin) vMin = c11; if (c11 > vMax) vMax = c11;
    if (vc < vMin) vMin = vc; if (vc > vMax) vMax = vc;
    var cross = crossMargin(vMin, vMax, T.REFINE_THRESHOLDS);

    var maxDepth = S.maxDepth - S.degradeLevel;
    var minCell = T.MIN_CELL_PX * Math.pow(1.25, S.degradeLevel);
    var canSplit = n.depth < maxDepth &&
      n.w * 0.5 >= minCell && n.h * 0.5 >= minCell &&
      S.leafCount + 3 < S.maxLeavesHard;

    if (!n.children) {
      var wantSplit = cross > T.H_SPLIT_ENTER * (1 + S.degradeLevel) || n.depth < hoverDepth;
      if (wantSplit && canSplit) {
        splitNode(n, S);
        // cascade resolves within this same pass (frame-1 determinism)
        recurseChildren(n, S, c00, c10, c01, c11, vc);
      } else {
        classifyLeafStyle(n, vc, S);
        S.leafCount++;
      }
      return;
    }

    var tooDeep = n.depth + 1 > maxDepth;
    var stillNeeded = !tooDeep && (cross > -T.H_SPLIT_EXIT || n.depth < hoverDepth);
    if (!stillNeeded && S.nowMs - n.lastSplitChangeMs > T.SPLIT_MIN_DWELL_MS) {
      n.children = null;
      n.lastSplitChangeMs = S.nowMs;
      classifyLeafStyle(n, vc, S);
      S.leafCount++;
    } else {
      recurseChildren(n, S, c00, c10, c01, c11, vc);
    }
  }

  function recurseChildren(n, S, c00, c10, c01, c11, vc) {
    var f = S.field.sample;
    var mx = n.x + n.w / 2, my = n.y + n.h / 2;
    var vT = f(mx, n.y), vB = f(mx, n.y + n.h);
    var vL = f(n.x, my), vR = f(n.x + n.w, my);
    var ch = n.children;
    updateNode(ch[0], S, c00, vT, vL, vc);
    updateNode(ch[1], S, vT, c10, vc, vR);
    updateNode(ch[2], S, vL, vc, c01, vB);
    updateNode(ch[3], S, vc, vR, vB, c11);
  }

  function updateTree(S) {
    S.anyEnergy = false;
    S.leafCount = 0;
    var f = S.field.sample;
    for (var r = 0; r < S.regions.length; r++) {
      var reg = S.regions[r];
      var roots = reg.roots;
      for (var i = 0; i < roots.length; i++) {
        var n = roots[i];
        if (n.occluded) continue;
        updateNode(n, S, f(n.x, n.y), f(n.x + n.w, n.y), f(n.x, n.y + n.h), f(n.x + n.w, n.y + n.h));
      }
    }
  }

  function adjustBudget(S) {
    if (S.nowMs - S.lastBudgetMs < S.tune.DEGRADE_STEP_MS) return;
    S.lastBudgetMs = S.nowMs;
    if (S.leafCount > S.maxLeavesSoft) {
      if (S.degradeLevel < S.tune.DEGRADE_MAX) S.degradeLevel++;
      S.recoverStreak = 0;
    } else if (S.leafCount < S.maxLeavesSoft * S.tune.DEGRADE_RECOVER_FRAC) {
      if (++S.recoverStreak >= S.tune.DEGRADE_RECOVER_CHECKS && S.degradeLevel > 0) {
        S.degradeLevel--;
        S.recoverStreak = 0;
      }
    } else {
      S.recoverStreak = 0;
    }
  }

  /* ------------------------------------------------------------------ *
   * 8. render                                                           *
   * ------------------------------------------------------------------ */
  function drawLeaf(p, n, S) {
    var T = S.tune, C = S.col;
    var pop = n.energy > 0.02 ? n.energy * T.POP_MAX_PX : 0;
    var x = n.x - pop, y = n.y - pop, w = n.w + pop * 2, h = n.h + pop * 2;
    var i;

    switch (n.style) {
      case STYLE_EMPTY:
        p.stroke(C.line);
        p.noFill();
        p.rect(x, y, w, h);
        break;
      case STYLE_HATCH:
        if (w < T.HATCH_MIN_PX) {
          p.stroke(C.line);
          p.fill(C.grayLight);
          p.rect(x, y, w, h);
        } else {
          p.stroke(C.line);
          p.noFill();
          p.rect(x, y, w, h);
          p.stroke(C.grayMid);
          var qx = w / 4, qy = h / 4;
          for (i = 1; i < 4; i++) {
            p.line(x + qx * i, y, x + qx * i, y + h);
            p.line(x, y + qy * i, x + w, y + qy * i);
          }
        }
        break;
      case STYLE_DOT:
        p.stroke(C.ink);
        p.fill(C.grayDark);
        p.rect(x, y, w, h);
        if (w >= 9) {
          p.noStroke();
          p.fill(C.paper);
          var s = w / 5;
          p.rect(x + (w - s) / 2, y + (h - s) / 2, s, s);
        }
        break;
      case STYLE_CHECKER:
        if (w < T.CHECKER_MIN_PX) {
          p.stroke(C.ink);
          p.fill(C.grayMid);
          p.rect(x, y, w, h);
        } else {
          p.stroke(C.ink);
          p.fill(C.paper);
          p.rect(x, y, w, h);
          p.noStroke();
          p.fill(C.ink);
          var cw = w / 4, chh = h / 4;
          for (var cy = 0; cy < 4; cy++) {
            for (var cx = 0; cx < 4; cx++) {
              if (((cx + cy) & 1) === 0) p.rect(x + cx * cw, y + cy * chh, cw, chh);
            }
          }
        }
        break;
      case STYLE_SOLID:
        p.stroke(C.ink);
        p.fill(C.ink);
        p.rect(x, y, w, h);
        break;
    }
  }

  function drawNode(p, n, S, limit) {
    if (n.occluded || n.x > limit) return;
    if (n.children) {
      var ch = n.children;
      drawNode(p, ch[0], S, limit);
      drawNode(p, ch[1], S, limit);
      drawNode(p, ch[2], S, limit);
      drawNode(p, ch[3], S, limit);
    } else {
      drawLeaf(p, n, S);
    }
  }

  function drawTile(p, tile, S) {
    var T = S.tune, C = S.col;
    var g = easeOutCubic(tile.hoverT) * T.TILE_GROW_PX;
    var r = tile.rect;
    var x = r.x - g, y = r.y - g, w = r.w + g * 2, h = r.h + g * 2;

    if (tile.hovered || tile.hoverT > 0.6) {
      p.stroke(C.ink);
      p.fill(C.ink);
      p.rect(x, y, w, h);
      p.noFill();
      p.stroke(C.paper);
      p.rect(x + 4, y + 4, w - 8, h - 8);
      return;
    }

    p.stroke(C.ink);
    p.fill(C.paper);
    p.rect(x, y, w, h);
    // faint internal grid so the tile belongs to the composition
    p.stroke(C.grayLight);
    var step = T.TILE_GRID_CELL_PX, gx, gy;
    for (gx = x + step; gx < x + w - 1; gx += step) p.line(gx, y + 1, gx, y + h - 1);
    for (gy = y + step; gy < y + h - 1; gy += step) p.line(x + 1, gy, x + w - 1, gy);
    p.noFill();
    p.stroke(C.ink);
    p.rect(x + 4, y + 4, w - 8, h - 8);
    // touch has no hover: tiles ship pre-emphasized with a doubled border
    if (S.touch) p.rect(x + 1, y + 1, w - 2, h - 2);
  }

  function drawFieldView(p, S) {
    var s = 16;
    p.noStroke();
    for (var y = 0; y < p.height; y += s) {
      for (var x = 0; x < p.width; x += s) {
        p.fill(p.lerpColor(S.col.paper, S.col.ink, S.field.sample(x + s / 2, y + s / 2)));
        p.rect(x, y, s, s);
      }
    }
  }

  function drawHUD(p, S) {
    var lines = [
      'fps ' + p.frameRate().toFixed(0),
      'leaves ' + S.leafCount,
      'degrade ' + S.degradeLevel,
      't ' + S.field.getT().toFixed(3),
      'drift x' + S.driftMult
    ];
    p.noStroke();
    p.fill(S.col.ink);
    p.rect(8, 8, 116, 14 * lines.length + 12);
    p.fill(S.col.paper);
    p.textFont('monospace');
    p.textSize(11);
    p.textAlign(p.LEFT, p.TOP);
    for (var i = 0; i < lines.length; i++) p.text(lines[i], 14, 15 + i * 14);
  }

  function renderFrame(p, S) {
    p.background(S.col.paper);
    if (S.fieldView) { drawFieldView(p, S); if (S.debug) drawHUD(p, S); return; }
    p.strokeWeight(S.tune.STROKE_PX);

    var limit = Infinity;
    if (S.buildProgress < 1) {
      // driven by accumulated frame time, not wall clock: a tab hidden
      // mid-sweep resumes the reveal instead of skipping it
      S.buildProgress = Math.min(1, S.buildProgress + S.dt / S.tune.BUILD_IN_MS);
      if (S.buildProgress < 1) limit = easeOutCubic(S.buildProgress) * (p.width + 80);
    }

    for (var r = 0; r < S.regions.length; r++) {
      var roots = S.regions[r].roots;
      for (var i = 0; i < roots.length; i++) drawNode(p, roots[i], S, limit);
    }
    for (var t = 0; t < S.tiles.length; t++) {
      if (S.tiles[t].rect.x <= limit) drawTile(p, S.tiles[t], S);
    }
    if (S.debug) drawHUD(p, S);
  }

  /* ------------------------------------------------------------------ *
   * 9. factory                                                          *
   * ------------------------------------------------------------------ */
  function createGridSketch(container, opts) {
    if (!container || typeof container.appendChild !== 'function') {
      throw new Error('grid-engine: container element required');
    }
    opts = opts || {};
    if (typeof opts.seed !== 'number' || !isFinite(opts.seed)) {
      throw new Error('grid-engine: numeric seed required');
    }
    if (typeof window.p5 !== 'function') {
      throw new Error('grid-engine: p5 is not loaded');
    }
    window.p5.disableFriendlyErrors = true; // FES is a real perf drag

    var mode = MODES[opts.mode] ? opts.mode : 'landing';
    var tune = merge(TUNE, MODES[mode], VARIANTS[opts.variant] || null, opts.tune || null);

    var S = {
      tune: tune,
      mode: mode,
      seed: opts.seed,
      animate: opts.animate === undefined ? (mode === 'card' ? 'hover' : true) : opts.animate,
      interactive: opts.interactive !== false,
      reducedMotion: !!opts.reducedMotion,
      touch: !!opts.touch,
      density: opts.density === 'low' ? 'low' : 'default',
      buildIn: !!opts.buildIn && !opts.reducedMotion,
      debug: !!opts.debug,
      fieldView: false,
      driftMult: 1,
      bounds: [tune.T_HATCH, tune.T_DOT, tune.T_CHECKER, tune.T_SOLID],
      regions: [], tiles: [], field: null, col: null,
      leafCount: 0, degradeLevel: 0, recoverStreak: 0, lastBudgetMs: 0,
      pointerSeen: false, pointerOn: false, px: 0, py: 0,
      anyEnergy: false, initialPass: false,
      cardHover: false, looping: false, loopWanted: false, hidden: false,
      buildProgress: 1,
      maxDepth: tune.MAX_DEPTH, maxLeavesSoft: tune.MAX_LEAVES_SOFT, maxLeavesHard: tune.MAX_LEAVES_HARD,
      nowMs: 0, dt: 16,
      resizeTimer: null,
      dead: false,
      p: null
    };

    function envProfile(w) {
      var small = mode !== 'card' && w < tune.MOBILE_MAX_W;
      var low = S.density === 'low';
      S.cellScale = (small || low) ? tune.MOBILE_CELL_SCALE : 1;
      S.maxDepth = small ? Math.min(tune.MOBILE_MAX_DEPTH, tune.MAX_DEPTH) : tune.MAX_DEPTH;
      S.maxLeavesSoft = small ? Math.min(tune.MOBILE_MAX_LEAVES, tune.MAX_LEAVES_SOFT) : tune.MAX_LEAVES_SOFT;
      S.maxLeavesHard = small ? Math.round(S.maxLeavesSoft * 1.33) : tune.MAX_LEAVES_HARD;
    }

    function fireTiles() {
      if (typeof opts.onTiles === 'function' && S.tiles.length) {
        opts.onTiles(S.tiles.map(function (t) {
          return { id: t.id, x: t.rect.x, y: t.rect.y, w: t.rect.w, h: t.rect.h };
        }));
      }
    }

    function build(p) {
      var w = p.width, h = p.height;
      var rng = mulberry32(S.seed);
      var fbm = makeFbm(S.seed, tune.FBM_OCTAVES, tune.FBM_GAIN);
      envProfile(w);

      var featurePx = tune.FIELD_FEATURE_PX > 0
        ? tune.FIELD_FEATURE_PX
        : Math.max(60, tune.FIELD_FEATURE_FRAC * Math.min(w, h));
      S.field = makeField(fbm, {
        featurePx: featurePx,
        shear: tune.DIAG_SHEAR,
        bias: tune.DIAG_BIAS,
        lo: tune.NOISE_REMAP_LO,
        hi: tune.NOISE_REMAP_HI,
        drift: tune.DRIFT_PER_SEC,
        wph: w + h,
        ox: rng() * 64,
        oy: rng() * 64
      });

      // tiles first (they occlude), then regions; rng order is the contract
      // that keeps a seed reproducible
      var stacked = S.touch || w < tune.MOBILE_MAX_W;
      var insets = typeof opts.insets === 'function' ? opts.insets()
        : (opts.insets || { top: 0, right: 0, bottom: 0, left: 0 });
      S.tiles = (opts.tiles && opts.tiles.length)
        ? resolveTiles(w, h, opts.tiles, insets, rng, tune, stacked)
        : [];

      S.regions = makeRegions(w, h, rng, tune, S.cellScale, S.maxLeavesSoft);
      for (var r = 0; r < S.regions.length; r++) {
        var reg = S.regions[r];
        var cw = reg.w / reg.cols, ch = reg.h / reg.rows;
        reg.roots = [];
        for (var gy = 0; gy < reg.rows; gy++) {
          for (var gx = 0; gx < reg.cols; gx++) {
            var node = makeNode(reg.x + gx * cw, reg.y + gy * ch, cw, ch, 0);
            node.occluded = S.tiles.length ? rectInTiles(node, S.tiles) : false;
            reg.roots.push(node);
          }
        }
      }

      // initial full pass: exact styles, full cascade, no dwell smoothing
      S.nowMs = p.millis();
      S.dt = 16;
      S.pointerOn = false;
      S.degradeLevel = 0;
      S.recoverStreak = 0;
      S.initialPass = true;
      updateTree(S);
      S.initialPass = false;

      S.buildProgress = S.buildIn ? 0 : 1;
      fireTiles();
    }

    function safeRedraw() {
      if (!S.dead && S.p && !S.looping && !S.loopWanted) S.p.redraw();
    }

    var sketchFn = function (p) {
      S.p = p;

      p.setup = function () {
        p.pixelDensity(Math.min(tune.PIXEL_DENSITY_CAP, window.devicePixelRatio || 1));
        var renderer = p.createCanvas(Math.max(2, container.clientWidth), Math.max(2, container.clientHeight));
        renderer.elt.setAttribute('aria-hidden', 'true'); // hosts carry semantics
        S.col = {
          paper: p.color(tune.PAPER),
          ink: p.color(tune.INK),
          grayDark: p.color(tune.GRAY_DARK),
          grayMid: p.color(tune.GRAY_MID),
          grayLight: p.color(tune.GRAY_LIGHT),
          line: p.color(tune.LINE)
        };
        build(p);
        if (S.animate === true && !S.reducedMotion) {
          S.loopWanted = true;
          S.looping = true;
        } else {
          p.noLoop(); // p5 still runs draw() once after setup
        }
      };

      p.draw = function () {
        var dt = Math.min(p.deltaTime || 16, tune.DT_CLAMP_MS);
        S.dt = dt;
        S.nowMs = p.millis();

        // time evolution
        if (mode === 'card') {
          if (S.cardHover && !S.reducedMotion) {
            S.field.advance(dt * S.driftMult);
          } else {
            var t = S.field.getT();
            if (t !== 0) { // settle back to the seeded identity frame
              t += -t * (1 - Math.exp(-dt / tune.CARD_T_RETURN_TAU_MS));
              if (Math.abs(t) < 0.0004) t = 0;
              S.field.setT(t);
            }
          }
        } else if (S.animate === true && !S.reducedMotion) {
          S.field.advance(dt * S.driftMult);
        }

        // ambient pointer (window-level tracking; overlays cannot block it)
        S.pointerOn = S.interactive && !S.reducedMotion && !S.touch && S.pointerSeen &&
          p.mouseX >= 0 && p.mouseY >= 0 && p.mouseX <= p.width && p.mouseY <= p.height;
        S.px = p.mouseX;
        S.py = p.mouseY;

        // tile hover: fill inverts instantly, grow eases
        var tilesAnimating = false;
        for (var i = 0; i < S.tiles.length; i++) {
          var tl = S.tiles[i];
          var tt = tl.hovered ? 1 : 0;
          if (S.reducedMotion) {
            tl.hoverT = tt;
          } else if (tl.hoverT !== tt) {
            var step = dt / tune.TILE_HOVER_EASE_MS;
            tl.hoverT = tt > tl.hoverT ? Math.min(1, tl.hoverT + step) : Math.max(0, tl.hoverT - step);
            if (tl.hoverT !== tt) tilesAnimating = true;
          }
        }

        updateTree(S);
        adjustBudget(S);
        renderFrame(p, S);

        // card mode: stop looping once fully settled
        if (S.animate === 'hover' && S.looping && !S.cardHover &&
            S.field.getT() === 0 && !S.anyEnergy && !tilesAnimating) {
          S.looping = false;
          p.noLoop();
        }
      };

      p.mouseMoved = function () { S.pointerSeen = true; };
    };

    var instance = new window.p5(sketchFn, container);

    function onVisibility() {
      if (S.dead) return;
      S.hidden = document.hidden;
      if (S.hidden) {
        if (S.p) S.p.noLoop();
      } else if (S.loopWanted || S.looping) {
        if (S.p) S.p.loop();
      }
    }
    document.addEventListener('visibilitychange', onVisibility);

    var ro = null;
    if (typeof ResizeObserver === 'function') {
      ro = new ResizeObserver(function () {
        if (S.dead || !S.p) return;
        var w = container.clientWidth, h = container.clientHeight;
        if (!w || !h) return;
        if (w === S.p.width && h === S.p.height) return;
        clearTimeout(S.resizeTimer);
        S.resizeTimer = setTimeout(function () {
          if (S.dead || !S.p) return;
          var w2 = Math.max(2, container.clientWidth), h2 = Math.max(2, container.clientHeight);
          S.p.resizeCanvas(w2, h2, true);
          build(S.p);
          if (!S.looping) S.p.redraw();
        }, tune.RESIZE_DEBOUNCE_MS);
      });
      ro.observe(container);
    }

    var handle = {
      p: instance,

      getTiles: function () {
        return S.tiles.map(function (t) {
          return { id: t.id, x: t.rect.x, y: t.rect.y, w: t.rect.w, h: t.rect.h, hovered: t.hovered };
        });
      },

      setTileHover: function (id) {
        var changed = false;
        for (var i = 0; i < S.tiles.length; i++) {
          var hov = S.tiles[i].id === id;
          if (S.tiles[i].hovered !== hov) { S.tiles[i].hovered = hov; changed = true; }
        }
        // a state change must paint even under reducedMotion/noLoop
        if (changed && (S.reducedMotion || S.animate === false)) safeRedraw();
      },

      setHover: function (on) {
        if (S.dead || S.animate !== 'hover') return;
        S.cardHover = !!on;
        if (!S.hidden && !S.looping && S.p) {
          S.looping = true;
          S.p.loop(); // drawFrame stops itself once settled
        }
      },

      regenerate: function (seed) {
        if (S.dead || !S.p) return;
        if (typeof seed === 'number' && isFinite(seed)) S.seed = seed;
        build(S.p);
        if (!S.looping) S.p.redraw();
      },

      setDrift: function (mult) { S.driftMult = clamp(+mult || 1, 0, 50); },
      setDebug: function (on) { S.debug = !!on; safeRedraw(); },
      setFieldView: function (on) { S.fieldView = !!on; safeRedraw(); },

      destroy: function () {
        if (S.dead) return;
        S.dead = true;
        clearTimeout(S.resizeTimer);
        if (ro) ro.disconnect();
        document.removeEventListener('visibilitychange', onVisibility);
        instance.remove();
        S.p = null;
      }
    };

    return handle;
  }

  window.createGridSketch = createGridSketch;
})();
