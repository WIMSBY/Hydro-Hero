/**
 * components/CustomSoundsModal.tsx
 *
 * Pro-gated "Record Your Own Sounds" screen. Surfaces the customizable roles
 * (waterLog, jackpot) as 5-slot grids; tapping a "+" tile opens the Record
 * sheet. Recordings override the active pack for that role; per-play shuffle
 * order is handled inside SoundManager.
 */

import React, { useEffect, useRef, useState } from "react";
import {
  Alert,
  Animated,
  Easing,
  Linking,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Audio } from "expo-av";

import {
  CustomSoundClip,
  CustomSoundsState,
  CustomizableRole,
  MAX_CLIPS_PER_ROLE,
  MAX_DURATION_MS_BY_ROLE,
  addCustomClip,
  clearAllCustomSounds,
  deleteCustomClip,
  loadCustomSounds,
  renameCustomClip,
} from "../utils/CustomSounds";
import {
  cancelRecording,
  startRecording,
  stopRecording,
} from "../utils/AudioRecorder";
import { refreshCustomSounds } from "../utils/SoundManager";

const GOLD = "#c8a000";
const GOLD_DIM = "rgba(200,160,0,0.25)";
const NAVY = "#0a0520";

interface RoleMeta {
  role: CustomizableRole;
  emoji: string;
  title: string;
  description: string;
}

const ROLE_META: RoleMeta[] = [
  { role: "waterLog", emoji: "💦", title: "Drink Splash", description: "Plays each time you log a drink" },
  { role: "jackpot", emoji: "🎉", title: "Goal Celebration", description: "Plays when you complete your daily goal" },
];

