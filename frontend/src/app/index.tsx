import { useRouter } from "expo-router";
import { CameraView, useCameraPermissions, useMicrophonePermissions } from "expo-camera";
import { File } from "expo-file-system";
import { useKeepAwake } from "expo-keep-awake";
import * as Speech from "expo-speech";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { analyzeLiveClip, checkFallClip } from "@/lib/api";
import { createSessionId } from "@/lib/session";
import type { ClipEvent, ClipResponse, FallCheckResponse } from "@/lib/schema";

const CHECKIN_SECONDS = 20;
const SEGMENT_SECONDS = 3;

type PendingClip = { uri: string; generation: number; fallOnly: boolean; sequence: number };

export default function HikerScreen() {
  const router = useRouter();
  const cameraRef = useRef<CameraView>(null);
  const processingRef = useRef(false);
  const pendingClipsRef = useRef<PendingClip[]>([]);
  const clipSequenceRef = useRef(0);
  const generationRef = useRef(0);
  const monitoringRef = useRef(false);
  const checkinTriggeredRef = useRef(false);
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const [microphonePermission, requestMicrophonePermission] = useMicrophonePermissions();
  const [sessionId] = useState(createSessionId);
  const [live, setLive] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [fallOnlyMode, setFallOnlyMode] = useState(true);
  const [lowVision, setLowVision] = useState(false);
  const [showLog, setShowLog] = useState(false);
  const [events, setEvents] = useState<ClipEvent[]>([]);
  const [fallResult, setFallResult] = useState<FallCheckResponse | null>(null);
  const [fallCheckStatus, setFallCheckStatus] = useState("Waiting for live camera segments");
  const [countdown, setCountdown] = useState<number | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [captureStatus, setCaptureStatus] = useState("Monitoring is off");

  const startCheckinPreview = useCallback(() => {
    if (checkinTriggeredRef.current) return;
    checkinTriggeredRef.current = true;
    if (live) {
      monitoringRef.current = false;
      generationRef.current += 1;
      cameraRef.current?.stopRecording();
      setLive(false);
      setCameraReady(false);
      setCaptureStatus("Monitoring is off");
    }
    setNotice(null);
    setCountdown(CHECKIN_SECONDS);
    void Speech.stop();
    Speech.speak("Are you okay? Tap the button if you are okay.", { rate: 0.95 });
  }, [live]);

  useEffect(() => {
    if (countdown === null) return;
    if (countdown <= 0) {
      setCountdown(null);
      setNotice("No response. The check-in ended; no SOS call was placed.");
      return;
    }
    const timer = setTimeout(() => setCountdown((seconds) => (seconds === null ? null : seconds - 1)), 1000);
    return () => clearTimeout(timer);
  }, [countdown]);

  useEffect(() => {
    if (!live || !cameraReady) return;
    let active = true;
    const camera = cameraRef.current;
    if (!camera) return;

    const uploadClip = (uri: string) => {
      pendingClipsRef.current.push({
        uri,
        generation: generationRef.current,
        fallOnly: fallOnlyMode,
        sequence: clipSequenceRef.current++,
      });
      if (pendingClipsRef.current.length > 0) {
        setCaptureStatus(
            `${pendingClipsRef.current.length} three-second clip${pendingClipsRef.current.length === 1 ? "" : "s"} waiting for analysis`,
        );
      }
      if (processingRef.current) return;

      processingRef.current = true;
      void (async () => {
        while (pendingClipsRef.current.length > 0) {
          const current = pendingClipsRef.current.shift();
          if (!current) continue;
          const isMonitoring =
            monitoringRef.current && current.generation === generationRef.current;
          if (!isMonitoring) {
            deleteRecordedClip(current.uri);
            continue;
          }

          setFallCheckStatus(
            current.sequence < 2
              ? `Filling the 9-second window (${current.sequence + 1}/3 clips)…`
              : `Assessing the latest sliding 9-second window…`,
          );
          let trailResult: PromiseSettledResult<ClipResponse> | null = null;
          let fallCheck: PromiseSettledResult<FallCheckResponse>;
          if (current.fallOnly) {
            const [result] = await Promise.allSettled([
              checkFallClip(current.uri, sessionId, current.sequence),
            ]);
            fallCheck = result;
          } else {
            [trailResult, fallCheck] = await Promise.allSettled([
              analyzeLiveClip(current.uri, sessionId, current.sequence),
              checkFallClip(current.uri, sessionId, current.sequence),
            ]);
          }

          const isCurrent = monitoringRef.current && current.generation === generationRef.current;
          if (isCurrent && trailResult?.status === "fulfilled") {
            const response = trailResult.value;
            setEvents((previous) => [response.event, ...previous].slice(0, 8));
            setCaptureStatus("Recording and analyzing live segments");
            const warning = response.speak[0];
            if (warning) {
              void Speech.stop();
              Speech.speak(warning.say, { rate: 0.92 });
            }
          } else if (isCurrent && trailResult?.status === "rejected") {
            const message = trailResult.reason instanceof Error ? trailResult.reason.message : "Clip analysis failed";
            setNotice(`Could not analyze the latest trail clip: ${message}`);
            setCaptureStatus("Camera is recording; backend analysis is unavailable");
          }
          if (isCurrent && fallCheck.status === "fulfilled") {
            if (current.sequence >= 2) setFallResult(fallCheck.value);
            setFallCheckStatus(
              current.sequence < 2
                ? `Waiting for clip ${current.sequence + 2}/3 to complete the first 9-second window`
                : "Latest sliding window assessed",
            );
            if (fallCheck.value.fell === "yes" && !checkinTriggeredRef.current) {
              startCheckinPreview();
            }
          } else if (isCurrent && fallCheck.status === "rejected") {
            const message = fallCheck.reason instanceof Error ? fallCheck.reason.message : "Fall check failed";
            setFallCheckStatus(`Fall check failed: ${message}`);
          }
          deleteRecordedClip(current.uri);
          if (monitoringRef.current && current.generation === generationRef.current) {
            const queued = pendingClipsRef.current.length;
            setCaptureStatus(
              queued === 0
              ? "Recording three-second clips for sliding windows"
              : `${queued} three-second clip${queued === 1 ? "" : "s"} queued for analysis`,
            );
          }
        }
        processingRef.current = false;
      })().catch((error: unknown) => {
        processingRef.current = false;
        const message = error instanceof Error ? error.message : "Clip processing failed";
        setFallCheckStatus(`Clip processing failed: ${message}`);
      });
    };

    const captureLoop = async () => {
      setCaptureStatus("Recording three-second clips for sliding windows");
      while (active) {
        try {
          const recorded = await camera.recordAsync({
            maxDuration: SEGMENT_SECONDS,
            maxFileSize: 24 * 1024 * 1024,
          });
          if (!active) {
            if (recorded?.uri) deleteRecordedClip(recorded.uri);
            break;
          }
          if (recorded?.uri) uploadClip(recorded.uri);
        } catch {
          if (!active) break;
          setNotice("Camera recording stopped. Stop monitoring and start again to retry.");
          setCaptureStatus("Camera recording stopped");
          monitoringRef.current = false;
          setLive(false);
          setCameraReady(false);
          break;
        }
      }
    };

    void captureLoop();
    return () => {
      active = false;
      camera.stopRecording();
    };
  }, [live, cameraReady, fallOnlyMode, sessionId, startCheckinPreview]);

  useEffect(() => () => {
    monitoringRef.current = false;
    generationRef.current += 1;
    cameraRef.current?.stopRecording();
    void Speech.stop();
  }, []);

  const toggleMonitoring = async () => {
    if (live) {
      monitoringRef.current = false;
      generationRef.current += 1;
      cameraRef.current?.stopRecording();
      setLive(false);
      setCameraReady(false);
      setCaptureStatus("Monitoring is off");
      void Speech.stop();
      return;
    }

    const permission = cameraPermission?.granted ? cameraPermission : await requestCameraPermission();
    if (permission.granted) {
      const micPermission = microphonePermission?.granted
        ? microphonePermission
        : await requestMicrophonePermission();
      generationRef.current += 1;
      monitoringRef.current = true;
      checkinTriggeredRef.current = false;
      clipSequenceRef.current = 0;
      setCameraReady(false);
      setFallResult(null);
      setFallCheckStatus("Waiting to fill the first 9-second window");
      setLive(true);
      setNotice(micPermission.granted ? null : "Microphone is off. Fall checks will use video only.");
    } else {
      setNotice("Camera permission is needed for live monitoring.");
    }
  };

  const cancelCheckinPreview = () => {
    setCountdown(null);
    void Speech.stop();
    setNotice("Check-in cancelled. No SOS call was placed.");
  };

  const latestEvent = events[0];
  const latestHazard = latestEvent?.hazards[0];
  const statusTitle = fallOnlyMode
    ? "Fall-only test"
    : latestHazard?.say ?? (latestEvent ? "Trail clear" : "Ready to monitor");
  return (
    <SafeAreaView style={styles.safeArea} edges={["top", "bottom"]}>
      {live ? <KeepCameraAwake /> : null}
      <View style={styles.header}>
        <View>
          <Text style={styles.brand}>TrailSense</Text>
          <Text style={styles.subtitle}>Trail guidance and safety</Text>
        </View>
      </View>

      {countdown !== null ? (
        <View style={styles.checkinOverlay}>
          <Text style={styles.checkinEyebrow}>FALL CHECK-IN · DEV MODE · NO CALL WILL BE PLACED</Text>
          <Text style={styles.checkinTitle}>Are you okay?</Text>
          <Text style={styles.checkinBody}>Tap below if you are okay. This test does not place a call.</Text>
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
            <Text style={styles.eyebrow}>
              {lowVision ? "LOW-VISION VIEW" : fallOnlyMode ? "FALL TEST" : "HIKE STATUS"}
            </Text>
            <Text accessibilityLiveRegion="polite" style={lowVision ? styles.lowVisionText : styles.statusTitle}>
              {statusTitle}
            </Text>
            <Text style={styles.statusBody}>
              {live
                ? captureStatus
                : fallOnlyMode
                  ? "Test fall detection indoors with a controlled staged movement."
                  : "Start monitoring to analyze the trail from the live camera."}
            </Text>
          </View>

          <View style={styles.previewCard}>
            <View style={styles.previewHeader}>
              <Text style={styles.sectionTitle}>
                {fallOnlyMode ? "Fall-test camera" : live ? "Live trail camera" : "Trail camera"}
              </Text>
              {live ? <Text style={styles.liveTag}>LIVE</Text> : null}
            </View>
            {live ? (
              <CameraView
                ref={cameraRef}
                style={styles.camera}
                facing="back"
                mode="video"
                videoQuality="480p"
                active
                onCameraReady={() => setCameraReady(true)}
              />
            ) : (
              <View style={styles.previewPlaceholder}>
                <Text style={styles.previewIcon}>◉</Text>
              <Text style={styles.previewText}>Camera is off</Text>
                <Text style={styles.previewHint}>
                  {fallOnlyMode
                    ? "No hike needed. Point the camera at a person for a safe, staged fall test."
                    : "When active, TrailSense records short clips and analyzes them as you hike."}
                </Text>
              </View>
            )}
            <View style={styles.actionRow}>
              <ActionButton
                label={live ? "Stop monitoring" : fallOnlyMode ? "Start fall test" : "Start trail monitoring"}
                onPress={() => void toggleMonitoring()}
              />
            </View>
          </View>

          <View style={styles.controlsCard}>
            <ControlRow label="Low-vision display" value={lowVision} onChange={setLowVision} />
            <View style={styles.divider} />
            <ControlRow
              label="Fall-only test mode"
              value={fallOnlyMode}
              onChange={setFallOnlyMode}
              disabled={live}
              subtitle={fallOnlyMode ? "Fall detection only; no hike needed" : "Analyze falls and trail hazards"}
            />
            {!fallOnlyMode ? (
              <>
                <View style={styles.divider} />
                <Pressable accessibilityRole="button" onPress={() => setShowLog((open) => !open)} style={styles.rowButton}>
                  <View>
                    <Text style={styles.rowTitle}>Trail events</Text>
                    <Text style={styles.rowSubtitle}>{events.length === 0 ? "No events yet" : `${events.length} recent clip analyses`}</Text>
                  </View>
                  <Text style={styles.rowAction}>{showLog ? "Hide" : "Show"}</Text>
                </Pressable>
                {showLog ? (
                  events.length ? events.map((event) => (
                    <View key={event.clip_id} style={styles.eventRow}>
                      <Text style={styles.eventTitle}>{event.hazards[0]?.say ?? "Trail clear"}</Text>
                      <Text style={styles.rowSubtitle}>{event.scene}</Text>
                    </View>
                  )) : <Text style={styles.logEmpty}>Warnings and trail events will appear here.</Text>
                ) : null}
              </>
            ) : null}
          </View>

          <View style={styles.bottomActions}>
            <View style={styles.fallTestCard}>
              <Text style={styles.sectionTitle}>{fallOnlyMode ? "Indoor fall-only test" : "Live fall detection"}</Text>
              <Text style={styles.rowSubtitle}>
                {fallOnlyMode
                  ? "Three-second clips build a rolling 9-second fall window. Each new clip advances it by 3 seconds, keeping 6 seconds of previous context. A YES opens the check-in; this test will not place a call."
                  : "Three-second clips build rolling windows for falls and trail hazards. Each new clip advances the fall window by 3 seconds, keeping 6 seconds of previous context. A YES opens the check-in; this test will not place a call."}
              </Text>
              <Text accessibilityLiveRegion="polite" style={styles.fallStatus}>{fallCheckStatus}</Text>
              {fallResult ? (
                <Text accessibilityLiveRegion="polite" style={styles.fallResult}>
                  Latest result: {fallResult.fell.toUpperCase()} · {Math.round(fallResult.confidence * 100)}% confidence
                </Text>
              ) : null}
            </View>
            <ActionButton label="Preview fall check-in" onPress={startCheckinPreview} secondary />
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

function deleteRecordedClip(uri: string) {
  try {
    new File(uri).delete();
  } catch {
    // The camera may already have removed its temporary recording.
  }
}

function KeepCameraAwake() {
  useKeepAwake("trailsense-live-camera", { suppressDeactivateWarnings: true });
  return null;
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

function ControlRow({
  label,
  value,
  onChange,
  subtitle,
  disabled = false,
}: {
  label: string;
  value: boolean;
  onChange: (value: boolean) => void;
  subtitle?: string;
  disabled?: boolean;
}) {
  return (
    <View style={styles.controlRow}>
      <View>
        <Text style={styles.rowTitle}>{label}</Text>
        <Text style={styles.rowSubtitle}>
          {subtitle ?? (value ? "Large high-contrast guidance" : "Standard guidance view")}
        </Text>
      </View>
      <Switch
        accessibilityLabel={label}
        value={value}
        onValueChange={onChange}
        disabled={disabled}
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
  warning: "#FFD60A",
  dark: "#000000",
};

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: COLORS.bg },
  header: { minHeight: 76, paddingHorizontal: 20, paddingBottom: 12, flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderBottomWidth: 1, borderBottomColor: COLORS.divider },
  brand: { color: COLORS.text, fontSize: 24, fontWeight: "800", letterSpacing: 0.3 },
  subtitle: { color: COLORS.muted, fontSize: 14, marginTop: 3 },
  content: { padding: 16, paddingBottom: 32, gap: 16 },
  notice: { backgroundColor: COLORS.surfaceRaised, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: COLORS.divider },
  noticeText: { color: COLORS.text, fontSize: 15, lineHeight: 22 },
  statusCard: { padding: 20, borderRadius: 18, backgroundColor: COLORS.accent, minHeight: 176, justifyContent: "center" },
  eyebrow: { color: COLORS.text, fontSize: 13, fontWeight: "800", letterSpacing: 1.2 },
  statusTitle: { color: COLORS.text, fontSize: 34, lineHeight: 40, fontWeight: "800", marginTop: 8 },
  lowVisionText: { color: COLORS.text, fontSize: 48, lineHeight: 56, fontWeight: "800", marginTop: 8 },
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
  rowSubtitle: { color: COLORS.muted, fontSize: 14, lineHeight: 20, marginTop: 4 },
  rowAction: { color: COLORS.bright, fontSize: 15, fontWeight: "700" },
  divider: { height: 1, backgroundColor: COLORS.divider },
  eventRow: { borderTopWidth: 1, borderColor: COLORS.divider, paddingVertical: 12 },
  eventTitle: { color: COLORS.text, fontSize: 16, fontWeight: "700" },
  logEmpty: { color: COLORS.muted, fontSize: 15, lineHeight: 22, paddingBottom: 16 },
  bottomActions: { gap: 10 },
  fallTestCard: { gap: 10, padding: 16, borderRadius: 16, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.divider },
  fallStatus: { color: COLORS.muted, fontSize: 15, lineHeight: 21 },
  fallResult: { color: COLORS.bright, fontSize: 18, fontWeight: "800" },
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
