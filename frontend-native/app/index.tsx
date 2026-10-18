import { StyleSheet, Text, View } from "react-native";

import { getSessionId } from "@/lib/session";
import { READY_TEXT } from "@/lib/ui/state";
import { colors, space, type } from "@/theme/tokens";

/** Phase 1 placeholder: proves tokens and shared logic load. Phase 2 replaces it with the hiker screen. */
export default function HikerScreenPlaceholder() {
  return (
    <View style={styles.root}>
      <Text style={styles.brand}>TrailSense</Text>
      <Text accessibilityRole="header" style={styles.hero}>
        {READY_TEXT}
      </Text>
      <Text style={styles.meta}>Session {getSessionId()}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: "center", gap: space[6], paddingHorizontal: space[4], backgroundColor: colors.bg },
  brand: { ...type.secondary, fontWeight: "600", color: colors.textMuted },
  hero: { ...type.hero, color: colors.text },
  meta: { ...type.meta, color: colors.textMuted },
});
