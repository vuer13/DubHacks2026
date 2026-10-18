/** Short, non-secret session id used to key in-memory backend state. */
export function createSessionId(): string {
  const randomPart = Math.random().toString(36).slice(2, 10);
  return `${Date.now().toString(36)}-${randomPart}`;
}

export function sharePath(sessionId: string): string {
  return "/share/" + encodeURIComponent(sessionId);
}
