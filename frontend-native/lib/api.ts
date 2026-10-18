/**
 * Typed backend client. Every response is validated with the Zod schemas in
 * lib/schema.ts before use; a failed request or an invalid payload never
 * throws into the UI.
 *
 * EXPO_PUBLIC_BACKEND_URL is inlined at bundle time, so it must be read as
 * process.env.EXPO_PUBLIC_BACKEND_URL exactly (no destructuring). On a phone,
 * localhost is the phone itself: set it to the Mac's LAN IP or an ngrok URL.
 */
import { HealthResponseSchema } from "@/lib/schema";

export const BACKEND_URL = (process.env.EXPO_PUBLIC_BACKEND_URL ?? "http://localhost:8000").replace(/\/+$/, "");

/** Phones on bad networks can hang a fetch for a long time; give up after this. */
export const REQUEST_TIMEOUT_MS = 5000;

async function fetchJson(path: string, init?: RequestInit): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(BACKEND_URL + path, { ...init, signal: controller.signal });
    if (!response.ok) throw new Error("HTTP " + response.status);
    return (await response.json()) as unknown;
  } finally {
    clearTimeout(timer);
  }
}

/** GET /health. Example: curl http://localhost:8000/health */
export async function checkBackendHealth(): Promise<boolean> {
  try {
    const parsed = HealthResponseSchema.safeParse(await fetchJson("/health"));
    return parsed.success && parsed.data.ok;
  } catch {
    return false;
  }
}
