# TrailSense schema and API contract

Source of truth: [`docs/shared-context.md`](./docs/shared-context.md). Change only when the whole team agrees.

## Hazard taxonomy

`drop_off`, `steep_descent`, `water`, `loose_rock`, `roots_steps`, `low_branch`, `fork`, `mud_ice`, `wildlife`, `people`

| Field | Values |
|---|---|
| Severity | `1` note, `2` caution, `3` stop now |
| Direction | `"10"`, `"11"`, `"12"`, `"1"`, `"2"` (clock face) |
| Distance | `"near"` (<2 m), `"mid"` (2 to 6 m), `"far"` (>6 m) |
| Point x to direction | `0-199` "10", `200-399` "11", `400-599` "12", `600-799` "1", `800-1000` "2" |

## ClipEvent

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

- `say`: max 6 words, direction word first, imperative
- `trail_state`: `clear` | `narrowing` | `fork` | `unclear`
- `scene`: one sentence; never spoken automatically
- `point` (optional, default null): `[x, y]` on the 0 to 1000 grid from a grounding pass
- `sign` (optional, default null): `SignReading` below

## SignReading

```json
{
  "kind": "directional",
  "lines": ["Lynn Loop", "2.1 km"],
  "arrows": [{"label": "Lynn Loop", "direction": "right"}],
  "say": "Sign: Lynn Loop, right, two kilometres"
}
```

- `kind`: `directional` | `warning` | `info` | `none`
- `arrows[].direction`: `left` | `right` | `ahead` | `back`
- `say`: max 12 words, arrow direction first when there is one; unreadable text is dropped, never guessed

## SpeakEvent

```json
{ "t": 36.4, "priority": 3, "say": "Drop-off, left, stop", "earcon": "stop", "haptic": "long" }
```

- `earcon`: `note` | `caution` | `stop` | `fork` | `sos`
- `haptic`: `none` | `short` | `double` | `long`
- Priority 3 pre-empts current speech

## Safety events

```json
{ "type": "fall_suspected", "t": 212.0, "signals": {"motion_spike": true, "static_after": true, "vlm": "yes"}, "confidence": 0.86 }
{ "type": "fall_checkin_started", "t": 213.0, "timeout_s": 20 }
{ "type": "fall_cancelled", "t": 219.0, "by": "voice" }
{ "type": "sos_sent", "t": 233.0, "to": "+1...", "lat": 49.3, "lng": -123.1 }
{ "type": "off_trail", "t": 90.0, "distance_m": 22, "side": "left" }
```

## Backend API (FastAPI, port 8000)

| Method | Path | Owner |
|---|---|---|
| GET | `/health` | A |
| POST | `/api/analyze` | A |
| GET | `/api/jobs/{job_id}` | A |
| POST | `/api/clip` | A |
| POST | `/api/describe` | A |
| POST | `/api/read_sign` | A |
| GET | `/api/session/{session_id}/hazards` | A |
| POST | `/api/location` | C |
| GET | `/api/location/{session_id}` | C |
| GET | `/api/trail/{trail_id}/brief` | C |
| POST | `/api/fall/check` | C |
| POST | `/api/sos` | C |
| POST | `/api/sos/cancel` | C |

## Frontend routes

| Path | What |
|---|---|
| `/` | Hiker screen |
| `/share/[session_id]` | Live map for emergency contacts |
| `/api/voice/token` | ElevenLabs signed URL for the agent WebSocket |
| `/api/voice/tts` | ElevenLabs text to speech proxy with cache, for warnings |

## Agent client tools (ElevenLabs)

| Tool | Backend call |
|---|---|
| `get_hazards_ahead` | GET `/api/session/{id}/hazards` |
| `describe_surroundings` | POST `/api/describe` |
| `read_sign` | POST `/api/read_sign` |
| `where_am_i` | GET `/api/location/{id}` + `/api/trail/{id}/brief` |
| `start_sos` | POST `/api/sos` |
| `cancel_sos` | POST `/api/sos/cancel` |
