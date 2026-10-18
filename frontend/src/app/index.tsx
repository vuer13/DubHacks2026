import { CameraView, useCameraPermissions, useMicrophonePermissions } from "expo-camera";
import { File } from "expo-file-system";
import { useKeepAwake } from "expo-keep-awake";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { CheckinOverlay, CancelledScreen } from "@/components/safety/CheckinOverlay";
import { SosBanner, SosScreen } from "@/components/safety/SosScreens";
import { useCheckin } from "@/hooks/useCheckin";
import { analyzeLiveClip, checkFallClip } from "@/lib/api";
import { SOS_TEXT, sosBannerText } from "@/lib/checkin";
import { emergencyContactPhone, openDialer } from "@/lib/native/dialer";
import { createSessionId } from "@/lib/session";
import { speakSign, speakWarning, stopWarningSpeech } from "@/lib/voice/warnings";
import { buildSignReadout, SignReadoutHistory } from "@/lib/signReadout";
import type { ClipEvent, ClipResponse } from "@/lib/schema";
import { colors } from "@/theme/tokens";

const SEGMENT_SECONDS = 1;
const FALL_WINDOW_SEGMENTS = 4;
const FALL_CHECK_STRIDE_SEGMENTS = 3;
const HAZARD_CHECK_STRIDE_SEGMENTS = 3;
const MAX_PENDING_CLIPS = FALL_WINDOW_SEGMENTS;

type PendingClip = { uri: string; generation: number; sequence: number };
type FallDisplayState = "off" | "warming" | "checking" | "clear" | "uncertain" | "detected" | "error";

const FALL_STATUS_LABELS: Record<FallDisplayState, string> = {
  off: "Fall monitoring is off.",
  warming: "Collecting the first few seconds…",
  checking: "Checking for a fall…",
  clear: "No fall detected.",
  uncertain: "Fall check was inconclusive. Monitoring continues.",
  detected: "Fall detected. Starting a check-in.",
  error: "Could not complete the latest fall check.",
};

