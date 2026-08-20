# Assets

Drop files at these paths and they appear automatically. Until a file
exists, the page shows a labelled checker placeholder in its place - so
missing media never breaks the layout.

## Case study: AI journaling assistant (case-ai-journal.html)

| Path | What it is |
|---|---|
| `img/case-ai/hero.jpg` | Hero: the assistant panel inside the journal (wide crop) |
| `img/case-ai/discovery.jpg` | Workflow map / exploration from discovery |
| `video/case-ai/walkthrough.mp4` | Full walkthrough: calendar → record → draft → save |
| `img/case-ai/walkthrough-poster.jpg` | Poster frame shown before the video plays |
| `img/case-ai/step-1.jpg` | Starting a session from the calendar |
| `img/case-ai/step-2.jpg` | Recording + transcription states |
| `img/case-ai/step-3.jpg` | SOAP draft in review / edit mode |
| `img/case-ai/step-4.jpg` | Second document from the same transcript |
| `img/case-ai/adoption.jpg` | Adoption over time (optional) |

Images are `object-fit: contain`, so screenshots are never cropped - any
aspect ratio is safe. The slot's own ratio is set inline in the HTML
(`--slot-ratio`) if you want to change the reserved space.

To add a slot elsewhere, copy the markup pattern:

```html
<div class="img-slot" data-slot="my-slot" style="--slot-ratio: 16 / 9">
  <img src="assets/img/…" alt="…" loading="lazy" decoding="async">
  <span class="slot-label">IMAGE · WHAT IT SHOULD SHOW</span>
</div>
```

## Case study: Poka Reminder (case-poka-reminder.html)

All assets below already exist, processed from the originals in
`~/Downloads` (screenshots scaled to 780px, clips cut from the full
screen recording, H.264 for web). The iOS status bar, including the
red screen-recording pill, is cropped off every screenshot and clip.
The settings screenshot has the account email pixelated.
`card-reveal.mp4` is processed but currently unused on the page.

| Path | What it is |
|---|---|
| `img/case-poka/home-taken.png` | Hero: home screen, dose taken, streak alive |
| `img/case-poka/splash.png` | Splash screen with the character |
| `img/case-poka/home-tomorrow.png` | Tomorrow's schedule, dose still open |
| `img/case-poka/meds-list.png` | Medications list |
| `img/case-poka/med-detail.png` | Medication detail: interval, times, dates |
| `img/case-poka/collection.png` | Card collection, Poka's Hats |
| `img/case-poka/settings.png` | Settings (email pixelated) |
| `img/case-poka/appstore.jpg` | Live App Store listing |
| `img/case-poka/*-poster.jpg` | Poster frames for the clips below |
| `video/case-poka/brand-splash.mp4` | Wordmark inking itself in |
| `video/case-poka/poka-melting.mp4` | Character melting loop |
| `video/case-poka/card-reveal.mp4` | Blob-to-card morph |
| `video/case-poka/clip-onboarding.mp4` | First open: splash, hello, sign up |
| `video/case-poka/clip-create.mp4` | Create medication flow, 2x speed |
| `video/case-poka/clip-take.mp4` | Take a dose: celebration + new card |
| `video/case-poka/clip-collection.mp4` | Collection and card personality |
| `video/case-poka/clip-paywall.mp4` | Premium paywall |
| `video/case-poka/marketing.mp4` | App Store preview video (has sound) |

## Work page previews (work.html)

The shot shown in the preview cell while a project is hovered. These are
`data-hero` / `data-reveal` on the row, and unlike a case study's slots
they are `object-fit: cover`: they fill the cell and crop, so favour a
composition that survives losing its edges. A row with no `data-hero`
previews as its generative card instead.

| Path | What it is |
|---|---|
| `img/case-ai/nora-hero.jpg` | P-01: the assistant mid-draft |
| `img/case-research/loop.svg` | P-04: the two week cadence, drawn in the site's language - the project has no product screen of its own |
| `img/case-poka/hero.jpg` | P-03: Meet Poka, the mascot and the schedule |
| `video/case-poka/card-reveal.mp4` | P-03 `data-reveal`: plays over the shot once per visit, and the shot is there when it clears |

## About page

| Path | What it is |
|---|---|
| `img/me-01.jpg` … `me-04.jpg` | Photo cells revealed on hover (cropped to fill; tune the per-image `--crop` in `about.html` to move the crop up or down) |
| `img/ff-01.jpg` … | Optional image per fun fact (`data-img` on the fact) |
