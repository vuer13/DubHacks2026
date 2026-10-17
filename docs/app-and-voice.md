# App and voice

You own `frontend/`: the hiker screen, the video player and replay engine, the Grok Realtime connection and its tools, earcons, haptics, the share page UI, and the pitch deck.

Before you start: read [`shared-context.md`](./shared-context.md) (or point your agent at it). Keep the dev server running so you can test on your phone quickly.

Phone testing: run `next dev` and expose it with ngrok (HTTPS is required for camera, mic and geolocation). Open the ngrok URL on your phone while iterating.

---

## Step B0: Next.js skeleton

**Prompt B0**

```
Read docs/shared-context.md first.

Create the TrailSense frontend in frontend/ with Next.js 14 App Router, TypeScript strict, Tailwind. Mobile first, this runs on a phone held in one hand.

1. frontend/lib/schema.ts: Zod schemas for Hazard, ClipEvent, SpeakEvent and the safety events, exactly matching the JSON in docs/shared-context.md. Export inferred types.
2. frontend/lib/api.ts: a typed client for every backend endpoint in the API contract, using NEXT_PUBLIC_BACKEND_URL. Each function validates the response with Zod.
3. app/page.tsx: a dark, high contrast layout with three zones stacked: a video area (16:9, placeholder for now), a big status area that shows the last spoken text in very large type (minimum 40px), and a bottom bar with one huge round mic button (at least 96px) and a small "Load video" button. Add a tiny top-right indicator showing backend health by polling /health every 5 s.
4. .env.example with NEXT_PUBLIC_BACKEND_URL.

Run it, confirm the health indicator turns green when the backend is up, and commit "frontend skeleton".
```

**Done when**: the page loads on your phone over ngrok and shows a green health dot.

---

## Step B1: Grok says hello

**Prompt B1**

```
Read docs/shared-context.md. Connect the browser to xAI's Grok Voice Agent realtime API.

First, open https://docs.x.ai/docs/guides/voice/agent and tell me exactly how a browser is meant to authenticate: is there an ephemeral or short-lived token endpoint, or must the WebSocket be proxied? Do not guess. Based on that, pick one:
  (a) If short-lived tokens exist: create app/api/voice/token/route.ts that uses XAI_API_KEY server-side to mint one and returns it.
  (b) If not: create a minimal WebSocket relay in app/api/voice/relay (or a tiny Node script in frontend/scripts/relay.ts on port 8787) that forwards frames between the browser and wss://api.x.ai/v1/realtime, adding the Authorization header.

Then build frontend/lib/voice/grok.ts:
- class GrokVoice with connect(), disconnect(), sendText(text, { speakOnly?: boolean }), on('transcript'|'speaking'|'toolCall'|'error', cb).
- On connect, send a session.update with: voice "Ara", server VAD on, input and output audio format pcm16 at the rate the docs specify, and the system prompt from frontend/lib/voice/systemPrompt.ts (copy the Grok system prompt from docs/shared-context.md into that file).
- Mic capture via getUserMedia and an AudioWorklet that resamples to the required rate and streams base64 pcm16 chunks.
- Playback: queue incoming audio deltas and play them gaplessly through an AudioContext; expose stopSpeaking() that flushes the queue and sends a response.cancel so a priority-3 warning can interrupt.

Wire the mic button on app/page.tsx: tap once to connect and start listening, tap again to disconnect. Show the live transcript in small text under the status area.

Test on my phone: I tap the mic, say "hello", Grok replies out loud. Then call sendText("Drop-off, left, stop", {speakOnly: true}) from a dev button and confirm it is spoken verbatim. Commit "grok voice hello".
```

**Done when**: Grok replies to your voice on the phone and speaks an injected warning verbatim. If the realtime API fights you, fall back to Web Speech API `speechSynthesis` for warnings and keep Grok only for the question-and-answer path; swap back later if you get unblocked.

---

## Step B2: video player and replay engine

Perception will hand you `backend/data/jobs/hike1.json` when the offline pipeline is ready. Until then, build against a fake.

**Prompt B2**

```
Read docs/shared-context.md. Build the replay engine that drives the demo.

1. frontend/public/demo/fake-events.json: hand-write 8 SpeakEvents and 12 ClipEvents spread over a 90 second timeline, covering every earcon and haptic value and at least one priority 3.
2. frontend/lib/replay.ts: class Replay that takes a <video> element and a list of SpeakEvents. On each timeupdate (and a 100 ms interval for precision) it fires any SpeakEvent whose t has been crossed and not yet fired. Handles seek backwards by resetting the fired set. Exposes on('speak', cb).
3. app/page.tsx: "Load video" opens a file picker (accept video/*) or a "Use demo hike" button that loads /demo/hike1.mp4 if present. Playing the video starts Replay. When a SpeakEvent fires: show its text in the status area, call GrokVoice.sendText(say, {speakOnly: true}) if connected, otherwise fall back to speechSynthesis; if priority is 3, call stopSpeaking() first.
4. frontend/lib/earcons.ts: synthesise five short tones with the Web Audio API (no audio files): note (single soft blip), caution (two rising blips), stop (three sharp low blips), fork (a two-note chime), sos (long alternating siren). Play the earcon about 150 ms before the speech.
5. frontend/lib/haptics.ts: navigator.vibrate patterns for short, double, long; no-op where unsupported.
6. A collapsible "Event log" panel under the video that lists every fired event with its timestamp, severity colour, and the ClipEvent scene text. Judges will look at this.

Test with the fake events on my phone and commit "replay engine".
```

