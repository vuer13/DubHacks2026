# Perception

You own `backend/perception/`, the Mk1.5 prompts and schemas, the clip pipeline, the grounding pass, sign reading, the smoothing layer, and `events.json`. You also own `backend/main.py` and the FastAPI skeleton because Safety/Nav mounts routers into it.

Before you start: read [`shared-context.md`](./shared-context.md) and the Perceptron half of [`vendor-apis.md`](./vendor-apis.md). Work one step at a time; only change files in your lane unless coordinating with the team.

Model: `perceptron-mk1.5` on the Perceptron API with the `perceptron` SDK. Mk1 and OpenRouter are fallbacks only.

How we pass video (see "How we pass video to the model" in [`shared-context.md`](./shared-context.md)): hazard detection is continuous monitoring, so every call gets a running window of the last few seconds of frames. Whole-video offline jobs are batching, so they get frames or a contact sheet.

---

## Step A0: repo and backend skeleton

**Prompt A0**

```
Read docs/shared-context.md fully before doing anything.

Set up the backend skeleton for TrailSense:

1. Create backend/ with a Python 3.11 project: requirements.txt (fastapi, uvicorn[standard], httpx, pydantic>=2, python-dotenv, python-multipart, opencv-python-headless, numpy, gpxpy, twilio, "perceptron>=0.4.0"), a .env.example with every variable listed in docs/build-plan.md, and backend/data/ with subfolders clips/, jobs/, sessions/, logs/, frames/ plus a .gitignore that ignores their contents but keeps the folders.
2. Create backend/schemas.py with pydantic v2 models for Hazard, SignReading, ClipEvent, SpeakEvent, and the safety events, exactly matching the JSON in docs/shared-context.md. Use Literal types for type, direction, distance, trail_state, earcon, haptic, sign.kind, arrow direction. Hazard.point is Optional[tuple[int, int]] default None with each value 0 to 1000; ClipEvent.sign is Optional[SignReading] default None. Add validators: Hazard.say at most 6 words, SignReading.say at most 12 words. Also create a ModelHazardOutput model (hazards without point, trail_state, surface, scene) that is exactly what we ask the model to produce, and a helper that merges it into a ClipEvent.
3. Create backend/main.py: FastAPI app, CORS allow all, GET /health returning {"ok": true}, and router mounting for three routers: perception.router, safety.router, nav.router. Create empty routers in backend/perception/router.py, backend/safety/router.py and backend/nav/router.py so the app boots now and other lanes fill them in.
4. Create backend/tests/test_schemas.py that round-trips the example ClipEvent from docs/shared-context.md through the pydantic model, and also round-trips the same event with point and sign removed (older events must still validate).
5. Add a Makefile or scripts in README with: install, dev (uvicorn with reload on port 8000), test.

Run the install, start the server, curl /health, run the test, and show me the output. Then commit with message "backend skeleton".
```

**Done when**: `curl localhost:8000/health` returns `{"ok": true}` and the schema tests pass. Tell App/Voice and Safety/Nav the backend boots; they can now add their routers.

---

## Step A1: one Mk1.5 call that returns valid JSON

This is the riskiest step in the whole project. Do not move on until it works on a real trail clip.

**Prompt A1**

