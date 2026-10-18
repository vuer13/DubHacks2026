# TrailSense design handoff

TrailSense is a Next.js mobile web app for blind and low-vision hikers. The hiker listens; the screen exists for arm's-length glances, sighted teammates and judges. This page is the developer contract for the design in `source/project/` and `png/`: tokens, components, the data that drives every frame, and the glyph SVGs.

Contents

1. Token table
2. Component inventory
3. Screen-by-screen state map
4. Glyph SVGs
5. Accessibility rules
6. Files in this package

## 1. Token table

Paste the block below into a global stylesheet. Every text and background pair listed meets WCAG AAA 7:1 unless marked as a non-text indicator. Ratios were computed with the WCAG 2 relative luminance formula.

```css
:root {
  /* Ground and text, hiker screen (dark only) */
  --ts-bg: #0B1410;            /* page background, near-black green */
  --ts-surface: #13201A;       /* rows, cards, video zone */
  --ts-surface-2: #1B2C23;     /* raised controls, ring track */
  --ts-divider: #2A3F33;       /* hairlines and card edges, never carries text */
  --ts-text: #F2F5F0;          /* primary text, focus ring; 17.0:1 on --ts-bg */
  --ts-text-muted: #AEBBB2;    /* timestamps, scene sentences; 9.4:1 on --ts-bg, 7.4:1 on --ts-surface-2 */

  /* Accent (one hue, two uses) */
  --ts-accent: #1B5A38;        /* primary action fill, trail clear fill; --ts-text on it 7.4:1 */
  --ts-accent-bright: #5FC98A; /* same green as text, icon, outline on dark; 9.1:1 on --ts-bg */

  /* Severity scale, distinguishable by luminance alone (59%, 43%, 6%) */
  --ts-sev-1-bg: #9ED8AE;      /* note, calm green */
  --ts-sev-1-fg: #0B1410;      /* 11.5:1 */
  --ts-sev-2-bg: #E0A526;      /* caution, amber */
  --ts-sev-2-fg: #0B1410;      /* 8.5:1 */
  --ts-sev-3-bg: #8F0F19;      /* stop, red */
  --ts-sev-3-fg: #FFFFFF;      /* 9.3:1, pure white only here */

  /* Event and emergency */
  --ts-fork-bg: #8DC4F5;       /* junction events, sign readouts */
  --ts-fork-fg: #0B1410;       /* 10.1:1 */
  --ts-sos-bg: #FFD60A;        /* SOS yellow */
  --ts-sos-fg: #000000;        /* 14.9:1 either way round; low-vision mode is yellow on black */

  /* Health indicators (non-text, each over 6:1 on --ts-bg, always beside a word) */
  --ts-health-ok: #4CC37A;
  --ts-health-fail: #FF5C5C;
  --ts-health-off: #8A958D;

  /* Live share page (light) */
  --ts-light-bg: #F4F6F2;
  --ts-light-surface: #FFFFFF;
  --ts-light-text: #0B1410;    /* 17.2:1 on --ts-light-bg */
  --ts-light-muted: #44534A;   /* 7.5:1 on --ts-light-bg, 8.1:1 on white */
  --ts-light-divider: #D5DDD6;
  --ts-map-ground: #E6EAE4;    /* placeholder until Leaflet tiles load */

  /* Type, system stack, no web fonts */
  --ts-font: -apple-system, BlinkMacSystemFont, system-ui, "Segoe UI", sans-serif;
  --ts-font-mono: ui-monospace, SFMono-Regular, Menlo, monospace;
  --ts-type-hero: 56px;        /* last spoken line; 40px minimum when the line reaches 6 words; line-height 1.05; weight 700; max-width 12ch */
  --ts-type-hero-min: 40px;
  --ts-type-lv: 64px;          /* low-vision mode text; line-height 1.05; weight 700 */
  --ts-type-heading: 32px;     /* line-height 38px; weight 700 */
  --ts-type-label: 24px;       /* line-height 30px; weight 600 */
  --ts-type-secondary: 20px;   /* line-height 28px; weight 400; floor for labels */
  --ts-type-meta: 18px;        /* line-height 24px; weight 500; tabular numerals; absolute floor on the hiker screen */

  /* Spacing, 4px base */
  --ts-space-1: 4px;
  --ts-space-2: 8px;
  --ts-space-3: 12px;
  --ts-space-4: 16px;          /* screen gutter */
  --ts-space-6: 24px;
  --ts-space-8: 32px;
  --ts-space-12: 48px;
  --ts-space-16: 64px;

  /* Sizes */
  --ts-touch-min: 64px;
  --ts-touch-mic: 112px;       /* never under 96px */
  --ts-gutter: 16px;
  --ts-radius-control: 16px;
  --ts-radius-pill: 999px;
  --ts-focus: 3px solid var(--ts-text); /* outline-offset 3px; inside the yellow check-in it is inset 6px */
}
```

