import { useLocalSearchParams, useRouter } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

const COLORS = {
  background: "#F4F6F2",
  surface: "#FFFFFF",
  text: "#0B1410",
  muted: "#44534A",
  divider: "#D5DDD6",
  green: "#1B5A38",
};

export default function HikeShareScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ session_id?: string | string[] }>();
  const sessionId = Array.isArray(params.session_id) ? params.session_id[0] : params.session_id;

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.content}>
        <Text style={styles.eyebrow}>TRAILSENSE SAFETY SHARE</Text>
        <Text style={styles.title}>Hike status</Text>
        <Text style={styles.session}>Session {sessionId ?? "not available"}</Text>
        <View accessibilityLiveRegion="polite" style={styles.card}>
          <View style={styles.dot} />
          <View style={styles.cardCopy}>
            <Text style={styles.cardTitle}>Waiting for location</Text>
            <Text style={styles.body}>The live location and recent trail events will appear here.</Text>
          </View>
        </View>
        <Pressable accessibilityRole="button" onPress={() => router.replace("/")} style={styles.button}>
          <Text style={styles.buttonText}>Back to TrailSense</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: COLORS.background },
  content: { flex: 1, padding: 24, justifyContent: "center" },
  eyebrow: { color: COLORS.green, fontSize: 13, letterSpacing: 1.1, fontWeight: "800" },
  title: { color: COLORS.text, fontSize: 34, lineHeight: 40, fontWeight: "800", marginTop: 10 },
  session: { color: COLORS.muted, fontSize: 15, marginTop: 12 },
  card: { flexDirection: "row", alignItems: "flex-start", gap: 14, borderRadius: 16, borderWidth: 1, borderColor: COLORS.divider, backgroundColor: COLORS.surface, padding: 18, marginTop: 28 },
  dot: { width: 14, height: 14, borderRadius: 7, backgroundColor: "#8A958D", marginTop: 4 },
  cardCopy: { flex: 1 },
  cardTitle: { color: COLORS.text, fontSize: 19, fontWeight: "700" },
  body: { color: COLORS.muted, fontSize: 16, lineHeight: 23, marginTop: 6 },
  button: { minHeight: 60, alignItems: "center", justifyContent: "center", borderRadius: 14, backgroundColor: COLORS.green, marginTop: 24 },
  buttonText: { color: "#FFFFFF", fontSize: 17, fontWeight: "700" },
});
