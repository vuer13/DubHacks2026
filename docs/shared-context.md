# TrailSense shared context

Shared context for the whole team and any coding agent. Treat the schema and API contract as shared; change them only when the whole team agrees.

## What we are building

TrailSense helps visually impaired hikers. A phone at chest height streams video. Live mode requests hazard analysis every 3 seconds over a rolling frame window; Perceptron Mk1.5 returns hazards as structured JSON. Prompts include trip risks and people or animals that could cause a collision, using the existing hazard categories. A smoothing layer speaks only new detected hazards and remains silent when none are found. A fall check runs alongside hazard analysis and interrupts warning speech when a fall is suspected. ElevenLabs speaks short warnings (text to speech) and answers questions like "what's ahead?" (ElevenLabs Agent with client tools). Mk1.5 also reads trail signs with OCR and grounds hazards with points so direction comes from geometry, not guesswork. A safety layer logs GPS, exposes a live share page, detects falls, and places a voice call if the hiker does not respond to a voice check-in.

The hiker uses the TrailSense app: one React Native codebase (Expo SDK 57, Expo Router) that runs on iPhone and Android and also builds the web share page the emergency contact opens in any browser. The ElevenLabs voice agent runs in an Expo development build; everything else also runs in Expo Go.

The primary demo is a recorded trail video replayed with pre-computed events and pre-rendered speech. Live camera mode exists but is secondary.

## Non-negotiable principles

- Short, direction-first speech. "Drop-off, left, stop." Never a paragraph during a warning.
- Silence is a feature. Repeat nothing within 20 seconds.
- A fall never triggers SOS without a voice check-in first.
- Every model call returns JSON that validates against the schema below, or we discard it and log it.
- Everything degrades gracefully. If a model call fails, the app keeps running and says nothing.
- Warnings never wait on a language model. The warning channel is pre-rendered or plain text to speech; the conversational agent is for questions.

## Hazard taxonomy

`drop_off`, `steep_descent`, `water`, `loose_rock`, `roots_steps`, `low_branch`, `fork`, `mud_ice`, `wildlife`, `people`

Severity: 1 = note it, 2 = caution, 3 = stop now.
Direction: clock face, one of `"10"`, `"11"`, `"12"`, `"1"`, `"2"` (o'clock, relative to the hiker's facing direction).
Distance: `"near"` (under 2 m), `"mid"` (2 to 6 m), `"far"` (over 6 m).

Direction from geometry: when a hazard has a grounding `point`, its `x` on the 0 to 1000 grid maps to clock bands `0-199 -> "10"`, `200-399 -> "11"`, `400-599 -> "12"`, `600-799 -> "1"`, `800-1000 -> "2"`. The geometry wins over the model's own direction guess.

## Event schema (frozen, with two optional additions)

Every perception result is a `ClipEvent`. The list of these for a video is `events.json`.

```json
{
  "clip_id": "clip_0012",
  "t_start": 36.0,
  "t_end": 39.0,
  "hazards": [
    {
      "type": "drop_off",
      "severity": 3,
      "direction": "11",
      "distance": "near",
      "say": "Drop-off, left, stop",
      "point": [310, 760]
    }
  ],
  "trail_state": "clear",
  "surface": "packed dirt",
  "scene": "Narrow dirt trail with a steep edge on the left, trees on the right.",
  "sign": null,
  "model": "perceptron-mk1.5",
  "latency_ms": 1840
}
```

`t_start` and `t_end` are the bounds of the context window the model saw, in seconds from session or video start. Windows overlap (default 6 s window, 3 s stride), so consecutive events share frames. `clip_id` names the window.

Rules for `say`: maximum 6 words, direction word first when there is a hazard ("left", "right", "ahead"), imperative. `trail_state` is one of `clear`, `narrowing`, `fork`, `unclear`. `scene` is one sentence for on-demand description, never spoken automatically.

Optional fields (added 2026-10-17, default `null`, older events without them still validate):

- `Hazard.point`: `[x, y]` on the 0 to 1000 grid from a Mk1.5 grounding pass, or `null` if the pass did not run.
- `ClipEvent.sign`: `null`, or a `SignReading`:

