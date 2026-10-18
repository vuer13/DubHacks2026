# Integration checkpoints and demo

## Kickoff sync

- Backend boots, the app shows a green health dot in Expo Go, footage recording underway.
- App/Voice has the TrailSense development build on the demo phone (the voice agent needs it).
- Confirm everyone has read [`shared-context.md`](./shared-context.md). Treat the schema as frozen unless everyone agrees to change it.
- Agree on one shared session_id for testing: `demo`.

## Mid-build handoffs

- Perception gives App/Voice `backend/data/jobs/hike1.json` (events and, soon, speak).
- Perception gives Safety/Nav `get_client()` from `backend/perception/mk1.py` to reuse for fall confirmation.
- App/Voice runs the speech pre-render script on the real job and commits the mp3s.
- Everyone confirms the 2026-10-17 schema additions (`point`, `sign`, `/api/read_sign`, `read_sign` tool) at this sync.
- App/Voice confirms `/api/jobs/hike1` loads in the app.

## Demo setup

- **Phone:** the TrailSense development build, not Expo Go (the voice agent only runs in the development build). A build signed with a free Apple ID stops opening after 7 days, so rebuild it within a week of the demo; see [`frontend/docs/dev-build.md`](../frontend/docs/dev-build.md).
- **Backend:** reached from the phone through `EXPO_PUBLIC_BACKEND_URL`: the Mac's LAN IP on the same Wi-Fi, or the backend's ngrok https URL if the venue Wi-Fi blocks device-to-device traffic. Test this at the venue before the demo.
- **Share page:** the hosted share site (`EXPO_PUBLIC_SHARE_BASE_URL`), opened on the laptop or the second phone as `<share site>/share/<session_id>`, or by scanning the QR on the idle screen.
- **Projector:** mirror the phone. iPhone: QuickTime Player, New Movie Recording, pick the iPhone over USB. Android: scrcpy over USB.

## Integration: the full run

Run in this order. Everyone at one table, backend logs on one screen, the phone on another.

1. Start the backend (LAN IP or ngrok), run `npm run start:dev` in `frontend/`, and open the TrailSense development build on the phone.
2. Tap mic, say "hello", the agent replies. Pre-brief plays from the pre-rendered file.
3. "Use demo hike", play. Watch for: earcons before speech, priority 3 interrupting the agent mid-sentence, no repeated warnings, the sign readout after "Fork ahead", event log filling. Then turn on airplane mode and replay 30 seconds: warnings must still play.
4. Mid-hike, ask by voice: "what's ahead?", "describe what you see", "read the sign", "where am I?". Each should answer in two sentences or fewer.
5. Open the hosted share page on a laptop; confirm the pin moves if you walk the phone around the room with location on.
6. Play `stumble.mp4`: nothing should fire. Play `fall.mp4`: one positive fall result starts the check-in and countdown. Stay silent; the emergency contact receives a call with the reason and location, and the share page shows the red banner. Replay `fall.mp4` and this time say "I'm fine" during the countdown: it cancels.
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
| 0:50 | App/Voice | Fork: "Fork ahead", chime, then "Sign: Lynn Loop, right, two kilometres" read by OCR. Ask "which way?" and the agent answers from the sign and the trail brief. |
| 1:15 | App/Voice | Drop-off moment: stop earcon, "Drop-off, left, stop", long vibration, cuts off any speech. |
| 1:40 | App/Voice | Ask "describe what you see". The agent reads the scene. |
| 2:00 | Safety/Nav | Switch to stumble clip: show nothing fires. Say why: three signals, two required. |
| 2:20 | Safety/Nav | Fall clip: check-in starts, countdown, silence, emergency contact receives the Twilio voice call, share page goes red. |
| 2:50 | Safety/Nav | Replay, answer "I'm fine", it cancels. |
| 3:05 | Perception | What is real vs stubbed, latency numbers, cost per hour of hiking from the Mk1.5 logs, how the point grounding fixes direction, and the community hazard map vision. |
| 3:30 | all | Questions. |

## Pitch deck (7 slides, App/Voice builds)

1. The problem, with a quote from a visually impaired hiker if you managed to talk to one, otherwise a stat on outdoor access.
2. What TrailSense does, in three lines: sees, speaks, protects.
3. Architecture: phone app (React Native, Expo), web share page, FastAPI, Mk1.5, ElevenLabs (two channels), Twilio. One diagram.
4. Perception: hazard taxonomy, strict JSON schema, point grounding for direction, OCR for signs, the smoothing rules.
5. Fall detection: the three-signal rule and the voice gate.
6. Honest status: what runs live, what is replayed, measured latency and cost.
7. Next: community hazard map, companion mode, any body camera as an input, SAR partnership.

## What to say when asked hard questions

- "Is the detection real time?" Two to four seconds behind. It is a hazard-awareness aid that complements a cane or guide, not a replacement.
- "How do you avoid false fall alarms?" Three signals, two required, and the hiker always gets 20 seconds to say they are fine.
- "Why Mk1.5 and not a generic VLM?" Video input, strict JSON and regex output, pointing on the same model so direction comes from geometry, OCR for signs, trained on first-person video, and cost low enough to call every three seconds for a whole hike.
- "Why not analyse single frames?" Each call sees the last six seconds as a running window, so the model can tell an edge it is walking toward from one it is walking past. Offline jobs over the whole hike use frames or contact sheets instead, which is cheaper when nothing is live.
- "Why not have the voice agent say the warnings?" A warning must never wait on a language model or get paraphrased. Text to speech is verbatim and about 75 ms; the agent is for questions.
- "What about offline?" Not in the first version. The fall check-in and SOS path is the first thing to move on-device.
- "Did you test with actual users?" Answer honestly. If you did not, say what you would test first and with whom.
