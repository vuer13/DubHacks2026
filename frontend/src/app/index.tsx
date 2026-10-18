import { useRouter } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import { CameraView, useCameraPermissions } from "expo-camera";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { checkBackendHealth } from "@/lib/api";
import { createSessionId } from "@/lib/session";

const CHECKIN_SECONDS = 20;

export default function HikerScreen() {
  const router = useRouter();
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const [sessionId] = useState(createSessionId);
  const [backendOnline, setBackendOnline] = useState<boolean | null>(null);
  const [live, setLive] = useState(false);
  const [lowVision, setLowVision] = useState(false);
  const [showLog, setShowLog] = useState(false);
  const [clipName, setClipName] = useState<string | null>(null);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const poll = async () => {
      const online = await checkBackendHealth();
      if (active) setBackendOnline(online);
    };
    void poll();
    const timer = setInterval(() => void poll(), 5000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    if (countdown === null) return;
    if (countdown <= 0) {
      setCountdown(null);
      setNotice("Preview ended. No SOS call was placed.");
      return;
    }
    const timer = setTimeout(() => setCountdown((seconds) => (seconds === null ? null : seconds - 1)), 1000);
    return () => clearTimeout(timer);
  }, [countdown]);

  const startCamera = async () => {
    if (live) {
      setLive(false);
      return;
    }
    const permission = cameraPermission?.granted ? cameraPermission : await requestCameraPermission();
    if (permission.granted) {
      setLive(true);
      setNotice(null);
    } else {
      setNotice("Camera permission is needed for live preview.");
    }
  };

  const chooseClip = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["videos"],
      allowsMultipleSelection: false,
    });
    if (!result.canceled) {
      setClipName(result.assets[0]?.fileName ?? "Trail video selected");
      setNotice("Clip selected. Fall analysis upload is the next integration step.");
    }
  };

  const startCheckinPreview = () => {
    setNotice(null);
    setCountdown(CHECKIN_SECONDS);
  };

  const cancelCheckinPreview = () => {
    setCountdown(null);
    setNotice("Cancelled. Help is not being called.");
  };

  const healthLabel = backendOnline === null ? "Checking backend" : backendOnline ? "Backend connected" : "Backend offline";

  return (
    <SafeAreaView style={styles.safeArea} edges={["top", "bottom"]}>
      <View style={styles.header}>
        <View>
          <Text style={styles.brand}>TrailSense</Text>
          <Text style={styles.subtitle}>Trail guidance and safety</Text>
        </View>
        <View style={styles.healthPill}>
          {backendOnline === null ? (
            <ActivityIndicator size="small" color={COLORS.muted} />
          ) : (
            <View style={[styles.healthDot, { backgroundColor: backendOnline ? COLORS.health : COLORS.danger }]} />
          )}
          <Text style={styles.healthText}>{healthLabel}</Text>
        </View>
      </View>

      {countdown !== null ? (
        <View style={styles.checkinOverlay}>
          <Text style={styles.checkinEyebrow}>CHECK-IN PREVIEW · NO CALL WILL BE PLACED</Text>
          <Text style={styles.checkinTitle}>Are you okay?</Text>
          <Text style={styles.checkinBody}>Say anything or tap below to cancel.</Text>
          <Text accessibilityLabel={`${countdown} seconds remaining`} style={styles.countdown}>
            {countdown}
          </Text>
          <Pressable accessibilityRole="button" onPress={cancelCheckinPreview} style={styles.cancelButton}>
            <Text style={styles.cancelButtonText}>I’m okay · Cancel</Text>
          </Pressable>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
          {notice ? (
            <View style={styles.notice}>
              <Text style={styles.noticeText}>{notice}</Text>
            </View>
          ) : null}

          <View style={styles.statusCard}>
            <Text style={styles.eyebrow}>{lowVision ? "LOW-VISION VIEW" : "HIKE STATUS"}</Text>
            <Text accessibilityLiveRegion="polite" style={lowVision ? styles.lowVisionText : styles.statusTitle}>
              Trail clear
            </Text>
            <Text style={styles.statusBody}>
              {backendOnline
                ? "Ready when you are. Start a live camera preview or choose a clip."
                : "Connect to the backend to analyze trail clips."}
            </Text>
          </View>

          <View style={styles.previewCard}>
            <View style={styles.previewHeader}>
              <Text style={styles.sectionTitle}>{live ? "Live camera preview" : "Trail video"}</Text>
              {live ? <Text style={styles.liveTag}>LIVE</Text> : null}
            </View>
            {live ? (
              <CameraView style={styles.camera} facing="back" />
            ) : (
              <View style={styles.previewPlaceholder}>
                <Text style={styles.previewIcon}>◉</Text>
                <Text style={styles.previewText}>{clipName ?? "No clip selected"}</Text>
                <Text style={styles.previewHint}>Camera preview works in Expo Go. Analysis wiring is next.</Text>
              </View>
            )}
            <View style={styles.actionRow}>
              <ActionButton label={live ? "Stop camera" : "Start camera"} onPress={() => void startCamera()} />
              <ActionButton label="Choose clip" onPress={() => void chooseClip()} secondary />
            </View>
          </View>

          <View style={styles.controlsCard}>
            <ControlRow label="Low-vision display" value={lowVision} onChange={setLowVision} />
            <View style={styles.divider} />
            <Pressable accessibilityRole="button" onPress={() => setShowLog((open) => !open)} style={styles.rowButton}>
              <View>
                <Text style={styles.rowTitle}>Trail events</Text>
                <Text style={styles.rowSubtitle}>{showLog ? "No events yet" : "No new warnings"}</Text>
              </View>
              <Text style={styles.rowAction}>{showLog ? "Hide" : "Show"}</Text>
            </Pressable>
            {showLog ? <Text style={styles.logEmpty}>Warnings and trail events will appear here.</Text> : null}
          </View>

          <View style={styles.bottomActions}>
            <ActionButton label="Preview fall check-in" onPress={startCheckinPreview} />
            <Pressable
              accessibilityRole="button"
              onPress={() => router.push({ pathname: "/share/[session_id]", params: { session_id: sessionId } })}
              style={styles.shareButton}
            >
              <Text style={styles.shareButtonText}>View hike share page</Text>
            </Pressable>
          </View>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

function ActionButton({ label, onPress, secondary = false }: { label: string; onPress: () => void; secondary?: boolean }) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.actionButton, secondary && styles.actionButtonSecondary, pressed && styles.pressed]}
    >
      <Text style={[styles.actionButtonText, secondary && styles.actionButtonTextSecondary]}>{label}</Text>
    </Pressable>
  );
}

