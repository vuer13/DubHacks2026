import * as Haptics from "expo-haptics";

const PULSE_GAP_MS = 220;

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Strong, unmistakable pattern for "SOS sent": an error buzz, then three heavy pulses. Never throws. */
export async function playSosHaptic(): Promise<void> {
  try {
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    for (let pulse = 0; pulse < 3; pulse += 1) {
      await wait(PULSE_GAP_MS);
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    }
  } catch {
    // Haptics are a bonus; the screen and speech still announce the SOS.
  }
}
