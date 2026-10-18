# TrailSense

A hiking assistant for visually impaired hikers: phone camera in, Perceptron Mk1.5 hazards and trail signs out, ElevenLabs voice warnings and questions, plus GPS share / fall check-in / SOS.

The app is React Native with Expo (SDK 57) and Expo Router: one codebase for the hiker app on iPhone and Android and the web share page for the emergency contact.

> **Migration in progress.** The frontend is moving from Next.js to Expo in six phases. Until Phase 6 lands, the Expo app is in `frontend-native/` and `frontend/` is still the old Next.js app. Run the commands below in `frontend-native/` until then.

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
that file for local settings.

App, in another terminal:

    cd frontend
    npm install
    cp .env.example .env
    npx expo start

Scan the QR code with Expo Go on your phone. Keep the phone and computer on the
same Wi-Fi network. Set `EXPO_PUBLIC_BACKEND_URL` in `frontend/.env` to
`http://<computer-wifi-ip>:8000` so the phone can reach FastAPI. On the computer,
the backend health check is at http://localhost:8000/health.
Keep Perceptron and Twilio secrets in the repository-root `.env`; do not put
secrets in the Expo app's public environment variables. The current voice client
and fall check-in UI are still being integrated.

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
