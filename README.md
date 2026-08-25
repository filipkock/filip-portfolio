# Filip Kockendal - portfolio

Personal portfolio and landing page. A parametric black and white grid system,
drawn live with p5.js: recursive quadtree subdivision, dithered noise fields,
plotter-pen aesthetic.

Plain HTML/CSS/JS. No build step, no framework. The only dependency is p5.js,
loaded from a pinned CDN.

## Run

```
python3 dev/serve.py 8137
# -> http://localhost:8137 (no-cache, edits show on plain reload)
```

Plain `python3 -m http.server` works too, but the browser will cache
js/css heuristically - you then need hard refreshes after every edit.

Opening `index.html` directly from the filesystem also works (all scripts are
classic scripts, no modules).

## Structure

```
index.html                     landing: living grid, tiles = navigation
work.html                      project index: rows plus a live preview cell
about.html                     bio panel, action tiles, fun-fact drawer
art.html                       generative art gallery (tag-filterable)
case-ai-journal.html           P-01 case study
case-continuous-research.html  P-04 case study
case-helfo-settlements.html    P-02 case study
case-poka-reminder.html        P-03 case study
css/style.css                  the single shared stylesheet
js/grid-engine.js              the generative engine (window.createGridSketch)
js/landing.js                  landing: tile links, mold page exits
js/work.js                     work page: row wipes, preview, case links
js/about.js                    about page: cells, photo hovers, fact drawer
js/case.js                     case pages: paper channel, section index
js/interactions.js             shared: red dot cursor, sound + motion switches
js/site.js                     art page: header strips, thumbs, tag filter
assets/                        img, video, fonts (some slots still empty)
dev/engine-test.html           engine playground: seeds, modes, HUD
dev/serve.py                   the no-cache server used by Run, above
```

## Edit

- Content lives directly in the HTML files.
- About page fun facts: each fact is an `<li class="ff-fact">` in about.html
  (heading + one paragraph). `js/about.js` turns the list into a click-through
  deck and builds one tick per item, so adding or removing a fact is a pure
  HTML edit. Without JS the whole list just shows.
- About page photos: drop `me-01.jpg`, `me-02.jpg`, `me-03.jpg` into
  `assets/img/` - the hover cells show a checker placeholder until then.
  The RESUME tile points at `assets/resume.pdf` (also not in the repo yet).
- Hover-images easter egg: drop images into `assets/img/` and list their
  paths in `HOVER_IMAGES` at the top of `js/landing.js` - hovering the
  landing grid then reveals a random one in the cell under the cursor.
- Every generative canvas is a `data-sketch` host; its `data-seed` is the
  piece's stable identity. Seeds are curated by eye - change one and the
  thumbnail changes forever, so pick deliberately (use the playground).
- Case study media: each `.img-slot` holds a real `<img>` or `<video>` at the
  path in the markup, and falls back to a checker placeholder until that file
  exists. Still missing: `assets/img/case-research/backlog.png`, and the
  invoice example in P-04 carries a visible TO CONFIRM line.
- Case study hero: one `.shot-frame` per screen inside `[data-shot]`, one
  `.shot-switch` button per frame (matched on `data-view`), and the first
  frame in the markup is the one the page opens with. P-01 runs HERO /
  DESKTOP / MOBILE. A wide frame that is not the band's 16/9 declares its own
  `--shot-ratio` inline, so it sits narrower instead of being cropped; a phone
  frame adds `shot-frame--phone`. Marks are placed in image percentages, so
  they need no attention when the band resizes. Without JS every frame shows.
- Work page previews: a row's `data-hero` is the shot shown in the preview
  cell while that project is hovered or focused, filling the cell (it crops -
  a preview is a glance, not a figure). Drop the attribute and the project
  previews as its generative card instead, which is also what happens if the
  file is missing. The other rows' shots are warmed once the page is idle, so
  moving down the list swaps straight from cache.
- A row can also carry `data-reveal`, a short clip that plays over its shot
  the first time that project is previewed, once per visit. P-03 uses its card
  reveal: ink gathers, swells and clears, and the shot is there when it goes.
  Skipped under reduced motion, and if the clip stalls or autoplay is refused
  the shot is simply shown.
- P-04 has no product screen to show, so its hero is drawn:
  `assets/img/case-research/loop.svg` is the two week cadence in the site's own
  language (hairline grid, ink sessions, hatched synthesis, the accent red
  loop), authored at 4/3 so it fills the preview cell exactly.
- Sound and cursor live in `js/interactions.js`. Hovering the artwork sounds
  one note per lattice cell entered, pitched by cell size; the toggle sits in
  the wordmark cell and remembers its state. `--accent` in the tokens is the
  cursor red, the only colour on the site.
- The motion switch sits beside the sound one and freezes the artwork into a
  still image: the field stops drifting, the pointer stops rippling, and the
  sketches leave their animation loops. The flag is `window.gridMotion` in
  `js/grid-engine.js` (remembered, read before the first frame), so a paused
  visit never animates in and then stops. It is hidden when the OS already
  asks for reduced motion, which is the same still state.
- Composition tunables live in the `TUNE` block at the top of
  `js/grid-engine.js`.
- The CV lives only as `assets/Resume Filip - 2026.pdf`, linked from the
  RESUME tile on the about page. There is no HTML sheet for it any more.

## Mobile

The sheets simplify rather than shrink on a phone:

- Chrome splits the top row: wordmark left, menu stacked down the right edge
  (the engine gives corner text cells one column each when two share a row on
  a narrow lattice). Case pages wrap their flush-row menu to a second
  right-aligned line instead.
- The sound switch does not exist on touch: the sound is played by hovering
  the artwork, and touch cannot hover. The motion switch remains.
- Work: header row, then the project list (scrolls internally, rows never
  shrink), contact on the last row. The preview pane is desktop-only; the WIP
  rows carry their own notes instead.
- About: the sheet grows past the viewport and the page scrolls it -
  `js/about.js` sizes the stage so the bio's rows hold the whole text, and
  anchors funfact / contact / resume / linkedin to the foot with an artwork
  row between each. The fun-fact drawer opens upward over the bio (which
  steps aside while covered).
- Side quests: the spots arrive revealed - the hover hunt has no hover on
  touch, and empty cells read as broken rather than hidden.
- Case studies: without a lattice channel (phones, small tablets) the chrome
  becomes the same top row the artwork pages have - wordmark cell left, menu
  cell right, one lattice row tall (--lat-ch), a hairline between them - and
  it scrolls away with the page. The document runs full width flush beneath
  it, no artwork in the margins. The section index keeps its fixed bar at
  the foot. On wide screens the fixed chrome and the centered channel are
  unchanged.
