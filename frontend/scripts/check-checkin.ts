/**
 * Proves the fall check-in and SOS logic without a phone: the reducer in
 * lib/checkin.ts, the location fallback in lib/sosLocation.ts, the dev fake
 * SOS client and the SOS Zod schemas.
 *
 * Run: npm run check:checkin
 */
import assert from "node:assert/strict";

import * as checkin from "@/lib/checkin";
import {
  CHECKIN_SECONDS,
  checkinAnnouncement,
  checkinReducer,
  checkinScreen,
  initialCheckinState,
  safetyEventToAction,
  sosBannerText,
  type CheckinAction,
  type CheckinState,
} from "@/lib/checkin";
import { SosCancelResponseSchema, SosRequestSchema, SosResponseSchema } from "@/lib/schema";
import { createFakeSosClient } from "@/lib/sosClient";
import { DEFAULT_DEMO_LOCATION, parseDemoLocation, resolveSosLocation, type Coords } from "@/lib/sosLocation";

let passed = 0;
async function check(name: string, run: () => void | Promise<void>): Promise<void> {
  try {
    await run();
    passed += 1;
    console.log(`ok   ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    throw error;
  }
}

function apply(state: CheckinState, ...actions: CheckinAction[]): CheckinState {
  return actions.reduce(checkinReducer, state);
}

/** Ticks n times and counts how many SOS attempts started, the way the hook would see them. */
function tickAndCountSends(state: CheckinState, ticks: number): { state: CheckinState; sends: number } {
  let sends = 0;
  let current = state;
  for (let i = 0; i < ticks; i += 1) {
    const next = checkinReducer(current, { type: "tick" });
    if (next.sosStatus === "sending" && next.sosAttempt !== current.sosAttempt) sends += 1;
    current = next;
  }
  return { state: current, sends };
}

const devFake: CheckinAction = { type: "start", trigger: "dev", sosMode: "fake" };
const at = Date.UTC(2026, 9, 18, 21, 14);

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main(): Promise<void> {
  // ------------------------------------------------------------- reducer
  await check("countdown length is one constant, 20 seconds by default", () => {
    assert.equal(CHECKIN_SECONDS, 20);
    const started = apply(initialCheckinState, devFake);
    assert.equal(started.phase, "counting");
    assert.equal(started.countdownSeconds, CHECKIN_SECONDS);
    assert.equal(checkinScreen(started), "counting");
  });

  await check("a full countdown reaches sos_sent exactly once, even with extra ticks", () => {
    const started = apply(initialCheckinState, devFake);
    const almost = tickAndCountSends(started, CHECKIN_SECONDS - 1);
    assert.equal(almost.state.phase, "counting");
    assert.equal(almost.state.countdownSeconds, 1);
    assert.equal(almost.sends, 0);

    const done = tickAndCountSends(almost.state, 10);
    assert.equal(done.sends, 1, "one SOS attempt, no matter how many ticks arrive late");
    assert.equal(done.state.phase, "sos_sent");
    assert.equal(done.state.sosStatus, "sending");
    assert.equal(done.state.sosAttempt, 1);
    assert.equal(checkinScreen(done.state), "sos_sending");
  });

  await check("a second start during the countdown does not restart it", () => {
    const counting = apply(initialCheckinState, devFake, { type: "tick" }, { type: "tick" });
    const again = checkinReducer(counting, { type: "start", trigger: "fall", sosMode: "real" });
    assert.equal(again, counting);
  });

  await check("cancel during counting reaches cancelled with no SOS, then clears", () => {
    const counting = apply(initialCheckinState, devFake, { type: "tick" }, { type: "tick" });
    const cancelled = checkinReducer(counting, { type: "cancel" });
    assert.equal(cancelled.phase, "cancelled");
    assert.equal(cancelled.sosStatus, null);
    assert.equal(cancelled.sosAttempt, 0);
    assert.equal(checkinScreen(cancelled), "cancelled");
    assert.equal(checkinAnnouncement(cancelled), checkin.CANCELLED_TEXT);

    const afterTicks = tickAndCountSends(cancelled, CHECKIN_SECONDS + 5);
    assert.equal(afterTicks.sends, 0, "ticks after a cancel never send");
    const cleared = checkinReducer(afterTicks.state, { type: "cancelledCleared" });
    assert.equal(cleared.phase, "none");
    assert.equal(checkinScreen(cleared), "none");
  });

  await check("a failed send moves to failed, a retry keeps the failed screen, a later success moves to sent", () => {
    const sending = tickAndCountSends(apply(initialCheckinState, devFake), CHECKIN_SECONDS).state;
    const failed = checkinReducer(sending, { type: "sosFailed", error: "Network request failed", attempt: 1 });
    assert.equal(failed.sosStatus, "failed");
    assert.equal(failed.sosError, "Network request failed");
    assert.equal(checkinScreen(failed), "sos_failed");

    const retrying = checkinReducer(failed, { type: "sosSending" });
    assert.equal(retrying.sosStatus, "sending");
    assert.equal(retrying.sosAttempt, 2);
    assert.equal(checkinScreen(retrying), "sos_failed", "still trying, so the failed screen stays up");

    const stale = checkinReducer(retrying, { type: "sosFailed", error: "old", attempt: 1 });
    assert.equal(stale, retrying, "results from an old attempt are ignored");

    const sent = checkinReducer(retrying, { type: "sosSent", at, attempt: 2 });
    assert.equal(sent.phase, "sos_sent");
    assert.equal(sent.sosStatus, "sent");
    assert.equal(sent.sosSentAt, at);
    assert.equal(sent.sosError, null);
    assert.equal(checkinScreen(sent), "sos_banner");
    assert.match(sosBannerText(sent), /^Help contacted at \d{1,2}:\d{2} (am|pm)$/);

    const duplicate = checkinReducer(sent, { type: "sosSent", at: at + 5000, attempt: 2 });
    assert.equal(duplicate, sent, "a second success does not restamp the time");
  });

  await check("sosSending only retries from failed", () => {
    const sending = tickAndCountSends(apply(initialCheckinState, devFake), CHECKIN_SECONDS).state;
    assert.equal(checkinReducer(sending, { type: "sosSending" }), sending);
    assert.equal(checkinReducer(initialCheckinState, { type: "sosSending" }), initialCheckinState);
  });

  await check("the hiker can stop a failing SOS; a late success for that attempt still shows the banner", () => {
    const sending = tickAndCountSends(apply(initialCheckinState, devFake), CHECKIN_SECONDS).state;
    const failed = checkinReducer(sending, { type: "sosFailed", error: "timeout", attempt: 1 });
    const stopped = checkinReducer(failed, { type: "cancel" });
    assert.equal(stopped.phase, "cancelled");
    assert.equal(stopped.sosStatus, null);
    assert.equal(checkinReducer(stopped, { type: "sosSending" }), stopped, "no retry after a cancel");

    const stoppedWhileSending = checkinReducer(sending, { type: "cancel" });
    const late = checkinReducer(stoppedWhileSending, { type: "sosSent", at, attempt: 1 });
    assert.equal(late.sosStatus, "sent", "the call really went out, so the banner must say so");
  });

  await check("cancel does nothing once the SOS is sent; a new check-in never interrupts it", () => {
    const sent = apply(
      tickAndCountSends(apply(initialCheckinState, devFake), CHECKIN_SECONDS).state,
      { type: "sosSent", at, attempt: 1 },
    );
    assert.equal(checkinReducer(sent, { type: "cancel" }), sent);
    assert.equal(checkinReducer(sent, { type: "start", trigger: "fall", sosMode: "real" }), sent);
  });

  await check("cancelSos clears the banner; a failed cancel keeps it and retries", () => {
    const sent = apply(
      tickAndCountSends(apply(initialCheckinState, devFake), CHECKIN_SECONDS).state,
      { type: "sosSent", at, attempt: 1 },
    );
    const cancelling = checkinReducer(sent, { type: "cancelSos" });
    assert.equal(cancelling.cancelSosStatus, "cancelling");
    assert.equal(cancelling.cancelSosAttempt, 1);
    assert.equal(checkinReducer(cancelling, { type: "cancelSos" }), cancelling, "no double cancel request");

    const cancelFailed = checkinReducer(cancelling, { type: "cancelSosFailed", error: "offline", attempt: 1 });
    assert.equal(cancelFailed.cancelSosStatus, "failed");
    assert.equal(checkinScreen(cancelFailed), "sos_banner", "banner stays up");
    assert.equal(checkinAnnouncement(cancelFailed), checkin.CANCEL_SOS_FAILED_TEXT);

    const retry = checkinReducer(cancelFailed, { type: "cancelSos" });
    assert.equal(retry.cancelSosStatus, "cancelling");
    assert.equal(retry.cancelSosAttempt, 2);
    assert.equal(retry.cancelSosError, "offline", "keeps showing 'Could not cancel' while retrying");

    const confirmed = checkinReducer(retry, { type: "cancelSosConfirmed", recalled: true, attempt: 2 });
    assert.equal(confirmed.cancelSosStatus, "done");
    assert.equal(sosBannerText(confirmed), checkin.SOS_CANCELLED_TEXT);

    const cleared = checkinReducer(confirmed, { type: "cancelSosCleared" });
    assert.equal(cleared.phase, "none");
    assert.equal(cleared.sosSentAt, null);
    assert.equal(checkinScreen(cleared), "none");
  });

  await check("a cancel the backend could not recall says the contact was already called", () => {
    const sent = apply(
      tickAndCountSends(apply(initialCheckinState, devFake), CHECKIN_SECONDS).state,
      { type: "sosSent", at, attempt: 1 },
      { type: "cancelSos" },
      { type: "cancelSosConfirmed", recalled: false, attempt: 1 },
    );
    assert.equal(sosBannerText(sent), checkin.SOS_CANCELLED_ALREADY_CALLED_TEXT);
  });

  await check("safety events map to actions", () => {
    assert.deepEqual(safetyEventToAction({ type: "fall_checkin_started", t: 213, timeout_s: 20 }, at), {
      type: "start",
      trigger: "fall",
      sosMode: "real",
      seconds: 20,
    });
    assert.deepEqual(safetyEventToAction({ type: "fall_cancelled", t: 219, by: "voice" }, at), { type: "cancel" });
    assert.deepEqual(
      safetyEventToAction({ type: "sos_sent", t: 233, to: "+15550000000", lat: 49.3, lng: -123.1 }, at),
      { type: "sosSent", at },
    );
    assert.equal(
      safetyEventToAction(
        { type: "fall_suspected", t: 212, signals: { motion_spike: true, static_after: true, vlm: "yes" }, confidence: 0.86 },
        at,
      ),
      null,
    );
    const viaEvents = apply(initialCheckinState, { type: "start", trigger: "fall", sosMode: "real", seconds: 20 }, { type: "sosSent", at });
    assert.equal(viaEvents.sosStatus, "sent");
  });

  await check("no em dashes in user-facing check-in text", () => {
    for (const [name, value] of Object.entries(checkin)) {
      if (typeof value === "string") assert.ok(!value.includes("—"), `${name} contains an em dash`);
    }
  });

  // ------------------------------------------------------- location fallback
  const live: Coords = { lat: 49.32, lng: -123.02 };
  const last: Coords = { lat: 49.31, lng: -123.05 };
  const demo: Coords = { lat: 49.3, lng: -123.1 };

  await check("location: a fresh fix within the timeout wins", async () => {
    const result = await resolveSosLocation({
      getFresh: async () => live,
      getLastKnown: async () => last,
      demo,
      freshTimeoutMs: 50,
    });
    assert.deepEqual(result, { ...live, source: "live" });
  });

  await check("location: a slow fresh fix falls back to the last known one", async () => {
    const result = await resolveSosLocation({
      getFresh: async () => {
        await wait(80);
        return live;
      },
      getLastKnown: async () => last,
      demo,
      freshTimeoutMs: 20,
    });
    assert.deepEqual(result, { ...last, source: "last_known" });
  });

  await check("location: errors and empty fixes fall back to the demo point", async () => {
    const result = await resolveSosLocation({
      getFresh: async () => {
        throw new Error("permission denied");
      },
      getLastKnown: async () => null,
      demo,
      freshTimeoutMs: 20,
    });
    assert.deepEqual(result, { ...demo, source: "demo" });
  });

  await check("location: invalid coordinates are skipped", async () => {
    const result = await resolveSosLocation({
      getFresh: async () => ({ lat: Number.NaN, lng: 0 }),
      getLastKnown: async () => ({ lat: 120, lng: 0 }),
      demo,
      freshTimeoutMs: 20,
    });
    assert.equal(result.source, "demo");
  });

  await check("location: demo env strings parse, with a built-in default", () => {
    assert.deepEqual(parseDemoLocation("49.3439", "-123.0175"), { lat: 49.3439, lng: -123.0175 });
    assert.deepEqual(parseDemoLocation(undefined, undefined), DEFAULT_DEMO_LOCATION);
    assert.deepEqual(parseDemoLocation("", "-123"), DEFAULT_DEMO_LOCATION);
    assert.deepEqual(parseDemoLocation("north", "-123"), DEFAULT_DEMO_LOCATION);
    assert.deepEqual(parseDemoLocation("95", "-123"), DEFAULT_DEMO_LOCATION);
  });

  // ------------------------------------------------------- client and schemas
  await check("fake SOS client waits, then succeeds for send and cancel", async () => {
    const fake = createFakeSosClient(10);
    const startedAt = Date.now();
    const sent = await fake.send({ session_id: "demo", reason: "TEST ONLY: check", lat: 49.3, lng: -123.1, recent_events: [] });
    assert.ok(Date.now() - startedAt >= 9);
    assert.equal(sent.sent, true);
    assert.deepEqual(await fake.cancel("demo"), { cancelled: true });
  });

  await check("SOS schemas mirror the backend models", () => {
    assert.ok(SosRequestSchema.safeParse({ session_id: "demo", reason: "r", lat: 49.3, lng: -123.1, recent_events: [] }).success);
    assert.ok(!SosRequestSchema.safeParse({ session_id: "", reason: "r", lat: 49.3, lng: -123.1, recent_events: [] }).success);
    assert.ok(!SosRequestSchema.safeParse({ session_id: "demo", reason: "r", lat: 91, lng: 0, recent_events: [] }).success);
    assert.ok(!SosRequestSchema.safeParse({ session_id: "demo", reason: "r", lat: 0, lng: 0 }).success);
    assert.ok(SosResponseSchema.safeParse({ sent: true, to: "+15550000000" }).success);
    assert.ok(SosResponseSchema.safeParse({ sent: false, to: null }).success);
    assert.ok(!SosResponseSchema.safeParse({ sent: true, to: null, sid: "CA123" }).success, "extra fields are rejected");
    assert.ok(SosCancelResponseSchema.safeParse({ cancelled: false }).success);
    assert.ok(!SosCancelResponseSchema.safeParse({}).success);
  });

  console.log(`\n${passed} checks passed`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
