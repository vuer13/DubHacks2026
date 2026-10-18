# App and voice

You own `frontend/`: the TrailSense app in React Native (Expo SDK 57, Expo Router). One codebase gives the hiker app on iPhone and Android and the web share page the emergency contact opens in a browser. You also own the hiker screen, video replay, both ElevenLabs channels (text to speech for warnings, the Agent for questions), the speech cache and pre-render script, earcons, haptics, the development builds, and the pitch deck. In the backend you own `backend/voice/`, the two proposed voice routes.

Before you start: read [`shared-context.md`](./shared-context.md) and the ElevenLabs half of [`vendor-apis.md`](./vendor-apis.md).

**Migration status.** Expo Router is active in `frontend/`; the previous Next.js files are preserved under `frontend/legacy-web/`. Live safety monitoring is the default and records one-second video segments. Hazard analysis runs every two captured seconds over the backend's rolling frame buffer; fall analysis runs independently over sliding four-second windows: segments `[1,2,3,4]`, then `[4,5,6,7]`. Fall checks assess after the first four clips and then every three clips, retaining one second of overlap. Hazard speech is silent when no hazard is detected and suppresses repeats for 20 seconds. A positive fall result stops warning playback and opens the 20-second check-in. Fall-only mode remains available for indoor tests. The check-in currently does not place an SOS call, and voice-response cancellation, location sharing, and automatic SOS still need their B5 wiring. Perceptron receives the four original fall segments, including their audio. One nine-second request previously took 37,302 ms at high reasoning effort; fall confirmation now uses medium, but live latency still needs measuring.

## How you run it

| Need | Run | Opens in |
|---|---|---|
| UI work, layout, state changes | `npm run start:go` in `frontend/` | Expo Go from the app store; scan the QR code |
| Anything with the voice agent | `npm run start:dev` | The TrailSense development build installed on your phone ([`frontend/docs/dev-build.md`](../frontend/docs/dev-build.md)) |
| The share page | `npm run web` | A desktop or phone browser |

The phone reaches the backend through `EXPO_PUBLIC_BACKEND_URL` in `frontend/.env`: the Mac's LAN IP (`http://192.168.x.x:8000`) on the same Wi-Fi, or the backend's ngrok https URL otherwise. Campus Wi-Fi often blocks phone-to-laptop traffic; use ngrok or a phone hotspot then.

## Device features: use the wrappers, not the raw libraries

| Wrapper in `frontend/lib/native/` | Library | Used by |
|---|---|---|
| `audio.ts` | `expo-audio` | B1 warning playback, B2 earcons |
| `haptics.ts` | `expo-haptics` | B2 severity patterns |
| `useClipRecorder.ts` | `expo-camera` | B3 describe and sign tools in live mode, B5 live clips and fall check |
| `location.ts` | `expo-location` | B3 location logging and off-trail nudges |
| `motion.ts` | `expo-sensors` | B5 fall trigger |
| `voice.ts` | `@elevenlabs/react-native` | B1 agent, B3 client tools, B5 check-in dialogue. Development build only; skipped in Expo Go |

Keep-awake (`expo-keep-awake`) is already on during replay, live and low-vision mode. Install any new package with `npx expo install`, and check whether it needs a development build before you rely on it in Expo Go.

Two voice channels, on purpose:

- **Warnings** go through text to speech only. No language model, nothing to paraphrase, under 300 ms live, zero latency in replay because the mp3s are pre-rendered and bundled in the app.
- **Questions** go through the ElevenLabs Agent, which handles the mic, turn-taking, and calls our client tools.

---

## Step B0: ElevenLabs agent setup

The app skeleton is built by the migration. Do the dashboard part by hand (10 minutes):

1. Create an ElevenLabs account, make an API key, pick a voice (a calm, clear one; note its voice ID).
2. Agents: create an agent "TrailSense". Paste the system prompt from `docs/shared-context.md`. Set the voice. First message: leave empty (we do not want it to talk until spoken to). Turn-taking: default.
3. Security tab: leave the agent private (authentication on). Enable the System prompt, First message and Voice ID overrides in case the React Native SDK supports them.
4. Tools: add six Client tools with these exact names and parameter schemas, all with "Wait for response" on:
   - `get_hazards_ahead` (no parameters)
   - `describe_surroundings` (no parameters)
   - `read_sign` (no parameters)
   - `where_am_i` (no parameters)
   - `start_sos` (`reason`: string)
   - `cancel_sos` (no parameters)
