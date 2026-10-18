/**
 * Session id per Step B3 in docs/app-and-voice.md: created once when the app
 * starts, kept for the life of the app process, sent with every backend call,
 * and shared as /share/<session_id>. A new launch is a new session.
 *
 * The id is 16 hex characters from a secure random source: the share link
 * shows the hiker's live location, so it must not be guessable.
 */
import { getRandomBytes } from "expo-crypto";

let sessionId: string | null = null;

function newSessionId(): string {
  return Array.from(getRandomBytes(8), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

/** The session id for this app run, created on first use. */
export function getSessionId(): string {
  sessionId ??= newSessionId();
  return sessionId;
}

export function sharePath(id: string): string {
  return "/share/" + encodeURIComponent(id);
}

/** EXPO_PUBLIC_SHARE_BASE_URL is the hosted share site (Phase 5); read exactly like this so Expo inlines it. */
export const SHARE_BASE_URL = (process.env.EXPO_PUBLIC_SHARE_BASE_URL ?? "").replace(/\/+$/, "");

/** Full share link for the QR code, or null when no share site is configured. */
export function shareUrl(id: string): string | null {
  return SHARE_BASE_URL ? SHARE_BASE_URL + sharePath(id) : null;
}
