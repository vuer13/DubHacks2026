# App and voice

You own `frontend/`: the hiker screen, the video player and replay engine, both ElevenLabs channels (text to speech for warnings, the Agent for questions), the speech cache and pre-render script, earcons, haptics, the share page UI, and the pitch deck.

Before you start: read [`shared-context.md`](./shared-context.md) and the ElevenLabs half of [`vendor-apis.md`](./vendor-apis.md). Keep the dev server running so you can test on your phone quickly.

Phone testing: run `next dev` and expose it with ngrok (HTTPS is required for camera, mic and geolocation). Open the ngrok URL on your phone while iterating.

Two voice channels, on purpose:

- **Warnings** go through text to speech only. No language model, nothing to paraphrase, under 300 ms live, zero latency in replay because the mp3s are pre-rendered.
- **Questions** go through the ElevenLabs Agent, which handles the mic, turn-taking, and calls our client tools.

---

## Step B0: Next.js skeleton and the ElevenLabs agent

Do the dashboard part by hand first (10 minutes):

1. Create an ElevenLabs account, make an API key, pick a voice (a calm, clear one; note its voice ID).
2. Agents: create an agent "TrailSense". Paste the system prompt from `docs/shared-context.md`. Set the voice. First message: leave empty (we do not want it to talk until spoken to). Turn-taking: default.
3. Security tab: enable overrides for System prompt, First message, Voice ID. Leave the agent private (authentication on).
4. Tools: add six Client tools with these exact names and parameter schemas, all with "Wait for response" on:
   - `get_hazards_ahead` (no parameters)
   - `describe_surroundings` (no parameters)
   - `read_sign` (no parameters)
   - `where_am_i` (no parameters)
   - `start_sos` (`reason`: string)
   - `cancel_sos` (no parameters)
5. Copy the agent ID into `frontend/.env.local`.

**Prompt B0**

```
Read docs/shared-context.md first.

Create the TrailSense frontend in frontend/ with Next.js 14 App Router, TypeScript strict, Tailwind. Mobile first, this runs on a phone held in one hand.

1. frontend/lib/schema.ts: Zod schemas for Hazard (with optional point tuple), SignReading, ClipEvent (with optional sign), SpeakEvent and the safety events, exactly matching the JSON in docs/shared-context.md. Export inferred types.
2. frontend/lib/api.ts: a typed client for every backend endpoint in the API contract, using NEXT_PUBLIC_BACKEND_URL. Each function validates the response with Zod.
3. app/page.tsx: a dark, high contrast layout with three zones stacked: a video area (16:9, placeholder for now), a big status area that shows the last spoken text in very large type (minimum 40px), and a bottom bar with one huge round mic button (at least 96px) and a small "Load video" button. Add a tiny top-right indicator showing backend health by polling /health every 5 s.
4. .env.example with NEXT_PUBLIC_BACKEND_URL, ELEVENLABS_API_KEY, ELEVENLABS_AGENT_ID, ELEVENLABS_VOICE_ID, ELEVENLABS_TTS_MODEL.

Run it, confirm the health indicator turns green when the backend is up, and commit "frontend skeleton".
```

**Done when**: the page loads on your phone over ngrok and shows a green health dot, and the agent exists in the dashboard with six tools.

---

## Step B1: warnings speak, agent says hello

**Prompt B1**

```
Read docs/shared-context.md and docs/vendor-apis.md (ElevenLabs section). Build both voice channels.

Part 1, the warning channel (text to speech):
- app/api/voice/tts/route.ts: POST {"text": string}. Compute sha1(text). If frontend/.cache/tts/<sha1>.mp3 exists, return it. Otherwise call POST https://api.elevenlabs.io/v1/text-to-speech/<ELEVENLABS_VOICE_ID>/stream?output_format=mp3_22050_32 with header xi-api-key, body {text, model_id: ELEVENLABS_TTS_MODEL, voice_settings: {stability: 0.7, similarity_boost: 0.75, speed: 1.1}}, write the bytes to the cache file, and return them with Content-Type audio/mpeg and Cache-Control max-age=31536000. Never expose the API key to the client. Add frontend/.cache to .gitignore.
- frontend/lib/voice/speech.ts: class Speech with say(text, {priority}) and stop(). It keeps a queue of {text, priority}. It resolves audio in this order: a pre-rendered file at /demo/speech/<sha1>.mp3 (HEAD request once, cache the result), then POST /api/voice/tts, then browser speechSynthesis as the last resort. Audio plays through a single HTMLAudioElement so iOS keeps it unlocked after the first user tap. A priority 3 say() stops whatever is playing, clears the queue, and plays immediately. Emits on('start'|'end', cb) with the text.
- A dev button that calls Speech.say("Drop-off, left, stop", {priority: 3}). Confirm it is spoken verbatim on the phone and that the second press is instant (served from cache).

Part 2, the conversation channel (ElevenLabs Agent):
- app/api/voice/token/route.ts: GET. Calls https://api.elevenlabs.io/v1/convai/conversation/get-signed-url?agent_id=<ELEVENLABS_AGENT_ID> with xi-api-key and returns {"signed_url"}. Mark the route dynamic so it is never cached.
- Install @elevenlabs/react. Wrap app/layout.tsx in ConversationProvider.
- frontend/lib/voice/agent.ts: a hook useTrailAgent() built on useConversation with: clientTools stubbed to return "not wired yet" for all six names from docs/shared-context.md; overrides.agent.prompt.prompt set from frontend/lib/voice/systemPrompt.ts (copy the system prompt from docs/shared-context.md into that file); onMessage logging transcripts; onModeChange exposing isSpeaking. connect() fetches /api/voice/token and calls startSession({signedUrl, connectionType: "websocket"}). disconnect() calls endSession(). Expose sendContextualUpdate, sendUserMessage, sendUserActivity, setVolume.
- Wire the mic button on app/page.tsx: tap once to connect and start listening, tap again to disconnect. Show the live transcript in small text under the status area.

Test on my phone: tap the mic, say "hello", the agent replies out loud. Then press the dev button while the agent is mid-sentence and confirm the warning plays over it. Commit "elevenlabs voice hello".
```

