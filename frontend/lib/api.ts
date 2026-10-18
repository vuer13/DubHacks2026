import { ClipResponseSchema, HealthResponseSchema, type ClipResponse } from "@/lib/schema";

const backendUrl = process.env.EXPO_PUBLIC_BACKEND_URL ?? "http://localhost:8000";

export async function checkBackendHealth(): Promise<boolean> {
  try {
    const response = await fetch(backendUrl + "/health", { cache: "no-store" });
    if (!response.ok) {
      return false;
    }

    const payload: unknown = await response.json();
    const parsed = HealthResponseSchema.safeParse(payload);
    return parsed.success && parsed.data.ok;
  } catch {
    return false;
  }
}

export async function analyzeLiveClip(uri: string, sessionId: string): Promise<ClipResponse> {
  const form = new FormData();
  const isQuickTime = uri.toLowerCase().split("?")[0]?.endsWith(".mov") ?? false;
  const file = {
    uri,
    name: `trail-${Date.now()}.${isQuickTime ? "mov" : "mp4"}`,
    type: isQuickTime ? "video/quicktime" : "video/mp4",
  };
  form.append("clip", file as unknown as Blob);
  form.append("session_id", sessionId);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 90_000);
  try {
    const response = await fetch(backendUrl + "/api/clip", {
      method: "POST",
      body: form,
      signal: controller.signal,
    });
    const payload: unknown = await response.json();
    if (!response.ok) {
      const detail =
        typeof payload === "object" && payload !== null && "detail" in payload && typeof payload.detail === "string"
          ? payload.detail
          : `Clip analysis failed (${response.status})`;
      throw new Error(detail);
    }
    const parsed = ClipResponseSchema.safeParse(payload);
    if (!parsed.success) {
      throw new Error("Backend returned an invalid clip response");
    }
    return parsed.data;
  } finally {
    clearTimeout(timeout);
  }
}