| Token | Value | Usage |
| --- | --- | --- |
| --ts-bg | #0B1410 | Hiker screen page background |
| --ts-surface | #13201A | Rows, cards, video zone |
| --ts-surface-2 | #1B2C23 | Raised controls, secondary buttons, ring track |
| --ts-divider | #2A3F33 | Hairlines, card edges |
| --ts-text | #F2F5F0 | Primary text, focus ring |
| --ts-text-muted | #AEBBB2 | Timestamps, scene sentences, stale last warning |
| --ts-accent | #1B5A38 | Primary action fill, trail clear zone, live share track and Call button |
| --ts-accent-bright | #5FC98A | Green as text, icon, outline, mic ring, progress fill |
| --ts-sev-1-bg / -fg | #9ED8AE / #0B1410 | Severity 1 note zone and swatch |
| --ts-sev-2-bg / -fg | #E0A526 / #0B1410 | Severity 2 caution zone and swatch, countdown arc in the normal theme |
| --ts-sev-3-bg / -fg | #8F0F19 / #FFFFFF | Severity 3 stop zone and swatch, SOS banners |
| --ts-fork-bg / -fg | #8DC4F5 / #0B1410 | Fork zone, sign card arrow tile, fork swatch |
| --ts-sos-bg / -fg | #FFD60A / #000000 | Fall check-in, SOS status, entire low-vision mode |
| --ts-health-ok / -fail / -off | #4CC37A / #FF5C5C / #8A958D | Health dot, offline banner dot |
| --ts-light-* | see block | Live share page only |
| --ts-map-ground | #E6EAE4 | Map placeholder before tiles load |

Greyscale check: the three severity backgrounds have relative luminance 0.59, 0.43 and 0.06, so they read as light, mid and dark with no colour. Red on yellow was rejected for SOS at 4.4:1.

## 2. Component inventory

Props are given as TypeScript-style signatures. Every component renders a native element (`button`, `a`, `ul`) and takes an `ariaLabel` override; icons are inline stroke SVG at `stroke-width` 2 to 2.6 and `currentColor`.

**MicButton**
`{ state: "idle" | "listening" | "speaking" | "unavailable"; onPress(); size?: 112 }`
Idle: `--ts-surface-2` fill, 3px `--ts-accent-bright` ring, mic glyph in `--ts-text`. Listening: `--ts-accent` fill, same ring, one outer ring animating `scale(1) → scale(1.28)` and fading over 1.4 s (`.ts-pulse`), static at 50% opacity under `prefers-reduced-motion`. Speaking: `--ts-text` fill, `--ts-bg` waveform glyph, no motion. Unavailable: idle with `--ts-text-muted` ring and glyph. `aria-label` per state: "Ask TrailSense", "Listening, tap to stop", "TrailSense is speaking, tap to interrupt", "Ask TrailSense, voice agent unavailable offline". `aria-pressed` true while listening.

**PillToggle**
`{ label: "Live" | "Low vision"; checked: boolean; onChange(checked); tone?: "dark" | "yellow" }`
`role="switch"`, `aria-checked`, `aria-label` "`label` mode, on|off". Off: `--ts-surface-2` fill, 3px `--ts-text-muted` border. On: `--ts-accent` fill, 3px `--ts-accent-bright` border, check glyph before the label. Yellow tone (low-vision mode): `#000000` fill, 3px `--ts-sos-bg` border and text, 220 by 64. Label 18px in the 115px bottom-bar pills, 20px when wider. Min height 64.

**SecondaryButton**
`{ label; icon?; onPress() }`
`--ts-surface-2` fill, 3px `--ts-text-muted` border, `--ts-text` 24px label, radius 16, min height 64. Used for Load video, Repeat last, Cancel SOS.

