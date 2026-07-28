/* ==========================================================================
 * grid-engine.js - parametric lattice grid engine (p5 instance mode)
 *
 * Contract:
 *   window.createGridSketch(container, opts) -> handle
 *
 *   opts: {
 *     seed: Number (required, deterministic output per seed),
 *     mode: 'landing' | 'strip' | 'card',
 *     animate: true | false | 'hover',
 *     tiles: [{id, kind?}],           (landing; kind 'nav' (default) | 'text')
 *     reducedMotion, touch: Boolean,  (env detected by the page layer)
 *     density: 'default' | 'low',
 *     buildIn: Boolean, variant: String (card flavor preset),
 *     interactive: Boolean (default true),
 *     onTiles(rects): fired on build + resize ONLY; CSS px, container-relative,
 *                     rects include {id, kind, x, y, w, h},
 *     debug: Boolean, tune: {overrides}
 *   }
 *
 *   handle: { getTiles, setTileHover(id|null), setHover(bool), cellAt(x,y),
 *             regenerate(seed?), setDrift(mult), setDebug(bool),
 *             setFieldView(bool), destroy, p }
 *
 * Design notes:
 *   - The composition is a uniform lattice with seeded merges; nav/text tiles
 *     ARE lattice spans, so chrome sits inside the artwork, never on top.
 *   - All textures are pure black line-work at fixed pitches, aligned to the
 *     global canvas origin, so splits/merges never make a texture jump.
 *   - Style changes crossfade through a centered window tween instead of
 *     popping between bands.
 *   - Tile base rects never move after build; hover swaps fill only.
 *   - Pointer is read from p5's window-level mouse tracking, so HTML overlay
 *     anchors do not break the ambient hover ripple.
 *   - The engine observes its container size itself (debounced rebuild).
 * ========================================================================== */
