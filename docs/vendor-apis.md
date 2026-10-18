# Vendor API notes: Perceptron Mk1.5 and ElevenLabs

Facts gathered 2026-10-17 from the Perceptron workshop (DubHacks), the Mk1.5 launch post, the Perceptron docs, and the ElevenLabs docs. Verify anything marked "unverified" in the playground or with a probe script before building on it. Sources at the bottom.

## Perceptron Mk1.5

### Endpoint and SDK

- Model ID: `perceptron-mk1.5`. Endpoint: `POST https://api.perceptron.inc/v1/chat/completions`, Bearer `PERCEPTRON_API_KEY`. OpenAI-style chat completions.
- Python: `pip install "perceptron>=0.4.0"`, then `from perceptron import Client, image, video, audio, video_frames`. `Client(api_key=...)`, `client.chat.completions.create(model="perceptron-mk1.5", messages=[...], ...)`.
- `image()`, `video()`, `audio()` accept a local path, bytes, a URL, or an uploaded file ID (Files API, upload once and reuse).
- `video_frames([(image, timestamp_ms), ...])` sends preselected frames as one asset. At least two frames, same dimensions, ascending integer timestamps. Timestamps are kept as given, not rebased, so pass source-video or session timestamps and the answers come back in that clock. This is our default way to send video; see "Passing video" below.
- OpenRouter slug: `perceptron/perceptron-mk1.5`. OpenRouter is a plain chat completions proxy; whether it forwards `vision_config`, `response_format` json_schema, and `regex` is unverified. Treat it as a fallback for plain prompting only.
- Mk1 (`perceptron-mk1`) still exists. Hosted Isaac models (`isaac-0.1`, `isaac-0.2-1b`, `isaac-0.2-2b-preview`) were retired on 2026-09-25 and now return 404 `model_not_found`. Isaac 0.5 mentioned in the workshop Q&A is a robot action model for teleop data; not relevant to us.

### Parameters that matter

| Parameter | Values | Our use |
|---|---|---|
| `reasoning_effort` | `high` (default, slowest), `medium`, `low`, `minimal`, `none` | `low` or `minimal` for running-window hazard calls, `medium` for fall confirmation, `high` for describe and OCR. Replaces Mk1's `vision_config.enable_thinking` |
| `max_completion_tokens` | int, max 8,192 | 512 for hazard JSON, 2048 for describe and OCR, 4096 for tracking |
| `response_format` | `{"type":"json_schema","json_schema":{"name":..., "strict": true, "schema": {...}}}` | Hazard JSON, sign JSON, fall JSON. Build the schema with pydantic `model_json_schema()` and validate with `model_validate_json(..., strict=True)` |
| `regex` | top-level string, e.g. `"yes|no"` | Severity 3 confirmation |
| `vision_config.annotation_format` | `point`, `box`, `polygon`, `clip` | Grounding pass, tracking, clip events |
| `vision_config.enable_audio_in_video` | bool, default false | Fall confirm, optional for water, wildlife, people |
| `tools`, `tool_choice`, `parallel_tool_calls` | OpenAI function-calling format | Not used in the main loop. Cannot be combined with json_schema or regex |
| `stream` | bool | Not needed |

Rules: one output constraint per request. Check `finish_reason == "stop"` before parsing; `"length"` means the budget ran out. Context window 36,864 tokens, so video, prompt, and output must fit together. Audio is about 750 tokens per minute, 16,384 tokens per item. 256 media units per request.

Pricing: $0.15 per million input tokens, $1.50 per million output, $0.0375 per million cached input. Speed from the launch post (single H100, median): image question 0.51 s, 60 s video 9.1 s. Our 6 s windows of about 12 frames should land well under that; measure in Step A1, including tokens per frame from the usage field.

### Passing video: continuous vs batch

Guidance from Perceptron: "For passing data to the model, if you're trying to do continuous monitoring, I'd pass in a running context window of a few seconds. If batching, I'd pass in frames or a contact sheet."

- **Continuous monitoring (live and replay hazards).** Keep a ring buffer of frames per session and send the last few seconds on each analysis tick. Live Expo currently requests analysis every 3 seconds over a 6 s ring buffer, sampling the submitted one-second segments at 2 fps and 480p. Model latency can make real response spacing longer and leave gaps in the ring. Tune against latency and tokens per frame. Do not treat a clean result as proof the trail is safe.
- **Batching (whole-video jobs).** Send `video_frames` with source timestamps at 1 to 2 fps when you need exact times, in segments under 256 media units and the 36,864 token context. For a cheap first scan, send a contact sheet: one image, a grid of thumbnails (for example 4 x 4 at one frame per 2 s, so 32 s per sheet) with each tile's timestamp burned into its corner. The model cannot know tile times on its own, so ask it to answer with tile labels and map them back in code. Then send frames only for the segments the sheet flags.
- **Audio is the exception.** `enable_audio_in_video` only applies to a real video asset. Frames and contact sheets carry no sound, so fall confirmation and the audio experiment send `video()` clips.

