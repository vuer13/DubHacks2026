/**
 * Where an SOS says the hiker is. Pure, so scripts/check-checkin.ts can drive
 * it with fake sources; lib/native/location.ts plugs in expo-location.
 *
 * Order: a fresh fix if one arrives within FRESH_TIMEOUT_MS, then the last
 * known fix, then the demo location. It never throws and never returns
 * nothing, because a missing location must not block or skip the SOS.
 */

export type Coords = { lat: number; lng: number };
export type LocationSource = "live" | "last_known" | "demo";
export type SosLocation = Coords & { source: LocationSource };

export type LocationSources = {
  getFresh: () => Promise<Coords | null>;
  getLastKnown: () => Promise<Coords | null>;
  demo: Coords;
  freshTimeoutMs?: number;
};

export const FRESH_TIMEOUT_MS = 5000;
/** Used when EXPO_PUBLIC_DEMO_LAT / EXPO_PUBLIC_DEMO_LNG are missing or invalid. Same point as the backend curl examples. */
export const DEFAULT_DEMO_LOCATION: Coords = { lat: 49.3, lng: -123.1 };

export function isValidCoords(coords: Coords | null | undefined): coords is Coords {
  return (
    coords != null &&
    Number.isFinite(coords.lat) &&
    Number.isFinite(coords.lng) &&
    coords.lat >= -90 &&
    coords.lat <= 90 &&
    coords.lng >= -180 &&
    coords.lng <= 180
  );
}

/** Reads the demo location from the two env strings, falling back to DEFAULT_DEMO_LOCATION. */
export function parseDemoLocation(lat: string | undefined, lng: string | undefined): Coords {
  if (lat === undefined || lng === undefined || lat.trim() === "" || lng.trim() === "") {
    return DEFAULT_DEMO_LOCATION;
  }
  const coords = { lat: Number(lat), lng: Number(lng) };
  return isValidCoords(coords) ? coords : DEFAULT_DEMO_LOCATION;
}

async function settle(source: () => Promise<Coords | null>): Promise<Coords | null> {
  try {
    const coords = await source();
    return isValidCoords(coords) ? coords : null;
  } catch {
    return null;
  }
}

function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<T>((resolve) => {
    timer = setTimeout(() => resolve(fallback), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

export async function resolveSosLocation(sources: LocationSources): Promise<SosLocation> {
  const fresh = await withTimeout(settle(sources.getFresh), sources.freshTimeoutMs ?? FRESH_TIMEOUT_MS, null);
  if (fresh) return { ...fresh, source: "live" };

  const lastKnown = await settle(sources.getLastKnown);
  if (lastKnown) return { ...lastKnown, source: "last_known" };

  const demo = isValidCoords(sources.demo) ? sources.demo : DEFAULT_DEMO_LOCATION;
  return { ...demo, source: "demo" };
}