```
Read docs/shared-context.md and docs/vendor-apis.md. We are integrating Perceptron Mk1.5 through the Perceptron API with the perceptron Python SDK (>=0.4.0).

Hazard detection is continuous monitoring, so we send a running context window of the last few seconds as frames, not disconnected clips.

First, build backend/perception/frames.py:
- extract_frames(video_path, fps=FRAME_FPS, height=480) -> list[Frame] where Frame is (jpeg_path, t_ms). Uses ffmpeg, writes JPEGs, keeps source timestamps.
- class RunningWindow(seconds=WINDOW_S): push(frames) appends and drops frames older than the newest minus WINDOW_S; frames() returns the current window in timestamp order; latest() returns the newest frame.
- Constants at the top: FRAME_FPS = 2, WINDOW_S = 6.0, STRIDE_S = 3.0, overridable from env.

Then write backend/tests/probe_mk1.py that sends the same moment of a trail video three ways and prints latency, token usage and the raw response for each:
  (a) video() of the 3 s clip ending at that moment (the old approach, as a baseline);
  (b) video_frames() of a 6 s running window at 2 fps (12 frames, 480p) ending at that moment, with real timestamps in ms;
  (c) video_frames() of a 4 s window at 2 fps (8 frames).
Run each with reasoning_effort "minimal", "low" and "medium" (9 runs) and print a table. Report input tokens per frame so we can size the window against the 36,864 token context. Do not guess at limits; if a request fails, print the error body.

Then build backend/perception/mk1.py:

- A single module-level client built from PERCEPTRON_API_KEY, PERCEPTRON_MODEL, PERCEPTRON_BASE_URL. Expose it as get_client() so Safety/Nav can reuse it for fall confirmation.
- async function analyze_window(frames: list[Frame], *, clip_id: str, reasoning_effort: str = MK1_HAZARD_EFFORT) -> ClipEvent. t_start and t_end are the first and last frame timestamps in seconds.
- It sends the frames as one video_frames asset with this system prompt:

  "You are the eyes for a blind hiker wearing a chest camera. You see the last few seconds as frames in time order; judge hazards by the most recent frame and use the earlier frames to tell what is getting closer. Identify hazards for a person walking forward. Hazard types: drop_off, steep_descent, water, loose_rock, roots_steps, low_branch, fork, mud_ice, wildlife, people. Severity 3 only for immediate danger within 2 metres, 2 for caution, 1 for a note. Direction: the frame is five equal vertical bands, left to right '10', '11', '12', '1', '2'. Distance: near under 2 m, mid 2 to 6 m, far over 6 m. say: at most 6 words, direction word first (left, right, ahead), imperative. trail_state: clear, narrowing, fork, or unclear. surface: two or three words. scene: one sentence for someone who cannot see. An empty hazards list is a valid and common answer. Prefer saying nothing over inventing a hazard."

The live and replay prompts also treat a stationary tree trunk, stump, boulder, or large rock as a collision hazard when it blocks the forward walking corridor. To preserve the shared hazard schema, trunks and fixed obstructions use `roots_steps`, while rocks use `loose_rock`; the spoken warning names the specific object. Trees and rocks outside the walking corridor remain unreported.

- Use response_format json_schema with strict true, built from ModelHazardOutput.model_json_schema(). Set max_completion_tokens 512. Do not use tools in this request.
- Check finish_reason == "stop". Parse with ModelHazardOutput.model_validate_json(strict=True). Merge into a ClipEvent, filling clip_id, t_start, t_end, model and latency_ms. On validation failure, retry once with the error message appended ("Your previous response failed validation: ... Return corrected JSON only."). On second failure return a ClipEvent with empty hazards and trail_state "unclear" and log the raw response.
- Make MK1_HAZARD_EFFORT a constant, default "low", and read an override from env.
- Log every call (clip_id, frame count, window seconds, reasoning_effort, latency, token usage, finish_reason, raw content) as one JSON line in backend/data/logs/mk1.jsonl.
- If PERCEPTRON_API_KEY is missing but OPENROUTER_API_KEY is set, fall back to OpenRouter with model perceptron/perceptron-mk1.5, plain prompting without response_format, strip markdown fences, same validation. Log which path was used.

Run analyze_window on a 6 s window from footage/<a trail video> and show me the output and latency. If there is no footage yet, use any walking video.
```

**Done when**: a real 6 s window returns a validated `ClipEvent` with a sensible `scene` in under about 3 s. Paste the output and the probe table into the team chat so everyone sees the real shape and the trade-offs. Pick the window length and effort level: the fastest pair that still finds the edge in `edge.mp4`. Set `WINDOW_S` and `MK1_HAZARD_EFFORT` from that.