**Done when**: playing a video on the phone produces tones, vibration and spoken warnings at the right moments, with the log filling in.

---

## Step B3: Grok tools and the real events

**Prompt B3**

```
Read docs/shared-context.md. Wire the Grok tools and switch the replay to real data.

1. In GrokVoice, declare the five tools from docs/shared-context.md in session.update with JSON schemas. When Grok emits a tool call, run the matching function in frontend/lib/voice/tools.ts, which calls the backend via lib/api.ts, then send the result back to Grok as a tool output and request a response.
   - get_hazards_ahead: GET /api/session/{id}/hazards; return a compact string like "11 o'clock: roots and steps, near. Trail clear otherwise."
   - describe_surroundings: grab the last 3 seconds of the current video (or camera) as a webm Blob using MediaRecorder on a captureStream, POST /api/describe, return the scene text.
   - where_am_i: GET /api/location/{id} and /api/trail/demo/brief, return one sentence.
   - start_sos and cancel_sos: POST the backend routes and return the confirmation.
2. Session handling: generate a session_id on page load, store it in sessionStorage, send it with every backend call, and show it as a small QR code (use the qrcode package) that links to /share/{session_id}.
3. Replace fake events: on "Use demo hike", call GET /api/jobs/hike1 and use its speak list and events list. Keep the fake as a fallback if the backend is unreachable.
4. Add a geolocation watcher that POSTs /api/location every 5 seconds while a session is active. If the response includes off_trail, speak "Drifting left of trail" or right, through the same speak path with priority 2 and earcon caution.

Test the three question tools by voice on my phone during the demo hike replay, then commit "grok tools and real events".
```

**Done when**: during replay you can ask "what's ahead?" and get a sensible spoken answer sourced from the backend.

---

## Step B4: integration

Follow [`integration-and-demo.md`](./integration-and-demo.md). Your job is the full-run driver: play the hike, exercise each tool, trigger the fall sequence with Safety/Nav, and keep a list of every UI glitch.

---

## Step B5: live camera mode

**Prompt B5**

```
Read docs/shared-context.md. Add live mode.

1. A "Live" toggle in the bottom bar. When on: getUserMedia with the rear camera at 640x480, show the preview in the video area, and every 3 seconds use MediaRecorder to cut a 3 second webm chunk and POST it to /api/clip with the session_id. Feed the returned speak list straight into the same speak path as replay. Show a small "analysing" pulse while a request is in flight and skip a cycle if the previous one has not returned, so requests never pile up.
2. Also POST every 3 second chunk to /api/fall/check only when the motion detector in frontend/lib/motion.ts flags a spike. Build motion.ts: sample the preview to a 64x36 canvas at 10 fps, compute mean absolute frame difference, flag a spike when the difference exceeds 4x its 2 second rolling average, then flag static_after if the next 2 seconds stay under 0.5x average. Expose on('fallSuspected').
3. When /api/fall/check returns "yes" or "unsure" with confidence above 0.6, start the fall check-in: send Grok the text "FALL CHECK-IN: ask the hiker if they are okay and wait", show a giant countdown from 20 in the status area, play the sos earcon every 5 seconds. Any transcript from the hiker or a tap anywhere cancels it (call cancel_sos and tell Grok "Hiker responded, cancel"). If the countdown reaches zero, call start_sos.
4. Keep live mode and replay mode mutually exclusive.

Test by walking around the room with the phone, then simulating a fall by dropping the phone onto a cushion. Commit "live mode and fall check-in".
```

**Done when**: live mode produces warnings while walking, a cushion drop triggers the check-in, and speaking cancels it.

---

## Step B6: polish, share page, low-vision mode, deck

**Prompt B6**

```
Read docs/shared-context.md. Polish for the demo.

1. app/share/[session_id]/page.tsx: a page an emergency contact opens. Poll GET /api/location/{id} every 5 s, show a map (use Leaflet with OpenStreetMap tiles via CDN, no API key) with the track and latest pin, the last 5 events in plain words, and a red banner if an sos_sent event exists. Big "Call hiker" tel: link.
2. A pre-brief: when a session starts (demo or live), fetch /api/trail/demo/brief and speak it through Grok before playback begins.
3. Low-vision mode toggle: hides the video, fills the screen with a single huge arrow or STOP glyph derived from the latest SpeakEvent direction, yellow on black, with the say text underneath at 64px.
4. Accessibility pass: every control has aria-label, the status area is aria-live="assertive", touch targets at least 64px, and the whole app works with the phone screen locked except for audio (test that audio keeps playing when the screen dims; if not, add a wake lock via navigator.wakeLock).
5. Then create pitch/deck.md as a 7 slide outline: problem with a user quote, what we built, architecture diagram (ASCII is fine), the three-signal fall logic, demo, what is real vs stubbed, and the community hazard map vision.

Commit "polish and share page".
```

---

## Step B7: rehearsal

You drive the demo. Rehearse the exact script in [`integration-and-demo.md`](./integration-and-demo.md) three times, record a screen capture of the best run with phone audio as the backup, and put the final demo video and cached events under `demo/`.