export default function HikerScreen() {
  const cameraRef = useRef<CameraView>(null);
  const processingRef = useRef(false);
  const pendingClipsRef = useRef<PendingClip[]>([]);
  const clipSequenceRef = useRef(0);
  const nextFallAssessmentSequenceRef = useRef(FALL_WINDOW_SEGMENTS - 1);
  const nextHazardAssessmentSequenceRef = useRef(HAZARD_CHECK_STRIDE_SEGMENTS - 1);
  const generationRef = useRef(0);
  const monitoringRef = useRef(false);
  const checkinTriggeredRef = useRef(false);
  const signHistoryRef = useRef(new SignReadoutHistory());
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const [microphonePermission, requestMicrophonePermission] = useMicrophonePermissions();
  const [sessionId] = useState(createSessionId);
  const [live, setLive] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [events, setEvents] = useState<ClipEvent[]>([]);
  const [fallDisplayState, setFallDisplayState] = useState<FallDisplayState>("off");
  const [fallLatencyMs, setFallLatencyMs] = useState<number | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const eventsRef = useRef<ClipEvent[]>([]);
  useEffect(() => {
    eventsRef.current = events;
  }, [events]);
  const getRecentEvents = useCallback(() => eventsRef.current, []);
  const checkin = useCheckin({ sessionId, getRecentEvents });
  const { start: startCheckin, screen } = checkin;
  const contactPhone = emergencyContactPhone();
  const sosActive = screen === "sos_banner";
  const callEmergencyContact = useCallback(() => {
    if (contactPhone) void openDialer(contactPhone);
  }, [contactPhone]);

  const stopMonitoringForCheckin = useCallback(() => {
    if (!live) return;
    monitoringRef.current = false;
    generationRef.current += 1;
    cameraRef.current?.stopRecording();
    setLive(false);
    setCameraReady(false);
  }, [live]);

  // A YES from fall detection starts the real check-in and SOS flow.
  const startFallCheckin = useCallback(() => {
    if (checkinTriggeredRef.current) return;
    checkinTriggeredRef.current = true;
    stopMonitoringForCheckin();
    setNotice(null);
    stopWarningSpeech();
    startCheckin("fall", "real");
  }, [startCheckin, stopMonitoringForCheckin]);

  useEffect(() => {
    if (!live || !cameraReady) return;
    let active = true;
    const camera = cameraRef.current;
    if (!camera) return;

    const uploadClip = (uri: string) => {
      const generation = generationRef.current;
      const obsolete = pendingClipsRef.current.filter((clip) => clip.generation !== generation);
      pendingClipsRef.current = pendingClipsRef.current.filter((clip) => clip.generation === generation);
      obsolete.forEach((clip) => deleteRecordedClip(clip.uri));

      pendingClipsRef.current.push({
        uri,
        generation,
        sequence: clipSequenceRef.current++,
      });
      if (pendingClipsRef.current.length > MAX_PENDING_CLIPS) {
        const dropped = pendingClipsRef.current.splice(
          0,
          pendingClipsRef.current.length - MAX_PENDING_CLIPS,
        );
        dropped.forEach((clip) => deleteRecordedClip(clip.uri));
        const firstPending = pendingClipsRef.current[0];
        if (firstPending) {
          nextFallAssessmentSequenceRef.current =
            firstPending.sequence + FALL_WINDOW_SEGMENTS - 1;
        }
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

          const fallAssessmentDue =
            current.sequence >= nextFallAssessmentSequenceRef.current;
          if (fallAssessmentDue && isMonitoring) {
            setFallDisplayState("checking");
          }
          const isCurrent = () =>
            monitoringRef.current && current.generation === generationRef.current;
          const hazardAssessmentDue =
            current.sequence >= nextHazardAssessmentSequenceRef.current;
          if (hazardAssessmentDue) {
            nextHazardAssessmentSequenceRef.current =
              current.sequence + HAZARD_CHECK_STRIDE_SEGMENTS;
          }

          // Handle each result as it arrives so a positive fall result can
          // interrupt a hazard warning that is already being generated or spoken.
          const signSourceStartedAt = Date.now();
          const hazardTask: Promise<ClipResponse | null> = hazardAssessmentDue
            ? analyzeLiveClip(current.uri, sessionId, current.sequence)
                .then((response) => {
                  if (isCurrent()) {
                    setEvents((previous) => [response.event, ...previous].slice(0, 8));
                    const warning = response.speak[0];
                    console.info(
                      `Hazard check: count=${response.event.hazards.length} warning=${warning?.say ?? "none"} latency_ms=${response.event.latency_ms}`,
                      response.event.hazards,
                    );
                    const readout = signHistoryRef.current.acceptsResult(signSourceStartedAt)
                      ? buildSignReadout(response.event.sign)
                      : null;
                    if (warning && !checkinTriggeredRef.current) {
                      void speakWarning(warning.say);
                    } else if (readout && !checkinTriggeredRef.current) {
                      void speakSign(readout.chunks, {
                        fingerprint: readout.fingerprint,
                        isCurrent: () => isCurrent() && !checkinTriggeredRef.current,
                        canStart: () => signHistoryRef.current.canRead(
                          readout.fingerprint, signSourceStartedAt,
                        ),
                        onStart: () => undefined,
                      }).then((completed) => {
                        if (completed) {
                          signHistoryRef.current.markFinished(
                            readout.fingerprint,
                          );
                        }
                      });
                    }
                  }
                  return response;
                })
                .catch((error: unknown) => {
                  if (isCurrent()) {
                    const message = error instanceof Error ? error.message : "Clip analysis failed";
                    setNotice(`Could not analyze the latest trail clip: ${message}`);
                  }
                  throw error;
                })
            : Promise.resolve(null);

          const fallRequestStartedAt = Date.now();
          const fallTask = checkFallClip(current.uri, sessionId, current.sequence)
            .then((result) => {
              if (!isCurrent()) return result;
              if (fallAssessmentDue) {
                const latencyMs = Date.now() - fallRequestStartedAt;
                setFallLatencyMs(latencyMs);
                setFallDisplayState(
                  result.fell === "yes"
                    ? "detected"
                    : result.fell === "no"
                      ? "clear"
                      : "uncertain",
                );
                console.info(
                  `Fall result: fell=${result.fell} confidence=${result.confidence.toFixed(3)} latency_ms=${latencyMs}`,
                );
                if (current.sequence >= nextFallAssessmentSequenceRef.current) {
                  nextFallAssessmentSequenceRef.current = Math.max(
                    nextFallAssessmentSequenceRef.current,
                    current.sequence + FALL_CHECK_STRIDE_SEGMENTS,
                  );
                }
              }
              if (result.fell === "yes" && !checkinTriggeredRef.current) {
                console.info(
                  `Fall decision: source=perceptron fell=yes confidence=${result.confidence.toFixed(3)}`,
                );
                startFallCheckin();
              }
              return result;
            })
            .catch((error: unknown) => {
              if (isCurrent()) {
                const message = error instanceof Error ? error.message : "Fall check failed";
                if (fallAssessmentDue) setFallDisplayState("error");
                setNotice(`Could not check for a fall: ${message}`);
              }
              throw error;
            });

          await Promise.allSettled([hazardTask, fallTask]);
          deleteRecordedClip(current.uri);
        }
        processingRef.current = false;
      })().catch((error: unknown) => {
        processingRef.current = false;
        const message = error instanceof Error ? error.message : "Clip processing failed";
        setNotice(`Clip processing failed: ${message}`);
      });
    };

    const captureLoop = async () => {
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
  }, [live, cameraReady, sessionId, startFallCheckin]);

  useEffect(() => () => {
    monitoringRef.current = false;
    generationRef.current += 1;
    cameraRef.current?.stopRecording();
    stopWarningSpeech();
  }, []);

  const toggleMonitoring = async () => {
    if (live) {
      monitoringRef.current = false;
      generationRef.current += 1;
      cameraRef.current?.stopRecording();
      setLive(false);
      setCameraReady(false);
      setFallDisplayState("off");
      stopWarningSpeech();
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
      signHistoryRef.current.reset();
      clipSequenceRef.current = 0;
      nextFallAssessmentSequenceRef.current = FALL_WINDOW_SEGMENTS - 1;
      nextHazardAssessmentSequenceRef.current = HAZARD_CHECK_STRIDE_SEGMENTS - 1;
      setCameraReady(false);
      setFallDisplayState("warming");
      setFallLatencyMs(null);
      setLive(true);
      setNotice(micPermission.granted ? null : "Microphone is off. Fall checks will use video only.");
    } else {
      setNotice("Camera permission is needed for live monitoring.");
    }
  };

  const recentHazards = events
    .flatMap((event) => event.hazards.map((hazard, index) => ({
      id: `${event.clip_id}-${index}`,
      say: hazard.say,
    })))
    .slice(0, 3);
  const recentSigns = events
    .flatMap((event) => event.sign ? [{ id: event.clip_id, say: event.sign.say }] : [])
    .slice(0, 3);
  return (
    <SafeAreaView style={styles.safeArea} edges={["top", "bottom"]}>
      {live ? <KeepCameraAwake /> : null}
      {checkin.keepAwake ? <KeepCheckinAwake /> : null}
      {screen === "counting" ? null : (
        <View style={styles.header}>
          <View>
            <Text style={styles.brand}>TrailSense</Text>
            <Text style={styles.subtitle}>Trail guidance and safety</Text>
          </View>
        </View>
      )}
      {screen === "sos_banner" ? (
        <SosBanner
          text={sosBannerText(checkin.state)}
          cancelStatus={checkin.state.cancelSosStatus}
          cancelFailed={checkin.state.cancelSosError !== null}
          onCancelSos={checkin.cancelSos}
        />
      ) : null}

      {screen === "counting" ? (
        <CheckinOverlay
          seconds={checkin.state.countdownSeconds}
          total={checkin.state.totalSeconds}
          onCancel={checkin.cancel}
        />
      ) : screen === "cancelled" ? (
        <CancelledScreen />
      ) : screen === "sos_sending" || screen === "sos_failed" ? (
        <SosScreen
          failed={screen === "sos_failed"}
          contactPhone={contactPhone}
          onCallContact={callEmergencyContact}
          onCancel={checkin.cancel}
        />
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
          {notice ? (
            <View style={styles.notice}>
              <Text style={styles.noticeText}>{notice}</Text>
            </View>
          ) : null}

          {sosActive ? (
            // Frame S3 status zone, under the banner, until the SOS is cancelled.
            <View style={[styles.statusCard, styles.statusCardSos]}>
              <Text style={[styles.eyebrow, styles.sosText]}>SOS</Text>
              <Text style={[styles.statusTitle, styles.sosText]}>{SOS_TEXT}</Text>
            </View>
          ) : (
            <View style={styles.safetyCard}>
              <Text style={styles.eyebrow}>LIVE SAFETY MONITORING</Text>
              <Text style={styles.sectionTitle}>Fall status</Text>
              <Text
                accessibilityLiveRegion="polite"
                style={[
                  styles.fallStatusText,
                  fallDisplayState === "detected" ? styles.fallStatusAlert : null,
                ]}
              >
                {FALL_STATUS_LABELS[fallDisplayState]}
              </Text>
              {fallLatencyMs !== null && live ? (
                <Text style={styles.rowSubtitle}>
                  Latest check took {(fallLatencyMs / 1000).toFixed(1)} seconds.
                </Text>
              ) : null}
              <View style={styles.divider} />
              <Text style={styles.sectionTitle}>Recent hazards</Text>
              {recentHazards.length > 0 ? (
                recentHazards.map((hazard) => (
                  <View key={hazard.id} style={styles.hazardRow}>
                    <Text style={styles.hazardBullet}>•</Text>
                    <Text style={styles.hazardText}>{hazard.say}</Text>
                  </View>
                ))
              ) : (
                <Text style={styles.rowSubtitle}>
                  {events.length > 0
                    ? "No hazards detected in the latest check."
                    : live
                      ? "Looking for hazards…"
                      : "Start monitoring to see hazards here."}
                </Text>
              )}
              <View style={styles.divider} />
              <Text style={styles.sectionTitle}>Trail signs</Text>
              {recentSigns.length > 0 ? (
                recentSigns.map((sign) => (
                  <View key={sign.id} style={styles.hazardRow}>
                    <Text style={styles.signBullet}>SIGN</Text>
                    <Text style={styles.hazardText}>{sign.say}</Text>
                  </View>
                ))
              ) : (
                <Text style={styles.rowSubtitle}>No trail signs read yet.</Text>
              )}
              <Text style={styles.safetyHint}>
                {live ? "Camera monitoring is on." : "Camera monitoring is off."}
              </Text>
            </View>
          )}

          <View style={styles.previewCard}>
            <View style={styles.previewHeader}>
              <Text style={styles.sectionTitle}>
                {live ? "Live trail camera" : "Trail camera"}
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
                  When active, TrailSense records short clips and analyzes them as you hike.
                </Text>
              </View>
            )}
            <View style={styles.actionRow}>
              <ActionButton
                label={live ? "Stop monitoring" : "Start trail monitoring"}
                onPress={() => void toggleMonitoring()}
              />
            </View>
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

function KeepCheckinAwake() {
  useKeepAwake("trailsense-checkin", { suppressDeactivateWarnings: true });
  return null;
}

function ActionButton({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.actionButton, pressed && styles.pressed]}
    >
      <Text style={styles.actionButtonText}>{label}</Text>
    </Pressable>
  );
}

