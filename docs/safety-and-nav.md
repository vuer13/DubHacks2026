# Safety and navigation

You own `backend/safety/`, `backend/nav/`, the Twilio SOS, GPX handling, the share-page API, the fall detector, and the trail footage. You are also the one who goes outside early to record footage, because the footage is the whole demo.

Before you start: read [`shared-context.md`](./shared-context.md) (or point your agent at it). Prompts are written as one module at a time with inputs, outputs, and a test named up front.

---

## Step C0: keys and footage

No agent needed. Do these by hand:

1. Create accounts and get keys: Perceptron (for Perception; key at perceptron.inc, try the playground while you are there), ElevenLabs (for App/Voice), Twilio trial (verify the emergency contact's phone number in Twilio so the trial can text it). Put backend keys in the repository-root `.env`, frontend keys in `frontend/.env.local`, and share them with the team over a private channel, never in git.
2. Go record footage. Phone at chest height, landscape, 1080p 30 fps. Record these as separate clips, 60 to 90 s each, on the nearest trail with some variety (a park with stairs and a creek works if a real trail is far):
   - `clear.mp4`: easy clear trail, steady walking
   - `roots.mp4`: roots, steps, uneven ground
   - `edge.mp4`: a steep edge or drop-off on one side, walk along it
   - `fork.mp4`: approach and pass a trail junction, ideally one with a signpost; walk up close enough that the text is readable in the frame for a second or two
   - `sign.mp4`: 10 s facing a trail sign or notice board, steady, then walk on (used for the sign-reading tool)
   - `people.mp4`: another person or dog passing
   - `stumble.mp4`: a stumble and recovery, keep walking (this must NOT trigger a fall)
   - `fall.mp4`: a staged fall onto grass, lie still for 10 s, then get up
   - `hike1.mp4`: one continuous 6 to 8 minute walk that contains as many of the above as possible, in order
3. Also record a GPX track of `hike1` with any tracking app (Strava, AllTrails, or the phone's built-in). Export it to `backend/data/gpx/demo.gpx`.
4. Put all clips in `footage/` and upload them to a shared Drive. Tell Perception `hike1.mp4` is ready.

**Done when**: footage is in the repo folder and the GPX file exists.

---

## Step C1: location logging

**Prompt C1**

```
Read docs/shared-context.md. Implement location logging in backend/safety/location.py and expose it in backend/safety/router.py (the router already exists and is mounted; add routes, do not create a new app).

Module backend/safety/location.py:
- In-memory dict sessions: dict[str, list[LocationPoint]] where LocationPoint is a pydantic model {lat: float, lng: float, ts: float}.
- record(session_id, point) appends and persists the whole list to backend/data/sessions/<session_id>.location.json.
- latest(session_id) -> LocationPoint | None, track(session_id) -> list[LocationPoint].

Routes:
- POST /api/location body {"session_id","lat","lng","ts"} -> {"ok": true, "off_trail": null}. The off_trail field will be filled by backend/nav in a later step; leave a clearly marked hook.
- GET /api/location/{session_id} -> {"latest": LocationPoint | null, "track": [LocationPoint]}.

Test backend/tests/test_location.py: post three points, get them back in order, confirm the JSON file exists. Run the test and show output.
```

---

## Step C2: GPX, off-trail detection, trail brief

**Prompt C2**

```
Read docs/shared-context.md. Implement backend/nav/trail.py and routes in backend/nav/router.py.

backend/nav/trail.py:
- load_trail(trail_id) -> Trail: parses backend/data/gpx/<trail_id>.gpx with gpxpy into a list of (lat, lng, ele) points, cached in memory. "demo" maps to demo.gpx.
- distance_to_trail(trail, lat, lng) -> (distance_m, side): minimum perpendicular distance from the point to any segment of the track using an equirectangular projection (accurate enough for a few km), and side = "left" or "right" of the direction of travel of the nearest segment, computed with a cross product.
- progress(trail, lat, lng) -> {"distance_done_m", "distance_left_m", "pct"} using the nearest segment index.
- brief(trail) -> str: one spoken paragraph under 50 words: total length in km, total elevation gain, and the location of the steepest 100 m segment as "about X minutes in" assuming 3 km/h. Example: "This hike is 2.1 kilometres with 120 metres of climbing. The steepest part comes about 12 minutes in. I'll warn you about hazards as we go."

Off-trail logic in backend/nav/offtrail.py:
- class OffTrailDetector with check(session_id, trail, lat, lng, ts) -> OffTrailEvent | None. Fires when distance_to_trail exceeds 15 m for at least 20 continuous seconds of points, then not again until the hiker is back within 8 m. Thresholds as constants.
- Wire it into the hook in POST /api/location so the response's off_trail field is populated when it fires, and log the event to backend/data/sessions/<session_id>.events.json.

Routes:
- GET /api/trail/{trail_id}/brief -> {"text": brief}
- GET /api/trail/{trail_id}/status?lat=&lng= -> {"distance_m", "side", "progress": {...}}

Tests in backend/tests/test_trail.py: brief returns under 50 words for demo.gpx; a point 30 m east of the track reports side correctly; the detector fires only after 20 s of off-trail points and resets on return. Run tests and show output.
```

---

## Step C3: fall detector, Mk1.5 confirmation, SOS

**Prompt C3**

```
Read docs/shared-context.md. Implement fall detection and SOS.

backend/safety/fall.py:
- motion_signature(clip_path) -> per-clip optical-flow features: sample at up to 10 fps, preserve aspect ratio with a 320 px longest edge, calculate Farneback average flow per frame pair, and estimate rotation from ORB matches plus a RANSAC affine transform. Return max_flow, end_flow, peak_vertical_flow, rotation_change_deg, motion_spike, static_after, and opencv_fall_suspected. Initial tunable rule: max_flow > HIGH_MOTION, end_flow < LOW_MOTION, and either a vertical sweep or rotation above its limit. If ORB cannot estimate rotation, high flow plus a still ending remains a weaker candidate. Rotation may be null when there are too few reliable matches.
- async vlm_confirm(clip_path) -> ("yes"|"no"|"unsure", confidence): reuse backend/perception/mk1.py's get_client() to ask Mk1.5 with response_format json_schema (strict) for {"fell": "yes"|"no"|"unsure", "confidence": number 0 to 1, "reason": string}, reasoning_effort "high", and vision_config {"enable_audio_in_video": true} so the sound of an impact or a cry counts as evidence. Prompt: "This is a chest camera on a hiker, with sound. Did the wearer fall to the ground during this clip? A stumble with recovery is no. Consider both the picture and any impact or vocal sounds." Import the client, do not duplicate the API code. Check finish_reason == "stop" before parsing. Send the clip with video(), not frames: this is the one model call that does not use the running window, because frames carry no audio.
- async assess(clip_path) -> FallAssessment with fields fell, confidence, signals. Run OpenCV as supplemental diagnostics and call vlm_confirm for every submitted clip; OpenCV never gates model assessment. Mk1.5's yes/no/unsure result controls the classification. If OpenCV feature extraction fails, continue with Mk1.5.

backend/safety/sos.py:
- send_sos(session_id, reason, lat, lng, recent_events) -> {"sent": bool, "to": str, "sid": str}: builds a message like "TrailSense alert: <name or session_id> may need help. <reason>. Last location: https://maps.google.com/?q=<lat>,<lng> at <local time>. Recent: <up to 3 say strings>. Live: <SHARE_BASE_URL>/share/<session_id>" and sends it via Twilio REST to EMERGENCY_CONTACT_NUMBER. If Twilio env vars are missing, log the message to backend/data/logs/sos.log and return sent=false with a clear reason. Never raise.
- cancel_sos(session_id): marks a pending SOS cancelled in memory and logs a fall_cancelled event.

Routes in backend/safety/router.py:
- POST /api/fall/check (multipart clip + session_id) -> {"fell","confidence"} and logs a fall_suspected event when fell is yes or unsure.
- POST /api/sos and POST /api/sos/cancel per docs/shared-context.md.

Tests in backend/tests/test_fall.py: cover optical-flow features on a synthetic rotating fall-like clip and a steady clip, plus model classification independent of OpenCV cues. To train an SVM or Random Forest later, collect labeled fall and non-fall clips and export the per-clip features; no classifier is trained until those labels are available.
```

**Done when**: `fall.mp4` assesses "yes", `stumble.mp4` assesses "no", and a test SMS arrives on the verified phone (send one real one now so you know the Twilio trial works; it prefixes "Sent from your Twilio trial account", which is fine).

---

## Step C4: integration

Follow [`integration-and-demo.md`](./integration-and-demo.md). You run the fall sequence: play `fall.mp4` in the app with App/Voice, confirm the check-in starts, stay silent, confirm the SMS arrives with a working share link. Then play `stumble.mp4` and confirm nothing fires.

---

## Step C5: hardening and the hazard log

**Prompt C5**

```
Read docs/shared-context.md. Two improvements.

1. backend/safety/session.py: a single SessionStore that every router uses, holding per-session location track, last ClipEvents, safety events, and sos state, persisted to backend/data/sessions/<id>.json after each write. Refactor location.py, fall.py, sos.py and the hook in perception/router.py (coordinate with Perception, change only the import and the two calls that store or fetch events) to use it. Add GET /api/session/{session_id} returning the whole session for the share page and the demo event log.
2. backend/nav/hazard_map.py: when a session ends (POST /api/session/{id}/end), write every hazard with severity 2 or more, with the GPS point nearest in time, into backend/data/hazard_map.json keyed by trail_id. Add GET /api/trail/{trail_id}/hazards returning that list. This is the "community hazard map" that the next hiker benefits from; the brief should mention "3 hazards reported by previous hikers" when the list is non-empty.

Update tests, run everything, commit "session store and hazard map".
```

---

## Step C6: demo script and backup

No agent. Write `demo/SCRIPT.md` using the outline in [`integration-and-demo.md`](./integration-and-demo.md), with exact timestamps in `hike1.mp4` where each moment happens (first warning, fork and sign, drop-off, the question "what's ahead?", the stumble that does not fire, the fall). Perception's Step A7 produces `backend/data/jobs/hike1.clips.json` from a Mk1.5 clip-event pass over the whole video; use its timestamps as the starting point instead of scrubbing by hand, then confirm each one by eye. The contact sheets from that pass (one image per 32 s of video, timestamps on each tile) are a quick visual index of the whole hike. Set up a second phone or laptop with the share page open on the projector. Record a backup screen capture of a full clean run with App/Voice.

---

## Step C7: rehearsal

You watch the share page and SMS during each rehearsal, confirm the link opens, and keep the demo tight (aim for under about 4 minutes).
