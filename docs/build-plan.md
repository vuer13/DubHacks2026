# TrailSense build plan

A hiking assistant for visually impaired hikers. The phone camera is the eyes, Perceptron Mk1.5 understands the trail (hazards, grounding, trail signs), ElevenLabs speaks warnings and answers questions, and a safety layer handles GPS sharing, fall check-in, and SOS.

Working name: **TrailSense**. Rename freely.

## Changelog

| Date | Change | Why |
|---|---|---|
| 2026-10-17 | Voice moves from xAI Grok Voice to ElevenLabs: text to speech for warnings, ElevenLabs Agent with client tools for questions. | Team decision. Warnings no longer pass through a language model, so they are faster and spoken verbatim. Replay demo uses pre-rendered mp3s and needs no voice network call. |
| 2026-10-17 | Perception moves from Mk1 on OpenRouter to Mk1.5 on the Perceptron API. | Mk1.5 is the model Perceptron recommends as the starting point. It adds strict JSON schema output, regex output, pointing, clip events, video tracking, audio in video, and `reasoning_effort`. Hosted Isaac was retired on 2026-09-25. |
| 2026-10-17 | Video input follows Perceptron's guidance. Continuous monitoring (live and the replay pipeline) sends a running window of the last 6 s of frames every 3 s. Batch jobs over the whole hike send frames or a contact sheet. `ClipEvent.t_start` and `t_end` now mean the window bounds. | Perceptron advised: "if you're trying to do continuous monitoring, I'd pass in a running context window of a few seconds. If batching, I'd pass in frames or a contact sheet." Overlapping windows let the model see motion toward a hazard. No schema shape change. |
| 2026-10-17 | New: trail sign reading (OCR) as a voice tool and an automatic readout at forks. Two optional schema fields (`Hazard.point`, `ClipEvent.sign`) and one endpoint (`POST /api/read_sign`). | Perceptron's smart glasses demo uses OCR and web search to add context to what the wearer sees. Signs are the trail equivalent. Additive and nullable, so nothing built so far breaks. Needs all three people to agree before code lands. |

## Tech stack

| Layer | Choice | Why |
|---|---|---|
| Frontend | Next.js 14 (App Router), TypeScript, Tailwind | Runs on any phone browser, no app store, fast to iterate |
| Backend | Python 3.11, FastAPI, uvicorn | Easy ffmpeg, OpenCV and numpy work; async for model calls |
| Perception | Perceptron Mk1.5 on the Perceptron API (`perceptron-mk1.5`, `pip install "perceptron>=0.4.0"`) | Video in, strict JSON out, pointing and OCR on the same model, cheap enough to call every 3 s on a running 6 s window of frames ($0.15/M in, $1.50/M out) |
| Perception fallback | Same model through OpenRouter (`perceptron/perceptron-mk1.5`) | Only if the direct API has an outage. OpenRouter may not pass `vision_config` or `response_format` through, so the fallback is plain JSON prompting with validation and retry |
| Perception (stretch) | Mk1.5 video tracking, offline, on the recorded hike | Trail-centre track for a guidance arrow. Replaces the old Isaac plan; hosted Isaac is retired and Isaac 0.5 is a robot-action model |
| Voice: warnings | ElevenLabs text to speech, `eleven_flash_v2_5` (about 75 ms), via a Next.js server route with a disk cache; pre-rendered mp3s for the demo | Verbatim, fast, no language model in the loop |
| Voice: conversation | ElevenLabs Agent, `@elevenlabs/react`, WebSocket with a server-minted signed URL, client tools | Speech in and out, turn-taking and interruption handled by the platform, tools run in the browser against our backend |
| Fall detection | numpy + OpenCV frame differencing, Mk1.5 confirmation with audio enabled, agent voice check-in | No training needed |
| Location | Browser Geolocation API, gpxpy on the backend | Off-trail drift from a GPX file |
| SOS | Twilio SMS | One API call |
| Video tooling | ffmpeg | Clip slicing, frame extraction |
| Storage | JSON files on disk, in-memory dicts | Keep persistence simple; no database required |
| Tunnel | ngrok (backend) + Vercel or ngrok (frontend) | Phone must reach the backend over HTTPS for camera and mic permissions |

## Team lanes

Use whatever coding tool you want. Lanes are about ownership, not tools.

| Person | Lane | Owns |
|---|---|---|
| Person A | Perception | `backend/perception/`, Mk1.5 prompts and schemas, clip pipeline, grounding pass, sign reading, smoothing, `events.json` |
| Person B | App and voice | `frontend/`, video player, replay engine, ElevenLabs agent and text to speech routes, speech cache and pre-render script, earcons, haptics |
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
  frontend/                         <- App and voice
    app/
      api/voice/token/route.ts      <- ElevenLabs signed URL
      api/voice/tts/route.ts        <- ElevenLabs text to speech proxy + cache
    lib/
    public/sounds/
    public/demo/speech/             <- pre-rendered warning mp3s (committed, small)
    scripts/prerender-speech.ts     <- builds public/demo/speech from a job's speak list
  footage/                          <- raw trail videos (gitignored)
  demo/                             <- demo script, cached events
```

## Environment variables

Create the repository-root `.env` and `frontend/.env.local` early, and commit example files only.

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
SHARE_BASE_URL=https://<frontend-host>

# frontend/.env.local
NEXT_PUBLIC_BACKEND_URL=https://<ngrok-id>.ngrok.app
ELEVENLABS_API_KEY=          # server side only; never NEXT_PUBLIC_
ELEVENLABS_AGENT_ID=
ELEVENLABS_VOICE_ID=
ELEVENLABS_TTS_MODEL=eleven_flash_v2_5
```

## Suggested build order

Work lanes in parallel. Rough dependency order:

1. **Skeleton**: repo, env, FastAPI + Next.js boots, health check green; Safety/Nav records trail footage; App/Voice creates the ElevenLabs agent in the dashboard
2. **Core loops**: one valid Mk1.5 hazard JSON with strict schema output; ElevenLabs text to speech says "Drop-off, left, stop" on the phone; agent says hello; location logging
3. **Pipelines**: video to `events.json`; replay engine on fake then real events with pre-rendered speech; GPX / off-trail / share API
4. **Safety + voice tools**: smoothing + live clip endpoints; grounding pass for direction; agent client tools; earcons; haptics; fall detector + SOS
5. **Integration**: full recorded hike end to end ([integration-and-demo.md](./integration-and-demo.md))
6. **Polish**: prompt tuning, sign reading at the fork, live camera, fall check-in UX, pre-brief, low-vision mode, pitch deck
7. **Rehearsal**: run the demo script, cache events and speech under `demo/` and `frontend/public/demo/`

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
