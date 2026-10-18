import { Linking } from "react-native";

/**
 * The emergency contact's number from EXPO_PUBLIC_EMERGENCY_CONTACT_PHONE,
 * reduced to digits and a leading +, or null when it is not set. Like every
 * EXPO_PUBLIC_ value it is bundled into the app.
 */
export function emergencyContactPhone(): string | null {
  const raw = process.env.EXPO_PUBLIC_EMERGENCY_CONTACT_PHONE ?? "";
  const digits = raw.trim().replace(/(?!^\+)[^\d]/g, "");
  return /\d{3,}/.test(digits) ? digits : null;
}

/** Opens the phone dialer with the number filled in. Resolves false if the device cannot dial. */
export async function openDialer(phone: string): Promise<boolean> {
  try {
    await Linking.openURL(`tel:${phone}`);
    return true;
  } catch {
    return false;
  }
}