export default function CustomSoundsModal({
  visible,
  onClose,
  onBackToSettings,
  activePackName,
}: {
  visible: boolean;
  onClose: () => void;
  onBackToSettings?: () => void;
  activePackName: string;
}) {
  const [state, setState] = useState<CustomSoundsState>({});
  const [recordingFor, setRecordingFor] = useState<CustomizableRole | null>(null);
  const [previewSound, setPreviewSound] = useState<Audio.Sound | null>(null);

  // Reload metadata each time the modal opens.
  useEffect(() => {
    if (!visible) return;
    (async () => {
      const s = await loadCustomSounds();
      setState(s);
    })();
    return () => {
      if (previewSound) {
        previewSound.stopAsync().catch(() => {});
        previewSound.unloadAsync().catch(() => {});
        setPreviewSound(null);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  async function refresh() {
    const s = await loadCustomSounds();
    setState(s);
    await refreshCustomSounds(s);
  }

  async function previewClip(uri: string) {
    try {
      if (previewSound) {
        await previewSound.stopAsync().catch(() => {});
        await previewSound.unloadAsync().catch(() => {});
      }
      const { sound } = await Audio.Sound.createAsync(
        { uri },
        { volume: 0.9, shouldPlay: true },
      );
      setPreviewSound(sound);
      sound.setOnPlaybackStatusUpdate((s) => {
        if (s.isLoaded && s.didJustFinish) {
          sound.unloadAsync().catch(() => {});
          setPreviewSound(null);
        }
      });
    } catch {}
  }

  function handleClipLongPress(role: CustomizableRole, clip: CustomSoundClip) {
    Alert.alert(
      clip.label ?? "Custom clip",
      `Recorded ${new Date(clip.createdAt).toLocaleDateString()}`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Rename",
          onPress: () => {
            (Alert as unknown as { prompt: (...args: unknown[]) => void }).prompt(
              "Rename clip",
              "Give this clip a name (e.g. \"Kid's voice\").",
              [
                { text: "Cancel", style: "cancel" },
                {
                  text: "Save",
                  onPress: async (name?: string) => {
                    await renameCustomClip(role, clip.id, name ?? "");
                    await refresh();
                  },
                },
              ],
              "plain-text",
              clip.label ?? "",
            );
          },
        },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            await deleteCustomClip(role, clip.id);
            await refresh();
          },
        },
      ],
    );
  }

  function handleResetAll() {
    Alert.alert(
      "Reset all custom sounds?",
      "All recorded clips will be deleted. Default sounds from your pack will play again.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Reset",
          style: "destructive",
          onPress: async () => {
            await clearAllCustomSounds();
            await refresh();
          },
        },
      ],
    );
  }

  return (
    <>
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={s.overlay}>
        <View style={s.sheet}>
          <View style={s.header}>
            <TouchableOpacity onPress={onBackToSettings ?? onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Text style={s.headerBack}>← Sound Packs</Text>
            </TouchableOpacity>
            <Text style={s.headerTitle}>Custom Sounds</Text>
            <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Text style={s.headerDone}>Done</Text>
            </TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={{ paddingBottom: 32 }}>
            <Text style={s.subtitle}>
              Record your own splash and celebration sounds. They&apos;ll override the active pack
              ({activePackName}) for those moments. Each role holds up to {MAX_CLIPS_PER_ROLE} clips
              that cycle randomly.
            </Text>

            {ROLE_META.map((m) => {
              const clips = state[m.role] ?? [];
              const empties = Math.max(0, MAX_CLIPS_PER_ROLE - clips.length);
              return (
                <View key={m.role} style={s.roleCard}>
                  <View style={s.roleHeader}>
                    <Text style={s.roleEmoji}>{m.emoji}</Text>
                    <View style={{ flex: 1 }}>
                      <Text style={s.roleTitle}>{m.title}</Text>
                      <Text style={s.roleDesc}>{m.description}</Text>
                    </View>
                    <Text style={s.roleCount}>{clips.length} / {MAX_CLIPS_PER_ROLE}</Text>
                  </View>
                  <View style={s.slotRow}>
                    {clips.map((c) => (
                      <TouchableOpacity
                        key={c.id}
                        style={s.slotFilled}
                        onPress={() => previewClip(c.uri)}
                        onLongPress={() => handleClipLongPress(m.role, c)}
                        delayLongPress={250}
                      >
                        <Text style={s.slotIcon}>▶</Text>
                        <Text style={s.slotDuration}>
                          {(c.durationMs / 1000).toFixed(1)}s
                        </Text>
                        {c.label ? (
                          <Text style={s.slotLabel} numberOfLines={1}>{c.label}</Text>
                        ) : null}
                      </TouchableOpacity>
                    ))}
                    {Array.from({ length: empties }).map((_, i) => (
                      <TouchableOpacity
                        key={`empty-${i}`}
                        style={s.slotEmpty}
                        onPress={() => setRecordingFor(m.role)}
                        disabled={i !== 0}
                      >
                        <Text style={[s.slotPlus, i !== 0 && { opacity: 0.4 }]}>+</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                  <Text style={s.hint}>Tap a clip to preview · Long-press to rename or delete</Text>
                </View>
              );
            })}

            <TouchableOpacity style={s.resetBtn} onPress={handleResetAll}>
              <Text style={s.resetBtnText}>Reset all custom sounds</Text>
            </TouchableOpacity>

            <Text style={s.footnote}>
              Recordings are stored on this device only. They&apos;re lost if you uninstall the app.
            </Text>
          </ScrollView>
        </View>

        {/* RecordSheet rendered as an in-Modal overlay (not a nested Modal) —
            iOS won't present a Modal on top of another Modal. */}
        {recordingFor !== null && (
          <View style={StyleSheet.absoluteFill}>
            <RecordSheet
              role={recordingFor}
              onCancel={() => setRecordingFor(null)}
              onSaved={async () => {
                setRecordingFor(null);
                await refresh();
              }}
            />
          </View>
        )}
      </View>
    </Modal>
    </>
  );
}

// ─── Record sheet ──────────────────────────────────────────────────────────────

type RecordPhase = 'idle' | 'recording' | 'review';

function RecordSheet({
  role,
  onCancel,
  onSaved,
}: {
  role: CustomizableRole | null;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const visible = role !== null;
  const [phase, setPhase] = useState<RecordPhase>('idle');
  const [elapsedMs, setElapsedMs] = useState(0);
  const [reviewUri, setReviewUri] = useState<string | null>(null);
  const [reviewDurationMs, setReviewDurationMs] = useState(0);
  const [permissionDenied, setPermissionDenied] = useState(false);
  const [reviewSound, setReviewSound] = useState<Audio.Sound | null>(null);

  const startTsRef = useRef(0);
  const tickerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!visible) {
      setPhase('idle');
      setElapsedMs(0);
      setReviewUri(null);
      setReviewDurationMs(0);
      setPermissionDenied(false);
      if (tickerRef.current) { clearInterval(tickerRef.current); tickerRef.current = null; }
      pulse.setValue(0);
      if (reviewSound) {
        reviewSound.stopAsync().catch(() => {});
        reviewSound.unloadAsync().catch(() => {});
        setReviewSound(null);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  // Pulse animation while recording
  useEffect(() => {
    if (phase !== 'recording') {
      pulse.setValue(0);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 500, useNativeDriver: true, easing: Easing.inOut(Easing.ease) }),
        Animated.timing(pulse, { toValue: 0, duration: 500, useNativeDriver: true, easing: Easing.inOut(Easing.ease) }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [phase, pulse]);

  const maxMs = role ? MAX_DURATION_MS_BY_ROLE[role] : 2000;

  async function handleStart() {
    if (!role) return;
    setPermissionDenied(false);
    const result = await startRecording(maxMs, () => {
      // auto-stop fired
      handleStop();
    });
    if (!result.ok) {
      if (result.reason === 'permission') setPermissionDenied(true);
      return;
    }
    setPhase('recording');
    setElapsedMs(0);
    startTsRef.current = Date.now();
    tickerRef.current = setInterval(() => {
      const ms = Math.min(maxMs, Date.now() - startTsRef.current);
      setElapsedMs(ms);
    }, 50);
  }

  async function handleStop() {
    if (tickerRef.current) { clearInterval(tickerRef.current); tickerRef.current = null; }
    const result = await stopRecording();
    if (!result || !result.uri) {
      setPhase('idle');
      setElapsedMs(0);
      return;
    }
    // Trust the tick clock if the OS-reported duration is zero (e.g., race conditions).
    const dur = result.durationMs && result.durationMs > 100
      ? result.durationMs
      : Math.max(200, Date.now() - startTsRef.current);
    setReviewUri(result.uri);
    setReviewDurationMs(Math.min(maxMs, dur));
    setPhase('review');
  }

  async function handlePreview() {
    if (!reviewUri) return;
    try {
      if (reviewSound) {
        await reviewSound.stopAsync().catch(() => {});
        await reviewSound.unloadAsync().catch(() => {});
      }
      const { sound } = await Audio.Sound.createAsync(
        { uri: reviewUri },
        { volume: 0.9, shouldPlay: true },
      );
      setReviewSound(sound);
      sound.setOnPlaybackStatusUpdate((st) => {
        if (st.isLoaded && st.didJustFinish) {
          sound.unloadAsync().catch(() => {});
          setReviewSound(null);
        }
      });
    } catch {}
  }

  async function handleRetake() {
    if (reviewSound) {
      await reviewSound.unloadAsync().catch(() => {});
      setReviewSound(null);
    }
    // Discard temp file? It was a tempfile from expo-av; cleaning up isn't critical
    // (iOS purges its cache), but leaving it doesn't hurt either.
    setReviewUri(null);
    setReviewDurationMs(0);
    setPhase('idle');
    setElapsedMs(0);
  }

  async function handleSave() {
    if (!role || !reviewUri) return;
    try {
      if (reviewSound) {
        await reviewSound.stopAsync().catch(() => {});
        await reviewSound.unloadAsync().catch(() => {});
        setReviewSound(null);
      }
      await addCustomClip(role, reviewUri, reviewDurationMs);
      onSaved();
    } catch (e) {
      Alert.alert("Couldn't save", (e as Error).message ?? "Try again in a moment.");
    }
  }

  async function handleCancel() {
    if (phase === 'recording') {
      await cancelRecording();
    }
    if (reviewSound) {
      await reviewSound.unloadAsync().catch(() => {});
      setReviewSound(null);
    }
    onCancel();
  }

  if (!role) return null;
  const meta = ROLE_META.find((m) => m.role === role);

  const pulseScale = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.18] });
  const pulseOpacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.7, 0.3] });

  return (
      <View style={recStyles.overlay}>
        <View style={recStyles.sheet}>
          <Text style={recStyles.title}>Recording {meta?.title}</Text>
          <Text style={recStyles.subtitle}>{meta?.description}</Text>

          <View style={recStyles.micWrap}>
            {phase === 'recording' && (
              <Animated.View style={[recStyles.micPulse, { transform: [{ scale: pulseScale }], opacity: pulseOpacity }]} />
            )}
            <Text style={recStyles.micIcon}>{phase === 'recording' ? '🔴' : '🎙'}</Text>
          </View>

          <Text style={recStyles.timer}>
            {(elapsedMs / 1000).toFixed(1)} / {(maxMs / 1000).toFixed(1)}s
          </Text>

          {phase === 'idle' && !permissionDenied && (
            <TouchableOpacity style={recStyles.primaryBtn} onPress={handleStart}>
              <Text style={recStyles.primaryBtnText}>● Tap to start</Text>
            </TouchableOpacity>
          )}
          {phase === 'idle' && permissionDenied && (
            <View>
              <Text style={recStyles.permissionText}>
                Microphone access is required to record. Enable it in Settings.
              </Text>
              <TouchableOpacity
                style={recStyles.primaryBtn}
                onPress={() => Linking.openSettings()}
              >
                <Text style={recStyles.primaryBtnText}>Open Settings</Text>
              </TouchableOpacity>
            </View>
          )}
          {phase === 'recording' && (
            <TouchableOpacity style={recStyles.primaryBtn} onPress={handleStop}>
              <Text style={recStyles.primaryBtnText}>⬛ Stop</Text>
            </TouchableOpacity>
          )}
          {phase === 'review' && (
            <View>
              <View style={recStyles.reviewRow}>
                <TouchableOpacity style={recStyles.reviewBtn} onPress={handlePreview}>
                  <Text style={recStyles.reviewBtnText}>▶ Play</Text>
                </TouchableOpacity>
                <TouchableOpacity style={recStyles.reviewBtn} onPress={handleRetake}>
                  <Text style={recStyles.reviewBtnText}>🔁 Retake</Text>
                </TouchableOpacity>
              </View>
              <TouchableOpacity style={[recStyles.primaryBtn, { marginTop: 12 }]} onPress={handleSave}>
                <Text style={recStyles.primaryBtnText}>✓ Save</Text>
              </TouchableOpacity>
            </View>
          )}

          <TouchableOpacity style={recStyles.cancelBtn} onPress={handleCancel}>
            <Text style={recStyles.cancelText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </View>
  );
}

// ─── Styles ────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" },
  sheet: { backgroundColor: "#fffaf0", borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 20, paddingTop: 18, height: "92%" },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 14 },
  headerBack: { color: GOLD, fontSize: 14, fontWeight: "700" },
  headerTitle: { color: NAVY, fontSize: 17, fontWeight: "800" },
  headerDone: { color: GOLD, fontSize: 15, fontWeight: "800" },
  subtitle: { color: "#555", fontSize: 13, lineHeight: 19, marginBottom: 20 },
  roleCard: { backgroundColor: "#ffffff", borderRadius: 16, padding: 14, marginBottom: 16, borderWidth: 1, borderColor: GOLD_DIM },
  roleHeader: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 12 },
  roleEmoji: { fontSize: 28 },
  roleTitle: { color: NAVY, fontSize: 15, fontWeight: "800" },
  roleDesc: { color: "#666", fontSize: 12, marginTop: 2 },
  roleCount: { color: GOLD, fontSize: 12, fontWeight: "800" },
  slotRow: { flexDirection: "row", gap: 8, justifyContent: "space-between" },
  slotFilled: { flex: 1, aspectRatio: 1, borderRadius: 10, backgroundColor: GOLD, alignItems: "center", justifyContent: "center", paddingHorizontal: 4 },
  slotEmpty: { flex: 1, aspectRatio: 1, borderRadius: 10, backgroundColor: "rgba(200,160,0,0.08)", borderWidth: 1.5, borderColor: GOLD_DIM, borderStyle: "dashed", alignItems: "center", justifyContent: "center" },
  slotIcon: { color: "#ffffff", fontSize: 16, fontWeight: "800" },
  slotDuration: { color: "#ffffff", fontSize: 11, fontWeight: "700", marginTop: 2 },
  slotLabel: { color: "#ffffff", fontSize: 10, marginTop: 1, opacity: 0.9 },
  slotPlus: { color: GOLD, fontSize: 22, fontWeight: "800" },
  hint: { color: "#999", fontSize: 11, marginTop: 8, textAlign: "center" },
  resetBtn: { marginTop: 8, paddingVertical: 12, alignItems: "center" },
  resetBtnText: { color: "#cc3344", fontSize: 13, fontWeight: "700" },
  footnote: { color: "#888", fontSize: 11, textAlign: "center", marginTop: 16, lineHeight: 16 },
});

