import { HealthResponseSchema } from "@/lib/schema";

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