**PrimaryButton**
`{ label; icon?; onPress() | href }`
`--ts-accent` fill, `--ts-text` 24px label, radius 16, min height 64. One per screen. Use demo hike, I'm okay, Call hiker (an `a[href="tel:"]`, 72px on the phone, 88px on the laptop).

**HealthDot**
`{ status: "ok" | "fail" | "off"; label: string }`
16px to 20px circle in the matching `--ts-health-*` token, `aria-hidden`, followed by `label` in words. In the header it stands alone with `role="img"` and `aria-label` = `label`.

**EventRow**
`{ t: string; severity: 1 | 2 | 3 | "fork"; say: string; scene?: string; signLines?: string[]; compact?: boolean }`
Left swatch 72px (40px compact) in the severity background with its glyph (check, triangle, octagon, fork), `aria-hidden`. Then `t` in `--ts-type-meta` tabular and the severity word, `say` at 24px (20px compact), `scene` and `signLines` at 20px (18px compact) in `--ts-text-muted`. Rows are `li` inside `ul[aria-label="Recent events, newest first"]`. `t` is `m:ss` of the hike, not wall-clock.

**EventLogPanel**
`{ events: EventRow[]; expanded: boolean; newCount: number; onToggle() }`
Header is a 64px `button` with `aria-expanded` and `aria-label` "Event log, N events[, M new], collapsed|expanded". When expanded the panel takes the status zone (rows at 44px, eight visible).

**StatusZone**
`{ text: string; tone: "plain" | "stale" | 1 | 2 | 3 | "fork" | "clear" | "sos"; word?: string; glyph?: ReactNode; children? }`
Fills the space between the log header and the bottom bar. Plain: `--ts-bg` with `--ts-text` hero. Stale: `--ts-text-muted` hero. Severity tones fill the zone with `--ts-sev-N-bg` and set `--ts-sev-N-fg`; fork uses the fork pair; clear uses `--ts-accent` with `--ts-text`; sos uses `#000000` with `--ts-sos-bg`. The hero `p` has `aria-live="assertive" aria-atomic="true"`, 56px, dropping to 40px when `text` has 6 words or when `children` need room.

**TranscriptLine**
`{ speaker: "hiker" | "agent"; text: string }`
24px `--ts-text` with a mic or waveform glyph in `--ts-accent-bright`, 20px top padding over a `--ts-divider` rule, `aria-live="polite"`.

**SignCard**
`{ label: string; direction: "left" | "right" | "ahead"; distanceKm: number; spoken: string }`
Arrow tile 64px in `--ts-fork-bg`/`--ts-fork-fg`, `label` at 32px, "Direction, 2.1 km" at 24px muted, `spoken` at 20px. `role="group"` with `aria-label` = `spoken`. On the hiker screen it sits on `--ts-bg` inside the fork zone.

**CountdownRing**
`{ seconds: number; total: 20; tone: "sos" | "caution"; size: 240 | 176 }`
SVG circle rotated -90deg, `stroke-dasharray` = circumference, `stroke-dashoffset` = circumference × (1 − seconds/total). SOS tone: 4px `--ts-sos-bg` track, 20px `--ts-sos-bg` arc, number at 120px. Caution tone (component sheet): `--ts-surface-2` track, 14px `--ts-sev-2-bg` arc, number at 56px. `role="timer"`, number `aria-live="assertive"`, spoken every 5 s. Arc eases 1 s per tick; steps under reduced motion.

**StatusBanner**
`{ tone: "clear" | "warn" | "sos" | "offline"; text: string; action?: { label; onPress } }`
Clear: `--ts-accent` fill, check glyph, `role="status"`. Offline: `--ts-surface-2` fill, 3px `--ts-text-muted` border, `--ts-health-fail` dot, `role="status"`. SOS (hiker): `#000000` fill, 3px `--ts-sos-bg` border, `role="alert"`. SOS top banner (hiker and share page): `--ts-sev-3-bg` fill, white text, `role="alert"`, persistent, optional `action` rendered as SecondaryButton.

**GuidanceGlyph** (low-vision mode)
`{ kind: "ahead" | "steer-left" | "steer-right" | "stop" | "fork-left" | "fork-right" }`
Full-screen SVG, `viewBox="0 0 390 844"`, `--ts-sos-bg` on `#000000`, `role="img"` with a spoken label. Paths in section 4.