const COLORS = {
  bg: colors.bg,
  surface: colors.surface,
  surfaceRaised: colors.surface2,
  divider: colors.divider,
  text: colors.text,
  muted: colors.textMuted,
  accent: colors.accent,
  bright: colors.accentBright,
  warning: colors.sosBg,
  dark: colors.sosFg,
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
  actionButton: { minHeight: 64, minWidth: 64, flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 14, borderRadius: 14, backgroundColor: COLORS.accent },
  actionButtonText: { color: COLORS.text, fontSize: 16, fontWeight: "700", textAlign: "center" },
  pressed: { opacity: 0.78 },
  rowSubtitle: { color: COLORS.muted, fontSize: 14, lineHeight: 20, marginTop: 4 },
  fallStatusText: { color: COLORS.text, fontSize: 16, lineHeight: 23 },
  fallStatusAlert: { color: COLORS.warning, fontWeight: "800" },
  divider: { height: 1, backgroundColor: COLORS.divider },
  safetyCard: { gap: 10, padding: 18, borderRadius: 18, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.divider },
  hazardRow: { flexDirection: "row", alignItems: "flex-start", gap: 9 },
  hazardBullet: { color: COLORS.bright, fontSize: 20, lineHeight: 23, fontWeight: "800" },
  signBullet: { color: COLORS.bright, fontSize: 10, lineHeight: 23, fontWeight: "900", width: 34 },
  hazardText: { color: COLORS.text, flex: 1, fontSize: 16, lineHeight: 23 },
  safetyHint: { color: COLORS.muted, fontSize: 13, marginTop: 2 },
  statusCardSos: { backgroundColor: COLORS.dark },
  sosText: { color: COLORS.warning },
});
