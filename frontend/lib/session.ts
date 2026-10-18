/**
 * Session id for the hiker screen, per Step B3 in docs/app-and-voice.md:
 * generated on page load, kept in sessionStorage, sent with every backend
 * call, and shared as /share/<session_id>. Client-side only.
 */

export const SESSION_STORAGE_KEY = "trailsense.session_id";

function newSessionId(): string {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

/** Returns the tab's session id, creating and storing one on first use. */
export function getSessionId(): string {
  try {
    const existing = window.sessionStorage.getItem(SESSION_STORAGE_KEY);
    if (existing) return existing;
    const created = newSessionId();
    window.sessionStorage.setItem(SESSION_STORAGE_KEY, created);
    return created;
  } catch {
    // Storage can be blocked (private mode, embedded views); fall back to a
    // fresh id for this page load rather than failing.
    return newSessionId();
  }
}

export function sharePath(sessionId: string): string {
  return "/share/" + encodeURIComponent(sessionId);
}