5. Put `ELEVENLABS_API_KEY`, `ELEVENLABS_AGENT_ID`, `ELEVENLABS_VOICE_ID` and `ELEVENLABS_TTS_MODEL=eleven_flash_v2_5` in the repository-root `.env` the backend reads. Never in `frontend/.env`: that file is bundled into the app.
6. Install the TrailSense development build on your phone ([`frontend/docs/dev-build.md`](../frontend/docs/dev-build.md)).

**Done when**: the app opens in Expo Go, the development build opens on your phone, and the agent exists in the dashboard with six tools.

---

## Step B1: warnings speak, agent says hello

**Prompt B1**

```
Read docs/shared-context.md and docs/vendor-apis.md (ElevenLabs section). Build both voice channels.

Part 1, the backend voice routes (backend/voice/router.py, mounted in backend/main.py; coordinate the one-line mount with the other lanes):
- POST /api/voice/tts: body {"text": string}. Compute sha1(text). If backend/data/tts/<sha1>.mp3 exists, return it. Otherwise call POST https://api.elevenlabs.io/v1/text-to-speech/<ELEVENLABS_VOICE_ID>/stream?output_format=mp3_22050_32 with header xi-api-key, body {text, model_id: ELEVENLABS_TTS_MODEL, voice_settings: {stability: 0.7, similarity_boost: 0.75, speed: 1.1}}, write the bytes to the cache file, and return them as audio/mpeg. Add backend/data/tts/ to .gitignore.
- GET /api/voice/token: call GET https://api.elevenlabs.io/v1/convai/conversation/token?agent_id=<ELEVENLABS_AGENT_ID> with xi-api-key and return {"conversation_token": token}. Never cache it.
- pydantic models for both, a curl example in each docstring, and backend/tests/test_voice.py that mocks ElevenLabs and checks the cache hit and the token shape.

Part 2, the warning channel in the app:
- frontend/lib/voice/speech.ts: class Speech with say(text, {priority}) and stop(). It keeps a queue of {text, priority}. It resolves audio in this order: a bundled pre-rendered file from frontend/assets/speech/manifest.ts (a generated map from sha1 to require("./<sha1>.mp3"); see B2), then POST /api/voice/tts downloaded once to the app's cache directory, then on-device speech with expo-speech as the last resort. Play through frontend/lib/native/audio.ts. A priority 3 say() stops whatever is playing, clears the queue, and plays immediately. Emits on('start'|'end', cb) with the text.
- A dev-only button that calls Speech.say("Drop-off, left, stop", {priority: 3}). Confirm it is spoken verbatim and that the second press is instant (cached).

Part 3, the conversation channel:
- Wire the mic button to frontend/lib/native/voice.ts: tap starts a session (the wrapper fetches GET /api/voice/token and starts the agent with the conversation token), tap again ends it. The six client tools return "not wired yet" for now. Agent mode and transcript dispatch to the hiker reducer so the listening and speaking states show.
- In Expo Go the mic button announces "Voice agent needs the TrailSense dev build"; warnings still work.

Test on the development build: tap the mic, say "hello", the agent replies out loud. Then press the dev button while the agent is mid-sentence and confirm the warning is heard over it. Commit "elevenlabs voice hello".
```

**Done when**: the agent replies to your voice on the phone, and an injected warning plays verbatim within a second. If the agent fights you, the warning channel alone carries the whole replay demo; keep going with B2 and come back.

---

## Step B2: video replay, pre-rendered speech, earcons, haptics

Perception will hand you `backend/data/jobs/hike1.json` when the offline pipeline is ready. Until then, build against a fake.

**Prompt B2**