(function () {
  'use strict';

  /* ------------------------------------------------------------------ *
   * 1. TUNE - every constant that shapes the composition.               *
   * ------------------------------------------------------------------ */
  var TUNE = {
    // palette: cold, high contrast; textures do the shading
    PAPER: '#fafafa',
    INK: '#111111',
    PANEL: '#ffffff',         // content panels lift slightly off the field
    STROKE_PX: 1,
    PANEL_STROKE_PX: 2,

    // lattice
    CELL_TARGET_PX: 190,      // super-cell size the lattice aims for
    MERGE_P: 0.28,            // chance a lattice cell tries to merge a block
    NAV_SPAN: 2,              // nav tiles span NxN lattice cells (desktop)

    // field (values are post-remap 0..1)
    FIELD_FEATURE_FRAC: 0.35, // blob size as a fraction of min(w,h)
    FIELD_FEATURE_PX: 0,      // when > 0, overrides the fraction (strips)
    FBM_OCTAVES: 4,
    FBM_GAIN: 0.5,
    DIAG_SHEAR: 0.35,         // elongates features along the main diagonal
    DIAG_BIAS: 0.08,          // intensity flows corner to corner
    NOISE_REMAP_LO: 0.44,     // contrast stretch: fBm output is center-biased,
    NOISE_REMAP_HI: 0.74,     // asymmetric on purpose: most of the canvas stays calm
    DRIFT_PER_SEC: 0.012,     // visible but unhurried evolution

    // style bands: 0 EMPTY < 1 < 2 < 3 < 4, textures come from STYLE_LADDER
    T_B1: 0.50,
    T_B2: 0.62,
    T_B3: 0.74,
    T_B4: 0.86,
    REFINE_THRESHOLDS: [0.50, 0.74], // subdivide on silhouette + dense-core edge
    STYLE_LADDER: ['empty', 'lines', 'grid_m', 'grid_f', 'grid_x'],

    // texture pitches (px, aligned to the canvas origin)
    LINES_PITCH: 7,
    GRID_M_PITCH: 9,
    GRID_F_PITCH: 4.5,
    GRID_X_PITCH: 2.5,
    CHECKER_PITCH: 8,
    MAX_LINES_PER_CELL: 240,  // density cap: pitch doubles until under this

    // nav tiles: labels are a 5x7 pixel face built from grid squares;
    // hover is a left-to-right polarity wipe (ink cell -> paper cell)
    TILE_HOVER_EASE_MS: 140,
    TILE_LABEL_PS_MIN: 2,
    TILE_LABEL_PS_MAX: 10,

    // motion smoothing
    STYLE_TWEEN_MS: 280,      // crossfade window for band changes
    H_SPLIT_ENTER: 0.012,
    H_SPLIT_EXIT: 0.03,       // exit needs more margin than enter (Schmitt)
    SPLIT_MIN_DWELL_MS: 450,
    H_STYLE: 0.012,
    STYLE_MIN_DWELL_MS: 300,

    // structural caps
    MAX_DEPTH: 5,
    MIN_CELL_PX: 6,
    MAX_LEAVES_SOFT: 4500,
    MAX_LEAVES_HARD: 6000,
    DEGRADE_STEP_MS: 1000,
    DEGRADE_MAX: 3,
    DEGRADE_RECOVER_FRAC: 0.7,
    DEGRADE_RECOVER_CHECKS: 3,

    // hover energy: gentle attack, slow relax
    HOVER_RADIUS_PX: 170,
    HOVER_MAX_EXTRA_DEPTH: 2,
    ENERGY_ATTACK_TAU_MS: 120,
    ENERGY_DECAY_TAU_MS: 500,

    // environment
    MOBILE_MAX_W: 700,
    MOBILE_CELL_SCALE: 1.2,
    MOBILE_MAX_LEAVES: 2500,
    MOBILE_MAX_DEPTH: 4,
    RESIZE_DEBOUNCE_MS: 200,
    PIXEL_DENSITY_CAP: 2,
    DT_CLAMP_MS: 100,
    BUILD_IN_MS: 500,

    // page transition: ink spreads cell by cell from the click, mold-like,
    // until the sheet is black with paper grid lines; the destination page
    // starts in that state and the mold retreats to reveal it
    MOLD_OUT_MS: 700,
    MOLD_IN_MS: 600,
    MOLD_DIST_W: 0.62,        // wavefront: distance share of the threshold
    MOLD_NOISE_W: 0.38,       // organic fingers: noise share, scaled by distance
    MOLD_NOISE_PX: 130,       // finger size

    // card mode extras
    CARD_T_RETURN_TAU_MS: 400
  };

  // Mode presets narrow budgets and densities for small canvases.
  var MODES = {
    landing: {},
    strip: {
      CELL_TARGET_PX: 46,
      MERGE_P: 0.35,
      MAX_DEPTH: 3, MAX_LEAVES_SOFT: 1400, MAX_LEAVES_HARD: 2000,
      FIELD_FEATURE_PX: 220,  // strip height is too small for fractional sizing
      NOISE_REMAP_LO: 0.40, NOISE_REMAP_HI: 0.68, DIAG_BIAS: 0,
      HOVER_RADIUS_PX: 70,
      DRIFT_PER_SEC: 0.014
    },
    card: {
      CELL_TARGET_PX: 90,
      MERGE_P: 0.30,
      MAX_DEPTH: 5, MAX_LEAVES_SOFT: 800, MAX_LEAVES_HARD: 1200,
      FIELD_FEATURE_FRAC: 0.45,
      HOVER_RADIUS_PX: 90,
      DRIFT_PER_SEC: 0.02    // hover animation should visibly breathe
    }
  };

  // Variants: per-piece flavors, mostly for card thumbnails.
  var VARIANTS = {
    quadtree: {
      STYLE_LADDER: ['empty', 'grid_m', 'grid_f', 'checker', 'solid']
    },
    dither: {
      STYLE_LADDER: ['empty', 'grid_f', 'checker', 'checker', 'solid'],
      T_B1: 0.50, T_B2: 0.58, T_B3: 0.62, T_B4: 0.90,
      REFINE_THRESHOLDS: [0.50, 0.62]
    },
    flow: {
      STYLE_LADDER: ['empty', 'lines', 'grid_m', 'grid_f', 'solid'],
      DIAG_SHEAR: 0.85, FIELD_FEATURE_FRAC: 0.32, FBM_OCTAVES: 3
    },
    field: {
      STYLE_LADDER: ['empty', 'lines', 'grid_m', 'grid_x', 'solid'],
      FBM_OCTAVES: 3,
      T_B1: 0.50, T_B2: 0.60, T_B3: 0.70, T_B4: 0.78,
      REFINE_THRESHOLDS: [0.78]
    },
    blocks: {
      STYLE_LADDER: ['empty', 'grid_m', 'grid_f', 'solid', 'solid'],
      CELL_TARGET_PX: 120, MAX_DEPTH: 3,
      T_B1: 0.52, T_B2: 0.62, T_B3: 0.70, T_B4: 0.78,
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
  function easeOutCubic(t) { var u = 1 - t; return 1 - u * u * u; }

  function moldMaxDist(origin, p) {
    var ox = origin ? origin.x : p.width / 2, oy = origin ? origin.y : p.height / 2;
    var fx = Math.max(ox, p.width - ox), fy = Math.max(oy, p.height - oy);
    return Math.max(60, Math.sqrt(fx * fx + fy * fy));
  }

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
   * 5. lattice - uniform grid + seeded merges; tiles claim spans first. *
   *    Tile spans get no roots at all: the chrome IS those cells.       *
   * ------------------------------------------------------------------ */
  function makeTile(def, c0, r0, cs, rs, cw, ch) {
    return {
      id: def.id,
      kind: def.kind === 'text' ? 'text' : 'nav',
      panel: !!def.panel, // heavier frame + white fill: content, not chrome
      lines: (def.lines || []).map(function (l) {
        return {
          t: String(l.t).toUpperCase(),
          h: l.h === 'right' ? 'right' : 'left',
          v: l.v === 'bottom' ? 'bottom' : 'top',
          row: l.row | 0,
          scale: l.scale > 0 ? clamp(l.scale, 0.3, 1) : 1 // sub-line size, e.g. 0.5
        };
      }),
      rect: {
        x: Math.round(c0 * cw), y: Math.round(r0 * ch),
        w: Math.round(cs * cw), h: Math.round(rs * ch)
      },
      span: { c0: c0, r0: r0, cs: cs, rs: rs },
      hovered: false,
      hoverT: 0
    };
  }

  // Nav tiles get one horizontal bin each (never overlapping); text cells pin
  // to the top-left (wordmark) and bottom-left (contact) lattice corners.
  // layout 'column' stacks nav tiles down one lattice column instead - the
  // same artwork read as an index (project pages).
  function placeTiles(defs, cols, rows, rng, T, stacked, cw, ch, layout) {
    var tiles = [];
    var navDefs = [], textDefs = [];
    for (var i = 0; i < defs.length; i++) {
      (defs[i].kind === 'text' ? textDefs : navDefs).push(defs[i]);
    }

    if (stacked) {
      // full-width bands with an empty lattice row between each
      var firstRow = 2;
      for (var s = 0; s < navDefs.length; s++) {
        var r = Math.min(firstRow + s * 2, rows - 2);
        tiles.push(makeTile(navDefs[s], 0, r, cols, 1, cw, ch));
      }
    } else if (layout === 'column') {
      var ccs = Math.min(2, Math.max(1, cols - 2));
      var cc0 = clamp(Math.round(cols * 0.4), 1, Math.max(1, cols - ccs - 1));
      for (var q = 0; q < navDefs.length; q++) {
        var cr = Math.min(1 + q * 2, Math.max(1, rows - 2));
        tiles.push(makeTile(navDefs[q], cc0, cr, ccs, 1, cw, ch));
      }
    } else {
      var n = navDefs.length;
      var cs = cols >= 6 ? Math.min(T.NAV_SPAN, Math.floor(cols / n)) : 1;
      var rs = rows >= 6 ? T.NAV_SPAN : 1;
      var minR = 1;
      var maxR = Math.max(minR, rows - 1 - rs); // keep top + bottom rows clear
      for (var j = 0; j < n; j++) {
        var binLo = Math.floor(j * cols / n);
        var binHi = Math.floor((j + 1) * cols / n) - cs;
        var c0 = clamp(binLo + Math.floor(rng() * Math.max(1, binHi - binLo + 1)), 0, cols - cs);
        var r0 = clamp(minR + Math.floor(rng() * Math.max(1, maxR - minR + 1)), minR, maxR);
        tiles.push(makeTile(navDefs[j], c0, r0, cs, rs, cw, ch));
      }
    }

    for (var t = 0; t < textDefs.length; t++) {
      var def = textDefs[t];
      if (def.spanFrac) {
        // free-form span in 0..1 fractions, snapped to the lattice so the
        // cell is flush with the surrounding artwork
        var f = def.spanFrac;
        var c0 = clamp(Math.round((f.x0 || 0) * cols), 0, cols - 1);
        var c1 = clamp(Math.round((f.x1 || 1) * cols), c0 + 1, cols);
        var r0 = clamp(Math.round((f.y0 || 0) * rows), 0, rows - 1);
        var r1 = clamp(Math.round((f.y1 || 1) * rows), r0 + 1, rows);
        tiles.push(makeTile(def, c0, r0, c1 - c0, r1 - r0, cw, ch));
        continue;
      }
      var at = def.at || (def.id === 'contact' ? 'bl' : 'tl');
      var span = Math.min(2, cols);
      var tc0 = (at === 'tr' || at === 'br') ? cols - span : 0;
      var tr0 = (at === 'bl' || at === 'br') ? rows - 1 : 0;
      tiles.push(makeTile(def, tc0, tr0, span, 1, cw, ch));
    }
    return tiles;
  }

  /* ------------------------------------------------------------------ *
   * 6. quadtree - persistent nodes, reclassified every frame.           *
   *    Hysteresis + hover energy live on the nodes; style changes       *
   *    crossfade through a centered-window tween.                       *
   * ------------------------------------------------------------------ */
  function makeNode(x, y, w, h, depth) {
    return {
      x: x, y: y, w: w, h: h, depth: depth,
      children: null,
      style: 0,
      prevStyle: 0,
      styleT: 1,
      lastStyleChangeMs: 0,
      lastSplitChangeMs: 0,
      energy: 0
    };
  }

  function bandFor(v, T) {
    if (v >= T.T_B4) return 4;
    if (v >= T.T_B3) return 3;
    if (v >= T.T_B2) return 2;
    if (v >= T.T_B1) return 1;
    return 0;
  }

  // move ONE band per change, gated by margin + dwell; the renderer tweens it
  function classifyLeafStyle(n, v, S) {
    var T = S.tune;
    var target = bandFor(v, T);
    if (S.initialPass) { n.style = target; n.prevStyle = target; n.styleT = 1; return; }
    if (target === n.style) return;
    var up = target > n.style;
    var boundary = S.bounds[up ? n.style : n.style - 1];
    if (Math.abs(v - boundary) > T.H_STYLE && S.nowMs - n.lastStyleChangeMs > T.STYLE_MIN_DWELL_MS) {
      n.prevStyle = n.style;
      n.style += up ? 1 : -1;
      n.styleT = 0;
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
      k.prevStyle = n.prevStyle;
      k.styleT = n.styleT;       // a mid-tween split keeps morphing seamlessly
      k.lastStyleChangeMs = n.lastStyleChangeMs;
      k.lastSplitChangeMs = S.nowMs;
    }
    n.children = kids;
    n.lastSplitChangeMs = S.nowMs;
  }

  // corners (c00,c10,c01,c11) are passed down so each node samples only its
  // center (leaf) or center + 4 edge midpoints (internal): ~2.4x fewer samples
  function updateNode(n, S, c00, c10, c01, c11) {
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
    var roots = S.roots;
    for (var i = 0; i < roots.length; i++) {
      var n = roots[i];
      updateNode(n, S, f(n.x, n.y), f(n.x + n.w, n.y), f(n.x, n.y + n.h), f(n.x + n.w, n.y + n.h));
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
   * 7. render - pure black line-work at global-aligned pitches.         *
   * ------------------------------------------------------------------ */

  // 5x7 pixel face for tile labels: type built from the same squares as
  // the artwork. Uppercase A-Z and '&' only; that is all the tiles need.
  var PIXEL_FONT = {
    A: ['.XXX.', 'X...X', 'X...X', 'XXXXX', 'X...X', 'X...X', 'X...X'],
    B: ['XXXX.', 'X...X', 'X...X', 'XXXX.', 'X...X', 'X...X', 'XXXX.'],
    C: ['.XXX.', 'X...X', 'X....', 'X....', 'X....', 'X...X', '.XXX.'],
    D: ['XXXX.', 'X...X', 'X...X', 'X...X', 'X...X', 'X...X', 'XXXX.'],
    E: ['XXXXX', 'X....', 'X....', 'XXXX.', 'X....', 'X....', 'XXXXX'],
    F: ['XXXXX', 'X....', 'X....', 'XXXX.', 'X....', 'X....', 'X....'],
    G: ['.XXX.', 'X...X', 'X....', 'X.XXX', 'X...X', 'X...X', '.XXX.'],
    H: ['X...X', 'X...X', 'X...X', 'XXXXX', 'X...X', 'X...X', 'X...X'],
    I: ['XXXXX', '..X..', '..X..', '..X..', '..X..', '..X..', 'XXXXX'],
    J: ['..XXX', '...X.', '...X.', '...X.', '...X.', 'X..X.', '.XX..'],
    K: ['X...X', 'X..X.', 'X.X..', 'XX...', 'X.X..', 'X..X.', 'X...X'],
    L: ['X....', 'X....', 'X....', 'X....', 'X....', 'X....', 'XXXXX'],
    M: ['X...X', 'XX.XX', 'X.X.X', 'X.X.X', 'X...X', 'X...X', 'X...X'],
    N: ['X...X', 'XX..X', 'X.X.X', 'X..XX', 'X...X', 'X...X', 'X...X'],
    O: ['.XXX.', 'X...X', 'X...X', 'X...X', 'X...X', 'X...X', '.XXX.'],
    P: ['XXXX.', 'X...X', 'X...X', 'XXXX.', 'X....', 'X....', 'X....'],
    Q: ['.XXX.', 'X...X', 'X...X', 'X...X', 'X.X.X', 'X..X.', '.XX.X'],
    R: ['XXXX.', 'X...X', 'X...X', 'XXXX.', 'X.X..', 'X..X.', 'X...X'],
    S: ['.XXXX', 'X....', 'X....', '.XXX.', '....X', '....X', 'XXXX.'],
    T: ['XXXXX', '..X..', '..X..', '..X..', '..X..', '..X..', '..X..'],
    U: ['X...X', 'X...X', 'X...X', 'X...X', 'X...X', 'X...X', '.XXX.'],
    V: ['X...X', 'X...X', 'X...X', 'X...X', 'X...X', '.X.X.', '..X..'],
    W: ['X...X', 'X...X', 'X...X', 'X.X.X', 'X.X.X', 'XX.XX', 'X...X'],
    X: ['X...X', 'X...X', '.X.X.', '..X..', '.X.X.', 'X...X', 'X...X'],
    Y: ['X...X', 'X...X', '.X.X.', '..X..', '..X..', '..X..', '..X..'],
    Z: ['XXXXX', '....X', '...X.', '..X..', '.X...', 'X....', 'XXXXX'],
    '&': ['.XX..', 'X..X.', 'X.X..', '.X...', 'X.X.X', 'X..X.', '.XX.X'],
    '0': ['.XXX.', 'X...X', 'X..XX', 'X.X.X', 'XX..X', 'X...X', '.XXX.'],
    '1': ['..X..', '.XX..', '..X..', '..X..', '..X..', '..X..', 'XXXXX'],
    '2': ['.XXX.', 'X...X', '....X', '...X.', '..X..', '.X...', 'XXXXX'],
    '3': ['.XXX.', 'X...X', '....X', '..XX.', '....X', 'X...X', '.XXX.'],
    '4': ['...X.', '..XX.', '.X.X.', 'X..X.', 'XXXXX', '...X.', '...X.'],
    '5': ['XXXXX', 'X....', 'XXXX.', '....X', '....X', 'X...X', '.XXX.'],
    '6': ['.XXX.', 'X....', 'X....', 'XXXX.', 'X...X', 'X...X', '.XXX.'],
    '7': ['XXXXX', '....X', '...X.', '..X..', '.X...', '.X...', '.X...'],
    '8': ['.XXX.', 'X...X', 'X...X', '.XXX.', 'X...X', 'X...X', '.XXX.'],
    '9': ['.XXX.', 'X...X', 'X...X', '.XXXX', '....X', '....X', '.XXX.'],
    '-': ['.....', '.....', '.....', 'XXXXX', '.....', '.....', '.....']
  };

  // columns a word occupies: glyphs are 5 + 1 gap, spaces advance 4
  function wordCols(text) {
    var c = 0;
    for (var i = 0; i < text.length; i++) c += text[i] === ' ' ? 4 : 6;
    return c - 1;
  }

  // every 'on' pixel picks its color from which side of the wipe edge it
  // sits on, so the label inverts in perfect sync with the tile fill
  function drawPixelWord(p, S, text, x, y, ps, edgeX) {
    p.noStroke();
    var cx = x;
    for (var i = 0; i < text.length; i++) {
      var ch = text[i];
      if (ch === ' ') { cx += 4 * ps; continue; }
      var g = PIXEL_FONT[ch];
      if (!g) { cx += 6 * ps; continue; }
      for (var row = 0; row < 7; row++) {
        var line = g[row];
        for (var col = 0; col < 5; col++) {
          if (line.charCodeAt(col) !== 88) continue; // 'X'
          var sx = cx + col * ps;
          p.fill(sx + ps / 2 < edgeX ? S.col.ink : S.col.paper);
          p.rect(sx, y + row * ps, ps, ps);
        }
      }
      cx += 6 * ps;
    }
  }

  // vertical/horizontal rules at a fixed pitch, aligned to the canvas origin
  // so parent and child cells share the exact same lines
  function gridLines(p, S, x, y, w, h, pitch, vertical, horizontal) {
    var est = (vertical ? w / pitch : 0) + (horizontal ? h / pitch : 0);
    var guard = 0;
    while (est > S.tune.MAX_LINES_PER_CELL && guard++ < 3) { pitch *= 2; est /= 2; }
    p.stroke(S.col.ink);
    var g;
    if (vertical) {
      for (g = Math.ceil(x / pitch) * pitch; g < x + w; g += pitch) p.line(g, y, g, y + h);
    }
    if (horizontal) {
      for (g = Math.ceil(y / pitch) * pitch; g < y + h; g += pitch) p.line(x, g, x + w, g);
    }
  }

  // 'lines' orientation is stable per lattice cell across all depths
  function lineOrientation(n, S) {
    var c = Math.floor((n.x + 1) / S.latCW), r = Math.floor((n.y + 1) / S.latCH);
    return hash3(c, r, 7, S.seed) < 0.5;
  }

  function drawBandTexture(p, S, n, band, x, y, w, h) {
    if (w < 2 || h < 2) return;
    var T = S.tune, C = S.col;
    switch (S.ladder[band]) {
      case 'empty':
        break;
      case 'lines':
        if (lineOrientation(n, S)) gridLines(p, S, x, y, w, h, T.LINES_PITCH, true, false);
        else gridLines(p, S, x, y, w, h, T.LINES_PITCH, false, true);
        break;
      case 'grid_m':
        gridLines(p, S, x, y, w, h, T.GRID_M_PITCH, true, true);
        break;
      case 'grid_f':
        gridLines(p, S, x, y, w, h, T.GRID_F_PITCH, true, true);
        break;
      case 'grid_x':
        gridLines(p, S, x, y, w, h, T.GRID_X_PITCH, true, true);
        break;
      case 'checker': {
        var k = T.CHECKER_PITCH;
        var est = (w / k) * (h / k), guard = 0;
        while (est > T.MAX_LINES_PER_CELL && guard++ < 3) { k *= 2; est /= 4; }
        p.noStroke();
        p.fill(C.ink);
        var gy0 = Math.floor(y / k), gy1 = Math.floor((y + h) / k);
        var gx0 = Math.floor(x / k), gx1 = Math.floor((x + w) / k);
        for (var gy = gy0; gy <= gy1; gy++) {
          for (var gx = gx0; gx <= gx1; gx++) {
            if (((gx + gy) & 1) !== 0) continue;
            var sx = Math.max(x, gx * k), sy = Math.max(y, gy * k);
            var ex = Math.min(x + w, gx * k + k), ey = Math.min(y + h, gy * k + k);
            if (ex > sx && ey > sy) p.rect(sx, sy, ex - sx, ey - sy);
          }
        }
        break;
      }
      case 'dot':
        p.noStroke();
        p.fill(C.ink);
        p.rect(x, y, w, h);
        if (w >= 9) {
          p.fill(C.paper);
          var s = w / 5;
          p.rect(x + (w - s) / 2, y + (h - s) / 2, s, s);
        }
        break;
      case 'solid':
        p.noStroke();
        p.fill(C.ink);
        p.rect(x, y, w, h);
        break;
    }
  }

  function drawLeaf(p, n, S) {
    p.stroke(S.col.ink);
    p.noFill();
    p.rect(n.x, n.y, n.w, n.h);

    if (n.styleT < 1) {
      n.styleT = Math.min(1, n.styleT + S.dt / S.tune.STYLE_TWEEN_MS);
      var eIn = easeOutCubic(n.styleT);
      var eOut = 1 - eIn;
      if (eOut > 0.05) {
        var ow = n.w * eOut, oh = n.h * eOut;
        drawBandTexture(p, S, n, n.prevStyle, n.x + (n.w - ow) / 2, n.y + (n.h - oh) / 2, ow, oh);
      }
      if (eIn > 0.05) {
        var iw = n.w * eIn, ih = n.h * eIn;
        drawBandTexture(p, S, n, n.style, n.x + (n.w - iw) / 2, n.y + (n.h - ih) / 2, iw, ih);
      }
      S.anyTween = true;
    } else {
      drawBandTexture(p, S, n, n.style, n.x, n.y, n.w, n.h);
    }
  }

  function drawNode(p, n, S, limit) {
    if (n.x > limit) return;
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

  // nav tiles are lattice cells: flush solid ink, no inset chrome, no growth.
  // Hover is a polarity wipe: paper sweeps in from the left and every label
  // pixel flips as the edge passes it - the cell simply changes sign.
  function drawTile(p, tile, S) {
    var r = tile.rect, C = S.col, T = S.tune;
    p.strokeWeight(T.STROKE_PX);
    if (tile.kind === 'text') {
      if (tile.panel) {
        // separation from the field: white fill, heavy border, inner hairline
        p.stroke(C.ink);
        p.strokeWeight(T.PANEL_STROKE_PX);
        p.fill(C.panel);
        p.rect(r.x + 1, r.y + 1, r.w - 2, r.h - 2);
        p.strokeWeight(T.STROKE_PX);
        p.noFill();
        p.rect(r.x + 5, r.y + 5, r.w - 10, r.h - 10);
      } else {
        p.stroke(C.ink);
        p.fill(C.paper);
        p.rect(r.x, r.y, r.w, r.h);
      }
      return;
    }

    var e = easeOutCubic(tile.hoverT);
    var edge = r.x + r.w * e;
    p.noStroke();
    if (e > 0.001) { p.fill(C.paper); p.rect(r.x, r.y, r.w * e, r.h); }
    if (e < 0.999) { p.fill(C.ink); p.rect(edge, r.y, r.x + r.w - edge, r.h); }
    p.noFill();
    p.stroke(C.ink);
    p.rect(r.x, r.y, r.w, r.h);

    if (!tile.lines.length) return;
    var maxCols = 1;
    for (var i = 0; i < tile.lines.length; i++) {
      maxCols = Math.max(maxCols, wordCols(tile.lines[i].t) * tile.lines[i].scale);
    }
    // pixel size fits the longest (scaled) line plus generous margins (the
    // mock keeps air around the labels), capped by tile height
    var ps = clamp(Math.min(Math.floor(r.w / (maxCols + 9)), Math.floor(r.h / 24)),
      T.TILE_LABEL_PS_MIN, T.TILE_LABEL_PS_MAX);
    var inset = 2 * ps;
    for (var j = 0; j < tile.lines.length; j++) {
      var l = tile.lines[j];
      var lps = Math.max(2, Math.round(ps * l.scale));
      var wpx = wordCols(l.t) * lps;
      var x = l.h === 'right' ? r.x + r.w - inset - wpx : r.x + inset;
      var rowOff = l.row * 10 * ps; // stacking unit stays in base ps
      var y = l.v === 'bottom' ? r.y + r.h - inset - 7 * lps - rowOff : r.y + inset + rowOff;
      drawPixelWord(p, S, l.t, x, y, lps, edge);
    }
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
    S.anyTween = false;

    var limit = Infinity;
    if (S.buildProgress < 1) {
      // driven by accumulated frame time, not wall clock: a tab hidden
      // mid-sweep resumes the reveal instead of skipping it
      S.buildProgress = Math.min(1, S.buildProgress + S.dt / S.tune.BUILD_IN_MS);
      if (S.buildProgress < 1) limit = easeOutCubic(S.buildProgress) * (p.width + 80);
    }

    for (var i = 0; i < S.roots.length; i++) drawNode(p, S.roots[i], S, limit);
    for (var t = 0; t < S.tiles.length; t++) {
      if (S.tiles[t].rect.x <= limit) drawTile(p, S.tiles[t], S);
    }

    if (S.trans) drawMoldPass(p, S);

    if (S.debug) drawHUD(p, S);
  }

  /* mold transition: a cell is consumed once the wavefront passes its
     threshold = dist * (DIST_W + NOISE_W * smooth-noise). Noise grows with
     distance, so the frontier breaks into organic fingers. Consumed cells
     are solid ink with paper grid lines. 'in' runs the same field with
     progress inverted: the last cells consumed are the first to clear. */
  function moldThreshold(cx, cy, S) {
    var tr = S.trans, T = S.tune;
    var dx = cx - tr.origin.x, dy = cy - tr.origin.y;
    var dNorm = Math.sqrt(dx * dx + dy * dy) / tr.maxDist;
    var n = vnoise(cx / T.MOLD_NOISE_PX, cy / T.MOLD_NOISE_PX, 3.7, S.seed);
    return dNorm * (T.MOLD_DIST_W + T.MOLD_NOISE_W * n);
  }

  function drawMoldRect(p, S, prog, x, y, w, h) {
    if (prog >= moldThreshold(x + w / 2, y + h / 2, S)) {
      p.stroke(S.col.paper);
      p.fill(S.col.ink);
      p.rect(x, y, w, h);
    }
  }

  function drawMoldNode(p, S, prog, n) {
    if (n.children) {
      var ch = n.children;
      drawMoldNode(p, S, prog, ch[0]);
      drawMoldNode(p, S, prog, ch[1]);
      drawMoldNode(p, S, prog, ch[2]);
      drawMoldNode(p, S, prog, ch[3]);
    } else {
      drawMoldRect(p, S, prog, n.x, n.y, n.w, n.h);
    }
  }

  function drawMoldPass(p, S) {
    var tr = S.trans, T = S.tune;
    tr.t = Math.min(1, tr.t + S.dt / (tr.mode === 'out' ? T.MOLD_OUT_MS : T.MOLD_IN_MS));
    var prog = tr.mode === 'out' ? tr.t : 1 - tr.t;

    p.strokeWeight(T.STROKE_PX);
    var i;
    for (i = 0; i < S.roots.length; i++) drawMoldNode(p, S, prog, S.roots[i]);
    // reserved tile spans have no quadtree cells: consume them in
    // lattice-cell chunks so panels get eaten organically too
    for (i = 0; i < S.tiles.length; i++) {
      var r = S.tiles[i].rect;
      for (var gy = r.y; gy < r.y + r.h - 1; gy += S.latCH) {
        for (var gx = r.x; gx < r.x + r.w - 1; gx += S.latCW) {
          drawMoldRect(p, S, prog, gx, gy,
            Math.min(S.latCW, r.x + r.w - gx), Math.min(S.latCH, r.y + r.h - gy));
        }
      }
    }

    if (tr.t >= 1) {
      var cb = tr.cb;
      tr.cb = null;
      clearTimeout(S.sweepTimer);
      // 'out' keeps the sheet fully black until navigation; 'in' is done
      if (tr.mode === 'in') S.trans = null;
      if (cb) cb();
    }
  }

  /* ------------------------------------------------------------------ *
   * 8. factory                                                          *
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
      ladder: tune.STYLE_LADDER,
      bounds: [tune.T_B1, tune.T_B2, tune.T_B3, tune.T_B4],
      roots: [], tiles: [], field: null, col: null,
      latCW: 1, latCH: 1,
      leafCount: 0, degradeLevel: 0, recoverStreak: 0, lastBudgetMs: 0,
      pointerSeen: false, pointerOn: false, px: 0, py: 0,
      anyEnergy: false, anyTween: false, initialPass: false,
      cardHover: false, looping: false, loopWanted: false, hidden: false,
      buildProgress: 1,
      trans: null, arrivedOnce: false,
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
          return { id: t.id, kind: t.kind, x: t.rect.x, y: t.rect.y, w: t.rect.w, h: t.rect.h };
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

      // lattice dims first, tiles claim spans, then the rest becomes roots;
      // rng call order is the contract that keeps a seed reproducible
      var target = tune.CELL_TARGET_PX * ((S.touch || w < tune.MOBILE_MAX_W) && mode !== 'card'
        ? tune.MOBILE_CELL_SCALE : (S.density === 'low' ? tune.MOBILE_CELL_SCALE : 1));
      var cols = clamp(Math.round(w / target), 2, 16);
      var rows = clamp(Math.round(h / target), 1, 24);
      var stacked = (S.touch || w < tune.MOBILE_MAX_W) && mode === 'landing';
      // tiles may be a function so pages can re-derive spans per rebuild
      var tileDefs = typeof opts.tiles === 'function' ? opts.tiles() : opts.tiles;
      var navCount = (tileDefs || []).filter(function (t) { return t.kind !== 'text'; }).length;
      if (stacked && navCount) rows = Math.max(rows, 2 + navCount * 2);
      var cw = w / cols, ch = h / rows;
      S.latCW = cw;
      S.latCH = ch;

      S.tiles = (tileDefs && tileDefs.length)
        ? placeTiles(tileDefs, cols, rows, rng, tune, stacked, cw, ch, opts.layout)
        : [];

      var lattice = makeLatticeAt(w, h, cols, rows, cw, ch, rng, tune, S.tiles);
      S.roots = lattice.roots;

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

      // arriving from a mold exit: start fully consumed and retreat.
      // Only on the first build - resize rebuilds must not replay it.
      if (opts.arrive && !S.reducedMotion && !S.arrivedOnce && w > 2) {
        S.arrivedOnce = true;
        S.buildProgress = 1;
        S.trans = {
          mode: 'in',
          t: 0,
          origin: { x: w / 2, y: h / 2 },
          maxDist: moldMaxDist(null, { width: w, height: h }),
          cb: typeof opts.onArrived === 'function' ? opts.onArrived : null
        };
        // overlays must never stay hidden if frames stall before reveal ends
        clearTimeout(S.arriveTimer);
        S.arriveTimer = setTimeout(function () {
          if (S.dead || !S.trans || S.trans.mode !== 'in') return;
          var cb = S.trans.cb;
          S.trans = null;
          if (cb) cb();
          if (S.p && !S.looping) S.p.redraw();
        }, tune.MOLD_IN_MS + 400);
      } else if (opts.arrive && !S.arrivedOnce && w > 2) {
        // reduced motion: no animation, but the page must still un-hide
        S.arrivedOnce = true;
        if (typeof opts.onArrived === 'function') opts.onArrived();
      }

      fireTiles();
    }

    // wrapper keeps makeLattice pure while build() controls the dims
    function makeLatticeAt(w, h, cols, rows, cw, ch, rng, T, tiles) {
      var taken = [];
      for (var r = 0; r < rows; r++) taken.push(new Array(cols).fill(false));
      tiles.forEach(function (tile) {
        var sp = tile.span;
        for (var rr = sp.r0; rr < Math.min(rows, sp.r0 + sp.rs); rr++) {
          for (var cc = sp.c0; cc < Math.min(cols, sp.c0 + sp.cs); cc++) taken[rr][cc] = true;
        }
      });
      var roots = [];
      function isFree(r, c) { return r < rows && c < cols && !taken[r][c]; }
      function claim(r0, c0, rs, cs) {
        for (var r = r0; r < r0 + rs; r++) for (var c = c0; c < c0 + cs; c++) taken[r][c] = true;
        roots.push(makeNode(c0 * cw, r0 * ch, cs * cw, rs * ch, 0));
      }
      for (var rr = 0; rr < rows; rr++) {
        for (var cc = 0; cc < cols; cc++) {
          if (taken[rr][cc]) continue;
          if (rng() < T.MERGE_P) {
            var shape = rng();
            if (shape < 0.4 && isFree(rr, cc + 1)) { claim(rr, cc, 1, 2); continue; }
            if (shape < 0.7 && isFree(rr + 1, cc)) { claim(rr, cc, 2, 1); continue; }
            if (isFree(rr, cc + 1) && isFree(rr + 1, cc) && isFree(rr + 1, cc + 1)) { claim(rr, cc, 2, 2); continue; }
          }
          claim(rr, cc, 1, 1);
        }
      }
      return { roots: roots };
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
        S.col = { paper: p.color(tune.PAPER), ink: p.color(tune.INK), panel: p.color(tune.PANEL) };
        build(p);
        if (S.animate === true && !S.reducedMotion) {
          S.loopWanted = true;
          S.looping = true;
        } else {
          p.noLoop(); // p5 still runs draw() once after setup
        }
      };

      p.draw = function () {
        // built at 0x0 (hidden/detached tab): heal on the first live frame
        if ((p.width <= 2 || p.height <= 2) && container.clientWidth > 2) {
          rebuildToContainer();
        }
        // own frame clock: p5's deltaTime is unreliable under manual
        // redraw() pumping, and wall time is what animations should follow
        var nowMs = p.millis();
        var dt = S.lastFrameMs === undefined ? 16 : nowMs - S.lastFrameMs;
        S.lastFrameMs = nowMs;
        dt = Math.max(0.01, Math.min(dt, tune.DT_CLAMP_MS));
        S.dt = dt;
        S.nowMs = nowMs;

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

        // tile hover wipe (reduced motion snaps; setTileHover repaints)
        var tilesAnimating = false;
        for (var i = 0; i < S.tiles.length; i++) {
          var tl = S.tiles[i];
          if (tl.kind !== 'nav') continue;
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
            S.field.getT() === 0 && !S.anyEnergy && !S.anyTween && !tilesAnimating) {
          S.looping = false;
          p.noLoop();
        }
      };

      p.mouseMoved = function () { S.pointerSeen = true; };
    };

    var instance = new window.p5(sketchFn, container);

    function rebuildToContainer() {
      if (S.dead || !S.p) return;
      var w2 = Math.max(2, container.clientWidth), h2 = Math.max(2, container.clientHeight);
      S.p.resizeCanvas(w2, h2, true);
      build(S.p);
      if (!S.looping) S.p.redraw();
    }

    function scheduleRebuildIfResized() {
      if (S.dead || !S.p) return;
      var w = container.clientWidth, h = container.clientHeight;
      if (!w || !h) return;
      if (w === S.p.width && h === S.p.height) return;
      clearTimeout(S.resizeTimer);
      // a canvas built while the tab had no dimensions heals immediately;
      // the debounce only exists to coalesce real drag-resizes
      if (S.p.width <= 2 || S.p.height <= 2) { rebuildToContainer(); return; }
      S.resizeTimer = setTimeout(rebuildToContainer, tune.RESIZE_DEBOUNCE_MS);
    }

    function onVisibility() {
      if (S.dead) return;
      S.hidden = document.hidden;
      if (S.hidden) {
        if (S.p) S.p.noLoop();
      } else {
        if (S.p && (S.loopWanted || S.looping)) S.p.loop();
        // ResizeObserver does not deliver while a tab is not rendering, so a
        // resize that happened in the background is caught here instead
        scheduleRebuildIfResized();
      }
    }
    document.addEventListener('visibilitychange', onVisibility);

    var ro = null;
    if (typeof ResizeObserver === 'function') {
      ro = new ResizeObserver(scheduleRebuildIfResized);
      ro.observe(container);
    }

    var handle = {
      p: instance,

      getTiles: function () {
        return S.tiles.map(function (t) {
          return { id: t.id, kind: t.kind, x: t.rect.x, y: t.rect.y, w: t.rect.w, h: t.rect.h, hovered: t.hovered };
        });
      },

      setTileHover: function (id) {
        var changed = false;
        for (var i = 0; i < S.tiles.length; i++) {
          if (S.tiles[i].kind !== 'nav') continue;
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

      // leaf cell under a canvas-space point; null over tiles / outside
      cellAt: function (x, y) {
        for (var i = 0; i < S.roots.length; i++) {
          var n = S.roots[i];
          if (x < n.x || y < n.y || x >= n.x + n.w || y >= n.y + n.h) continue;
          while (n.children) {
            var idx = (x >= n.x + n.w / 2 ? 1 : 0) + (y >= n.y + n.h / 2 ? 2 : 0);
            n = n.children[idx];
          }
          return { x: n.x, y: n.y, w: n.w, h: n.h };
        }
        return null;
      },

      regenerate: function (seed) {
        if (S.dead || !S.p) return;
        if (typeof seed === 'number' && isFinite(seed)) S.seed = seed;
        build(S.p);
        if (!S.looping) S.p.redraw();
      },

      // consume the sheet from `origin` (canvas px; defaults to center),
      // then hand control back (used for page exits); under reduced motion
      // the callback fires immediately
      sweepOut: function (origin, onDone) {
        if (typeof origin === 'function') { onDone = origin; origin = null; }
        if (S.dead || S.reducedMotion || S.hidden || !S.p) {
          if (onDone) onDone();
          return;
        }
        if (S.trans) return; // already transitioning
        S.trans = {
          mode: 'out',
          t: 0,
          origin: origin || { x: S.p.width / 2, y: S.p.height / 2 },
          maxDist: moldMaxDist(origin, S.p),
          cb: onDone || null
        };
        if (!S.looping && !S.loopWanted) { S.looping = true; S.p.loop(); }
        // navigation must never depend on frames actually running: if rAF
        // stalls (tab hidden mid-click), a timer completes the exit anyway
        clearTimeout(S.sweepTimer);
        S.sweepTimer = setTimeout(function () {
          if (S.dead || !S.trans || !S.trans.cb) return;
          var cb = S.trans.cb;
          S.trans.cb = null;
          cb();
        }, tune.MOLD_OUT_MS + 300);
      },

      // 'out' | 'in' | null - what transition is running (debug/tests)
      transition: function () { return S.trans ? S.trans.mode : null; },

      setDrift: function (mult) { S.driftMult = clamp(+mult || 1, 0, 50); },
      setDebug: function (on) { S.debug = !!on; safeRedraw(); },
      setFieldView: function (on) { S.fieldView = !!on; safeRedraw(); },

      destroy: function () {
        if (S.dead) return;
        S.dead = true;
        clearTimeout(S.resizeTimer);
        clearTimeout(S.sweepTimer);
        clearTimeout(S.arriveTimer);
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
