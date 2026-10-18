# TrailSense shared context

Shared context for the whole team and any coding agent. Treat the schema and API contract as shared; change them only when the whole team agrees.

## What we are building

TrailSense helps visually impaired hikers. A phone at chest height streams video. Every 3 seconds, a running window of the last few seconds of frames goes to Perceptron Mk1.5, which returns hazards as structured JSON. A smoothing layer decides what is worth saying. ElevenLabs speaks short warnings (text to speech) and answers questions like "what's ahead?" (ElevenLabs Agent with client tools). Mk1.5 also reads trail signs with OCR and grounds hazards with points so direction comes from geometry, not guesswork. A safety layer logs GPS, exposes a live share page, detects falls, and escalates to an SMS if the hiker does not respond to a voice check-in.

The primary demo is a recorded trail video replayed with pre-computed events and pre-rendered speech. Live camera mode exists but is secondary.

## Non-negotiable principles

- Short, direction-first speech. "Drop-off, left, stop." Never a paragraph during a warning.
- Silence is a feature. Repeat nothing within 20 seconds unless it got closer.
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
| POST | `/api/clip` | multipart `clip` (the latest 3 s webm or mp4 chunk), `session_id`. The backend adds the chunk's frames to the session's running window and analyses the whole window | `{"event": ClipEvent, "speak": [SpeakEvent]}` | A |
| POST | `/api/describe` | multipart `clip`, `session_id` | `{"scene": "...", "hazards": [...]}` | A |
| POST | `/api/read_sign` | multipart `frame` (jpeg) or `clip`, `session_id` | `{"sign": SignReading}` | A |
| GET | `/api/session/{session_id}/hazards` | | last 3 `ClipEvent`s, for voice tools | A |
| POST | `/api/location` | `{"session_id","lat","lng","ts"}` | `{"ok": true, "off_trail": null or {...}}` | C |
| GET | `/api/location/{session_id}` | | `{"latest": {...}, "track": [...]}` | C |
| GET | `/api/trail/{trail_id}/brief` | | `{"text": "This hike is 2.1 km..."}` | C |
| POST | `/api/fall/check` | multipart `clip`, `session_id` | `{"fell": "yes\|no\|unsure", "confidence": 0.0}` | C |
| POST | `/api/sos` | `{"session_id","reason","lat","lng","recent_events":[...]}` | `{"sent": true, "to": "+1..."}` | C |
| POST | `/api/sos/cancel` | `{"session_id"}` | `{"cancelled": true}` | C |

Frontend routes (Next.js):

| Path | What |
|---|---|
| `/` | Main hiker screen: video (file or camera), big status area, mic button |
| `/share/[session_id]` | Live map pin and last events, for emergency contacts |
| `/api/voice/token` | Server route. Calls ElevenLabs `GET /v1/convai/conversation/get-signed-url?agent_id=...` with the server-side API key and returns `{"signed_url"}` for the browser WebSocket. Valid 15 minutes. |
| `/api/voice/tts` | Server route. `POST {"text"}` proxies ElevenLabs text to speech (`eleven_flash_v2_5`, mp3) and caches by text hash. Used for warnings, the pre-brief, and sign readouts. |

## Voice: two channels

| Channel | Technology | Carries | Latency target |
|---|---|---|---|
| Warning | ElevenLabs text to speech via `/api/voice/tts`, pre-rendered mp3s under `frontend/public/demo/speech/` for the replay demo | `SpeakEvent.say`, `sign.say`, pre-brief, off-trail nudges, check-in countdown prompts | under 300 ms live, 0 ms replay |
| Conversation | ElevenLabs Agent (`@elevenlabs/react`, WebSocket, signed URL) with client tools | Questions, fall check-in dialogue, SOS confirmation | normal agent turn |

Coordination rules: every spoken warning is also sent to the agent with `sendContextualUpdate("Warning spoken: <say>")` so it can answer follow-ups. A priority 3 warning calls `sendUserActivity()` and mutes agent output while the warning audio plays. If the text to speech route is unreachable, fall back to the browser `speechSynthesis` API; never drop a warning.

## Agent client tools (frontend declares in the ElevenLabs agent config and executes by calling the backend)

| Tool | Calls | Agent says |
|---|---|---|
| `get_hazards_ahead` | GET `/api/session/{id}/hazards` | Summarises the last events, direction first |
| `describe_surroundings` | POST `/api/describe` with the latest clip | Reads `scene` |
| `read_sign` | POST `/api/read_sign` with the latest frame | Reads `sign.say`, then the lines if asked |
| `where_am_i` | GET `/api/location/{id}` + `/api/trail/{id}/brief` | Distance covered, off-trail status |
| `start_sos` | POST `/api/sos` | Confirms help was contacted |
| `cancel_sos` | POST `/api/sos/cancel` | Confirms cancellation |

Tool names and parameter names are case-sensitive and must match the dashboard config exactly. The four question tools need "Wait for response" on; the two SOS tools return a confirmation string too.