```
Read docs/shared-context.md. Build the replay engine that drives the demo.

1. frontend/assets/demo/fake-events.json: hand-write 8 SpeakEvents and 12 ClipEvents spread over a 90 second timeline, covering every earcon and haptic value, at least one priority 3, one fork event with a directional sign attached, and at least two hazards with a point. Validate it with the Zod schemas in a script.
2. frontend/scripts/prerender-speech.ts: node script that reads a jobs file (path argument, default assets/demo/fake-events.json), collects every unique SpeakEvent.say, every sign.say, and the fixed phrases in frontend/lib/voice/phrases.ts (pre-brief placeholder, "Drifting left of trail", "Drifting right of trail", "Are you okay? Say anything to cancel.", "Calling for help now.", "Cancelled. Help is not being called."), and writes assets/speech/<sha1>.mp3 for each by calling the backend's POST /api/voice/tts (so the key never leaves the backend). It then regenerates assets/speech/manifest.ts, the sha1 to require() map Speech uses. Skip files that exist. Print count and total bytes. Add "prerender" to package.json scripts.
3. frontend/lib/replay.ts: class Replay that takes an expo-video VideoPlayer and a list of SpeakEvents. On the player's time updates (set timeUpdateEventInterval to 0.1 s) it fires any SpeakEvent whose t has been crossed and not yet fired. Handles seeking backwards by resetting the fired set. Exposes on('speak', cb).
4. Hiker screen: "Load video" already picks a file with expo-document-picker. "Use demo hike" calls GET /api/jobs/hike1 and plays footage/hike1.mp4 from the phone (AirDrop it once and pick it) or from a URL you serve on the LAN. Playing the video starts Replay. When a SpeakEvent fires: dispatch it to the hiker reducer (the event log and status zone already render it), call Speech.say(say, {priority}), and send the agent a contextual update "Warning spoken: <say>" if a session is open. Priority 3 pauses or ducks the agent until Speech emits 'end'.
5. Earcons: frontend/scripts/make-earcons.ts writes five short WAV files to frontend/assets/sounds/ (note: one soft blip; caution: two rising blips; stop: three sharp low blips; fork: a two-note chime; sos: a long alternating siren). Commit the files. Play them through lib/native/audio.ts about 150 ms before the speech.
6. Haptics: lib/native/haptics.ts already maps short, double and long and the severities; call it with the SpeakEvent's haptic value.

Run the prerender script on the fake events, test with airplane mode on the phone (speech must still play from the bundled files), and commit "replay engine and speech prerender".
```

**Done when**: playing a video on the phone produces tones, vibration and spoken warnings at the right moments with no network, and the log fills in.

---

## Step B3: agent tools and the real events

**Prompt B3**

```
Read docs/shared-context.md. Wire the agent's client tools and switch the replay to real data.

1. Implement the six client tools in frontend/lib/native/voice.ts (or a tools.ts it imports), each returning a short string the agent can read out, with exactly these names:
   - get_hazards_ahead: GET /api/session/{id}/hazards; return a compact string like "11 o'clock: roots and steps, near. Trail clear otherwise." Use the hazard's point for the clock word when present.
   - describe_surroundings: in live mode, record a fresh 3 second clip with useClipRecorder and POST /api/describe; the backend prefers the session's running window. In replay there is no live camera, so answer from the latest ClipEvent's scene (computed offline) without a network call.
   - read_sign: in live mode, take a photo with the camera and POST /api/read_sign as a JPEG frame; return sign.say followed by the lines joined with commas. In replay, read the latest ClipEvent's sign if it has one, otherwise say no sign is visible.
   - where_am_i: GET /api/location/{id} and /api/trail/demo/brief, return one sentence.
   - start_sos: POST /api/sos with reason, lat, lng, recent say strings; return "Calling your emergency contact now" or the failure reason.
   - cancel_sos: POST /api/sos/cancel; return "Cancelled".
2. Session: lib/session.ts already creates the session id on app start; send it with every backend call. The share QR on the idle screen already encodes EXPO_PUBLIC_SHARE_BASE_URL + /share/<session_id>.
3. Replace fake events: on "Use demo hike", use the speak and events lists from GET /api/jobs/hike1. Keep the fake as a fallback if the backend is unreachable. Run the prerender script against the real job and commit the mp3s and manifest (they are small).
4. Location: use lib/native/location.ts to POST /api/location every 5 seconds while a session is active. If the response includes off_trail, speak "Drifting left of trail" or right, through Speech.say with priority 2 and the caution earcon.
5. Sign readout in replay: when a fired SpeakEvent's matching ClipEvent has a directional sign, the smoother already added a second SpeakEvent; the status zone already shows the sign card.

Test the four question tools by voice on the development build during the demo hike replay ("what's ahead?", "what do you see?", "read the sign", "where am I?"), then commit "agent tools and real events".
```

**Done when**: during replay you can ask "what's ahead?" and get a sensible spoken answer sourced from the backend, and "read the sign" reads the fork sign.

---

## Step B4: integration

Follow [`integration-and-demo.md`](./integration-and-demo.md). Your job is the full-run driver: play the hike, exercise each tool, trigger the fall sequence with Safety/Nav, and keep a list of every UI glitch.

---

## Step B5: live camera mode and fall check-in

The repeated camera clip upload and live hazard analysis described in item 1 are
implemented in `frontend/src/app/index.tsx` and `backend/perception/live.py`.
The remaining steps below cover fall candidate detection and the check-in/SOS
flow.

