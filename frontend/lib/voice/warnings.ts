import { isSameSign } from "@/lib/signReadout";
import { createAudioPlayer, setAudioModeAsync } from "expo-audio";
import { File, Paths } from "expo-file-system";
import { fetch as expoFetch } from "expo/fetch";
import * as DeviceSpeech from "expo-speech";

const backendUrl = process.env.EXPO_PUBLIC_BACKEND_URL ?? "http://localhost:8000";
type Player = ReturnType<typeof createAudioPlayer>;
type SignOptions = {
  fingerprint: string;
  isCurrent: () => boolean;
  canStart: () => boolean;
  onStart: () => void;
};

let generation = 0;
let mode: "warning" | "sign" | null = null;
let activeSignFingerprint: string | null = null;
let player: Player | null = null;
let file: File | null = null;
let subscription: { remove: () => void } | null = null;
let controller: AbortController | null = null;
let cancelPlayback: (() => void) | null = null;
let stopped: Promise<void> = Promise.resolve();
let loggedFallback = false;

function releaseAudio(): void {
  subscription?.remove();
  subscription = null;
  player?.remove();
  player = null;
  if (file?.exists) file.delete();
  file = null;
}

export function stopWarningSpeech(): void {
  generation += 1;
  mode = null;
  activeSignFingerprint = null;
  controller?.abort();
  controller = null;
  const cancel = cancelPlayback;
  cancelPlayback = null;
  cancel?.();
  releaseAudio();
  stopped = DeviceSpeech.stop().catch(() => undefined);
}

async function playText(
  text: string,
  token: number,
  allowed: () => boolean,
  onStart: () => void,
): Promise<boolean> {
  const current = () => token === generation && allowed();
  const request = new AbortController();
  controller = request;
  const timeout = setTimeout(() => request.abort(), 20_000);

  try {
    const response = await expoFetch(backendUrl + "/api/voice/tts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
      signal: request.signal,
    });
    if (!response.ok) throw new Error("TTS unavailable");
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (!current()) return false;

    const audioFile = new File(
      Paths.cache, `sign-speech-${token}-${Date.now()}.mp3`,
    );
    file = audioFile;
    audioFile.create({ intermediates: true, overwrite: true });
    audioFile.write(bytes);
    await setAudioModeAsync({
      playsInSilentMode: true,
      interruptionMode: "doNotMix",
    });
    if (!current()) {
      if (audioFile.exists) audioFile.delete();
      return false;
    }

    return await new Promise<boolean>((resolve, reject) => {
      let settled = false;
      let started = false;
      const cancel = () => finish(false);
      const finish = (completed: boolean, error?: Error) => {
        if (settled) return;
        settled = true;
        if (cancelPlayback === cancel) cancelPlayback = null;
        if (token === generation) releaseAudio();
        if (error) reject(error);
        else resolve(completed);
      };
      cancelPlayback = cancel;
      const audioPlayer = createAudioPlayer(audioFile.uri, {
        updateInterval: 100,
      });
      player = audioPlayer;
      subscription = audioPlayer.addListener(
        "playbackStatusUpdate",
        (status) => {
          if (!current()) {
            finish(false);
          } else if (status.error) {
            finish(false, new Error(String(status.error)));
          } else {
            if (status.playing && !started) {
              started = true;
              onStart();
            }
            if (status.didJustFinish) finish(true);
          }
        },
      );
      audioPlayer.play();
    });
  } catch (error) {
    if (!current()) return false;
    releaseAudio();
    if (!loggedFallback) {
      console.warn("Using device speech.", error);
      loggedFallback = true;
    }

    return await new Promise<boolean>((resolve) => {
      let settled = false;
      const cancel = () => finish(false);
      const finish = (completed: boolean) => {
        if (settled) return;
        settled = true;
        if (cancelPlayback === cancel) cancelPlayback = null;
        resolve(completed);
      };
      cancelPlayback = cancel;
      try {
        DeviceSpeech.speak(text, {
          rate: 0.92,
          onStart: () => {
            if (current()) onStart();
            else {
              if (token === generation) void DeviceSpeech.stop();
              finish(false);
            }
          },
          onDone: () => finish(current()),
          onStopped: () => finish(false),
          onError: () => finish(false),
        });
      } catch {
        finish(false);
      }
    });
  } finally {
    clearTimeout(timeout);
    if (controller === request) controller = null;
  }
}

export async function speakWarning(text: string): Promise<void> {
  stopWarningSpeech();
  const token = generation;
  mode = "warning";
  try {
    await stopped;
    if (token === generation) {
      await playText(text, token, () => true, () => undefined);
    }
  } finally {
    if (token === generation) mode = null;
  }
}


async function playSignText(
  text: string,
  token: number,
  allowed: () => boolean,
  onStart: () => void,
): Promise<boolean> {
  const current = () => token === generation && allowed();
  if (!current()) return false;

  return await new Promise<boolean>((resolve) => {
    let settled = false;
    const cancel = () => finish(false);
    const finish = (completed: boolean) => {
      if (settled) return;
      settled = true;
      if (cancelPlayback === cancel) cancelPlayback = null;
      resolve(completed);
    };
    cancelPlayback = cancel;

    try {
      DeviceSpeech.speak(text, {
        rate: 0.92,
        onStart: () => {
          if (current()) onStart();
          else finish(false);
        },
        onDone: () => finish(current()),
        onStopped: () => finish(false),
        onError: () => finish(false),
      });
    } catch {
      finish(false);
    }
  });
}

export async function speakSign(
  chunks: string[],
  options: SignOptions,
): Promise<boolean> {
  if (
    mode === "warning" ||
    (mode === "sign" && (activeSignFingerprint !== null && isSameSign(activeSignFingerprint, options.fingerprint))) ||
    !options.isCurrent() ||
    !options.canStart()
  ) {
    return false;
  }
  if (mode === "sign") stopWarningSpeech();

  const token = ++generation;
  mode = "sign";
  activeSignFingerprint = options.fingerprint;
  let started = false;
  const allowed = () =>
    options.isCurrent() && (started || options.canStart());

  try {
    await stopped;
    for (const chunk of chunks) {
      if (token !== generation || !allowed()) return false;
      const completed = await playSignText(chunk, token, allowed, () => {
        if (!started) {
          started = true;
          options.onStart();
        }
      });
      if (!completed) return false;
    }
    return token === generation && options.isCurrent();
  } finally {
    if (token === generation) {
      mode = null;
      activeSignFingerprint = null;
    }
  }
}