**If it is slow or failing**: shrink the window to 4 s, drop `FRAME_FPS` to 1.5, or drop to 360p. Keep at least 6 frames so the model still sees motion. If strict json_schema rejects the schema (tuple types or Literals sometimes do), simplify the model-facing schema: strings and integers only, and keep the Literal checks in pydantic.

---

## Step A2: video to events.json

**Prompt A2**

```
Read docs/shared-context.md. Build the offline pipeline that turns a full trail video into events.json.

backend/perception/pipeline.py:
This pipeline simulates live mode so the replay says exactly what live would have said. It uses the same running window as live, not a different batching scheme.
- Extract all frames once with frames.extract_frames(video_path) into backend/data/frames/<job_id>/.
- windows(frames) -> list of (clip_id, window_frames): one tick every STRIDE_S seconds of video time; each tick's window is the frames in (tick - WINDOW_S, tick]. The first ticks get partial windows. clip_id is clip_0001, clip_0002, and so on. The window's latest frame is what grounding and sign reading use.
- analyze_video(video_path, job_id, concurrency=4) -> list[ClipEvent]: runs analyze_window over all windows with an asyncio semaphore, preserves order, writes partial results to backend/data/jobs/<job_id>.json after every window so a crash loses nothing.

backend/perception/router.py:
- POST /api/analyze: accepts multipart video, saves it, creates a job_id, starts analyze_video as a background task, returns {"job_id"}.
- GET /api/jobs/{job_id}: returns status, events so far, and speak (an empty list for now; Step A3 fills it).

Add a CLI: python -m backend.perception.pipeline footage/hike1.mp4 --job hike1 that does the same thing without the server and prints a summary table (clip_id, window start and end, hazards count, top hazard, latency).

Run it on the full footage/hike1.mp4 and show me the summary. Tell me the total cost from token usage in the log at $0.15 per million input and $1.50 per million output tokens. Each frame is sent about WINDOW_S / STRIDE_S times, so expect roughly double the input cost of non-overlapping clips. Commit as "offline perception pipeline".
```

**Done when**: `backend/data/jobs/hike1.json` exists with one `ClipEvent` per window tick. Share it with App/Voice immediately; it is their replay input and the input to their speech pre-render script.

---

## Step A3: smoothing, live clip endpoint, describe

**Prompt A3**