function ControlRow({ label, value, onChange }: { label: string; value: boolean; onChange: (value: boolean) => void }) {
  return (
    <View style={styles.controlRow}>
      <View>
        <Text style={styles.rowTitle}>{label}</Text>
        <Text style={styles.rowSubtitle}>{value ? "Large high-contrast guidance" : "Standard guidance view"}</Text>
      </View>
      <Switch
        accessibilityLabel={label}
        value={value}
        onValueChange={onChange}
        trackColor={{ false: COLORS.divider, true: COLORS.accent }}
        thumbColor={COLORS.text}
      />
    </View>
  );
}

const COLORS = {
  bg: "#0B1410",
  surface: "#13201A",
  surfaceRaised: "#1B2C23",
  divider: "#2A3F33",
  text: "#F2F5F0",
  muted: "#AEBBB2",
  accent: "#1B5A38",
  bright: "#5FC98A",
  health: "#4CC37A",
  danger: "#FF5C5C",
  warning: "#FFD60A",
  dark: "#000000",
};

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: COLORS.bg },
  header: {
    minHeight: 76,
    paddingHorizontal: 20,
    paddingBottom: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderBottomWidth: 1,
    borderBottomColor: COLORS.divider,
  },
  brand: { color: COLORS.text, fontSize: 24, fontWeight: "800", letterSpacing: 0.3 },
  subtitle: { color: COLORS.muted, fontSize: 14, marginTop: 3 },
  healthPill: {
    minHeight: 40,
    maxWidth: 160,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    borderRadius: 20,
    backgroundColor: COLORS.surface,
  },
  healthDot: { width: 10, height: 10, borderRadius: 5 },
  healthText: { color: COLORS.text, fontSize: 12, fontWeight: "600", flexShrink: 1 },
  content: { padding: 16, paddingBottom: 32, gap: 16 },
  notice: { backgroundColor: COLORS.surfaceRaised, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: COLORS.divider },
  noticeText: { color: COLORS.text, fontSize: 16, lineHeight: 22 },
  statusCard: { padding: 20, borderRadius: 18, backgroundColor: COLORS.accent, minHeight: 176, justifyContent: "center" },
  eyebrow: { color: COLORS.text, fontSize: 13, fontWeight: "800", letterSpacing: 1.2 },
  statusTitle: { color: COLORS.text, fontSize: 34, lineHeight: 40, fontWeight: "800", marginTop: 8 },
  lowVisionText: { color: COLORS.text, fontSize: 56, lineHeight: 62, fontWeight: "800", marginTop: 8 },
  statusBody: { color: COLORS.text, fontSize: 16, lineHeight: 23, marginTop: 8 },
  previewCard: { overflow: "hidden", borderRadius: 18, borderWidth: 1, borderColor: COLORS.divider, backgroundColor: COLORS.surface },
  previewHeader: { minHeight: 54, paddingHorizontal: 16, flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  sectionTitle: { color: COLORS.text, fontSize: 18, fontWeight: "700" },
  liveTag: { color: COLORS.dark, backgroundColor: COLORS.warning, paddingHorizontal: 9, paddingVertical: 4, borderRadius: 12, fontSize: 12, fontWeight: "900" },
  camera: { height: 220, width: "100%", backgroundColor: COLORS.dark },
  previewPlaceholder: { minHeight: 180, alignItems: "center", justifyContent: "center", padding: 18, backgroundColor: COLORS.surfaceRaised },
  previewIcon: { color: COLORS.bright, fontSize: 36, fontWeight: "700" },
  previewText: { color: COLORS.text, fontSize: 18, fontWeight: "700", textAlign: "center", marginTop: 8 },
  previewHint: { color: COLORS.muted, fontSize: 14, lineHeight: 20, textAlign: "center", marginTop: 6 },
  actionRow: { flexDirection: "row", padding: 12, gap: 10 },
  actionButton: { minHeight: 56, minWidth: 64, flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 14, borderRadius: 14, backgroundColor: COLORS.accent },
  actionButtonSecondary: { backgroundColor: COLORS.surfaceRaised, borderWidth: 1, borderColor: COLORS.divider },
  actionButtonText: { color: COLORS.text, fontSize: 16, fontWeight: "700", textAlign: "center" },
  actionButtonTextSecondary: { color: COLORS.bright },
  pressed: { opacity: 0.78 },
  controlsCard: { borderRadius: 18, backgroundColor: COLORS.surface, paddingHorizontal: 16 },
  controlRow: { minHeight: 76, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
  rowButton: { minHeight: 76, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  rowTitle: { color: COLORS.text, fontSize: 17, fontWeight: "700" },
  rowSubtitle: { color: COLORS.muted, fontSize: 14, marginTop: 4 },
  rowAction: { color: COLORS.bright, fontSize: 15, fontWeight: "700" },
  divider: { height: 1, backgroundColor: COLORS.divider },
  logEmpty: { color: COLORS.muted, fontSize: 15, lineHeight: 22, paddingBottom: 16 },
  bottomActions: { gap: 10 },
  shareButton: { minHeight: 56, alignItems: "center", justifyContent: "center", borderRadius: 14, borderWidth: 1, borderColor: COLORS.bright },
  shareButtonText: { color: COLORS.bright, fontSize: 16, fontWeight: "700" },
  checkinOverlay: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: COLORS.warning, paddingHorizontal: 24 },
  checkinEyebrow: { color: COLORS.dark, textAlign: "center", fontSize: 12, fontWeight: "900", letterSpacing: 0.8 },
  checkinTitle: { color: COLORS.dark, textAlign: "center", fontSize: 36, lineHeight: 42, fontWeight: "900", marginTop: 18 },
  checkinBody: { color: COLORS.dark, textAlign: "center", fontSize: 18, lineHeight: 25, marginTop: 8 },
  countdown: { color: COLORS.dark, fontSize: 104, lineHeight: 116, fontWeight: "900", marginVertical: 12 },
  cancelButton: { minHeight: 64, width: "100%", alignItems: "center", justifyContent: "center", borderRadius: 16, backgroundColor: COLORS.dark, paddingHorizontal: 20 },
  cancelButtonText: { color: COLORS.warning, fontSize: 19, fontWeight: "800" },
});