The check-in, cancelled and SOS screens and their reducer actions already exist; `safetyEventToAction` maps the shared-context safety events onto them. This step decides when to start a check-in and talks to the backend.

**Prompt B5**

```
Read docs/shared-context.md. Add live mode and the fall check-in.

1. The live Expo camera records one-second video segments. Hazard requests go to /api/clip every two captured seconds with the session_id and sequence number; fall checks receive every segment. The backend stitches submitted hazard frames into its running trail window using capture order, even if analysis finishes later. Keep every segment in the fall queue in order; the analysis queue may lag behind the camera when model calls are slow.
2. Fall trigger with lib/native/motion.ts: flag a fall candidate when the accelerometer magnitude spikes above a threshold (start around 2.5 g) and the next 2 seconds stay nearly still (low variance on accelerometer and gyroscope). Make the thresholds constants. POST each one-second segment to /api/fall/check with an increasing sequence number. The backend keeps the most recent four segments and assesses a sliding four-second window: [1,2,3,4], then [4,5,6,7], so each check advances three seconds and overlaps by one. Perceptron gets the original segments with audio; OpenCV uses a temporary video assembled from their frames. Keep no more than four pending clips on the client; drop older queued clips if inference falls behind.
3. frontend/lib/safety/checkin.ts, owned by the app, not by the agent:
   - Start the check-in on the first fully assessed /api/fall/check response where fell is "yes". The first three one-second segments only fill the initial window and return unsure; those warm-up responses must not start it. Dispatch checkin_started, play the sos earcon and a long haptic, and Speech.say("Are you okay? Say anything to cancel.", {priority: 3}); repeat the earcon every 5 seconds. If the agent is connected, also send "[SYSTEM] Possible fall detected. Ask the hiker once if they are okay, then wait."
   - Cancel on any of: a final user transcript from voice.ts, a tap anywhere on the overlay (already wired), or the agent calling cancel_sos. On cancel: POST /api/sos/cancel, Speech.say("Cancelled. Help is not being called."), and tell the agent "Fall check-in cancelled by the hiker."
   - When the countdown reaches zero the reducer moves to sos_sent. Then POST /api/sos with the latest location and recent say strings, Speech.say("Calling for help now."), and tell the agent "SOS call placed to the emergency contact." Cancel SOS on the banner calls POST /api/sos/cancel.
   - The dev-only "Test check-in" button already starts a check-in so you can rehearse without dropping a phone.
4. Keep live mode and replay mode mutually exclusive.

Test by walking around the room with the phone, then simulating a fall by dropping the phone onto a cushion. Verify the rolling windows advance one segment at a time and a positive result starts the check-in. Commit "live mode and fall check-in".
```

**Done when**: live mode produces warnings while walking, a cushion drop triggers the check-in, and speaking cancels it.

---

## Step B6: polish, pre-brief, low-vision guidance, deck

The share page (`/share/[session_id]`, web build and in the app), low-vision mode and the accessibility basics are built by the migration. This step finishes the rest.

**Prompt B6**

```
Read docs/shared-context.md. Polish for the demo.

1. Pre-brief: when a session starts (demo or live), fetch /api/trail/demo/brief and play it through Speech.say with priority 1 before playback begins. Add the brief text to the prerender phrases so the demo plays it from the bundled file.
2. Low-vision guidance: if backend/data/jobs/hike1.track.json exists (Perception stretch), draw a thin guidance arrow from center_x between warnings in the low-vision view.
3. Accessibility pass with VoiceOver (iOS) and TalkBack (Android) on: every control has an accessibilityLabel and role, new warnings are announced (live region on Android, announceForAccessibility on iOS), every target is at least 64 points, and nothing important is colour only. Lock the screen during replay: if warnings stop, enable background audio in the expo-audio config plugin and rebuild the development build.
4. Then create pitch/deck.md as a 7 slide outline: problem with a user quote, what we built, architecture diagram (ASCII is fine: phone app on React Native and Expo, web share page, FastAPI, Mk1.5, ElevenLabs, Twilio), the three-signal fall logic, demo, what is real vs stubbed, and the community hazard map vision.

Commit "polish and pre-brief".
```

---

## Step B7: rehearsal

You drive the demo on the development build. Rehearse the exact script in [`integration-and-demo.md`](./integration-and-demo.md) three times, mirror the phone to the projector, record a screen capture of the best run with phone audio as the backup, re-run the prerender script after any change to the speak list (Metro serves the new files to the development build; no rebuild needed), and put the final demo video and cached events under `demo/`.
