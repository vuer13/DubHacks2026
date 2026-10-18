# TrailSense build plan

A hiking assistant for visually impaired hikers. The phone camera is the eyes, Perceptron Mk1.5 understands the trail (hazards, grounding, trail signs), ElevenLabs speaks warnings and answers questions, and a safety layer handles GPS sharing, fall check-in, and SOS.

Working name: **TrailSense**. Rename freely.

## Changelog

| Date | Change | Why |
|---|---|---|
| 2026-10-18 | Broadened hazard prompts to include clear trip risks and collision risks from people or animals; live hazard requests now run every 3 captured seconds, with one concise summary log per check. | Cover more practical trail dangers and reduce request/log volume. |
| 2026-10-18 | Live Expo monitoring runs hazard checks every two captured seconds alongside fall checks. It speaks only a newly detected hazard, stays silent on clear results, suppresses repeats for 20 s, and lets a positive fall check-in interrupt warning playback. Hazard and fall model results log to the backend JSONL logs and the Expo console. | Keep the live monitor responsive without noisy clear-path speech; retain separate fall safety checks. |
| 2026-10-18 | Expo is now the active frontend in `frontend/`; the prior Next.js app is preserved in `frontend/legacy-web/`. Live capture records 1 s segments, checks hazards every 2 captured seconds, and sends fall checks independently. | Use Expo Go for native camera iteration and keep the agreed clip API. |
| 2026-10-17 | Voice moves from xAI Grok Voice to ElevenLabs: text to speech for warnings, ElevenLabs Agent with client tools for questions. | Team decision. Warnings no longer pass through a language model, so they are faster and spoken verbatim. Replay demo uses pre-rendered mp3s and needs no voice network call. |
| 2026-10-17 | Perception moves from Mk1 on OpenRouter to Mk1.5 on the Perceptron API. | Mk1.5 is the model Perceptron recommends as the starting point. It adds strict JSON schema output, regex output, pointing, clip events, video tracking, audio in video, and `reasoning_effort`. Hosted Isaac was retired on 2026-09-25. |
| 2026-10-17 | Video input follows Perceptron's guidance. Continuous monitoring (live and the replay pipeline) sends a running window of the last 6 s of frames every 3 s. Batch jobs over the whole hike send frames or a contact sheet. `ClipEvent.t_start` and `t_end` now mean the window bounds. | Perceptron advised: "if you're trying to do continuous monitoring, I'd pass in a running context window of a few seconds. If batching, I'd pass in frames or a contact sheet." Overlapping windows let the model see motion toward a hazard. No schema shape change. |
| 2026-10-18 | Frontend moves from Next.js to React Native with Expo and Expo Router: one codebase for the hiker app on iOS and Android and the web share page; ElevenLabs voice agent runs in an Expo development build. The ElevenLabs token and text to speech routes move from Next.js server routes to the backend as `GET /api/voice/token` and `POST /api/voice/tts` (proposed, App/Voice owns `backend/voice/`). | Native camera, sensors, haptics, keep-awake and background-safe audio, plus a real installed app for blind users. The app cannot hold the ElevenLabs key, so the two voice routes need a server; the backend already holds the other keys. Migration was brought into `frontend/`; previous Next.js files are kept in `frontend/legacy-web/`. |
| 2026-10-17 | New: trail sign reading (OCR) as a voice tool and an automatic readout at forks. Two optional schema fields (`Hazard.point`, `ClipEvent.sign`) and one endpoint (`POST /api/read_sign`). | Perceptron's smart glasses demo uses OCR and web search to add context to what the wearer sees. Signs are the trail equivalent. Additive and nullable, so nothing built so far breaks. Needs all three people to agree before code lands. |

## Tech stack

