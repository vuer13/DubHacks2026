# TrailSense

A hiking assistant for visually impaired hikers: phone camera in, Perceptron Mk1.5 hazards and trail signs out, ElevenLabs voice warnings and questions, plus GPS share / fall check-in / SOS.

The app is React Native with Expo (SDK 57) and Expo Router: one codebase for the hiker app on iPhone and Android and the web share page for the emergency contact.

The active app is React Native with Expo Router in `frontend/`. The previous
Next.js implementation is kept under `frontend/legacy-web/` for reference.

## Prerequisites

- Python 3.11
- Node.js 22.13+ and npm
- FFmpeg for the planned video clip processing. The current scaffold does not use it yet.

On macOS with Homebrew, install the system tools with:

    brew install python@3.11 node ffmpeg

The package files install the Python and JavaScript dependencies for you.

## Install and start locally

Backend, from the repository root:

    python3.11 -m venv .venv
    source .venv/bin/activate
    python -m pip install --upgrade pip
    python -m pip install -r backend/requirements.txt
    cp backend/.env.example .env
    uvicorn backend.main:app --reload --host 0.0.0.0 --port 8000

Keep backend keys in the repository-root `.env` file. The backend loads only
that file for local settings. For spoken hazard warnings, set
`ELEVENLABS_API_KEY` and `ELEVENLABS_VOICE_ID` there; the TTS model defaults to
`eleven_flash_v2_5`. The app falls back to device speech when these are unset.

App, in another terminal:

    cd frontend
    npm install
    cp .env.example .env

Set `EXPO_PUBLIC_BACKEND_URL` in `frontend/.env` to your Mac's LAN IP
(`http://192.168.x.x:8000`, find it with `ipconfig getifaddr en0`); on a phone,
`localhost` means the phone. Put no keys in `frontend/.env`: every
`EXPO_PUBLIC_` value is bundled into the app.

Run it one of three ways:

- **Expo Go** (UI work, no build): `npx expo start --go`, then scan the QR code
  with the phone's camera (iPhone) or from Expo Go (Android). Phone and Mac on
  the same Wi-Fi.
- **Development build** (everything, including the voice agent): install the
  TrailSense development build once (`frontend/docs/dev-build.md`), then
  `npx expo start --dev-client` and open the TrailSense app.
- **Web share page**: `npx expo start --web`, then open
  `http://localhost:8081/share/demo`.

The app records repeated 1-second camera clips while monitoring is active. In
live safety mode, it checks hazards every 3 seconds and checks falls separately
using overlapping four-second windows. Fall checks advance by three clips to
retain one second of overlap. The first result needs four seconds of footage.
Camera recordings restart between clips, so short gaps are possible. Analysis is
processed in capture order, with at most four waiting clips; older queued clips
are dropped when model latency falls behind. One nine-second fall request took
37,302 ms at high reasoning effort. Fall confirmation now uses medium effort,
but latency still needs measuring. Keep the app open in the foreground during
live monitoring. On a physical phone, the backend URL must use the Mac's Wi-Fi IP.

For live diagnostics, watch the Expo/Metro terminal for `Hazard check` and
`Fall result` lines. The backend also writes structured
Perceptron logs to `backend/data/logs/perception_model.jsonl` and
`backend/data/logs/fall_model.jsonl`.

The backend health check is at http://localhost:8000/health.
API keys are only needed when you implement the Perceptron, ElevenLabs, or Twilio
integrations; keep them in the repository-root `.env`.

## Code ownership

- Frontend (React Native app and web share page): frontend/
- Voice routes for the app (proposed): backend/voice/
- Perception backend: backend/perception/
- Safety and navigation backend: backend/safety/ and backend/nav/
- Shared backend entry point and models: backend/main.py and backend/models.py

Keep the event and API contract in docs/shared-context.md stable. Each backend
lane owns its router; coordinate changes to backend/main.py, backend/models.py,
and dependency files to avoid collisions.

## Docs

Start here: [`docs/README.md`](./docs/README.md)

| Doc | For |
|---|---|
| [Build plan](./docs/build-plan.md) | Everyone: stack, lanes, build order, changelog |
| [Vendor APIs](./docs/vendor-apis.md) | Perceptron Mk1.5 and ElevenLabs facts |
| [Shared context](./docs/shared-context.md) | Schema + API for the team (and any agent) |
| [Perception](./docs/perception.md) | Vision backend |
| [App and voice](./docs/app-and-voice.md) | Frontend + voice |
| [Safety and nav](./docs/safety-and-nav.md) | GPS, fall, SOS, footage |
| [Integration and demo](./docs/integration-and-demo.md) | Wiring lanes together and demo prep |
| [Design](./docs/design/README.md) | UI design handoff: tokens, components, state frames, glyphs |
| [SCHEMA.md](./SCHEMA.md) | Shared event + API contract |
