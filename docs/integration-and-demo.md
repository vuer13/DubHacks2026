# Integration checkpoints and demo

## Kickoff sync

- Backend boots, frontend shows green health dot, footage recording underway.
- Confirm everyone has read [`shared-context.md`](./shared-context.md). Treat the schema as frozen unless everyone agrees to change it.
- Agree on one shared session_id for testing: `demo`.

## Mid-build handoffs

- Perception gives App/Voice `backend/data/jobs/hike1.json` (events and, soon, speak).
- Safety/Nav gives Perception the OpenRouter client to reuse for fall confirmation.
- App/Voice confirms `/api/jobs/hike1` loads in the app.

## Integration: the full run

Run in this order. Everyone at one table, backend logs on one screen, the phone on another.

1. Start the backend through ngrok, start the frontend, open on the phone.
2. Tap mic, say "hello", Grok replies. Pre-brief plays.
3. "Use demo hike", play. Watch for: earcons before speech, priority 3 interrupting, no repeated warnings, event log filling.
4. Mid-hike, ask by voice: "what's ahead?", "describe what you see", "where am I?". Each should answer in two sentences or fewer.
5. Open the share page on a laptop; confirm the pin moves if you walk the phone around the room with geolocation on.
6. Play `stumble.mp4`: nothing should fire. Play `fall.mp4`: check-in starts, countdown shows, stay silent, SMS arrives, share page shows the red banner. Replay `fall.mp4` and this time say "I'm fine" during the countdown: it cancels.
7. Write down every failure in `demo/ISSUES.md` with an owner. Fix the top five before moving on. Anything else is cut or stubbed.

Exit criteria: steps 2 to 6 work end to end at least once without a manual intervention. If they do not, drop live mode (Step B5) and spend more time here instead.

## Rehearsal

Three full runs of the demo script below, each timed. Between runs, only tune constants (smoothing thresholds, fall ratios, earcon volume). No new features. Record the best run as a backup video.

## Demo script (target about 3:30)

| Time | Who | What happens |
|---|---|---|
| 0:00 | App/Voice | One sentence on the problem: blind and low-vision hikers depend on a sighted guide; we want to give them an independent one. |
| 0:15 | App/Voice | Phone on the projector. Tap mic. Pre-brief plays. "This hike is 2.1 km..." |
| 0:30 | App/Voice | Play hike1. First note-level warning ("Roots ahead"). Point at the event log. |
| 0:50 | App/Voice | Fork: "Fork ahead", chime. Ask "which way?" and Grok answers from the trail brief. |
| 1:15 | App/Voice | Drop-off moment: stop earcon, "Drop-off, left, stop", long vibration, cuts off any speech. |
| 1:40 | App/Voice | Ask "describe what you see". Grok reads the scene. |
| 2:00 | Safety/Nav | Switch to stumble clip: show nothing fires. Say why: three signals, two required. |
| 2:20 | Safety/Nav | Fall clip: check-in starts, countdown, silence, SMS lands on the second phone, share page goes red. |
| 2:50 | Safety/Nav | Replay, answer "I'm fine", it cancels. |
| 3:05 | Perception | What is real vs stubbed, latency numbers, cost per hour of hiking from the Mk1 logs, and the community hazard map vision. |
| 3:30 | all | Questions. |

## Pitch deck (7 slides, App/Voice builds)

1. The problem, with a quote from a visually impaired hiker if you managed to talk to one, otherwise a stat on outdoor access.
2. What TrailSense does, in three lines: sees, speaks, protects.
3. Architecture: phone, FastAPI, Mk1, Grok, Twilio. One diagram.
4. Perception: hazard taxonomy, the JSON schema, the smoothing rules.
5. Fall detection: the three-signal rule and the voice gate.
6. Honest status: what runs live, what is replayed, measured latency and cost.
7. Next: community hazard map, companion mode, any body camera as an input, SAR partnership.

## What to say when asked hard questions

- "Is the detection real time?" Two to four seconds behind. It is a hazard-awareness aid that complements a cane or guide, not a replacement.
- "How do you avoid false fall alarms?" Three signals, two required, and the hiker always gets 20 seconds to say they are fine.
- "Why Mk1 and not a generic VLM?" Video input, structured output, and cost low enough to call every three seconds for a whole hike.
- "What about offline?" Not in the first version. The fall check-in and SOS path is the first thing to move on-device.
- "Did you test with actual users?" Answer honestly. If you did not, say what you would test first and with whom.