| Layer | Choice | Why |
|---|---|---|
| Frontend | React Native 0.86 with Expo SDK 57 and Expo Router, TypeScript strict, `StyleSheet` with `frontend/theme/tokens.ts` | One codebase for the iOS and Android hiker app and the web share page. Native camera, sensors, haptics, keep-awake and audio, and a real installed app that works with VoiceOver and TalkBack |
| Dev loop | Expo Go for UI work; an Expo development build (`expo-dev-client`) for the voice agent | Expo Go reloads instantly with no build; the agent's WebRTC native code needs a development build |
| Share page | Expo Router web output from the same codebase, hosted (EAS Hosting, set up in migration Phase 5) | The emergency contact opens a link in any browser; nothing to install |
| Device features | `expo-camera`, `expo-video`, `expo-audio`, `expo-haptics`, `expo-location`, `expo-sensors`, `expo-keep-awake`, wrapped in `frontend/lib/native/` | Typed wrappers so the B steps call one API, and the web build never imports them |
| Backend | Python 3.11, FastAPI, uvicorn | Easy ffmpeg, OpenCV and numpy work; async for model calls |
| Perception | Perceptron Mk1.5 on the Perceptron API (`perceptron-mk1.5`, `pip install "perceptron>=0.4.0"`) | Video in, strict JSON out, pointing and OCR on the same model; live hazard checks are requested every 2 captured seconds over recent frames |
| Perception fallback | Same model through OpenRouter (`perceptron/perceptron-mk1.5`) | Only if the direct API has an outage. OpenRouter may not pass `vision_config` or `response_format` through, so the fallback is plain JSON prompting with validation and retry |
| Perception (stretch) | Mk1.5 video tracking, offline, on the recorded hike | Trail-centre track for a guidance arrow. Replaces the old Isaac plan; hosted Isaac is retired and Isaac 0.5 is a robot-action model |
| Voice: warnings | ElevenLabs text to speech, `eleven_flash_v2_5` (about 75 ms), through the backend's `POST /api/voice/tts` with a disk cache; pre-rendered mp3s bundled in the app for the demo; `expo-speech` as the offline fallback | Verbatim, fast, no language model in the loop, and the key never reaches the phone |
| Voice: conversation | ElevenLabs Agent through `@elevenlabs/react-native` (LiveKit, WebRTC) with client tools; conversation token from the backend's `GET /api/voice/token` | Speech in and out, turn-taking and interruption handled by the platform, tools run in the app against our backend. Development build only |
| Fall detection | numpy + OpenCV frame differencing, Mk1.5 confirmation with audio enabled, agent voice check-in | No training needed |
| Location | `expo-location` foreground tracking, gpxpy on the backend | Off-trail drift from a GPX file |
| SOS | Twilio Voice call with spoken alert | One API call |
| Video tooling | ffmpeg | Clip slicing, frame extraction |
| Storage | JSON files on disk, in-memory dicts | Keep persistence simple; no database required |
| Tunnel | Backend reached by LAN IP on the same Wi-Fi, or ngrok when it is not; share site hosted | A native app needs no HTTPS for camera or mic. Expo Go and debug builds allow plain http to a LAN IP; use the ngrok https URL across networks and for release builds |

## Team lanes

Use whatever coding tool you want. Lanes are about ownership, not tools.

| Person | Lane | Owns |
|---|---|---|
| Person A | Perception | `backend/perception/`, Mk1.5 prompts and schemas, clip pipeline, grounding pass, sign reading, smoothing, `events.json` |
| Person B | App and voice | `frontend/` (React Native app and web share page), `backend/voice/` (proposed token and text to speech routes), video player, replay engine, ElevenLabs agent, speech cache and pre-render script, earcons, haptics, development builds |
| Person C | Safety and nav | `backend/safety/`, `backend/nav/`, fall detector, Twilio SOS, GPX, share page API, trail footage, demo timestamps |

## Repo layout

```
trailsense/
  CLAUDE.md / AGENTS.md / .cursor/rules/   <- copies of docs/shared-context.md for agents
  SCHEMA.md                         <- event and API contract
  docs/
    build-plan.md                   <- this file
    shared-context.md               <- source of truth for agents
    vendor-apis.md                  <- Perceptron and ElevenLabs API facts, with sources
    perception.md                   <- Perception steps
    app-and-voice.md                <- App and voice steps
    safety-and-nav.md               <- Safety and nav steps
    integration-and-demo.md         <- syncs, rehearsal, pitch
  backend/
    main.py                         <- FastAPI app, mounts routers
    perception/                     <- Perception
    safety/                         <- Safety and nav
    nav/                            <- Safety and nav
    data/                           <- clips, events.json, gpx, session logs
    requirements.txt
    voice/                          <- App/Voice: /api/voice/token and /api/voice/tts (proposed)
  frontend/                         <- App and voice: React Native, Expo SDK 57, Expo Router
    src/app/
      index.tsx                     <- hiker screen (iOS, Android)
      share/[session_id].tsx        <- emergency contact page (web build, also in the app)
      dev/states.tsx                <- dev-only gallery of every screen state
    components/                     <- design system and hiker screen components
    lib/                            <- schema, api, session, reducer, fixtures, low-vision logic
      native/                       <- typed wrappers: audio, haptics, clip recorder, location, motion, voice
    theme/tokens.ts                 <- design tokens, generated from docs/design/handoff.md
    assets/speech/                  <- pre-rendered warning mp3s (committed, small)
    assets/sounds/                  <- earcon sound files
    scripts/                        <- check-tokens, check-states, prerender-speech
    docs/dev-build.md               <- development build setup and the daily loop
  footage/                          <- raw trail videos (gitignored)
  demo/                             <- demo script, cached events
```