**ShareHeader** `{ sessionId; lastUpdateSeconds; sos: boolean }`, **MapView** `{ track: LatLng[]; position: LatLng; sos: boolean }` (Leaflet, OSM tiles, 5px to 6px `--ts-accent` polyline, 12px `--ts-accent` pin with 4px white ring and a `.ts-ping` halo), **ShareEventList** `{ events: { t: string; severity; text: string }[] }` (wall-clock `h:mm pm`, plain sentences, 12px severity dot plus the severity word inside the sentence).

## 3. Screen-by-screen state map

Event shapes referenced below:

```ts
type SpeakEvent = { kind: "speak"; t: number; priority: 1 | 2 | 3; say: string; scene?: string; earcon?: "fork" | "clear" }
type ClipEvent  = { kind: "clip";  t: number; sign?: { label: string; direction: "left" | "right" | "ahead"; distanceKm?: number; lines: string[] }; hazard?: { point: { x: number; y: number }; class: string } }
type SafetyEvent = { kind: "safety"; t: number; type: "fall_checkin_started" | "fall_cancelled" | "sos_sent"; secondsLeft?: number; sentAt?: string }
type Health = { camera: boolean; model: boolean; backend: boolean; gps: boolean }
type Mode = { live: boolean; lowVision: boolean; agent: "idle" | "listening" | "speaking" }
```

Frame source files are in `source/project/` and keep their original names, so the Source column below is the `.dc.html` file name. Renders are in `png/`, named by the state they show.

