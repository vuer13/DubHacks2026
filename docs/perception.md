# Perception

You own `backend/perception/`, the Mk1 prompts, the clip pipeline, the smoothing layer, and `events.json`. You also own `backend/main.py` and the FastAPI skeleton because Safety/Nav mounts routers into it.

Before you start: read [`shared-context.md`](./shared-context.md) (or point your agent at it). Work one step at a time; only change files in your lane unless coordinating with the team.

---

## Step A0: repo and backend skeleton

**Prompt A0**

```
Read docs/shared-context.md fully before doing anything.

Set up the backend skeleton for TrailSense:

1. Create backend/ with a Python 3.11 project: requirements.txt (fastapi, uvicorn[standard], httpx, pydantic>=2, python-dotenv, python-multipart, opencv-python-headless, numpy, gpxpy, twilio), a .env.example with every variable listed in docs/shared-context.md / docs/build-plan.md, and backend/data/ with subfolders clips/, jobs/, sessions/, logs/ plus a .gitignore that ignores their contents but keeps the folders.
2. Create backend/schemas.py with pydantic v2 models for Hazard, ClipEvent, SpeakEvent, and the safety events, exactly matching the JSON in docs/shared-context.md. Use Literal types for type, direction, distance, trail_state, earcon, haptic. Add a validator that enforces `say` is at most 6 words.
3. Create backend/main.py: FastAPI app, CORS allow all, GET /health returning {"ok": true}, and router mounting for three routers: perception.router, safety.router, nav.router. Create empty routers in backend/perception/router.py, backend/safety/router.py and backend/nav/router.py so the app boots now and other lanes fill them in.
4. Create backend/tests/test_schemas.py that round-trips the example ClipEvent from docs/shared-context.md through the pydantic model.
5. Add a Makefile or scripts in README with: install, dev (uvicorn with reload on port 8000), test.

Run the install, start the server, curl /health, run the test, and show me the output. Then commit with message "backend skeleton".
```

**Done when**: `curl localhost:8000/health` returns `{"ok": true}` and the schema test passes. Tell App/Voice and Safety/Nav the backend boots; they can now add their routers.

---

## Step A1: one Mk1 call that returns valid JSON

This is the riskiest step in the whole project. Do not move on until it works on a real trail clip.

**Prompt A1**

```
Read docs/shared-context.md. We are integrating Perceptron Mk1 through OpenRouter.

First, research how to send video to the model: fetch https://openrouter.ai/perceptron/perceptron-mk1 and the Perceptron docs it links to, and tell me (a) whether video is sent as a base64 data URL, a URL, or a sequence of frames, (b) whether there is an annotation_format or structured output option, (c) the max video length and resolution. Do not guess; if docs are unclear, write a tiny probe script that tries the base64 video approach first, then falls back to 6 evenly spaced JPEG frames sent as images.

Then build backend/perception/mk1.py:

- async function analyze_clip(clip_path: Path) -> ClipEvent
- It sends the clip to MK1_MODEL via OpenRouter chat completions with this system prompt:

  "You are the eyes for a blind hiker wearing a chest camera. Identify hazards for a person walking forward. Respond with JSON only, no prose, matching this schema: {hazards: [{type: one of drop_off|steep_descent|water|loose_rock|roots_steps|low_branch|fork|mud_ice|wildlife|people, severity: 1|2|3, direction: one of '10'|'11'|'12'|'1'|'2', distance: near|mid|far, say: string of at most 6 words, direction word first (left/right/ahead), imperative}], trail_state: clear|narrowing|fork|unclear, surface: short string, scene: one sentence describing the scene for someone who cannot see}. Severity 3 only for immediate danger within 2 metres. Empty hazards list is a valid and common answer. Prefer saying nothing over inventing a hazard."

- Strip any markdown fences from the response, parse JSON, validate with the ClipEvent model, fill clip_id, t_start, t_end, model and latency_ms. On validation failure, retry once with the error message appended ("Your previous response failed validation: ... Return corrected JSON only."). On second failure return a ClipEvent with empty hazards and trail_state "unclear" and log the raw response.
- Log every call (clip path, latency, token usage if returned, raw response) as one JSON line in backend/data/logs/mk1.jsonl.

Then write backend/tests/probe_mk1.py that takes a video path and prints the ClipEvent. Run it on footage/<a 3 second trail clip> and show me the output and latency. If there is no clip yet, cut a 3 second clip from any video in footage/ with ffmpeg.
```

**Done when**: a real trail clip returns a validated `ClipEvent` with a sensible `scene` in under about 4 s. Paste the output into the team chat so everyone sees the real shape.

**If it is slow or failing**: try 480p, 8 fps clips (ffmpeg `-vf scale=-2:480 -r 8`). If video input is unsupported, the 6-frame image fallback is fine for the demo.

---

## Step A2: video to events.json

**Prompt A2**

```
Read docs/shared-context.md. Build the offline pipeline that turns a full trail video into events.json.

backend/perception/pipeline.py:
- slice_video(video_path, clip_seconds=3, overlap=0.5) -> list of clip paths, using ffmpeg, output 480p 8fps mp4 into backend/data/clips/<job_id>/. Overlap means clip N starts 0.5 s before clip N-1 ends.
- analyze_video(video_path, job_id, concurrency=4) -> list[ClipEvent]: runs analyze_clip over all clips with an asyncio semaphore, preserves order, writes partial results to backend/data/jobs/<job_id>.json after every clip so a crash loses nothing.

backend/perception/router.py:
- POST /api/analyze: accepts multipart video, saves it, creates a job_id, starts analyze_video as a background task, returns {"job_id"}.
- GET /api/jobs/{job_id}: returns status, events so far, and speak (an empty list for now; Step A3 fills it).

Add a CLI: python -m backend.perception.pipeline footage/hike1.mp4 --job hike1 that does the same thing without the server and prints a summary table (clip, hazards count, top hazard, latency).

Run it on the full footage/hike1.mp4 and show me the summary. Tell me the total cost estimate from token usage in the log. Commit as "offline perception pipeline".
```