**Done when**: the agent replies to your voice on the phone, and an injected warning plays verbatim within a second. If the agent fights you, the warning channel alone carries the whole replay demo; keep going with B2 and come back.

---

## Step B2: video player, replay engine, pre-rendered speech

Perception will hand you `backend/data/jobs/hike1.json` when the offline pipeline is ready. Until then, build against a fake.

**Prompt B2**

```
Read docs/shared-context.md. Build the replay engine that drives the demo.

1. frontend/public/demo/fake-events.json: hand-write 8 SpeakEvents and 12 ClipEvents spread over a 90 second timeline, covering every earcon and haptic value, at least one priority 3, one fork event with a directional sign attached, and at least two hazards with a point.
2. frontend/scripts/prerender-speech.ts: node script that reads a jobs file (path argument, default public/demo/fake-events.json), collects every unique SpeakEvent.say, every sign.say, and the fixed phrases in frontend/lib/voice/phrases.ts (pre-brief placeholder, "Drifting left of trail", "Drifting right of trail", "Are you okay? Say anything to cancel.", "Calling for help now.", "Cancelled. Help is not being called."), and writes public/demo/speech/<sha1>.mp3 for each through the same ElevenLabs call the tts route uses (share the code in frontend/lib/voice/elevenlabs.server.ts). Skip files that exist. Print count and total bytes. Add "prerender" to package.json scripts.
3. frontend/lib/replay.ts: class Replay that takes a <video> element and a list of SpeakEvents. On each timeupdate (and a 100 ms interval for precision) it fires any SpeakEvent whose t has been crossed and not yet fired. Handles seek backwards by resetting the fired set. Exposes on('speak', cb).
4. app/page.tsx: "Load video" opens a file picker (accept video/*) or a "Use demo hike" button that loads /demo/hike1.mp4 if present. Playing the video starts Replay. When a SpeakEvent fires: show its text in the status area, call Speech.say(say, {priority}), and if the agent is connected call sendContextualUpdate("Warning spoken: " + say). If priority is 3 and the agent is connected, also call sendUserActivity() and setVolume({volume: 0}) until Speech emits 'end', then restore volume to 1.
5. frontend/lib/earcons.ts: synthesise five short tones with the Web Audio API (no audio files): note (single soft blip), caution (two rising blips), stop (three sharp low blips), fork (a two-note chime), sos (long alternating siren). Play the earcon about 150 ms before the speech.
6. frontend/lib/haptics.ts: navigator.vibrate patterns for short, double, long; no-op where unsupported.
7. A collapsible "Event log" panel under the video that lists every fired event with its timestamp, severity colour, the ClipEvent scene text, and the sign lines when present. Judges will look at this.

Run the prerender script on the fake events, test with airplane mode on the phone (the speech must still play from the pre-rendered files), and commit "replay engine and speech prerender".
```

**Done when**: playing a video on the phone produces tones, vibration and spoken warnings at the right moments with no network, and the log fills in.

---

## Step B3: agent tools and the real events

**Prompt B3**

