import * as Location from "expo-location";

import { parseDemoLocation, resolveSosLocation, type Coords, type SosLocation } from "@/lib/sosLocation";

/**
 * Asks for foreground location once a check-in starts. Never throws; returns
 * whether permission is granted so callers can log it.
 */
export async function requestLocationPermission(): Promise<boolean> {
  try {
    const current = await Location.getForegroundPermissionsAsync();
    if (current.granted) return true;
    if (!current.canAskAgain) return false;
    const requested = await Location.requestForegroundPermissionsAsync();
    return requested.granted;
  } catch {
    return false;
  }
}

async function hasPermission(): Promise<boolean> {
  try {
    return (await Location.getForegroundPermissionsAsync()).granted;
  } catch {
    return false;
  }
}

function toCoords(position: Location.LocationObject | null): Coords | null {
  return position ? { lat: position.coords.latitude, lng: position.coords.longitude } : null;
}

/** The location sent with an SOS: live, else last known, else the demo point. Logs which one. */
export async function getSosLocation(): Promise<SosLocation> {
  const location = await resolveSosLocation({
    getFresh: async () =>
      (await hasPermission())
        ? toCoords(await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High }))
        : null,
    getLastKnown: async () =>
      (await hasPermission()) ? toCoords(await Location.getLastKnownPositionAsync()) : null,
    // Static property access so Expo inlines the values at build time.
    demo: parseDemoLocation(process.env.EXPO_PUBLIC_DEMO_LAT, process.env.EXPO_PUBLIC_DEMO_LNG),
  });
  console.info(`[sos] location source: ${location.source} (${location.lat.toFixed(5)}, ${location.lng.toFixed(5)})`);
  return location;
}
