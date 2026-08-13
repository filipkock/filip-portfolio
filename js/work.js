/* work.js - 01 WORK: the landing's artwork read as a project index.
 * The list and preview are reserved paper cells inside the living lattice
 * (engine text tiles), so the page is the same sheet in a different view.
 * Rows are real anchors; content lives in the HTML, generative params ride
 * on data attributes.
 */
(function () {
  "use strict";

  var host = document.getElementById("grid-host");
  if (!host) return;

  var reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var coarse = window.matchMedia("(hover: none), (pointer: coarse)").matches;
  // the inline head script normally sets .arriving (and the black pre-paint),
  // but read the flag directly too so a stale HTML cache cannot skip the
  // retreat animation
  var arriving = document.documentElement.classList.contains("arriving");
  try {
    arriving = arriving || sessionStorage.getItem("grid-mold") === "1";
    sessionStorage.removeItem("grid-mold");
  } catch (e) {
    /* private mode */
  }

  var overlays = {};
  document.querySelectorAll(".grid-cell-overlay").forEach(function (el) {
    overlays[el.dataset.cell] = el;
  });
  var rows = Array.prototype.slice.call(document.querySelectorAll(".w-row"));

  // the preview cell's target width in px: the thumb inside it is 4:3 of
  // this, so every embed is framed against one known box
  var PREVIEW_W = 520;

  // spans re-derived on every rebuild, so a resize past the breakpoint
  // swaps between split view and full-width list
  function tileDefs() {
    var narrow = window.innerWidth < 900;
    var defs = [
      { id: "wordmark", kind: "text" },
      { id: "menu", kind: "text", at: "tr" },
    ];
    if (!narrow) defs.push({ id: "contact", kind: "text" }); // default: bottom-left
    if (narrow) {
      // mirror the engine's row derivation (CELL_TARGET_PX 190, mobile scale
      // 1.2; no nav tiles here, so no stacked row forcing) and hand out whole
      // rows: header row 0, contact the last row, the list everything between.
      // Viewport fractions snapped differently per height and could land the
      // list on the contact row, one painted over the other.
      var target = 190 * (coarse || window.innerWidth < 700 ? 1.2 : 1);
      var R = Math.min(24, Math.max(1, Math.round(window.innerHeight / target)));
      if (R >= 4) {
        defs.push({
          id: "list",
          kind: "text",
          panel: true,
          spanFrac: { x0: 0, y0: 1 / R, x1: 1, y1: (R - 1) / R },
        });
        // explicit: the default bottom-left pin spans half a 2-col lattice,
        // and EMAIL · GITHUB · INSTAGRAM wraps ugly in half a phone
        defs.push({
          id: "contact",
          kind: "text",
          spanFrac: { x0: 0, y0: (R - 1) / R, x1: 1, y1: 1 },
        });
      } else {
        // landscape phone: too few rows for chrome + list + contact. The
        // list (which scrolls internally) takes everything under the header;
        // contact is dropped rather than painted over the list.
        defs.push({
          id: "list",
          kind: "text",
          panel: true,
          spanFrac: { x0: 0, y0: 1 / R, x1: 1, y1: 1 },
        });
      }
    } else {
      /* the preview holds live compositions built at their own fixed sizes,
         so the cell that frames them keeps a fixed width and the list takes
         whatever is left: one frame ratio to aim every crop at, instead of a
         box that reshapes with the window. The right edge stays at 0.9, and
         on a small laptop the width gives way rather than eat the list. */
      var vw = window.innerWidth;
      var pw = Math.min(PREVIEW_W, vw * 0.42);
      var px0 = 0.9 - pw / vw;
      defs.push({
        id: "list",
        kind: "text",
        panel: true,
        spanFrac: { x0: 0.125, y0: 0.18, x1: px0, y1: 0.85 },
      });
      defs.push({
        id: "preview",
        kind: "text",
        panel: true,
        spanFrac: { x0: px0, y0: 0.18, x1: 0.9, y1: 0.85 },
      });
    }
    return defs;
  }

  var sketch;
  try {
    sketch = window.createGridSketch(host, {
      mode: "landing",
      seed: 20260723, // this sheet's own identity
      tiles: tileDefs,
      density: coarse ? "low" : "default",
      touch: coarse,
      reducedMotion: reduced,
      buildIn: !reduced && !arriving,
      arrive: arriving,
      onArrived: function () {
        document.documentElement.classList.remove("arriving");
      },
      onTiles: placeCells,
    });
  } catch (err) {
    document.documentElement.classList.remove("arriving");
    document.documentElement.classList.add("engine-failed");
    return;
  }
  window.__grid = sketch; // debug handle (console tinkering, tests)

  function placeCells(rects) {
    var placed = {};
    rects.forEach(function (r) {
      var el = overlays[r.id];
      if (!el) return;
      placed[r.id] = true;
      el.style.transform = "translate(" + r.x + "px," + r.y + "px)";
      el.style.width = r.w + "px";
      el.style.height = r.h + "px";
      el.classList.add("is-placed");
    });
    // cells omitted this build (the preview on narrow screens) hide again
    Object.keys(overlays).forEach(function (id) {
      if (!placed[id]) overlays[id].classList.remove("is-placed");
    });
    document.body.classList.add("tiles-ready");
    sizeThumb();
    // the first row is selected before the engine has placed anything, so the
    // frame it measured then was a sliver: fit again now the cell has its size
    if (embedOn) fitEmbed(embedOn);
  }

  /* The frame is 4:3 and has to fit the cell on both axes. CSS cannot express
     that here: an explicit height is needed to reserve room for the words, but
     that height then beats aspect-ratio the moment max-width clamps a tall
     cell, and the frame quietly stops being 4:3. An embed set to cover a
     box that is no longer its own shape spills out of the sides, so the size
     is worked out here instead, from whichever axis runs out first. */
  var THUMB_SHARE = 0.62; // of the cell's height, at most

  function sizeThumb() {
    var thumb = document.getElementById("pv-thumb");
    var cell = document.querySelector(".cell-preview");
    if (!thumb || !cell) return;
    var cw = cell.clientWidth;
    var ch = cell.clientHeight;
    if (!cw || !ch) return;
    var w = Math.min(cw, Math.round(((ch * THUMB_SHARE) * 4) / 3));
    thumb.style.width = w + "px";
    thumb.style.height = Math.round((w * 3) / 4) + "px";
  }

  /* ---- preview ------------------------------------------------------ */
  var pvIdx = document.getElementById("pv-idx");
  var pvTitle = document.getElementById("pv-title");
  var pvDesc = document.getElementById("pv-desc");
  var pvLink = document.getElementById("pv-link");
  var pvTags = document.getElementById("pv-tags");
  var pvCanvas = document.getElementById("pv-canvas");
  var pvHero = document.getElementById("pv-hero");
  var pvClip = document.getElementById("pv-clip");
  var pvReveal = document.getElementById("pv-reveal");
  var pvSketch = null;
  var current = -1;
  var revealed = {}; // one reveal per project per visit
  var heroRun = 0; // the row a pending shot decode belongs to

  // variant is baked into an instance's tune, so swapping = fresh instance
  function card(row) {
    if (pvSketch) {
      pvSketch.destroy();
      pvSketch = null;
    }
    try {
      pvSketch = window.createGridSketch(pvCanvas, {
        mode: "card",
        seed: Number(row.dataset.seed) || 1,
        variant: row.dataset.variant || "quadtree",
        animate: "hover",
        reducedMotion: reduced,
        touch: coarse,
        tune: { PAPER: "#ffffff" }, // match the panel fill, no seam
      });
    } catch (e) {
      /* preview cell stays paper */
    }
  }

  /* ---- embeds: a live page as the preview shot -----------------------
     A row can hand the preview a self-contained HTML page (data-embed) in
     place of a still or a clip.

     A fluid page (the default: no data-embed-size) is handed the frame's own
     box and lays itself out in it, so it fits exactly at every screen size.
     This cell is a lattice tile, so its ratio really does move - roughly 4:3
     on a narrow sheet, past 16:9 on a wide one - and a page that sizes
     itself is the only thing that fills it without a band or a crop.

     A page built at a fixed size declares it (data-embed-size), and a
     transform brings the region worth showing (data-embed-rect, in page
     coordinates) to the frame: cover by default, contain where the whole
     composition has to survive.

     One iframe per page, kept mounted once built, so moving back up the
     list does not unpack the bundle again. */
  var pvThumb = document.getElementById("pv-thumb");
  var embeds = {};
  var embedOn = null;

  function fitEmbed(el) {
    if (el.fluid) return; // the page is given the box and sizes itself to it
    var box = pvThumb.getBoundingClientRect();
    // an unplaced cell measures a sliver rather than a clean zero, and fitting
    // to that bakes in a scale of almost nothing: wait for a real box
    if (box.width < 24 || box.height < 24) return;
    var r = el.rect;
    var s =
      el.fitMode === "contain"
        ? Math.min(box.width / r.w, box.height / r.h)
        : Math.max(box.width / r.w, box.height / r.h);
    el.style.transform =
      "translate(" +
      (box.width / 2 - s * (r.x + r.w / 2)) +
      "px," +
      (box.height / 2 - s * (r.y + r.h / 2)) +
      "px) scale(" +
      s +
      ")";
  }

  function showEmbed(row) {
    var src = (row && row.dataset.embed) || "";
    if (embedOn && embedOn.embedSrc !== src) {
      embedOn.hidden = true;
      embedOn = null;
    }
    if (!src) {
      pvThumb.style.background = "";
      return;
    }
    pvThumb.style.background = row.dataset.embedBg || "";
    var el = embeds[src];
    if (!el) {
      el = document.createElement("iframe");
      el.className = "pv-embed";
      el.title = "";
      el.tabIndex = -1;
      el.setAttribute("scrolling", "no");
      el.embedSrc = src;
      el.fluid = !row.dataset.embedSize;
      if (el.fluid) {
        el.classList.add("pv-embed--fluid");
      } else {
        var size = row.dataset.embedSize.split("x");
        var w = Number(size[0]) || 1000;
        var h = Number(size[1]) || 1000;
        var rect = (row.dataset.embedRect || "").split(",").map(Number);
        el.style.width = w + "px";
        el.style.height = h + "px";
        el.fitMode = row.dataset.embedFit || "cover";
        el.rect =
          rect.length === 4 &&
          rect.every(function (n) {
            return !isNaN(n);
          })
            ? { x: rect[0], y: rect[1], w: rect[2], h: rect[3] }
            : { x: 0, y: 0, w: w, h: h };
      }
      embeds[src] = el;
      pvThumb.appendChild(el);
      el.src = src;
    }
    el.hidden = false;
    embedOn = el;
    fitEmbed(el);
  }

  // the cell is sized by the lattice, so the fit is re-derived on every
  // rebuild rather than once at mount
  if (window.ResizeObserver) {
    // observe the cell, not the frame: the frame's own size is what sizeThumb
    // writes, so watching it would just feed itself
    new ResizeObserver(function () {
      sizeThumb();
      if (embedOn) fitEmbed(embedOn);
    }).observe(document.querySelector(".cell-preview") || pvThumb);
  } else {
    window.addEventListener("resize", function () {
      sizeThumb();
      if (embedOn) fitEmbed(embedOn);
    });
  }

  /* the reveal: a project can hand the preview a short clip to play over its
     shot (data-reveal). Poka's is its card reveal - ink blobs that gather,
     scatter, swell and clear again on paper. The clip ends on bare paper and
     Poka's shot is on paper too, so pulling the clip lands the reveal on a
     matching ground rather than a cut. Once per project per visit: the point
     of the cell is the shot, and a 2.5 second animation on every pass back up
     the list would be in the way. */
  var revealTimer = null;
  var revealRun = 0; // the run a late play() promise belongs to

  function stopReveal() {
    revealRun++;
    clearTimeout(revealTimer);
    pvReveal.hidden = true;
    if (!pvReveal.paused) pvReveal.pause();
  }

  function playReveal(src) {
    var run = ++revealRun;
    clearTimeout(revealTimer);
    if (pvReveal.getAttribute("src") !== src) pvReveal.setAttribute("src", src);
    try {
      pvReveal.currentTime = 0;
    } catch (e) {
      /* not seekable yet */
    }
    var play = pvReveal.play();
    // shown only once frames are actually running, so it never starts as an
    // empty box; refused autoplay simply means no reveal
    if (play && play.then) {
      play.then(function () {
        if (run === revealRun) pvReveal.hidden = false;
      }, stopReveal);
    } else {
      pvReveal.hidden = false;
    }
    // decode can stall (a backgrounded tab, a cold file): a clip that never
    // ends would sit over the shot for good
    revealTimer = setTimeout(stopReveal, 4000);
  }

  pvReveal.addEventListener("ended", stopReveal);
  pvReveal.addEventListener("error", stopReveal);

  function select(i) {
    if (i === current || !rows[i]) return;
    current = i;
    var row = rows[i];
    rows.forEach(function (r, j) {
      r.classList.toggle("is-current", j === i);
    });
    var wip = row.classList.contains("w-row--ask");
    pvIdx.textContent =
      row.querySelector(".idx").textContent + (wip ? " · WIP" : "");
    // the title is the h2's own text, not the WIP badge riding inside it
    var h2 = row.querySelector("h2");
    pvTitle.textContent = (
      h2.childNodes.length ? h2.childNodes[0].textContent : h2.textContent
    ).trim();
    pvDesc.textContent = row.dataset.desc || "";
    // a reference out of the sheet: what the domain is, or the thing itself.
    // Hidden rather than left empty, so it holds no space where there is none.
    var link = row.dataset.link || "";
    pvLink.hidden = !link;
    if (link) {
      pvLink.setAttribute("href", link);
      pvLink.textContent = row.dataset.linkLabel || "Read more →";
    }
    // tags are badges, one chip per term
    pvTags.textContent = "";
    (row.dataset.tags || "").split("·").forEach(function (t) {
      t = t.trim();
      if (!t) return;
      var b = document.createElement("span");
      b.className = "badge";
      b.textContent = t;
      pvTags.appendChild(b);
    });
    // the project's own hero shot when it has one: the real screen says more
    // than the artwork does. data-video is the same idea in motion, a muted
    // loop in the shot's place. Only a project with neither draws the card,
    // so there is never a sketch running behind a picture.
    var hero = row.dataset.hero || "";
    var vid = row.dataset.video || "";
    var clip = row.dataset.reveal || "";
    // a live page stands in for every other layer: no shot, no clip, no card
    showEmbed(row);
    if (row.dataset.embed) {
      heroRun++; // a shot still decoding must not reveal over the page
      pvHero.hidden = true;
      pvClip.hidden = true;
      if (!pvClip.paused) pvClip.pause();
      stopReveal();
      if (pvSketch) {
        pvSketch.destroy();
        pvSketch = null;
      }
      return;
    }
    pvClip.hidden = !vid;
    if (!vid && !pvClip.paused) pvClip.pause();
    if ((hero || vid) && clip && !reduced && !revealed[i]) {
      revealed[i] = true;
      playReveal(clip);
    } else {
      stopReveal();
    }
    if (!hero && !vid) {
      card(row);
      return;
    }
    if (pvSketch) {
      pvSketch.destroy();
      pvSketch = null;
    }
    /* the shot is mounted, then revealed only once its bitmap has decoded.
       Un-hiding first can leave the frame blank until something else happens
       to force a repaint. The run token means a row swapped during the decode
       wins over the shot that is still arriving. */
    if (hero) {
      var run = ++heroRun;
      if (pvHero.getAttribute("src") !== hero)
        pvHero.setAttribute("src", hero);
      var reveal = function () {
        if (run === heroRun) pvHero.hidden = false;
      };
      if (pvHero.decode) pvHero.decode().then(reveal, reveal);
      else reveal();
    } else {
      heroRun++;
      pvHero.hidden = true;
    }
    if (vid) {
      if (pvClip.getAttribute("src") !== vid) pvClip.setAttribute("src", vid);
      // under reduced motion the clip stands still: its poster frame is the
      // shot. A refused autoplay leaves the same frame, so both are fine.
      if (!reduced) {
        var play = pvClip.play();
        if (play && play.catch)
          play.catch(function () {
            /* frame stands */
          });
      }
    }
  }

  // a shot that fails to load is the same as a project without one
  pvHero.addEventListener("error", function () {
    pvHero.hidden = true;
    if (rows[current]) card(rows[current]);
  });
  pvClip.addEventListener("error", function () {
    pvClip.hidden = true;
    if (rows[current] && !rows[current].dataset.hero) card(rows[current]);
  });

  /* a row with no case page never opens mail on its own: clicking it selects
     the preview and says why nothing navigated. The toast is one ink tile,
     low on the sheet, carrying the same mail link the preview button has. */
  var toastEl = null;
  var toastTimer = null;

  function showToast(row) {
    if (!toastEl) {
      toastEl = document.createElement("div");
      toastEl.className = "toast";
      toastEl.setAttribute("role", "status");
      var msg = document.createElement("span");
      msg.className = "toast-msg";
      var link = document.createElement("a");
      link.className = "toast-link";
      toastEl.appendChild(msg);
      toastEl.appendChild(link);
      document.body.appendChild(toastEl);
    }
    toastEl.querySelector(".toast-msg").textContent =
      "Work in progress, no case page yet.";
    var a = toastEl.querySelector(".toast-link");
    a.textContent = "Email me about it →";
    a.href = row.dataset.mail || "mailto:filip.kockendal@gmail.com";
    // restart the enter animation when the toast is already up
    toastEl.classList.remove("is-live");
    void toastEl.offsetWidth;
    toastEl.classList.add("is-live");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      toastEl.classList.remove("is-live");
    }, 4500);
  }

  rows.forEach(function (row, i) {
    if (!coarse) {
      row.addEventListener("pointerenter", function () {
        select(i);
        if (pvSketch) pvSketch.setHover(true);
      });
      row.addEventListener("pointerleave", function () {
        if (pvSketch) pvSketch.setHover(false);
      });
    }
    row.addEventListener("focus", function () {
      select(i);
    });
    row.addEventListener("click", function (ev) {
      if (
        ev.defaultPrevented ||
        ev.button !== 0 ||
        ev.metaKey ||
        ev.ctrlKey ||
        ev.shiftKey ||
        ev.altKey
      )
        return;
      // a real link inside the row (the note's mail link) keeps its own click
      var inner = ev.target.closest ? ev.target.closest("a") : null;
      if (inner && inner !== row) return;
      var href = row.getAttribute("href");
      // rows without a case page just select and explain themselves; the
      // mail action lives on the preview button and in the toast, so the
      // row itself never throws the reader into a mail client
      if (!href || href === "#") {
        ev.preventDefault();
        select(i);
        if (row.classList.contains("w-row--ask")) showToast(row);
        return;
      }
      ev.preventDefault();
      select(i);
      document.body.classList.add("leaving");
      try {
        sessionStorage.setItem("grid-mold", "1");
      } catch (e) {
        /* fine */
      }
      var r = row.getBoundingClientRect();
      sketch.sweepOut(
        { x: r.left + r.width / 2, y: r.top + r.height / 2 },
        function () {
          window.location.href = row.href;
        },
      );
    });
    // the ask rows are buttons, not anchors: give the keyboard the same click
    if (row.tagName !== "A") {
      row.addEventListener("keydown", function (ev) {
        if (ev.key === "Enter" || ev.key === " ") {
          ev.preventDefault();
          row.click();
        }
      });
    }
  });
  select(0);

  // the first row's shot loads with the page; warm the others once it is idle,
  // so moving down the list swaps straight from cache. The reveal clip is
  // mounted in the same pass: preload fetches it, so the curtain starts on the
  // hover rather than after a round trip.
  (function warm() {
    var shots = rows
      .map(function (r) {
        return r.dataset.hero;
      })
      .filter(Boolean);
    var vid = rows
      .map(function (r) {
        return r.dataset.video;
      })
      .filter(Boolean)[0];
    var clip = rows
      .map(function (r) {
        return r.dataset.reveal;
      })
      .filter(Boolean)[0];
    if (shots.length < 2 && !vid && !clip) return;
    var go = function () {
      shots.forEach(function (s) {
        new Image().src = s;
      });
      if (vid && !pvClip.getAttribute("src")) pvClip.setAttribute("src", vid);
      if (clip && !reduced && !pvReveal.getAttribute("src"))
        pvReveal.setAttribute("src", clip);
    };
    if (typeof window.requestIdleCallback === "function") {
      window.requestIdleCallback(go, { timeout: 3000 });
    } else {
      setTimeout(go, 1200);
    }
  })();

  /* ---- exits: same erase gesture as the landing tiles ---------------- */
  document
    .querySelectorAll('[data-cell="menu"] a, [data-cell="wordmark"] a')
    .forEach(function (a) {
      a.addEventListener("click", function (ev) {
        if (
          ev.defaultPrevented ||
          ev.button !== 0 ||
          ev.metaKey ||
          ev.ctrlKey ||
          ev.shiftKey ||
          ev.altKey
        )
          return;
        if (a.getAttribute("aria-current") === "page") {
          ev.preventDefault();
          return;
        }
        ev.preventDefault();
        document.body.classList.add("leaving");
        try {
          sessionStorage.setItem("grid-mold", "1");
        } catch (e) {
          /* fine */
        }
        var cellId = a.closest(".grid-cell-overlay").dataset.cell;
        var t = sketch.getTiles().filter(function (x) {
          return x.id === cellId;
        })[0];
        var origin = t ? { x: t.x + t.w / 2, y: t.y + t.h / 2 } : null;
        sketch.sweepOut(origin, function () {
          window.location.href = a.href;
        });
      });
    });

  // restored from the back-forward cache mid-sweep: start the sheet fresh
  window.addEventListener("pageshow", function (ev) {
    if (ev.persisted) window.location.reload();
  });
})();