| Frame | Source | PNG | Driven by |
| --- | --- | --- | --- |
| Design system sheet | Main | [design-system-sheet.png](./png/design-system-sheet.png) | static |
| 1 Idle | Hiker01Idle | [hiker-idle.png](./png/hiker-idle.png) | no source loaded (`video == null && !mode.live`); StatusZone text "Ready. Tap the mic to talk." |
| 2 Playing, trail clear | Hiker02Playing | [hiker-playing-clear.png](./png/hiker-playing-clear.png) | video playing; last SpeakEvent older than 8 s renders `tone: "stale"`; latest `earcon == "clear"` shows the Trail clear line |
| 3 Severity 1 | Hiker03Sev1 | [hiker-sev1-note.png](./png/hiker-sev1-note.png) | SpeakEvent `priority 1` within the last 8 s: StatusZone `tone 1`, word "Note", check glyph; EventLogPanel `newCount` +1 |
| 4 Severity 2 | Hiker04Sev2 | [hiker-sev2-caution.png](./png/hiker-sev2-caution.png) | SpeakEvent `priority 2`: `tone 2`, word "Caution", triangle glyph |
| 5 Severity 3 | Hiker05Sev3 | [hiker-sev3-stop.png](./png/hiker-sev3-stop.png) | SpeakEvent `priority 3`: `tone 3`, word "STOP", 64px octagon beside the hero; the zone fills edge to edge |
| 6 Fork with sign | Hiker06Fork | [hiker-fork-sign.png](./png/hiker-fork-sign.png) | SpeakEvent `earcon == "fork"` plus a ClipEvent with `sign` inside 3 s: `tone "fork"`, SignCard from `sign.label`, `sign.direction`, `sign.distanceKm`, spoken line "Sign: `label`, `direction`, `distance` kilometres" |
| 7 Agent listening | Hiker07Listening | [hiker-agent-listening.png](./png/hiker-agent-listening.png) | `mode.agent == "listening"`: MicButton listening, TranscriptLine `speaker "hiker"` from the live ASR partial; StatusZone stays stale |
| 8 Agent speaking | Hiker08Speaking | [hiker-agent-speaking.png](./png/hiker-agent-speaking.png) | `mode.agent == "speaking"`: MicButton speaking, TranscriptLine `speaker "agent"` from the agent reply; hero drops to 40px |
| 9 Event log expanded | Hiker09Log | [hiker-event-log-expanded.png](./png/hiker-event-log-expanded.png) | EventLogPanel `expanded == true`; rows are the last 8 events, SpeakEvents keyed by `priority`, fork rows also carry `sign.lines` |
| 10 Live mode | Hiker10Live | [hiker-live-mode.png](./png/hiker-live-mode.png) | `mode.live == true`: MapView replaced by camera preview, Analysing chip while a frame is in flight, Live pill checked; latest `earcon == "clear"` fills the zone `tone "clear"` |
| 11 Backend offline | Hiker11Offline | [hiker-backend-offline.png](./png/hiker-backend-offline.png) | `health.backend == false`: HealthDot fail, StatusBanner offline "Working offline, pre-recorded warnings only.", MicButton unavailable |
| 12 Session QR | Hiker12QR | [hiker-session-qr.png](./png/hiker-session-qr.png) | frame 1 plus `session.shareUrl` present: QR tile and "Share this hike" link |
| S1 Check-in started | Safe01CheckIn | [safety-checkin-started.png](./png/safety-checkin-started.png) | SafetyEvent `fall_checkin_started`: full-screen cancel button, CountdownRing from `secondsLeft` (20), any tap or any speech cancels |
| S2 Cancelled | Safe02Cancelled | [safety-checkin-cancelled.png](./png/safety-checkin-cancelled.png) | SafetyEvent `fall_cancelled`: StatusZone `tone 1` "Cancelled. Help is not being called." for 3 s, then back to the previous state |
| S3 SOS sent | Safe03SOS | [safety-sos-sent.png](./png/safety-sos-sent.png) | SafetyEvent `sos_sent`: top StatusBanner sos "Help contacted at `sentAt`" with Cancel SOS, StatusZone `tone "sos"` "Calling for help now."; banner persists until the session ends or Cancel SOS is confirmed |
| LV4 Trail clear | LV04Clear | [lowvision-clear.png](./png/lowvision-clear.png) | `mode.lowVision && earcon == "clear"`: GuidanceGlyph `ahead`, text "Trail clear" |
| LV5 Hazard left | LV05HazardLeft | [lowvision-hazard-left.png](./png/lowvision-hazard-left.png) | `mode.lowVision && priority >= 2 && hazard.point.x < 400` (frame width 1280, hazard in the left third): GuidanceGlyph `steer-right`, text = `say` without the trailing ", stop". `x > 880` mirrors to `steer-left`. Between 400 and 880 use `stop` |
| LV6 Stop | LV06Stop | [lowvision-stop.png](./png/lowvision-stop.png) | `mode.lowVision && priority == 3`: GuidanceGlyph `stop`, text "Stop"; only the Low vision pill remains |
| LV7 Fork | LV07Fork | [lowvision-fork.png](./png/lowvision-fork.png) | `mode.lowVision && earcon == "fork"`: GuidanceGlyph `fork-right` or `fork-left` from `sign.direction`, text "Fork ahead, `direction`" |
| Share, phone, normal | Share01MobileNormal | [share-mobile-normal.png](./png/share-mobile-normal.png) | `GET /share/:session`: header from `session.id` and age of the last position, MapView from `track` and `position`, ShareEventList from the last 5 events, Call hiker from `session.phone` |
| Share, phone, SOS | Share02MobileSOS | [share-mobile-sos.png](./png/share-mobile-sos.png) | same, plus a `sos_sent` SafetyEvent in the session: top banner "SOS sent at `sentAt`. Emergency contact notified.", status dot red, SOS as the newest row |
| Share, laptop, normal | Share03DesktopNormal | [share-desktop-normal.png](./png/share-desktop-normal.png) | as the phone frame, two-column at 960px and above |
| Share, laptop, SOS | Share04DesktopSOS | [share-desktop-sos.png](./png/share-desktop-sos.png) | as the phone SOS frame |

Rules that cut across frames: a new SpeakEvent replaces the hero immediately (assertive live region); the severity fill lasts 8 s then falls back to stale; `priority 3` and `sos_sent` are never auto-dismissed while the hazard is still detected; the Low vision pill is always rendered so the mode can be left.

## 4. Glyph SVGs

All low-vision glyphs share `viewBox="0 0 390 844"` so coordinates match the phone frame one to one. Draw at full screen size; do not scale the stroke widths independently.

Thin arrow, ahead (LV4). Stroke 16px, shaft 260px from the lower third upward, head 120 by 60.

```svg
<svg viewBox="0 0 390 844" role="img" aria-label="Arrow pointing straight ahead">
  <path d="M195 560V300" fill="none" stroke="#FFD60A" stroke-width="16" stroke-linecap="round"/>
  <path d="M135 360L195 300L255 360" fill="none" stroke="#FFD60A" stroke-width="16" stroke-linecap="round" stroke-linejoin="round"/>
</svg>
```

