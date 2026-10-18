import { Platform, Pressable, StyleSheet, Text, View } from "react-native";

import { CANCELLED_TEXT, CHECKIN_FOOTER_TEXT, CHECKIN_TEXT, spokenSeconds } from "@/lib/checkin";
import { colors, size, space, type } from "@/theme/tokens";

import { CountdownRing } from "./CountdownRing";
import { CheckIcon } from "./icons";
import { useFocusOnMount } from "./useFocusOnMount";

/**
 * Frame S1: the whole screen is one button, so any tap cancels. It takes
 * screen reader focus when it opens.
 */
export function CheckinOverlay({ seconds, total, onCancel }: { seconds: number; total: number; onCancel: () => void }) {
  const focusRef = useFocusOnMount();
  return (
    <View style={styles.root}>
      <Pressable
        ref={focusRef}
        accessibilityRole="button"
        accessibilityLabel={`Fall check-in. ${CHECKIN_TEXT}`}
        accessibilityHint="Double tap to cancel. Help will not be called."
        accessibilityValue={{ text: `${seconds} seconds left` }}
        onPress={onCancel}
        style={styles.button}
      >
        <Text style={styles.hero} adjustsFontSizeToFit minimumFontScale={0.7} numberOfLines={5}>
          {CHECKIN_TEXT}
        </Text>
        <CountdownRing seconds={seconds} total={total} />
        <Text style={styles.footer}>{CHECKIN_FOOTER_TEXT}</Text>
      </Pressable>
      {Platform.OS === "android" ? (
        // TalkBack hears the count every 5 seconds through this live region.
        <View pointerEvents="none" style={styles.srOnly}>
          <Text accessibilityLiveRegion="assertive">{`${spokenSeconds(seconds, total)} seconds left`}</Text>
        </View>
      ) : null}
    </View>
  );
}

/** Frame S2: shown for 3 seconds after a cancel. */
export function CancelledScreen() {
  const focusRef = useFocusOnMount();
  return (
    <View ref={focusRef} style={styles.cancelled} accessible accessibilityLabel={CANCELLED_TEXT}>
      <View style={styles.wordRow}>
        <CheckIcon size={28} color={colors.sev1Fg} />
        <Text style={styles.word}>Cancelled</Text>
      </View>
      <Text accessibilityLiveRegion="assertive" style={styles.cancelledHero}>
        {CANCELLED_TEXT}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.sosFg },
  button: {
    flex: 1,
    minHeight: size.touchMin,
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: space[4],
    paddingTop: space[12],
    paddingBottom: space[8],
    backgroundColor: colors.sosFg,
  },
  hero: { ...type.hero, color: colors.sosBg, textAlign: "center", letterSpacing: -0.8 },
  footer: { ...type.label, color: colors.sosBg, textAlign: "center" },
  srOnly: { position: "absolute", width: 1, height: 1, overflow: "hidden", opacity: 0.01 },
  cancelled: {
    flex: 1,
    justifyContent: "center",
    gap: space[4],
    paddingHorizontal: space[4],
    backgroundColor: colors.sev1Bg,
  },
  wordRow: { flexDirection: "row", alignItems: "center", gap: space[3] },
  word: { ...type.label, color: colors.sev1Fg },
  cancelledHero: { ...type.hero, color: colors.sev1Fg },
});
