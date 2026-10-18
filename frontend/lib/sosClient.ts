import type { SosCancelResponse, SosRequest, SosResponse } from "@/lib/schema";

/** The two SOS calls the check-in flow makes, so the dev fake can stand in for the backend. */
export type SosClient = {
  send: (request: SosRequest) => Promise<SosResponse>;
  cancel: (sessionId: string) => Promise<SosCancelResponse>;
};

export const FAKE_SOS_DELAY_MS = 1000;

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Dev only: waits, then reports success. Nobody is contacted. */
export function createFakeSosClient(delayMs: number = FAKE_SOS_DELAY_MS): SosClient {
  return {
    send: async () => {
      await wait(delayMs);
      return { sent: true, to: null };
    },
    cancel: async () => {
      await wait(delayMs);
      return { cancelled: true };
    },
  };
}

export const SOS_REASON_FALL = "No response to fall check-in";
/** The backend reads a reason starting with "TEST ONLY:" as a test call, not an emergency. */
export const SOS_REASON_DEV_TEST = "TEST ONLY: dev check-in with no response";