```
Read docs/shared-context.md. Build the smoothing layer that decides what gets spoken, then the live endpoints.

backend/perception/smoothing.py:
- class Smoother with method push(event: ClipEvent) -> list[SpeakEvent]. Keep per-session state in memory.
- Rules:
  1. Severity 3 hazards produce a SpeakEvent immediately with priority 3, earcon "stop", haptic "long".
  2. Severity 1 and 2 hazards must appear in two consecutive ClipEvents (same type, any direction) before they are spoken. Windows overlap, so this means two separate model calls agreed on overlapping evidence; it filters one-off hallucinations, not short hazards. Priority equals severity, earcon "note" for 1 and "caution" for 2, haptic "short" for 1 and "double" for 2.
  3. The same hazard type is not spoken again within 20 seconds unless its distance bucket got closer (far to mid, mid to near), in which case speak it again with priority bumped by 1 (max 3).
  4. trail_state "fork" produces a SpeakEvent "Fork ahead" with earcon "fork", priority 2, once per 30 seconds. If the same ClipEvent or the next one carries a sign with kind "directional", add a second SpeakEvent 1.5 s later with the sign's say text, earcon "note", priority 1.
  5. At most one hazard SpeakEvent per ClipEvent; pick the highest priority, tie-break by nearest distance.
  6. Clear the 20 second memory if no hazards of that type appear for 60 seconds.
- Make the thresholds constants at the top of the file so we can tune them easily.

Then:
- Update GET /api/jobs/{job_id} to return speak = Smoother run over the events in order, with t = t_end + REPLAY_SPEAK_DELAY_S (default 0.5). Use t_end, not t_start: a window's answer is only available once its last frame exists, so this is when live mode would have spoken.
- POST /api/clip: multipart clip + session_id. Extract the chunk's frames at FRAME_FPS, timestamp them on a per-session clock (seconds of video received so far), push them into that session's RunningWindow, then run analyze_window over the whole window and Smoother.push for that session. Returns {"event", "speak"}. Store the last 10 ClipEvents per session in memory and in backend/data/sessions/<session_id>.json. Save the window's latest frame to backend/data/frames/<session_id>/latest.jpg for read_sign. Keep the raw chunk too (last one only) for fall confirmation, which needs its audio.
- GET /api/session/{session_id}/hazards: last 3 ClipEvents.
- POST /api/describe: multipart clip + session_id. If the session has a running window, send that window's frames (the hiker is asking about the last few seconds); otherwise extract frames from the posted clip. Plain text request (no response_format) with reasoning_effort "high" and the user message "Describe this scene in two sentences for a blind hiker, mentioning the trail direction and any landmarks. Then list hazards as a JSON array on the last line." Split the last line as JSON; return scene and hazards. If the last line does not parse, return scene with an empty hazards list.

Write backend/tests/test_smoothing.py with cases for each rule using hand-written ClipEvents. Run tests, run the hike1 job through the smoother and print the resulting SpeakEvents with timestamps. Commit as "smoothing and live endpoints".
```

**Done when**: the hike1 job yields a short, sensible list of `SpeakEvent`s (expect roughly 1 every 15 to 30 s on a typical trail; if it is chattier, raise the persistence rule or the repeat window).

---

## Step A4: grounding pass for direction and distance

Mk1.5 can point at things. We use that so direction comes from where the hazard is in the frame, not from the model's guess, and so a severity 3 with nothing to point at gets downgraded.

**Prompt A4**

```
Read docs/shared-context.md and the annotation section of docs/vendor-apis.md.

backend/perception/grounding.py:
- async ground_hazard(frame_path: Path, hazard_type: str) -> tuple[int, int] | None. Sends the window's latest frame as one image with vision_config {"annotation_format": "point"}, reasoning_effort "low", max_completion_tokens 256, and the prompt: "Point to the <hazard description> that a person walking forward would reach first. Use one point with mention \"<hazard_type>\" and asset_idx 0, coordinates normalised to 0-1000. If it is not visible, output no annotation." Map hazard_type to a short description (drop_off: "edge where the ground drops away", roots_steps: "exposed root or step across the path", low_branch: "branch at head height", people: "nearest person", and so on for all ten).
- Parse with response.annotations(strict=True).points. Take the first point whose mention matches. Validate 0 to 1000. Return None if there is no point.
- direction_from_x(x) -> "10"|"11"|"12"|"1"|"2" using the bands in docs/shared-context.md. distance_from_y(y) -> "near" if y >= NEAR_Y (default 700), "mid" if y >= MID_Y (default 450), else "far". Constants at the top; we will tune them on edge.mp4 and roots.mp4.
- async refine(event: ClipEvent, frame_path: Path) -> ClipEvent: for each hazard with severity >= 2, call ground_hazard. If a point comes back, set hazard.point, overwrite direction from x, overwrite distance from y, and regenerate say with the new direction word if it changed. If no point comes back and severity is 3, downgrade to 2 and log "ungrounded sev3". Run the per-hazard calls concurrently.
- Wire refine into analyze_video (after each analyze_window) and into POST /api/clip. Add a GROUNDING_ENABLED env flag so it can be turned off if latency is too high in live mode.

Test: backend/tests/test_grounding.py with a hand-made frame (draw a dark band on the left third of a 640x360 image) and assert direction_from_x gives "10" or "11" for the returned point, plus unit tests for the band mapping. Then re-run the hike1 job with grounding on and print, per window, the model's original direction vs the grounded one. Report how many severity 3 hazards were downgraded. Commit as "grounding pass".
```