```
Read docs/shared-context.md. Wire the agent's client tools and switch the replay to real data.

1. frontend/lib/voice/tools.ts: implement the six client tools, each returning a short string the agent can read out. Register them in useTrailAgent's clientTools with exactly these names:
   - get_hazards_ahead: GET /api/session/{id}/hazards; return a compact string like "11 o'clock: roots and steps, near. Trail clear otherwise." Use the hazard's point for the clock word when present.
   - describe_surroundings: grab the last 3 seconds of the current video (or camera) as a webm Blob using MediaRecorder on a captureStream, POST /api/describe, return the scene text.
   - read_sign: grab the current frame as a JPEG from a canvas, POST /api/read_sign, return sign.say followed by the lines joined with commas.
   - where_am_i: GET /api/location/{id} and /api/trail/demo/brief, return one sentence.
   - start_sos: POST /api/sos with reason, lat, lng, recent say strings; return "Help has been contacted" or the failure reason.
   - cancel_sos: POST /api/sos/cancel; return "Cancelled".
2. Session handling: generate a session_id on page load, store it in sessionStorage, send it with every backend call, and show it as a small QR code (use the qrcode package) that links to /share/{session_id}.
3. Replace fake events: on "Use demo hike", call GET /api/jobs/hike1 and use its speak list and events list. Keep the fake as a fallback if the backend is unreachable. Run the prerender script against the real job and commit the mp3s (they are small).
4. Add a geolocation watcher that POSTs /api/location every 5 seconds while a session is active. If the response includes off_trail, speak "Drifting left of trail" or right, through Speech.say with priority 2 and earcon caution.
5. Sign readout in replay: when a fired SpeakEvent's matching ClipEvent has a sign with kind "directional", the smoother already added a second SpeakEvent; nothing extra to do, but show the sign lines in the status area under the say text.

Test the four question tools by voice on my phone during the demo hike replay ("what's ahead?", "what do you see?", "read the sign", "where am I?"), then commit "agent tools and real events".
```

**Done when**: during replay you can ask "what's ahead?" and get a sensible spoken answer sourced from the backend, and "read the sign" reads the fork sign.

---

## Step B4: integration

Follow [`integration-and-demo.md`](./integration-and-demo.md). Your job is the full-run driver: play the hike, exercise each tool, trigger the fall sequence with Safety/Nav, and keep a list of every UI glitch.

---

## Step B5: live camera mode and fall check-in

**Prompt B5**

```
Read docs/shared-context.md. Add live mode and the fall check-in.

1. A "Live" toggle in the bottom bar. When on: getUserMedia with the rear camera at 640x480, show the preview in the video area, and every 3 seconds use MediaRecorder to cut a 3 second webm chunk and POST it to /api/clip with the session_id. Feed the returned speak list straight into the same speak path as replay. Show a small "analysing" pulse while a request is in flight and skip a cycle if the previous one has not returned, so requests never pile up.
2. Also POST every 3 second chunk to /api/fall/check only when the motion detector in frontend/lib/motion.ts flags a spike. Build motion.ts: sample the preview to a 64x36 canvas at 10 fps, compute mean absolute frame difference, flag a spike when the difference exceeds 4x its 2 second rolling average, then flag static_after if the next 2 seconds stay under 0.5x average. Expose on('fallSuspected').
3. Fall check-in, owned by the frontend (frontend/lib/safety/checkin.ts), not by the agent:
   - When /api/fall/check returns "yes" or "unsure" with confidence above 0.6: play the sos earcon, Speech.say("Are you okay? Say anything to cancel.", {priority: 3}), show a giant countdown from 20 in the status area, and repeat the earcon every 5 seconds. If the agent is connected, also sendUserMessage("[SYSTEM] Possible fall detected. Ask the hiker once if they are okay, then wait.").
   - Cancel on any of: a final user transcript from onMessage, a tap anywhere, or the agent calling cancel_sos. On cancel: POST /api/sos/cancel, Speech.say("Cancelled. Help is not being called."), sendContextualUpdate("Fall check-in cancelled by the hiker.").
   - If the countdown reaches zero: POST /api/sos directly from the frontend with the latest location and recent say strings, Speech.say("Calling for help now."), sendContextualUpdate("SOS sent to the emergency contact.").
   - In replay mode the same check-in can be triggered from a dev button so we can rehearse it without dropping a phone.
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
2. A pre-brief: when a session starts (demo or live), fetch /api/trail/demo/brief and play it through Speech.say with priority 1 before playback begins. Add the brief text to the prerender phrases so the demo plays it from cache.
3. Low-vision mode toggle: hides the video, fills the screen with a single huge arrow or STOP glyph, yellow on black, with the say text underneath at 64px. The arrow direction comes from the latest SpeakEvent's hazard: use hazard.point x when present (left of 400 means hazard on the left so arrow points right, and the reverse), otherwise the direction field. If backend/data/jobs/hike1.track.json exists (Perception stretch), draw a thin guidance arrow from center_x between warnings.
4. Accessibility pass: every control has aria-label, the status area is aria-live="assertive", touch targets at least 64px, and the whole app works with the phone screen locked except for audio (test that audio keeps playing when the screen dims; if not, add a wake lock via navigator.wakeLock).
5. Then create pitch/deck.md as a 7 slide outline: problem with a user quote, what we built, architecture diagram (ASCII is fine: phone, FastAPI, Mk1.5, ElevenLabs, Twilio), the three-signal fall logic, demo, what is real vs stubbed, and the community hazard map vision.

Commit "polish and share page".
```

---

## Step B7: rehearsal

You drive the demo. Rehearse the exact script in [`integration-and-demo.md`](./integration-and-demo.md) three times, record a screen capture of the best run with phone audio as the backup, re-run the prerender script after any change to the speak list, and put the final demo video and cached events under `demo/`.