Agent system prompt (frontend owns it, keep it in `frontend/lib/voice/systemPrompt.ts` and push it with the `overrides.agent.prompt` option at session start; enable the System prompt override in the agent's Security tab):

> You are TrailSense, a calm hiking guide for a blind hiker. Speak in short sentences. Hazard warnings are spoken by a separate channel; you receive them as context messages that start with "Warning spoken:". Do not repeat a warning unless the hiker asks. When asked a question, answer in two sentences or fewer, directions first using clock positions. Use get_hazards_ahead for "what's ahead", describe_surroundings for "what do you see", read_sign for any sign or marker, and where_am_i for location or progress. A message that starts with "[SYSTEM]" comes from the app, not the hiker; follow it exactly. If the hiker says anything that sounds like distress, call start_sos. If a fall check-in is active and the hiker speaks at all, call cancel_sos and tell them help is not being called. Never speculate about things you were not told.

## Perceptron Mk1.5: which capability we use where

Model `perceptron-mk1.5` on `https://api.perceptron.inc/v1/chat/completions` (`pip install "perceptron>=0.4.0"`, key in `PERCEPTRON_API_KEY`). Full notes and sources in [`vendor-apis.md`](./vendor-apis.md).

| Need | Mk1.5 feature | Request shape |
|---|---|---|
| Hazard JSON every 3 s, over a running 6 s window | Structured output, frames via `video_frames` | `response_format={"type":"json_schema","json_schema":{"strict":true,...}}`, `reasoning_effort="low"` (benchmark `minimal` vs `low` in Step A1) |
| Direction and distance from geometry | Pointing | second request, `vision_config={"annotation_format":"point"}`, only for severity 2 and 3 |
| Confirm a severity 3 | Regex output | `regex="yes\|no"` |
| Trail signs, junction posts, warning signs | OCR + structured output | `response_format` json_schema for `SignReading`, `reasoning_effort="high"` |
| Scene description on demand | Plain text | `reasoning_effort="high"`, two sentences |
| Fall confirmation | Structured output + audio | json_schema, `vision_config={"enable_audio_in_video": true}` so a thud or a cry counts. Sends the real clip, not frames, because audio needs it |
| Demo script timestamps and recall check | Clip events | `vision_config={"annotation_format":"clip"}`, offline batch: contact sheets to find candidate segments, then `video_frames` at 1 fps with source timestamps |
| Low-vision guidance arrow (stretch) | Video tracking | `vision_config={"annotation_format":"box"}`, "track the walkable trail", offline batch of `video_frames` at 2 fps, produces `track.json` |

### How we pass video to the model

Guidance from Perceptron: "For passing data to the model, if you're trying to do continuous monitoring, I'd pass in a running context window of a few seconds. If batching, I'd pass in frames or a contact sheet."

| Mode | Where | What we send |
|---|---|---|
| Continuous monitoring | Live `/api/clip`, and the offline replay pipeline (it simulates live so replay matches what live would say) | A running window. The backend samples frames at `FRAME_FPS` (default 2, 480p) into a per-session ring buffer. Every `STRIDE_S` (default 3 s) it sends the last `WINDOW_S` (default 6 s, about 12 frames) as one `video_frames` asset with real timestamps. The model sees what led up to now, so it can tell an approaching edge from a passing shadow |
| Batching | Whole-video offline jobs: clip-event ground truth, trail tracking, demo-script timestamps | Frames or a contact sheet. `video_frames` at 1 to 2 fps with source-video timestamps when exact times matter, in segments that fit 256 media units and the token budget. A contact sheet is one grid image of thumbnails with the timestamp burned into each tile. It costs one media unit, so use it for a cheap first scan that picks which segments get the frame pass |
| Single frame | Grounding, sign reading, severity 3 confirmation | The latest frame of the window as one image |
| Real clip | Fall confirmation | `video()` of the posted chunk, because `enable_audio_in_video` needs a real video asset |

Rules: one output constraint per request (json_schema, regex, or an annotation format; never two). Tools cannot be combined with json_schema or regex. Check `finish_reason == "stop"` before parsing. Coordinates are on a 0 to 1000 grid, origin top-left.

## Coding rules for all agents

- Python: type hints, pydantic models for every schema above, `async` endpoints, `httpx` or the `perceptron` SDK for API calls, log every model call with latency to `backend/data/logs/`.
- TypeScript: strict mode, no `any`, Zod schemas mirroring the pydantic models in `frontend/lib/schema.ts`.
- No databases. In-memory dicts keyed by `session_id`, persisted to JSON files under `backend/data/sessions/` on each write.
- Every endpoint has a curl example in a docstring or a comment.
- Write a tiny test or script that proves each step works before moving on. Keep them in `backend/tests/` and `frontend/scripts/`.
- No em dashes in any user-facing text.
- Never commit `.env` files or raw footage.
