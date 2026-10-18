import { fetch as expoFetch } from "expo/fetch";
import { File } from "expo-file-system";
import type { ZodType } from "zod";

import {
  ClipResponseSchema,
  FallCheckResponseSchema,
  type ClipResponse,
  type FallCheckResponse,
} from "@/lib/schema";

const backendUrl = process.env.EXPO_PUBLIC_BACKEND_URL ?? "http://localhost:8000";

export async function analyzeLiveClip(
  uri: string,
  sessionId: string,
  sequence?: number,
): Promise<ClipResponse> {
  const fields = sequence === undefined ? undefined : { sequence: String(sequence) };
  return uploadVideo("/api/clip", uri, sessionId, ClipResponseSchema, fields);
}

export async function checkFallClip(
  uri: string,
  sessionId: string,
  sequence?: number,
): Promise<FallCheckResponse> {
  const fields = sequence === undefined
    ? undefined
    : { windowed: "true", sequence: String(sequence) };
  return uploadVideo("/api/fall/check", uri, sessionId, FallCheckResponseSchema, fields);
}

async function uploadVideo<T>(
  endpoint: string,
  uri: string,
  sessionId: string,
  schema: ZodType<T>,
  fields?: Record<string, string>,
): Promise<T> {
  const form = new FormData();
  // Expo SDK 57's fetch requires a File/Blob part. React Native's older
  // { uri, name, type } FormData shape throws "Unsupported FormDataPart".
  const file = new File(uri);
  form.append("clip", file);
  form.append("session_id", sessionId);
  for (const [name, value] of Object.entries(fields ?? {})) {
    form.append(name, value);
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 90_000);
  try {
    const response = await expoFetch(backendUrl + endpoint, {
      method: "POST",
      body: form,
      signal: controller.signal,
    });
    const payload: unknown = await response.json();
    if (!response.ok) {
      const detail =
        typeof payload === "object" && payload !== null && "detail" in payload && typeof payload.detail === "string"
          ? payload.detail
          : `Video analysis failed (${response.status})`;
      throw new Error(detail);
    }
    const parsed = schema.safeParse(payload);
    if (!parsed.success) {
      throw new Error("Backend returned an invalid video analysis response");
    }
    return parsed.data;
  } finally {
    clearTimeout(timeout);
  }
}