### Output formats

Structured JSON lands in `message.content` as a string. Annotations also land in `message.content`, as markup:

```html
<point mention="drop-off edge" asset_idx="0"> (310,760) </point>
<point_box mention="person" asset_idx="0"> (420,100) (570,240) </point_box>
<clip mention="hiker falls" asset_idx="0" t="212.0 seconds 214.5 seconds" />
<track mention="walkable trail" asset_idx="0">
  <point_box t="0.5 seconds"> (300,600) (700,1000) </point_box>
  <point_box t="1.5 seconds"> (320,600) (720,1000) </point_box>
</track>
```

- Coordinates: 0 to 1000 grid, origin top-left, x right, y down, `(500,500)` is the centre. Pixels = value * width / 1000.
- `<clip>` with one timestamp is a moment, with two is a span. `<collection mention="...">` groups several clips.
- `<track>` children all use one geometry type and carry `t` in seconds. Waypoints can be sparse.
- Parse with the SDK: `response.annotations(strict=True)` gives `.points`, `.boxes`, `.clips`, `.tracks`. Do not use an HTML parser; it mangles `<track>`.
- Validate ranges, box ordering, and timestamps. The model can emit nothing when the object is not visible; that is the correct answer, not an error.

### Capability map from the workshop, with our use

| Capability (workshop) | What it is | TrailSense use |
|---|---|---|
| Natural language output | Free text | `scene` description, pre-brief hazard summary |
| JSON schema / regex output | Constrained decoding | Every hazard, sign, and fall result |
| Grounding: points, boxes, polygons | Spatial answer on the frame | Direction and distance from the hazard's point; people and wildlife boxes |
| Object counting, multiple detections in one call | "How many X? Point to each." | Count people or dogs ahead for the `people` hazard say text |
| OCR | Read labels, signage | Trail signs, junction posts, warning signs, distance markers |
| Video clip events | "Clip the exact moment X" | Offline batch: contact sheets find candidate segments in `hike1.mp4`, then `video_frames` at 1 fps give exact times for the demo script and ground truth for `events.json` recall |
| Video tracking | Timestamped geometry across frames | Offline batch of `video_frames` at 2 fps: track the walkable trail for a guidance arrow (stretch) |
| Audio in video | Transcription and environmental sound | Fall confirm hears the impact; water and wildlife get a second signal |
| In-context examples | Pass an image of the thing to find | Stretch: pass a reference photo of a trail marker blaze and ask the model to find the same marker |
| Tool calls (web search, zoom) | Function calling; you implement the tools | Stretch: after OCR reads a trailhead sign, look the trail up and summarise. Web search is not hosted; we would need our own search API |

The smart glasses example Perceptron published (navigation with OCR and web search layered on what the wearer sees) is the pattern we follow: the base perception loop stays simple and fast, and OCR and lookups are tools the hiker can call or the app triggers at a fork.

### Prompting patterns from the docs

- Detection: "Locate each visible <object> with one flat point_box per physical item, asset_idx 0, coordinates normalised to 0-1000. If none is visible, output no annotation." Same for `point`.
- Counting: ask for integer counts per category via json_schema; "count each item once, zero for absent categories".
- OCR: "Transcribe the visible text in reading order. Mark unreadable text as unknown. Do not invent text that is too small or obscured." For fields, json_schema with nullable strings and `additionalProperties: false`, keep numbers as strings.
- Clip events: "Clip every <event>. Use the <clip> tag for each occurrence." with `annotation_format: "clip"`.
- Tracking: "Track the <object> while it is visible. Return a track with mention=\"<object>\" and asset_idx=\"0\". Use point_box children with timestamps in seconds and coordinates normalised to 0-1000. Do not invent positions when it is occluded or off-screen." with `annotation_format: "box"`.
- Playground: perceptron.inc, "Try demo", examples view. Use it to tune prompts before writing code.

## ElevenLabs

### Text to speech (warnings)

- REST stream: `POST https://api.elevenlabs.io/v1/text-to-speech/{voice_id}/stream`, header `xi-api-key`, body `{"text", "model_id", "voice_settings"}`, query `output_format` (`mp3_22050_32` is small and fine for a phone speaker; `pcm_16000` if we want to pipe into Web Audio). Response is the audio byte stream.
- WebSocket stream: `wss://api.elevenlabs.io/v1/text-to-speech/{voice_id}/stream-input?model_id=...`. First message `{"text": " ", "voice_settings": ..., "xi-api-key": ...}`, then `{"text": "Drop-off, left, stop ", "flush": true}`, then `{"text": ""}` to close. Returns base64 audio chunks. Only worth it for live mode if REST latency is a problem.
- Models: `eleven_flash_v2_5` is the lowest latency (about 75 ms). `eleven_multilingual_v2` is the default and slower. Confirm the current list with `GET /v1/models`.
- Voice settings: `stability` 0.5, `similarity_boost` 0.75, `speed` 1.0 are defaults. For warnings try `stability` 0.7 and `speed` 1.1 so the voice is flat and quick.
- Keep the API key on the server. The app calls the backend's `POST /api/voice/tts`, which holds the key and caches the mp3.

