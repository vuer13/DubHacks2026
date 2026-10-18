import { createAudioPlayer, setAudioModeAsync } from "expo-audio";
import { File, Paths } from "expo-file-system";
import { fetch as expoFetch } from "expo/fetch";
import * as DeviceSpeech from "expo-speech";

const backendUrl = process.env.EXPO_PUBLIC_BACKEND_URL ?? "http://localhost:8000";
type WarningPlayer = ReturnType<typeof createAudioPlayer>;

let generation = 0;
let activePlayer: WarningPlayer | null = null;
let activeFile: File | null = null;
let activeSubscription: { remove: () => void } | null = null;
let loggedFallback = false;

function fallbackToDeviceSpeech(text: string, error: unknown): void {
  if (!loggedFallback) {
    console.warn("ElevenLabs warning speech unavailable; using device speech.", error);
    loggedFallback = true;
  }
  DeviceSpeech.speak(text, { rate: 0.92 });
}

function releaseActiveAudio(): void {
  activeSubscription?.remove();
  activeSubscription = null;
  activePlayer?.remove();
  activePlayer = null;
  if (activeFile?.exists) activeFile.delete();
  activeFile = null;
}

/** Stop ElevenLabs playback and any device-speech fallback immediately. */
export function stopWarningSpeech(): void {
  generation += 1;
  void DeviceSpeech.stop();
  releaseActiveAudio();
}

/** Speak a short alert with server-side ElevenLabs TTS, falling back on device. */
export async function speakWarning(text: string): Promise<void> {
  const requestGeneration = ++generation;
  void DeviceSpeech.stop();
  releaseActiveAudio();

  try {
    const response = await expoFetch(`${backendUrl}/api/voice/tts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });
    if (!response.ok) throw new Error(`TTS request failed (${response.status})`);

    const bytes = new Uint8Array(await response.arrayBuffer());
    if (requestGeneration !== generation) return;

    const file = new File(Paths.cache, `trailsense-warning-${Date.now()}.mp3`);
    file.create({ intermediates: true, overwrite: true });
    file.write(bytes);
    await setAudioModeAsync({ playsInSilentMode: true, interruptionMode: "doNotMix" });
    if (requestGeneration !== generation) {
      file.delete();
      return;
    }

    const player = createAudioPlayer(file.uri, { updateInterval: 100 });
    activePlayer = player;
    activeFile = file;
    activeSubscription = player.addListener("playbackStatusUpdate", (status) => {
      if (status.didJustFinish || status.error) {
        if (activePlayer === player) {
          releaseActiveAudio();
          if (status.error && requestGeneration === generation) {
            fallbackToDeviceSpeech(text, status.error);
          }
        }
      }
    });
    player.play();
  } catch (error) {
    if (requestGeneration !== generation) return;
    fallbackToDeviceSpeech(text, error);
  }
}