```json
{
  "kind": "directional",
  "lines": ["Lynn Loop", "2.1 km"],
  "arrows": [{"label": "Lynn Loop", "direction": "right"}],
  "say": "Sign: Lynn Loop, right, two kilometres"
}
```

`kind` is one of `directional`, `warning`, `info`, `none`. `arrows[].direction` is one of `left`, `right`, `ahead`, `back`. `lines` are in reading order; unreadable text is dropped, never guessed. `sign.say` is at most 12 words, arrow direction first when there is one.

The smoothing layer turns `ClipEvent`s into `SpeakEvent`s:

```json
{ "t": 36.4, "priority": 3, "say": "Drop-off, left, stop", "earcon": "stop", "haptic": "long" }
```

`priority` 3 pre-empts anything currently being spoken. `earcon` is one of `note`, `caution`, `stop`, `fork`, `sos`. `haptic` is one of `none`, `short`, `double`, `long`.

## Safety events

```json
{ "type": "fall_suspected", "t": 212.0, "signals": {"motion_spike": true, "static_after": true, "vlm": "yes"}, "confidence": 0.86 }
{ "type": "fall_checkin_started", "t": 213.0, "timeout_s": 20 }
{ "type": "fall_cancelled", "t": 219.0, "by": "voice" }
{ "type": "sos_sent", "t": 233.0, "to": "+1...", "lat": 49.3, "lng": -123.1 }
{ "type": "off_trail", "t": 90.0, "distance_m": 22, "side": "left" }
```

## API contract (backend, FastAPI, port 8000)

All JSON. CORS open during development.

| Method | Path | Body or params | Returns | Owner |
|---|---|---|---|---|
| GET | `/health` | | `{"ok": true}` | A |
| POST | `/api/analyze` | multipart `video` | `{"job_id": "..."}` | A |
| GET | `/api/jobs/{job_id}` | | `{"status": "running\|done\|error", "events": [ClipEvent], "speak": [SpeakEvent]}` | A |
| POST | `/api/clip` | multipart `clip` (short webm or mp4 segment), `session_id`; optional `sequence` for ordered one-second live segments. The backend adds frames to the session's running window | `{"event": ClipEvent, "speak": [SpeakEvent]}` | A |
| POST | `/api/describe` | multipart `clip`, `session_id` | `{"scene": "...", "hazards": [...]}` | A |
| POST | `/api/read_sign` | multipart `frame` (jpeg) or `clip`, `session_id` | `{"sign": SignReading}` | A |
| GET | `/api/session/{session_id}/hazards` | | last 3 `ClipEvent`s, for voice tools | A |
| POST | `/api/location` | `{"session_id","lat","lng","ts"}` | `{"ok": true, "off_trail": null or {...}}` | C |
| GET | `/api/location/{session_id}` | | `{"latest": {...}, "track": [...]}` | C |
| GET | `/api/trail/{trail_id}/brief` | | `{"text": "This hike is 2.1 km..."}` | C |
| POST | `/api/fall/check` | multipart `clip`, `session_id`; optional `windowed=true`, `sequence` for one-second rolling segments. The backend assesses a four-second window every three segments, retaining one second of overlap | `{"fell": "yes\|no\|unsure", "confidence": 0.0}` | C |
| POST | `/api/sos` | `{"session_id","reason","lat","lng","recent_events":[...]}` | `{"sent": true, "to": "+1..."}` | C |
| POST | `/api/sos/cancel` | `{"session_id"}` | `{"cancelled": true}` | C |
| GET | `/api/voice/token` | | `{"conversation_token": "..."}`. Calls ElevenLabs `GET /v1/convai/conversation/token?agent_id=...` with the server-side key; the app passes the token to the agent SDK (WebRTC). **Proposed 2026-10-18** | B |
| POST | `/api/voice/tts` | `{"text"}` | `audio/mpeg`. Proxies ElevenLabs text to speech (`eleven_flash_v2_5`, mp3), cached under `backend/data/tts/`. Used for warnings and check-in prompts. Implemented in `backend/voice/`. | B |