**Done when**: `backend/data/jobs/hike1.json` exists with one `ClipEvent` per clip. Share it with App/Voice immediately; it is their replay input.

---

## Step A3: smoothing, live clip endpoint, describe

**Prompt A3**

```
Read docs/shared-context.md. Build the smoothing layer that decides what gets spoken, then the live endpoints.

backend/perception/smoothing.py:
- class Smoother with method push(event: ClipEvent) -> list[SpeakEvent]. Keep per-session state in memory.
- Rules:
  1. Severity 3 hazards produce a SpeakEvent immediately with priority 3, earcon "stop", haptic "long".
  2. Severity 1 and 2 hazards must appear in two consecutive ClipEvents (same type, any direction) before they are spoken. Priority equals severity, earcon "note" for 1 and "caution" for 2, haptic "short" for 1 and "double" for 2.
  3. The same hazard type is not spoken again within 20 seconds unless its distance bucket got closer (far to mid, mid to near), in which case speak it again with priority bumped by 1 (max 3).
  4. trail_state "fork" produces a SpeakEvent "Fork ahead" with earcon "fork", priority 2, once per 30 seconds.
  5. At most one SpeakEvent per ClipEvent; pick the highest priority, tie-break by nearest distance.
  6. Clear the 20 second memory if no hazards of that type appear for 60 seconds.
- Make the thresholds constants at the top of the file so we can tune them easily.

Then:
- Update GET /api/jobs/{job_id} to return speak = Smoother run over the events in order, with t = t_start + 0.4.
- POST /api/clip: multipart clip + session_id, runs analyze_clip then Smoother.push for that session, returns {"event", "speak"}. Store the last 10 ClipEvents per session in memory and in backend/data/sessions/<session_id>.json.
- GET /api/session/{session_id}/hazards: last 3 ClipEvents.
- POST /api/describe: multipart clip + session_id, same model call but with the user message "Describe this scene in two sentences for a blind hiker, mentioning the trail direction and any landmarks. Then list hazards." Return scene and hazards.

Write backend/tests/test_smoothing.py with cases for each rule using hand-written ClipEvents. Run tests, run the hike1 job through the smoother and print the resulting SpeakEvents with timestamps. Commit as "smoothing and live endpoints".
```

**Done when**: the hike1 job yields a short, sensible list of `SpeakEvent`s (expect roughly 1 every 15 to 30 s on a typical trail; if it is chattier, raise the persistence rule or the repeat window).

---

## Step A4: integration

Join the full-run session in [`integration-and-demo.md`](./integration-and-demo.md). Your job during integration is to watch the backend logs, fix any schema mismatch quickly, and note every hazard Mk1 missed or invented on the real footage. That list drives Step A5.

---

## Step A5: prompt tuning on real footage

**Prompt A5**

```
Read docs/shared-context.md and backend/data/logs/mk1.jsonl. Here is what went wrong on the real hike footage during integration:

<paste your list: e.g. "clip_0007 to clip_0009: called a shadow a drop_off", "clip_0021: missed the root step that tripped the tester", "says 'ahead' when direction is 11">

Improve backend/perception/mk1.py:
1. Add few-shot guidance to the system prompt describing what each hazard type looks like from a chest camera on a BC forest trail, and explicit negatives (shadows, puddles that are not water crossings, trail edges with vegetation are not drop-offs unless there is visible height change).
2. Add a second-pass check: if a severity 3 hazard is returned, re-ask with the question "Confirm: is <type> within 2 metres and directly in the walking path? Answer yes or no." Downgrade to severity 2 on no. Only do this for severity 3 so latency stays low.
3. Make the direction mapping explicit: tell the model the frame is divided into five vertical bands and which band maps to which clock value.
Re-run the hike1 job and show me a before and after diff of the hazard list per clip. Commit as "prompt tuning v2".
```

**Stretch, only if someone has a GPU laptop and this step finished early**

```
Install the perceptron package and load PerceptronAI/Isaac-0.2-1B from Hugging Face. Write backend/perception/isaac_reflex.py with trail_edge(frame) that asks the model to point at the left and right edges of the walkable trail and the nearest obstacle, returning normalised x positions. Add a POST /api/frame endpoint that returns {"trail_center_x": 0.0 to 1.0, "obstacle_x": null or 0.0 to 1.0}. Benchmark latency on 10 frames. If it is under 300 ms, tell App/Voice so they can draw a guidance arrow; if not, leave it as a demo-only script.
```

---

## Step A6: pre-brief

**Prompt A6**

```
Read docs/shared-context.md. Safety/Nav exposes GET /api/trail/{trail_id}/brief with distance, elevation gain and the steepest segment from the GPX. Extend backend/perception/prebrief.py so that, given a job's events.json, it appends a hazard summary to that brief: count of hazards by type and the approximate time or distance of each severity 3 event. Output one short paragraph (under 60 words) suitable for Grok to read aloud before the hike starts. Add a test with the hike1 job and commit.
```

---

## Step A7: rehearsal

Keep the backend running through ngrok, watch logs, tune the constants in `smoothing.py` live between rehearsal runs. Record the final `events.json` and `speak` list into `demo/` so the demo does not depend on a live model call.
