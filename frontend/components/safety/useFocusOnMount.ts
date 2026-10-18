import { useEffect, useRef } from "react";
import { AccessibilityInfo, type View } from "react-native";

const FOCUS_DELAY_MS = 150;

/** Moves VoiceOver / TalkBack focus to the returned view when it first appears. */
export function useFocusOnMount() {
  const ref = useRef<View>(null);
  useEffect(() => {
    // Wait a frame or two so the native view exists before focusing it.
    const timer = setTimeout(() => {
      if (ref.current) AccessibilityInfo.sendAccessibilityEvent(ref.current, "focus");
    }, FOCUS_DELAY_MS);
    return () => clearTimeout(timer);
  }, []);
  return ref;
}