**Done when**: on `edge.mp4` the drop-off is reported on the correct side every time, and the extra latency per window with hazards is under about 1 s. Share the updated `hike1.json` with App/Voice; the `point` values drive the low-vision arrow.

---

## Step A5: trail signs (OCR)

The glasses demo from Perceptron layers OCR and lookups on top of what the wearer sees. On a trail that means signs: junction posts with arrows, distance markers, warning boards.

**Prompt A5**

```
Read docs/shared-context.md and the OCR section of docs/vendor-apis.md.

backend/perception/signs.py:
- async read_sign(frame_path: Path) -> SignReading. One request with response_format json_schema (strict) built from a model-facing schema {present: bool, kind: directional|warning|info|none, lines: [string], arrows: [{label: string, direction: left|right|ahead|back}]}, reasoning_effort "high", max_completion_tokens 1024, and the prompt: "You are reading trail signage for a blind hiker. If there is a sign, post, marker or notice board, transcribe its readable text in reading order, one entry per line. Drop any text you cannot read; never guess. For each arrow or pointing symbol, give the label next to it and the direction it points relative to the camera: left, right, ahead or back. kind: directional for junction or route signs, warning for closures, wildlife or danger notices, info for everything else, none if there is no sign. If there is no sign, present is false and all lists are empty."
- Build say from the result: if present is false, say "No sign visible". If there is an arrow, say "Sign: <label>, <direction>" and append the first distance-looking line ("2.1 km" becomes "two kilometres"; write a tiny number-to-words for km and m). For warning kind say "Warning sign: <first line>". Cap at 12 words.
- POST /api/read_sign: multipart frame (jpeg) or clip (we take the last frame) plus session_id. If neither is sent, use backend/data/frames/<session_id>/latest.jpg. Returns {"sign": SignReading} and stores the sign on the latest ClipEvent for that session.
- Automatic trigger: in analyze_video and in POST /api/clip, when an event's trail_state is "fork", call read_sign on that window's latest frame and attach the result as event.sign. Only do this for fork events so the main loop stays cheap.

Test: backend/tests/test_signs.py using any photo of a trail sign (take one on your phone, or frame-grab from fork.mp4). Print the SignReading and the say text. Then re-run hike1 and confirm the fork clip has a sign attached (or sign.kind == "none" if the footage has no sign; that is fine, but tell Safety/Nav so they can record a junction with a post next time). Commit as "sign reading".
```

**Done when**: a sign photo returns correct lines and arrow direction, and `hike1.json` fork events carry a `sign`. Tell App/Voice the `read_sign` tool can go live.

---

## Step A6: integration

Join the full-run session in [`integration-and-demo.md`](./integration-and-demo.md). Your job during integration is to watch the backend logs, fix any schema mismatch quickly, and note every hazard Mk1.5 missed or invented on the real footage. That list drives Step A7.

---

## Step A7: prompt tuning on real footage

**Prompt A7**