The ElevenLabs key stays on the backend; the React Native app calls `/api/voice/tts` and never holds the key. The conversation token endpoint remains proposed. The app reads `/api/clip` uploads from `expo-camera`; confirm the container each platform records (Step B5) and that the backend's ffmpeg accepts it.

App routes (Expo Router, `frontend/app/`):

| Path | Runs on | What |
|---|---|---|
| `/` | iOS, Android | Main hiker screen: video (file or camera), big status area, mic button |
| `/share/[session_id]` | Web build (any browser, no install) and in the app | Live map pin and last events, for emergency contacts |
| `/dev/states` | Development only | Gallery of every hiker screen state, checked against `docs/design/png/` |

## Voice: two channels

| Channel | Technology | Carries | Latency target |
|---|---|---|---|
| Warning | ElevenLabs text to speech through the backend's `POST /api/voice/tts`, played with `expo-audio`; pre-rendered mp3s bundled in `frontend/assets/speech/` for the replay demo | `SpeakEvent.say`, `sign.say`, pre-brief, off-trail nudges, check-in countdown prompts | under 300 ms live, 0 ms replay |
| Conversation | ElevenLabs Agent through `@elevenlabs/react-native` (LiveKit, WebRTC) with client tools, wrapped in `frontend/lib/native/voice.ts`; conversation token from `GET /api/voice/token`. Development build only | Questions, fall check-in dialogue, SOS confirmation | normal agent turn |

Coordination rules: every spoken warning is also sent to the agent as a contextual update ("Warning spoken: <say>") so it can answer follow-ups. A priority 3 warning pauses or ducks agent output while the warning audio plays; the audio session is set up so warnings and earcons are always heard while an agent session is open. If the text to speech route is unreachable, fall back to on-device speech (`expo-speech`); never drop a warning. In Expo Go the agent is unavailable and the mic button says so; warnings still play.

## Agent client tools (declared in the ElevenLabs agent config; the app runs them in `frontend/lib/native/voice.ts` by calling the backend)

| Tool | Calls | Agent says |
|---|---|---|
| `get_hazards_ahead` | GET `/api/session/{id}/hazards` | Summarises the last events, direction first |
| `describe_surroundings` | POST `/api/describe` with the latest clip | Reads `scene` |
| `read_sign` | POST `/api/read_sign` with the latest frame | Reads `sign.say`, then the lines if asked |
| `where_am_i` | GET `/api/location/{id}` + `/api/trail/{id}/brief` | Distance covered, off-trail status |
| `start_sos` | POST `/api/sos` | Confirms a call was placed to the emergency contact |
| `cancel_sos` | POST `/api/sos/cancel` | Confirms cancellation |

Tool names and parameter names are case-sensitive and must match the dashboard config exactly. The four question tools need "Wait for response" on; the two SOS tools return a confirmation string too.

Agent system prompt (App/Voice owns it; the ElevenLabs dashboard copy is the one the agent uses, and `frontend/lib/native/systemPrompt.ts` keeps the same text so the app can push it as an override if the React Native SDK supports overrides):

> You are TrailSense, a calm hiking guide for a blind hiker. Speak in short sentences. Hazard warnings are spoken by a separate channel; you receive them as context messages that start with "Warning spoken:". Do not repeat a warning unless the hiker asks. When asked a question, answer in two sentences or fewer, directions first using clock positions. Use get_hazards_ahead for "what's ahead", describe_surroundings for "what do you see", read_sign for any sign or marker, and where_am_i for location or progress. A message that starts with "[SYSTEM]" comes from the app, not the hiker; follow it exactly. If the hiker says anything that sounds like distress, call start_sos. If a fall check-in is active and the hiker speaks at all, call cancel_sos and tell them help is not being called. Never speculate about things you were not told.

## Perceptron Mk1.5: which capability we use where

Model `perceptron-mk1.5` on `https://api.perceptron.inc/v1/chat/completions` (`pip install "perceptron>=0.4.0"`, key in `PERCEPTRON_API_KEY`). Full notes and sources in [`vendor-apis.md`](./vendor-apis.md).

