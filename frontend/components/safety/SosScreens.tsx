import { Pressable, StyleSheet, Text, View } from "react-native";

import {
  CALL_CONTACT_LABEL,
  CANCEL_SOS_FAILED_TEXT,
  CANCEL_SOS_LABEL,
  SOS_FAILED_TEXT,
  SOS_TEXT,
  type CancelSosStatus,
} from "@/lib/checkin";
import { colors, size, space, type } from "@/theme/tokens";

import { AlertIcon, PhoneIcon } from "./icons";
import { useFocusOnMount } from "./useFocusOnMount";

type SosScreenProps = {
  failed: boolean;
  /** Null hides the call button (EXPO_PUBLIC_EMERGENCY_CONTACT_PHONE not set). */
  contactPhone: string | null;
  onCallContact: () => void;
  onCancel: () => void;
};

/**
 * Full screen while the SOS is being placed, in SOS colours (frame S3 zone).
 * After a failure it adds the retry line, a dialer button and a way to stop.
 */
export function SosScreen({ failed, contactPhone, onCallContact, onCancel }: SosScreenProps) {
  const focusRef = useFocusOnMount();
  const message = failed ? `${SOS_TEXT} ${SOS_FAILED_TEXT}` : SOS_TEXT;
  return (
    <View style={styles.sosRoot} accessibilityRole="alert">
      <View ref={focusRef} accessible accessibilityLabel={`SOS. ${message}`} style={styles.sosMessage}>
        <View style={styles.wordRow}>
          <PhoneIcon size={40} color={colors.sosBg} />
          <Text style={styles.sosWord}>SOS</Text>
        </View>
        <Text accessibilityLiveRegion="assertive" style={styles.sosHero}>
          {SOS_TEXT}
        </Text>
        {failed ? (
          <Text accessibilityLiveRegion="assertive" style={styles.sosFailed}>
            {SOS_FAILED_TEXT}
          </Text>
        ) : null}
      </View>
      {failed ? (
        <View style={styles.sosActions}>
          {contactPhone ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={CALL_CONTACT_LABEL}
              accessibilityHint="Opens the phone dialer with your emergency contact's number."
              onPress={onCallContact}
              style={({ pressed }) => [styles.callButton, pressed && styles.pressed]}
            >
              <PhoneIcon size={28} color={colors.sosFg} />
              <Text style={styles.callButtonText}>{CALL_CONTACT_LABEL}</Text>
            </Pressable>
          ) : null}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={CANCEL_SOS_LABEL}
            accessibilityHint="Stops trying to call for help."
            onPress={onCancel}
            style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressed]}
          >
            <Text style={styles.secondaryButtonText}>{CANCEL_SOS_LABEL}</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

type SosBannerProps = {
  text: string;
  cancelStatus: CancelSosStatus;
  cancelFailed: boolean;
  onCancelSos: () => void;
};

/**
 * Frame S3 top banner: persistent, red, with Cancel SOS as a secondary
 * button. After a confirmed cancel it shows the cancelled text with no button.
 */
export function SosBanner({ text, cancelStatus, cancelFailed, onCancelSos }: SosBannerProps) {
  const focusRef = useFocusOnMount();
  const done = cancelStatus === "done";
  const busy = cancelStatus === "cancelling";
  return (
    <View style={styles.banner} accessibilityRole="alert">
      <View ref={focusRef} accessible accessibilityLabel={text} style={styles.bannerRow}>
        <AlertIcon size={32} color={colors.sev3Fg} />
        <Text accessibilityLiveRegion="assertive" style={styles.bannerText}>
          {text}
        </Text>
      </View>
      {cancelFailed && !done ? (
        <Text accessibilityLiveRegion="assertive" style={styles.bannerNote}>
          {CANCEL_SOS_FAILED_TEXT}
        </Text>
      ) : null}
      {done ? null : (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={CANCEL_SOS_LABEL}
          accessibilityHint="Tells TrailSense you are okay."
          accessibilityState={{ busy, disabled: busy }}
          disabled={busy}
          onPress={onCancelSos}
          style={({ pressed }) => [styles.secondaryButton, (pressed || busy) && styles.pressed]}
        >
          <Text style={styles.secondaryButtonText}>{busy ? "Cancelling" : CANCEL_SOS_LABEL}</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  sosRoot: {
    flex: 1,
    justifyContent: "space-between",
    paddingHorizontal: space[4],
    paddingVertical: space[8],
    backgroundColor: colors.sosFg,
  },
  sosMessage: { flex: 1, justifyContent: "center", gap: space[4] },
  wordRow: { flexDirection: "row", alignItems: "center", gap: space[4] },
  sosWord: { ...type.label, color: colors.sosBg, letterSpacing: 2 },
  sosHero: { ...type.hero, color: colors.sosBg },
  sosFailed: { ...type.heading, color: colors.sosBg },
  sosActions: { gap: space[3] },
  callButton: {
    minHeight: 72,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: space[3],
    paddingHorizontal: space[4],
    borderRadius: size.radiusControl,
    backgroundColor: colors.sosBg,
  },
  callButtonText: { ...type.label, color: colors.sosFg },
  secondaryButton: {
    minHeight: size.touchMin,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: space[4],
    borderRadius: size.radiusControl,
    borderWidth: 3,
    borderColor: colors.textMuted,
    backgroundColor: colors.surface2,
  },
  secondaryButtonText: { ...type.label, color: colors.text },
  pressed: { opacity: 0.78 },
  banner: {
    gap: space[3],
    paddingHorizontal: space[4],
    paddingVertical: space[4],
    backgroundColor: colors.sev3Bg,
  },
  bannerRow: { flexDirection: "row", alignItems: "center", gap: space[3] },
  bannerText: { ...type.label, flex: 1, color: colors.sev3Fg },
  bannerNote: { ...type.secondary, color: colors.sev3Fg },
});
