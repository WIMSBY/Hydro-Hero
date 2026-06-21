/**
 * utils/AudioRecorder.ts
 *
 * Thin wrapper around expo-av Audio.Recording for the Custom Sounds feature.
 * - Records iOS AAC (.m4a) at HIGH_QUALITY preset
 * - Auto-stops after MAX_DURATION_MS so users can't accidentally record a saga
 * - Single recording at a time; subsequent start calls return { ok:false, reason:'busy' }
 * - Always restores playback-only audio mode on stop/cancel so the rest of the app
 *   keeps making noise like normal
 */

import { Audio } from "expo-av";
import { File as FSFile } from "expo-file-system";

export const MAX_DURATION_MS = 2000;

export interface RecordingResult {
  uri: string | null;
  durationMs: number;
}

export type StartResult =
  | { ok: true }
  | { ok: false; reason: 'permission' | 'busy' | 'error' };

let _activeRec: Audio.Recording | null = null;
let _autoStopTimer: ReturnType<typeof setTimeout> | null = null;

/** Returns true if mic permission is granted (asks if needed). */
export async function ensureMicPermission(): Promise<boolean> {
  try {
    const { status } = await Audio.requestPermissionsAsync();
    return status === 'granted';
  } catch {
    return false;
  }
}

/**
 * Start a recording. Auto-stops after MAX_DURATION_MS and calls onAutoStop.
 * Only one recording at a time — concurrent starts return reason: 'busy'.
 */
export async function startRecording(onAutoStop?: () => void): Promise<StartResult> {
  if (_activeRec) return { ok: false, reason: 'busy' };
  const granted = await ensureMicPermission();
  if (!granted) return { ok: false, reason: 'permission' };
  try {
    await Audio.setAudioModeAsync({
      allowsRecordingIOS: true,
      playsInSilentModeIOS: true,
    });
    const { recording } = await Audio.Recording.createAsync(
      Audio.RecordingOptionsPresets.HIGH_QUALITY,
    );
    _activeRec = recording;
    _autoStopTimer = setTimeout(() => {
      _autoStopTimer = null;
      onAutoStop?.();
    }, MAX_DURATION_MS);
    return { ok: true };
  } catch {
    _activeRec = null;
    return { ok: false, reason: 'error' };
  }
}

/** Stop the active recording and return its URI + duration. */
export async function stopRecording(): Promise<RecordingResult | null> {
  if (!_activeRec) return null;
  const rec = _activeRec;
  _activeRec = null;
  if (_autoStopTimer) { clearTimeout(_autoStopTimer); _autoStopTimer = null; }
  try {
    let durationMs = 0;
    try {
      const status = await rec.getStatusAsync();
      durationMs = (status as { durationMillis?: number }).durationMillis ?? 0;
    } catch {}
    await rec.stopAndUnloadAsync();
    const uri = rec.getURI();
    await Audio.setAudioModeAsync({
      allowsRecordingIOS: false,
      playsInSilentModeIOS: false,
    });
    return { uri, durationMs };
  } catch {
    return null;
  }
}

/**
 * Stop the active recording and delete the temp file. Use this when the user
 * cancels in the Record sheet — no clip should be left behind.
 */
export async function cancelRecording(): Promise<void> {
  if (!_activeRec) return;
  const rec = _activeRec;
  _activeRec = null;
  if (_autoStopTimer) { clearTimeout(_autoStopTimer); _autoStopTimer = null; }
  try {
    await rec.stopAndUnloadAsync();
    const uri = rec.getURI();
    if (uri) {
      try { new FSFile(uri).delete(); } catch {}
    }
  } catch {}
  try {
    await Audio.setAudioModeAsync({
      allowsRecordingIOS: false,
      playsInSilentModeIOS: false,
    });
  } catch {}
}

export function isRecording(): boolean {
  return _activeRec !== null;
}