## Environment variables

Create the repository-root `.env` and `frontend/.env` early, and commit example files only. Every key stays in the repository-root `.env` the backend reads. Nothing secret goes in `frontend/.env`: every `EXPO_PUBLIC_` value is bundled into the app and the web build.

```
# repo-root .env
PERCEPTRON_API_KEY=
PERCEPTRON_MODEL=perceptron-mk1.5
PERCEPTRON_BASE_URL=https://api.perceptron.inc/v1
OPENROUTER_API_KEY=          # optional fallback only
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_FROM_NUMBER=
EMERGENCY_CONTACT_NUMBER=
SHARE_BASE_URL=https://<share-site-host>   # the hosted web share page
ELEVENLABS_API_KEY=          # backend only; used by /api/voice/token and /api/voice/tts
ELEVENLABS_AGENT_ID=
ELEVENLABS_VOICE_ID=
ELEVENLABS_TTS_MODEL=eleven_flash_v2_5

# frontend/.env (public: bundled into the app and web build)
EXPO_PUBLIC_BACKEND_URL=http://192.168.x.x:8000   # Mac's LAN IP, or the backend's ngrok https URL
EXPO_PUBLIC_SHARE_BASE_URL=https://<share-site-host>
EXPO_PUBLIC_HIKER_PHONE=      # shown as the share page's Call hiker link
```

## Suggested build order

Work lanes in parallel. Rough dependency order:

1. **Skeleton**: repo, env, FastAPI boots, the Expo app opens in Expo Go with a green health dot; Safety/Nav records trail footage; App/Voice creates the ElevenLabs agent in the dashboard and installs the development build on the demo phone
2. **Core loops**: one valid Mk1.5 hazard JSON with strict schema output; ElevenLabs text to speech says "Drop-off, left, stop" on the phone; agent says hello; location logging
3. **Pipelines**: video to `events.json`; replay engine on fake then real events with pre-rendered speech; GPX / off-trail / share API
4. **Safety + voice tools**: smoothing + live clip endpoints; grounding pass for direction; agent client tools; earcons; haptics; fall detector + SOS
5. **Integration**: full recorded hike end to end ([integration-and-demo.md](./integration-and-demo.md))
6. **Polish**: prompt tuning, sign reading at the fork, live camera, fall check-in UX, pre-brief, low-vision mode, pitch deck
7. **Rehearsal**: run the demo script on the development build, cache events under `demo/` and speech under `frontend/assets/speech/`

## How to use these docs

1. Everyone reads [`build-plan.md`](./build-plan.md) and [`shared-context.md`](./shared-context.md) before touching a keyboard. Skim [`vendor-apis.md`](./vendor-apis.md) for the exact API shapes.
2. Point your agent (if any) at `docs/shared-context.md`, or paste it into whatever context file your tool uses. Keep `SCHEMA.md` in sync with the contract section.
3. Each person opens their lane file and works through the steps in order, pasting each prompt into their tool. Prompts are written to be pasted as-is. Fill in anything in `<angle brackets>`.
   - Perception: [`perception.md`](./perception.md)
   - App and voice: [`app-and-voice.md`](./app-and-voice.md)
   - Safety and nav: [`safety-and-nav.md`](./safety-and-nav.md)
4. Use [`integration-and-demo.md`](./integration-and-demo.md) when wiring lanes together and preparing the demo.

## Rules for the whole team

- Prefer small, frequent commits to `main`. Lanes touch different folders so conflicts are rare.
- Frontend UI changes go on a step branch with a PR into front-end-feature-branch; one PR per step.
- If a step is stuck, cut scope or cache a fake result in the agreed JSON shape and move on. The replay demo cannot tell the difference.
- The schema in `shared-context.md` / `SCHEMA.md` is shared. Changes need all three people agreeing. The 2026-10-17 additions (`point`, `sign`, `/api/read_sign`, `read_sign` tool) are proposed and nullable; confirm them at the kickoff sync.
