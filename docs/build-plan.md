# TrailSense build plan

A hiking assistant for visually impaired hikers. The phone camera is the eyes, Perceptron Mk1 understands the trail, Grok Voice speaks warnings and answers questions, and a safety layer handles GPS sharing, fall check-in, and SOS.

Working name: **TrailSense**. Rename freely.

## Tech stack

| Layer | Choice | Why |
|---|---|---|
| Frontend | Next.js 14 (App Router), TypeScript, Tailwind | Runs on any phone browser, no app store, fast to iterate |
| Backend | Python 3.11, FastAPI, uvicorn | Easy ffmpeg, OpenCV and numpy work; async for model calls |
| Perception | Perceptron Mk1 via OpenRouter (`perceptron/perceptron-mk1`) | Video-in, structured JSON out, cheap enough to call every 3 s |
| Perception (stretch) | Isaac 0.2-1B via `pip install perceptron` on a GPU laptop | Per-frame trail-edge pointing; only if someone has a GPU and spare capacity |
| Voice | xAI Grok Voice Agent, Realtime WebSocket (`wss://api.x.ai/v1/realtime`), voice "Ara" | Speech in and out, server VAD, custom tools |
| Fall detection | numpy + OpenCV frame differencing, Mk1 confirmation, Grok check-in | No training needed |
| Location | Browser Geolocation API, gpxpy on the backend | Off-trail drift from a GPX file |
| SOS | Twilio SMS | One API call |
| Video tooling | ffmpeg | Clip slicing, frame extraction |
| Storage | JSON files on disk, in-memory dicts | Keep persistence simple; no database required |
| Tunnel | ngrok (backend) + Vercel or ngrok (frontend) | Phone must reach the backend over HTTPS for camera and mic permissions |

## Team lanes

Use whatever coding tool you want. Lanes are about ownership, not tools.

| Person | Lane | Owns |
|---|---|---|
| Person A | Perception | `backend/perception/`, Mk1 prompts, clip pipeline, smoothing, `events.json` |
| Person B | App and voice | `frontend/`, video player, replay engine, Grok Realtime, earcons, haptics |
| Person C | Safety and nav | `backend/safety/`, `backend/nav/`, fall detector, Twilio SOS, GPX, share page API, trail footage |

## Repo layout

```
trailsense/
  CLAUDE.md / AGENTS.md / .cursor/rules/   <- optional agent context copies
  SCHEMA.md                         <- event and API contract
  docs/
    build-plan.md                   <- this file
    shared-context.md               <- source of truth for agents
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
    lib/
    public/sounds/
  footage/                          <- raw trail videos (gitignored)
  demo/                             <- demo script, cached events
```

## Environment variables

Create `backend/.env` and `frontend/.env.local` early, and commit `.env.example` files.

```
# backend/.env
OPENROUTER_API_KEY=
XAI_API_KEY=
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_FROM_NUMBER=
EMERGENCY_CONTACT_NUMBER=
MK1_MODEL=perceptron/perceptron-mk1

# frontend/.env.local
NEXT_PUBLIC_BACKEND_URL=https://<ngrok-id>.ngrok.app
XAI_API_KEY=            # server side only, for the voice token route
```

## Suggested build order

Work lanes in parallel. Rough dependency order:

1. **Skeleton** — repo, env, FastAPI + Next.js boots, health check green; Safety/Nav records trail footage
2. **Core loops** — one valid Mk1 hazard JSON; Grok voice hello; location logging
3. **Pipelines** — video → `events.json`; replay engine on fake then real events; GPX / off-trail / share API
4. **Safety + voice tools** — smoothing + live clip endpoints; Grok tools / earcons / haptics; fall detector + SOS
5. **Integration** — full recorded hike end to end ([integration-and-demo.md](./integration-and-demo.md))
6. **Polish** — prompt tuning, live camera, fall check-in UX, pre-brief, low-vision mode, pitch deck
7. **Rehearsal** — run the demo script, cache events under `demo/`

## How to use these docs

1. Everyone reads [`build-plan.md`](./build-plan.md) and [`shared-context.md`](./shared-context.md) before touching a keyboard.
2. Point your agent (if any) at `docs/shared-context.md`, or paste it into whatever context file your tool uses. Keep `SCHEMA.md` in sync with the contract section.
3. Each person opens their lane file and works through the steps in order, pasting each prompt into their tool. Prompts are written to be pasted as-is. Fill in anything in `<angle brackets>`.
   - Perception → [`perception.md`](./perception.md)
   - App and voice → [`app-and-voice.md`](./app-and-voice.md)
   - Safety and nav → [`safety-and-nav.md`](./safety-and-nav.md)
4. Use [`integration-and-demo.md`](./integration-and-demo.md) when wiring lanes together and preparing the demo.

## Rules for the whole team

- Prefer small, frequent commits to `main`. Lanes touch different folders so conflicts are rare.
- If a step is stuck, cut scope or cache a fake result in the agreed JSON shape and move on. The replay demo cannot tell the difference.
- The schema in `shared-context.md` / `SCHEMA.md` is shared. Changes need all three people agreeing.