```
Read docs/shared-context.md and backend/data/logs/mk1.jsonl. Here is what went wrong on the real hike footage during integration:

<paste your list: e.g. "clip_0007 to clip_0009: called a shadow a drop_off", "clip_0021: missed the root step that tripped the tester", "clip_0030: water hazard for a puddle">

Improve backend/perception/mk1.py and grounding.py:
1. Add few-shot guidance to the system prompt describing what each hazard type looks like from a chest camera on a BC forest trail, and explicit negatives (shadows, puddles that are not water crossings, trail edges with vegetation are not drop-offs unless there is visible height change).
2. For severity 3 hazards that survived grounding, add a cheap confirmation: a second request on the same frame with regex "yes|no", reasoning_effort "minimal", and the question "Is the <type> within 2 metres and directly in the walking path? Answer yes or no." Downgrade to severity 2 on no. Only for severity 3 so latency stays low.
3. Audio experiment: frames carry no sound, so for this run send each window as a video() clip cut from hike1.mp4 with ffmpeg over the same time span, with vision_config {"enable_audio_in_video": true}. Compare recall on the water and people clips and the latency per window. Keep it on only if recall improves and latency rises by less than 20 percent; otherwise leave it off and note the numbers.
4. Ground truth with clip events. This is batching, so send frames or contact sheets, not the raw video:
   a. Add contact_sheet(frames, cols=4, rows=4) -> Path to backend/perception/frames.py: one JPEG grid of thumbnails, each tile labelled in its corner with a tile id and its timestamp in seconds. Build sheets from hike1 at one frame per 2 s, so each sheet covers 32 s.
   b. Coarse pass: send each sheet as one image with response_format json_schema {tiles: [{tile: string, event: drop_off|junction|water|person|stumble|fall}]} and the prompt "Each tile is a moment from a chest camera on a hiker, labelled with its id. List the tiles that show the hiker approaching a drop-off, a trail junction, a water crossing, another person, or stumbling or falling. Return an empty list if none do." Map tile ids back to timestamps in code.
   c. Fine pass: for each flagged moment, send video_frames at 1 fps over 10 s before to 10 s after it, with source-video timestamps, vision_config {"annotation_format": "clip"} and the prompt "Clip every moment where the hiker approaches a drop-off, a trail junction, a water crossing, another person, or stumbles or falls. Use the <clip> tag for each occurrence with a short mention." Timestamps come back in the source clock, so no offset math. Save the result to backend/data/jobs/hike1.clips.json and print a table of clip timestamps next to the matching events.json hazards. Give that table to Safety/Nav for the demo script.
Re-run the hike1 job and show me a before and after diff of the hazard list per window. Commit as "prompt tuning v2".
```

**Stretch, only if this step finished early: trail tracking for the guidance arrow**

```
Read the tracking section of docs/vendor-apis.md. Write backend/perception/trail_track.py. This is batching, so send frames: video_frames at 2 fps in 30 second segments (60 frames each, well under 256 media units) with source-video timestamps, and vision_config {"annotation_format": "box"}, reasoning_effort "medium", max_completion_tokens 4096, and the prompt "Track the walkable trail surface directly ahead of the hiker while it is visible. Return one track with mention \"trail\" and asset_idx \"0\". Use point_box children with timestamps in seconds and coordinates normalised to 0-1000. Do not invent positions when the trail is not visible." Parse response.annotations(strict=True).tracks (timestamps are already in the source clock because frame timestamps are kept as given) and write backend/data/jobs/hike1.track.json as [{"t": 12.5, "center_x": 480, "width": 320}, ...]. Print how many waypoints per minute you got and the total cost. Tell App/Voice; they draw the guidance arrow from center_x in low-vision mode.
```

---

## Step A8: pre-brief

**Prompt A8**

```
Read docs/shared-context.md. Safety/Nav exposes GET /api/trail/{trail_id}/brief with distance, elevation gain and the steepest segment from the GPX. Extend backend/perception/prebrief.py so that, given a job's events.json, it appends a hazard summary to that brief: count of hazards by type, the approximate time or distance of each severity 3 event, and the text of any directional sign read along the way. Output one short paragraph (under 60 words) that App/Voice will pre-render with ElevenLabs text to speech and play before the hike starts. Add a test with the hike1 job and commit.
```

---

## Step A9: rehearsal

Keep the backend running through ngrok, watch logs, tune the constants in `smoothing.py` and `grounding.py` live between rehearsal runs. Record the final `events.json` and `speak` list into `demo/` so the demo does not depend on a live model call. Tell App/Voice to re-run the speech pre-render whenever the `speak` list changes.