const recStyles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.65)", justifyContent: "center", alignItems: "center", padding: 24 },
  sheet: { backgroundColor: "#fffaf0", borderRadius: 22, padding: 24, width: "100%", maxWidth: 360, alignItems: "center" },
  title: { color: NAVY, fontSize: 16, fontWeight: "800", marginBottom: 4 },
  subtitle: { color: "#666", fontSize: 12, marginBottom: 18, textAlign: "center" },
  micWrap: { width: 92, height: 92, alignItems: "center", justifyContent: "center", marginBottom: 12 },
  micPulse: { position: "absolute", width: 92, height: 92, borderRadius: 46, backgroundColor: "rgba(204,51,68,0.35)" },
  micIcon: { fontSize: 52 },
  timer: { color: NAVY, fontSize: 16, fontWeight: "700", marginBottom: 20 },
  primaryBtn: { backgroundColor: GOLD, borderRadius: 14, paddingVertical: 14, paddingHorizontal: 32, alignItems: "center", minWidth: 220 },
  primaryBtnText: { color: "#ffffff", fontSize: 15, fontWeight: "800", letterSpacing: 0.5 },
  reviewRow: { flexDirection: "row", gap: 10 },
  reviewBtn: { flex: 1, paddingVertical: 13, borderRadius: 12, borderWidth: 1.5, borderColor: GOLD, alignItems: "center" },
  reviewBtnText: { color: GOLD, fontSize: 14, fontWeight: "700" },
  cancelBtn: { paddingVertical: 14, marginTop: 6 },
  cancelText: { color: "#888", fontSize: 13 },
  permissionText: { color: "#cc3344", fontSize: 13, textAlign: "center", marginBottom: 12, paddingHorizontal: 12 },
});