| Need | Mk1.5 feature | Request shape |
|---|---|---|
| Hazard JSON every 3 s in live mode, over a running 6 s window | Structured output, frames via `video_frames` | `response_format={"type":"json_schema","json_schema":{"strict":true,...}}`, live mode uses `reasoning_effort="minimal"` and `max_completion_tokens=512`; offline clip jobs use `low` |
| Direction and distance from geometry | Pointing | second request, `vision_config={"annotation_format":"point"}`, only for severity 2 and 3 |
| Confirm a severity 3 | Regex output | `regex="yes\|no"` |
| Trail signs, junction posts, warning signs | OCR + structured output | `response_format` json_schema for `SignReading`, `reasoning_effort="high"` |
| Scene description on demand | Plain text | `reasoning_effort="high"`, two sentences |
| Fall confirmation | Structured output + audio | json_schema, `reasoning_effort="low"`, `max_completion_tokens=256`, `vision_config={"enable_audio_in_video": true}` so impact or distress sounds count. Sends real video clips, not frames, because audio needs them |
| Demo script timestamps and recall check | Clip events | `vision_config={"annotation_format":"clip"}`, offline batch: contact sheets to find candidate segments, then `video_frames` at 1 fps with source timestamps |
| Low-vision guidance arrow (stretch) | Video tracking | `vision_config={"annotation_format":"box"}`, "track the walkable trail", offline batch of `video_frames` at 2 fps, produces `track.json` |

### How we pass video to the model

Guidance from Perceptron: "For passing data to the model, if you're trying to do continuous monitoring, I'd pass in a running context window of a few seconds. If batching, I'd pass in frames or a contact sheet."

| Mode | Where | What we send |
|---|---|---|
| Continuous monitoring | Live `/api/clip`, and the offline replay pipeline (it simulates live so replay matches what live would say) | A running window. Live Expo sends one-second segments for hazard analysis every 3 seconds; the backend samples submitted frames at 2 fps, 480p, into a per-session ring buffer. Each request sends up to the last 6 seconds of sampled frames as one `video_frames` asset with real timestamps. The model sees recent context, though live capture cadence and model latency can leave gaps |
| Batching | Whole-video offline jobs: clip-event ground truth, trail tracking, demo-script timestamps | Frames or a contact sheet. `video_frames` at 1 to 2 fps with source-video timestamps when exact times matter, in segments that fit 256 media units and the token budget. A contact sheet is one grid image of thumbnails with the timestamp burned into each tile. It costs one media unit, so use it for a cheap first scan that picks which segments get the frame pass |
| Single frame | Grounding, sign reading, severity 3 confirmation | The latest frame of the window as one image |
| Real clip | Fall confirmation | `video()` of the posted chunk, because `enable_audio_in_video` needs a real video asset |

Rules: one output constraint per request (json_schema, regex, or an annotation format; never two). Tools cannot be combined with json_schema or regex. Check `finish_reason == "stop"` before parsing. Coordinates are on a 0 to 1000 grid, origin top-left.

## Coding rules for all agents

- Python: type hints, pydantic models for every schema above, `async` endpoints, `httpx` or the `perceptron` SDK for API calls, log every model call with latency to `backend/data/logs/`.
- TypeScript: strict mode, no `any`, Zod schemas in `frontend/lib/schema.ts` for everything that crosses the network, mirroring the pydantic models.
- Frontend: React Native with Expo SDK 57 and Expo Router. Style with `StyleSheet` and `frontend/theme/tokens.ts` (no Tailwind, no NativeWind). Install packages with `npx expo install` so versions match the SDK. Native features go through the typed wrappers in `frontend/lib/native/`; the web build must never import native-only modules.
- Never put an API key in the app. Every `EXPO_PUBLIC_` variable is bundled and readable by anyone; keys stay in the backend's `.env`.
- No databases. In-memory dicts keyed by `session_id`, persisted to JSON files under `backend/data/sessions/` on each write.
- Every endpoint has a curl example in a docstring or a comment.
- Write a tiny test or script that proves each step works before moving on. Keep them in `backend/tests/` and `frontend/scripts/`.
- No em dashes in any user-facing text.
- Never commit `.env` files or raw footage.
- Frontend UI changes go on a step branch with a PR into front-end-feature-branch; one PR per step.