Thick arrow, steer right (LV5). Stroke 40px, shaft 270px (70% of width), head 160px tall. Mirror with `transform="scale(-1,1) translate(-390,0)"` for steer left.

```svg
<svg viewBox="0 0 390 844" role="img" aria-label="Thick arrow pointing right, away from the hazard">
  <path d="M60 400H330" fill="none" stroke="#FFD60A" stroke-width="40" stroke-linecap="round"/>
  <path d="M250 320L330 400L250 480" fill="none" stroke="#FFD60A" stroke-width="40" stroke-linecap="round" stroke-linejoin="round"/>
</svg>
```

STOP octagon (LV6). Filled, no stroke, 358px across, centred in the top two thirds. Corner cut is 0.293 of the side.

```svg
<svg viewBox="0 0 390 844" role="img" aria-label="Stop">
  <polygon points="121,110 269,110 374,215 374,363 269,468 121,468 16,363 16,215" fill="#FFD60A"/>
</svg>
```

Fork, take the right branch (LV7). Stem 24px, the branch not taken 12px, the branch to take 40px with a 65px arrowhead. Mirror for the left branch.

```svg
<svg viewBox="0 0 390 844" role="img" aria-label="Fork, take the right branch">
  <path d="M195 600V430" fill="none" stroke="#FFD60A" stroke-width="24" stroke-linecap="round"/>
  <path d="M195 430L95 290" fill="none" stroke="#FFD60A" stroke-width="12" stroke-linecap="round"/>
  <path d="M195 430L295 290" fill="none" stroke="#FFD60A" stroke-width="40" stroke-linecap="round"/>
  <path d="M230 290H295V355" fill="none" stroke="#FFD60A" stroke-width="40" stroke-linecap="round" stroke-linejoin="round"/>
</svg>
```

Small 24-unit icons used in swatches and buttons (stroke 2.4, round caps and joins, `currentColor`): check `M5 12l5 5L20 7`; caution triangle `M12 3L22 20H2z M12 10v4 M12 17.5h.01`; stop octagon `M7.5 3h9L21 7.5v9L16.5 21h-9L3 16.5v-9z M12 8v5 M12 16.5h.01`; fork `M12 21v-8 M12 13L6 6 M12 13l6-7`; mic `rect 9,3 6x11 rx3; M5 11a7 7 0 0 0 14 0; M12 18v3`; waveform `M4 10v4 M8 7v10 M12 4v16 M16 8v8 M20 10v4`; alert circle `circle 12,12 r9; M12 7v6; M12 16.5h.01`. The same files are in `frontend/public/glyphs/` (`arrow-ahead.svg`, `arrow-steer-right.svg`, `stop.svg`, `fork-right.svg`), served at `/glyphs/<name>.svg`.

## 5. Accessibility rules

Every control is a native button, switch or link with an aria-label that says what it does and, for toggles, its current state. The last spoken line lives in a single region marked aria-live assertive and aria-atomic so a new warning interrupts whatever VoiceOver was reading; everything else is polite or silent. Colour is never the only signal: each severity carries an icon and its name in words, each health dot sits beside a status sentence, the fork blue always travels with the fork glyph, and in low-vision mode the arrow's stroke weight carries the severity. Focus rings are a 3px off-white outline with 3px offset. Motion is limited to one slow pulse on the listening mic, the blink of the Analysing dot, the map pin halo and the countdown arc, and all of them stop under prefers-reduced-motion. Nothing on the hiker screen is under 18px, nothing tappable is under 64px, low-vision text is 64px, and all type scales with the system text size.

## 6. Files in this package

```
source/project/canvas.json          canvas index: frame positions, titles, annotation stickies
source/project/*.dc.html            one self-contained HTML file per frame (inline styles, inline SVG)
png/*.png                           2x renders of every frame, named by state (phone 780 by 1688, laptop 2560 by 1600); the design system sheet is downscaled to 1920 wide, 64 colours, to stay under 500 KB
frontend/public/glyphs/*.svg        the four low-vision glyphs as standalone SVG (repo path, moved out of this folder)
handoff.md                          this page
```

The `.dc.html` files render as plain HTML once the `<x-dc>`, `<helmet>` wrappers and the two script tags are removed; `png/` was produced that way with Playwright at `deviceScaleFactor: 2` and reduced motion on.