### Agent (conversation), web SDK

This is the browser SDK the Next.js app planned to use; kept for reference. The TrailSense app uses the React Native SDK in the next section.


- Use a React Native compatible WebSocket client from the Expo app; do not expose the API key in the app bundle.
- Auth for a private agent: server calls `GET https://api.elevenlabs.io/v1/convai/conversation/get-signed-url?agent_id=...` with `xi-api-key`, gets `{"signed_url": "wss://..."}`, valid 15 minutes. The app connects with the returned signed URL. WebRTC uses a conversation token from the token endpoint instead; WebSocket is enough for us.
- Hook options: `clientTools: { name: async (params) => result }`, `overrides: { agent: { prompt: { prompt }, firstMessage, language }, tts: { voiceId } }`. Overrides must be enabled per field in the agent's Security tab or the session errors.
- Methods: `startSession`, `endSession`, `sendUserMessage(text)` (treated as the hiker speaking, triggers a reply), `sendContextualUpdate(text)` (background info, no reply), `sendUserActivity()` (holds agent speech about 2 s), `setVolume({volume})`, `setMuted`.
- Callbacks: `onMessage` (user transcripts tentative or final, agent replies), `onModeChange` (`speaking` or `listening`), `onStatusChange`, `onError`.
- Client tools: in the dashboard, Tool Type "Client", same `name`, `description`, and parameters as the code. Turn on "Wait for response" so the agent waits for the return value. Names are case-sensitive.
- Interruption: the platform's turn-taking model handles barge-in; when the hiker talks over the agent the agent stops. We do not need our own cancel.

### Agent in React Native (the TrailSense app)

- Packages: `@elevenlabs/react-native` plus its peers `@livekit/react-native`, `@livekit/react-native-webrtc` and `livekit-client`. It connects over WebRTC (LiveKit).
- It does not work in Expo Go; it needs a development build. TrailSense loads it lazily in `frontend/lib/native/voice.ts` and skips it in Expo Go.
- API: wrap the app in `ConversationProvider`, then use `useConversation` (`startSession`, `endSession`, `status`, `isSpeaking`, callbacks `onConnect`, `onDisconnect`, `onMessage`, `onError`). Finer hooks exist, including `useConversationMode`, `useConversationInput` and `useConversationClientTool` for registering client tools.
- Auth for a private agent over WebRTC: the backend calls `GET https://api.elevenlabs.io/v1/convai/conversation/token?agent_id=...` with the API key and returns `{"token", "conversation_id"}`; the app passes the token to `startSession`. The signed URL above is for WebSocket clients.
- Permissions: microphone (iOS `NSMicrophoneUsageDescription`, Android `RECORD_AUDIO`, requested at runtime on Android before a session starts).
- Not stated on the SDK page, to confirm in migration Phase 4 before relying on them: the Expo config plugins to add to `app.json`, the token's lifetime, and whether `sendContextualUpdate`, `sendUserActivity` and overrides exist under those names.

## Sources

- Perceptron workshop transcript (DubHacks 2026) and the smart glasses post: https://x.com/perceptroninc/status/2103508733372330010 (could not be fetched directly; quoted text supplied by the team)
- Mk1.5 launch: https://www.perceptron.inc/blog/introducing-perceptron-mk1-5
- Perceptron docs: https://docs.perceptron.inc/ (video understanding, video tracking, structured outputs, tool calling, image understanding, OCR, object detection, annotations)
- Perceptron prompting reference: https://docs.perceptron.inc/best-practices/prompting-reference
- Isaac retirement and parameter changes: https://www.orcarouter.ai/blog/perceptron-mk1-5-embodied-agents
- OpenRouter listing: https://openrouter.ai/perceptron/perceptron-mk1.5
- ElevenLabs React SDK: https://elevenlabs.io/docs/eleven-agents/libraries/react
- ElevenLabs JavaScript SDK: https://elevenlabs.io/docs/eleven-agents/libraries/java-script
- ElevenLabs React Native SDK: https://elevenlabs.io/docs/eleven-agents/libraries/react-native
- ElevenLabs conversation token (WebRTC): https://elevenlabs.io/docs/eleven-agents/api-reference/conversations/get-webrtc-token
- ElevenLabs agent authentication: https://elevenlabs.io/docs/eleven-agents/customization/authentication
- ElevenLabs client tools: https://elevenlabs.io/docs/eleven-agents/customization/tools/client-tools
- ElevenLabs overrides: https://elevenlabs.io/docs/eleven-agents/customization/personalization/overrides
- ElevenLabs text to speech stream: https://elevenlabs.io/docs/api-reference/text-to-speech/convert-as-stream
- ElevenLabs text to speech WebSocket: https://elevenlabs.io/docs/api-reference/text-to-speech/v-1-text-to-speech-voice-id-stream-input
- ElevenLabs models: https://elevenlabs.io/docs/overview/capabilities/text-to-speech
