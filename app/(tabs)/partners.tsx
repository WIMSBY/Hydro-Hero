/**
 * app/(tabs)/partners.tsx  —  Hydration Squad screen
 *
 * Local-first partner / family progress sharing via exportable codes.
 * No backend required. Codes are base64-encoded JSON snapshots that
 * expire after 24 hours.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert,
  InputAccessoryView,
  Keyboard,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  ScrollView,
  Share,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { useFocusEffect } from '@react-navigation/native';
import QRCode from 'react-native-qrcode-svg';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { router, useLocalSearchParams } from 'expo-router';
import { useProContext } from '../../contexts/ProContext';

// ─── Design tokens ────────────────────────────────────────────────────────────
const BG        = '#0a0520';
const CARD_BG   = 'rgba(255,255,255,0.07)';
const CARD_BORD = 'rgba(255,215,0,0.28)';
const GOLD      = '#FFD700';

const BEV_COLORS: Record<string, string> = {
  water: '#1565C0', coffee: '#7B4F2E', tea: '#8B7355', icedtea: '#C8A000',
  soda: '#C0392B', flavored: '#4488CC', coconut: '#8B6914',
  juice: '#E8920A', lemonade: '#FFD700', fruit: '#CC4488',
  sports: '#2E8B4A', milk: '#AAAAAA', protein: '#8844AA',
  beer: '#D4881A', wine: '#8B1A3A', cocktail: '#7B1A8B',
  energy: '#AACC00', energyshot: '#CC8800', hotchoc: '#5C3317', spirits: '#AA6622',
};
const BEV_KEYS = [
  'water','coffee','tea','icedtea','soda','flavored','coconut',
  'juice','lemonade','fruit','sports','milk','protein',
  'beer','wine','cocktail','energy','energyshot','hotchoc','spirits',
];

const CHEERS = [
  "You're crushing it! Keep sipping!",
  "Don't forget to hydrate — your goal is waiting!",
  "Your streak is on fire — don't break it now! 🔥",
  "Just a few more oz to your goal — you've got this!",
  "Hydration hero! You're an inspiration! 💧",
];

const AVATAR_EMOJIS = [
  '💧','🌊','🏆','🥤','⭐','🔥','💪','🦁','🐯','🐻',
  '🦊','🐺','🦅','🌟','✨','🎯','🏅','🍶','🧋','🎪',
];

// ─── Types ────────────────────────────────────────────────────────────────────
interface WeekDay { date: string; hit: boolean }

interface SquadMember {
  username: string;
  avatar: string;
  hydrationOz: number;
  hydrationPct: number;
  goalOz: number;
  streak: number;
  breakdown: Record<string, number>;
  weekHistory: WeekDay[];
  lifetimeJackpots: number;
  savedAt: number;
  codeTimestamp: number;
}

interface CodePayload extends SquadMember {
  v: number;
  timestamp: number;
  expiresAt: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
const MAX_PASTE_CHARS = 6000;

function ozToMl(oz: number) { return Math.round(oz * 29.5735); }

function dateKey(d: Date) {
  return `water_${d.getFullYear()}_${d.getMonth() + 1}_${d.getDate()}`;
}
function isoDate(d: Date) { return d.toISOString().slice(0, 10); }

function encodePayload(obj: object): string {
  try {
    const json = JSON.stringify(obj);
    return btoa(unescape(encodeURIComponent(json)))
      .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
  } catch { return ''; }
}

function extractProgressCode(input: string): string {
  const normalized = input.replace(/[\u200B-\u200D\uFEFF]/g, '').trim();
  const compact = normalized.replace(/\s+/g, '');
  const candidates = compact.match(/[A-Za-z0-9_-]{80,}/g);
  if (!candidates || candidates.length === 0) return compact;
  return candidates.reduce((longest, candidate) =>
    candidate.length > longest.length ? candidate : longest
  );
}

function normalizePayload(raw: any): CodePayload | null {
  if (!raw || typeof raw !== 'object') return null;

  if (raw.v === 2) {
    const now = typeof raw.t === 'number' ? raw.t : Date.now();
    return {
      v: 2,
      username: typeof raw.u === 'string' ? raw.u : 'Anonymous',
      avatar: typeof raw.a === 'string' ? raw.a : '💧',
      hydrationOz: Number(raw.h) || 0,
      hydrationPct: Number(raw.p) || 0,
      goalOz: Number(raw.g) || 64,
      streak: Number(raw.s) || 0,
      breakdown: {},
      weekHistory: Array.isArray(raw.w) ? raw.w : [],
      lifetimeJackpots: Number(raw.j) || 0,
      savedAt: now,
      codeTimestamp: now,
      timestamp: now,
      expiresAt: typeof raw.e === 'number' ? raw.e : now + 24 * 60 * 60 * 1000,
    };
  }

  if (typeof raw.username === 'string') {
    const now = typeof raw.timestamp === 'number' ? raw.timestamp : Date.now();
    return {
      v: typeof raw.v === 'number' ? raw.v : 1,
      username: raw.username,
      avatar: typeof raw.avatar === 'string' ? raw.avatar : '💧',
      hydrationOz: Number(raw.hydrationOz) || 0,
      hydrationPct: Number(raw.hydrationPct) || 0,
      goalOz: Number(raw.goalOz) || 64,
      streak: Number(raw.streak) || 0,
      breakdown: raw.breakdown && typeof raw.breakdown === 'object' ? raw.breakdown : {},
      weekHistory: Array.isArray(raw.weekHistory) ? raw.weekHistory : [],
      lifetimeJackpots: Number(raw.lifetimeJackpots) || 0,
      savedAt: Number(raw.savedAt) || now,
      codeTimestamp: Number(raw.codeTimestamp) || now,
      timestamp: now,
      expiresAt: typeof raw.expiresAt === 'number' ? raw.expiresAt : now + 24 * 60 * 60 * 1000,
    };
  }

  return null;
}

function decodePayload(code: string): CodePayload | null {
  try {
    const cleanCode = extractProgressCode(code);
    const b64 = cleanCode.replace(/-/g, '+').replace(/_/g, '/');
    const padded = b64.padEnd(Math.ceil(b64.length / 4) * 4, '=');
    const raw = JSON.parse(decodeURIComponent(escape(atob(padded))));
    return normalizePayload(raw);
  } catch { return null; }
}

function timeAgo(ts: number): string {
  const d = Date.now() - ts;
  const m = Math.floor(d / 60000), h = Math.floor(d / 3600000), dy = Math.floor(d / 86400000);
  if (dy > 0) return `${dy} day${dy > 1 ? 's' : ''} ago`;
  if (h  > 0) return `${h} hour${h > 1 ? 's' : ''} ago`;
  if (m  > 0) return `${m} min${m > 1 ? 's' : ''} ago`;
  return 'just now';
}

function computeStreak(goalHist: Record<string, number>): number {
  const today = new Date(); today.setHours(0,0,0,0);
  let streak = 0, d = new Date(today);
  for (let i = 0; i < 365; i++) {
    const pct = goalHist[dateKey(d)];
    if (pct !== undefined && pct >= 1.0) { streak++; d.setDate(d.getDate() - 1); }
    else break;
  }
  return streak;
}

function getLast7Days(goalHist: Record<string, number>): WeekDay[] {
  const today = new Date(); today.setHours(0,0,0,0);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(today); d.setDate(d.getDate() - (6 - i));
    return { date: isoDate(d), hit: (goalHist[dateKey(d)] ?? 0) >= 1.0 };
  });
}

async function fireJackpotNotif(username: string) {
  const flag = `squad_jackpot_notif_${username}_${dateKey(new Date())}`;
  const already = await AsyncStorage.getItem(flag);
  if (already) return;
  try {
    const { status } = await Notifications.getPermissionsAsync();
    if (status !== 'granted') return;
    // Write dedup flag BEFORE scheduling so a crash between write and schedule
    // never causes a second attempt to fire the same notification.
    await AsyncStorage.setItem(flag, '1');
    await Notifications.scheduleNotificationAsync({
      content: {
        title: `${username} hit their goal! 🎯`,
        body: 'Your squad member crushed their hydration goal today — celebrate together!',
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
        seconds: 1, repeats: false,
      },
    });
  } catch {}
}

// ─── Tiny sub-components ──────────────────────────────────────────────────────
function AvatarCircle({ value, size = 54, onPress }: { value: string; size?: number; onPress?: () => void }) {
  const isEmoji = value.length <= 2 && !/[a-zA-Z]/.test(value);
  const Wrapper = onPress ? TouchableOpacity : View;
  return (
    <Wrapper onPress={onPress} style={[s.avatar, { width: size, height: size, borderRadius: size / 2 }]}>
      <Text style={{ fontSize: isEmoji ? size * 0.52 : size * 0.38, color: GOLD, fontWeight: '900' }}>
        {value || '💧'}
      </Text>
    </Wrapper>
  );
}

function MiniDropFill({ pct }: { pct: number }) {
  const h = 28, fill = Math.min(pct, 1) * h;
  return (
    <View style={{ width: 20, height: h, backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 10, overflow: 'hidden', justifyContent: 'flex-end' }}>
      <View style={{ height: fill, backgroundColor: '#0088ff', borderRadius: 10 }} />
    </View>
  );
}

function BevBar({ breakdown, total }: { breakdown: Record<string, number>; total: number }) {
  const nonZero = BEV_KEYS.filter(k => (breakdown[k] ?? 0) > 0);
  if (nonZero.length === 0) return null;
  return (
    <View style={{ height: 8, flexDirection: 'row', borderRadius: 4, overflow: 'hidden', backgroundColor: 'rgba(255,255,255,0.08)' }}>
      {nonZero.map(k => (
        <View key={k} style={{ flex: (breakdown[k] ?? 0) / total, backgroundColor: BEV_COLORS[k] }} />
      ))}
    </View>
  );
}

function WeekDots({ history }: { history: WeekDay[] }) {
  return (
    <View style={{ flexDirection: 'row', gap: 4 }}>
      {history.map((d, i) => (
        <View key={i} style={{
          width: 7, height: 7, borderRadius: 3.5,
          backgroundColor: d.hit ? GOLD : 'rgba(255,255,255,0.18)',
        }} />
      ))}
    </View>
  );
}

const DEEP_LINK_PREFIX = 'hydrohero://add?code=';

function SimpleQRGrid({ code }: { code: string }) {
  return (
    <View style={{ padding: 12, backgroundColor: '#fff', borderRadius: 10, alignSelf: 'center' }}>
      <QRCode value={`${DEEP_LINK_PREFIX}${code}`} size={240} ecl="L" backgroundColor="#fff" color="#000" />
    </View>
  );
}

// ─── Share Code Modal ─────────────────────────────────────────────────────────
function ShareCodeModal({
  visible, code, onClose,
}: { visible: boolean; code: string; onClose: () => void }) {
  const APP_STORE_URL = 'https://apps.apple.com/app/id6764692053';
  const buildBody = (intro: string) =>
    `${intro}\n\n1. Open Hydro Hero (or get it: ${APP_STORE_URL})\n2. Go to Squad → Add Member → Paste Code\n3. Paste this code:\n\n${code}`;
  const share = async (intro: string) => {
    try { await Share.share({ message: buildBody(intro) }); } catch {}
  };
  const emailShare = () => {
    const subj = encodeURIComponent('Add me to your Hydro Hero squad');
    const body = encodeURIComponent(buildBody('Hey! Add me to your Hydro Hero squad 💧'));
    Linking.openURL(`mailto:?subject=${subj}&body=${body}`).catch(() => {});
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <TouchableWithoutFeedback onPress={onClose}>
        <View style={s.overlay}>
          <TouchableWithoutFeedback onPress={() => {}}>
            <View style={s.modalBox}>
              <TouchableOpacity style={s.closeBtn} onPress={onClose}>
                <Text style={s.closeTxt}>✕</Text>
              </TouchableOpacity>
              <Text style={s.modalTitle}>📤 My Progress Code</Text>
              <Text style={s.modalSub}>Share this with squad members so they can see your stats.{'\n'}Code expires in 24 hours.</Text>

              <SimpleQRGrid code={code} />

              <View style={s.codeBox}>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  <Text style={s.codeTxt} selectable>{code}</Text>
                </ScrollView>
              </View>

              <TouchableOpacity style={[s.actionBtn, { backgroundColor: GOLD }]} onPress={() => share('Hey! Here\'s my Hydro Hero progress code 💧')}>
                <Text style={[s.actionBtnTxt, { color: '#0a0520' }]}>💬 Share via Messages</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.actionBtn} onPress={emailShare}>
                <Text style={s.actionBtnTxt}>✉️ Share via Email</Text>
              </TouchableOpacity>
            </View>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
}

// ─── Emoji Picker Modal ───────────────────────────────────────────────────────
function EmojiPickerModal({
  visible, current, onPick, onClose,
}: { visible: boolean; current: string; onPick: (e: string) => void; onClose: () => void }) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <TouchableWithoutFeedback onPress={onClose}>
        <View style={s.overlay}>
          <TouchableWithoutFeedback onPress={() => {}}>
            <View style={[s.modalBox, { paddingVertical: 20 }]}>
              <Text style={s.modalTitle}>Choose Your Avatar</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, justifyContent: 'center', marginTop: 8 }}>
                {AVATAR_EMOJIS.map(e => (
                  <TouchableOpacity key={e} onPress={() => onPick(e)}
                    style={[s.emojiBtn, current === e && s.emojiBtnActive]}>
                    <Text style={{ fontSize: 26 }}>{e}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
}

// ─── Cheer On Modal ───────────────────────────────────────────────────────────
function CheerOnModal({
  visible, username, myUsername, onClose,
}: { visible: boolean; username: string; myUsername: string; onClose: () => void }) {
  const [custom, setCustom] = useState('');

  const send = async (msg: string) => {
    const signature = myUsername ? ` — from ${myUsername} via Hydro Hero 💧` : ' — sent from Hydro Hero 💧';
    const text = `${msg}${signature}`;
    try { await Share.share({ message: text }); } catch {}
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <TouchableWithoutFeedback onPress={onClose}>
          <View style={s.overlay}>
            <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
              <View style={s.modalBox}>
                <TouchableOpacity style={s.closeBtn} onPress={onClose}>
                  <Text style={s.closeTxt}>✕</Text>
                </TouchableOpacity>
                <Text style={s.modalTitle}>📣 Cheer On {username}</Text>
                <ScrollView style={{ maxHeight: 320 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
                  {CHEERS.map((msg, i) => (
                    <TouchableOpacity key={i} style={s.cheerRow} onPress={() => send(msg)}>
                      <Text style={s.cheerTxt}>{msg}</Text>
                      <Text style={{ color: GOLD, fontSize: 13 }}>→</Text>
                    </TouchableOpacity>
                  ))}
                  <View style={[s.cheerRow, { flexDirection: 'column', alignItems: 'stretch', gap: 8 }]}>
                    <TextInput
                      value={custom}
                      onChangeText={setCustom}
                      placeholder="Write a custom message..."
                      placeholderTextColor="rgba(255,255,255,0.3)"
                      style={s.cheerInput}
                      multiline
                      inputAccessoryViewID="cheer-msg-done"
                    />
                    {custom.length > 0 && (
                      <TouchableOpacity style={[s.actionBtn, { backgroundColor: GOLD }]} onPress={() => send(custom)}>
                        <Text style={[s.actionBtnTxt, { color: '#0a0520' }]}>Send Custom Message</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                </ScrollView>
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </KeyboardAvoidingView>
      {Platform.OS === 'ios' && (
        <InputAccessoryView nativeID="cheer-msg-done">
          <View style={{ backgroundColor: '#f1f1f1', padding: 8, alignItems: 'flex-end' }}>
            <TouchableOpacity onPress={Keyboard.dismiss} style={{ paddingVertical: 4, paddingHorizontal: 16 }}>
              <Text style={{ color: '#007AFF', fontSize: 16, fontWeight: '600' }}>Done</Text>
            </TouchableOpacity>
          </View>
        </InputAccessoryView>
      )}
    </Modal>
  );
}

// ─── Paste Code Modal (add / update) ─────────────────────────────────────────
function PasteCodeModal({
  visible, title, onSubmit, onClose,
}: { visible: boolean; title: string; onSubmit: (code: string) => void; onClose: () => void }) {
  const [input, setInput] = useState('');
  const extractedCode = extractProgressCode(input);
  const canDecode = extractedCode.length > 10;

  const handleChangeText = (next: string) => {
    setInput(next.length > MAX_PASTE_CHARS ? next.slice(0, MAX_PASTE_CHARS) : next);
  };

  const handleSubmit = () => {
    Keyboard.dismiss();
    onSubmit(extractedCode);
    setInput('');
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
          <View style={s.overlay}>
            <TouchableWithoutFeedback onPress={() => {}}>
              <View style={s.modalBox}>
                <TouchableOpacity style={s.closeBtn} onPress={onClose}>
                  <Text style={s.closeTxt}>✕</Text>
                </TouchableOpacity>
                <Text style={s.modalTitle}>{title}</Text>
                <Text style={s.modalSub}>Paste the code, or paste the whole message your squad member shared.</Text>
                <TextInput
                  value={input}
                  onChangeText={handleChangeText}
                  placeholder="Paste progress code here..."
                  placeholderTextColor="rgba(255,255,255,0.3)"
                  style={[s.codeInput, { height: 90 }]}
                  multiline
                  autoCapitalize="none"
                  autoCorrect={false}
                  inputAccessoryViewID="paste-code-done"
                />
                {input.length > 0 && canDecode && (
                  <Text style={{ color: GOLD, fontSize: 12, marginTop: 6, fontWeight: '600' }}>
                    ✓ Progress code detected
                  </Text>
                )}
                {input.length >= MAX_PASTE_CHARS && (
                  <Text style={{ color: 'rgba(255,255,255,0.45)', fontSize: 11, marginTop: 6 }}>
                    Paste was trimmed to keep the app responsive.
                  </Text>
                )}
                {Platform.OS === 'android' && (
                  <TouchableOpacity
                    onPress={Keyboard.dismiss}
                    style={{ alignSelf: 'flex-end', paddingVertical: 6, paddingHorizontal: 12, marginTop: 4 }}
                  >
                    <Text style={{ color: GOLD, fontSize: 13, fontWeight: '700' }}>Done</Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity
                  style={[s.actionBtn, { backgroundColor: canDecode ? GOLD : 'rgba(255,215,0,0.2)' }]}
                  onPress={handleSubmit}
                  disabled={!canDecode}
                >
                  <Text style={[s.actionBtnTxt, { color: canDecode ? '#0a0520' : 'rgba(255,255,255,0.4)' }]}>
                    Decode & Preview
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity style={s.cancelBtn} onPress={onClose}>
                  <Text style={s.cancelBtnTxt}>Cancel</Text>
                </TouchableOpacity>
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </KeyboardAvoidingView>
      {Platform.OS === 'ios' && (
        <InputAccessoryView nativeID="paste-code-done">
          <View style={{ backgroundColor: '#f1f1f1', padding: 8, alignItems: 'flex-end' }}>
            <TouchableOpacity onPress={Keyboard.dismiss} style={{ paddingVertical: 4, paddingHorizontal: 16 }}>
              <Text style={{ color: '#007AFF', fontSize: 16, fontWeight: '600' }}>Done</Text>
            </TouchableOpacity>
          </View>
        </InputAccessoryView>
      )}
    </Modal>
  );
}

// ─── Scan QR Code Modal ──────────────────────────────────────────────────────
function ScanCodeModal({
  visible, onScan, onClose,
}: { visible: boolean; onScan: (raw: string) => void; onClose: () => void }) {
  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState(false);

  useEffect(() => {
    if (visible) setScanned(false);
  }, [visible]);

  const handleScan = (result: { data: string }) => {
    if (scanned) return;
    setScanned(true);
    onScan(result.data);
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: '#000' }}>
        {!permission ? null : !permission.granted ? (
          <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32 }}>
            <Text style={{ fontSize: 56, marginBottom: 16 }}>📷</Text>
            <Text style={{ color: '#fff', fontSize: 18, fontWeight: '700', marginBottom: 10, textAlign: 'center' }}>
              Camera Access
            </Text>
            <Text style={{ color: 'rgba(255,255,255,0.6)', fontSize: 14, marginBottom: 24, textAlign: 'center', lineHeight: 20 }}>
              {permission.canAskAgain
                ? "Hydro Hero uses the camera to scan a squad member's QR code so you can add them to your squad."
                : "Camera access was previously turned off. To scan a QR code, enable Camera in Settings."}
            </Text>
            <TouchableOpacity
              style={[s.actionBtn, { backgroundColor: GOLD, width: '100%' }]}
              onPress={permission.canAskAgain ? requestPermission : () => Linking.openSettings()}
            >
              <Text style={[s.actionBtnTxt, { color: '#0a0520', fontWeight: '800' }]}>
                {permission.canAskAgain ? 'Continue' : 'Open Settings'}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.cancelBtn} onPress={onClose}>
              <Text style={s.cancelBtnTxt}>Cancel</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            <CameraView
              style={{ flex: 1 }}
              facing="back"
              barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
              onBarcodeScanned={scanned ? undefined : handleScan}
            />
            <View style={{ position: 'absolute', top: 70, left: 0, right: 0, alignItems: 'center' }}>
              <Text style={{ color: '#fff', fontSize: 15, fontWeight: '700', backgroundColor: 'rgba(0,0,0,0.55)', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 10 }}>
                Point at a Hydro Hero QR code
              </Text>
            </View>
            <TouchableOpacity
              style={{ position: 'absolute', bottom: 60, alignSelf: 'center', paddingHorizontal: 36, paddingVertical: 14, backgroundColor: 'rgba(255,255,255,0.18)', borderRadius: 14 }}
              onPress={onClose}
            >
              <Text style={{ color: '#fff', fontSize: 16, fontWeight: '700' }}>Cancel</Text>
            </TouchableOpacity>
          </>
        )}
      </View>
    </Modal>
  );
}

// ─── Preview / Confirm Modal ──────────────────────────────────────────────────
function PreviewModal({
  visible, preview, isUpdate, onConfirm, onCancel,
}: {
  visible: boolean;
  preview: CodePayload | null;
  isUpdate: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  if (!preview) return null;
  const expiry = preview.expiresAt < Date.now();
  const totalBev = Object.values(preview.breakdown).reduce((a, b) => a + b, 0);
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <TouchableWithoutFeedback onPress={onCancel}>
        <View style={s.overlay}>
          <TouchableWithoutFeedback onPress={() => {}}>
            <View style={s.modalBox}>
              <TouchableOpacity style={s.closeBtn} onPress={onCancel}>
                <Text style={s.closeTxt}>✕</Text>
              </TouchableOpacity>
              {expiry ? (
                <>
                  <Text style={[s.modalTitle, { color: '#FF6B6B' }]}>⏰ Code Expired</Text>
                  <Text style={s.modalSub}>This code has expired — ask your partner for a fresh one.</Text>
                  <TouchableOpacity style={s.cancelBtn} onPress={onCancel}>
                    <Text style={s.cancelBtnTxt}>OK</Text>
                  </TouchableOpacity>
                </>
              ) : (
                <>
                  <Text style={s.modalTitle}>
                    {isUpdate ? `Update ${preview.username}?` : `Add ${preview.username} to your squad?`}
                  </Text>
                  <View style={s.previewCard}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 10 }}>
                      <AvatarCircle value={preview.avatar} size={44} />
                      <View style={{ flex: 1 }}>
                        <Text style={{ color: GOLD, fontSize: 16, fontWeight: '800' }}>{preview.username}</Text>
                        <Text style={{ color: 'rgba(255,255,255,0.55)', fontSize: 12 }}>
                          Streak: {preview.streak} 🔥  ·  Goal: {preview.goalOz} oz · {ozToMl(preview.goalOz)} ml
                        </Text>
                      </View>
                      <View style={{ alignItems: 'center' }}>
                        <MiniDropFill pct={preview.hydrationPct} />
                        <Text style={{ color: GOLD, fontSize: 11, fontWeight: '700', marginTop: 3 }}>
                          {Math.round(preview.hydrationPct * 100)}%
                        </Text>
                      </View>
                    </View>
                    {totalBev > 0 && <BevBar breakdown={preview.breakdown} total={totalBev} />}
                    <WeekDots history={preview.weekHistory} />
                  </View>
                  <TouchableOpacity style={[s.actionBtn, { backgroundColor: GOLD }]} onPress={onConfirm}>
                    <Text style={[s.actionBtnTxt, { color: '#0a0520' }]}>
                      {isUpdate ? '✓ Update Progress' : '✓ Add to Squad'}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={s.cancelBtn} onPress={onCancel}>
                    <Text style={s.cancelBtnTxt}>Cancel</Text>
                  </TouchableOpacity>
                </>
              )}
            </View>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
}

// ─── Squad Member Card ────────────────────────────────────────────────────────
function SquadMemberCard({
  member,
  myUsername,
  onCheer,
  onUpdate,
  onRemove,
}: {
  member: SquadMember;
  myUsername: string;
  onCheer: () => void;
  onUpdate: () => void;
  onRemove: () => void;
}) {
  const breakdown = member.breakdown ?? {};
  const weekHistory = member.weekHistory ?? [];
  const totalBev = Object.values(breakdown).reduce((a, b) => a + b, 0);
  const hitGoal = member.hydrationPct >= 1.0;

  return (
    <TouchableOpacity
      onLongPress={() =>
        Alert.alert(
          `Remove ${member.username}?`,
          `Remove ${member.username} from your squad?`,
          [{ text: 'Cancel', style: 'cancel' }, { text: 'Remove', style: 'destructive', onPress: onRemove }]
        )
      }
      activeOpacity={0.95}
      style={s.memberCard}
    >
      {/* Header row */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 }}>
        <AvatarCircle value={member.avatar} size={44} />
        <View style={{ flex: 1 }}>
          <Text style={s.memberName}>{member.username}</Text>
          <Text style={s.memberSub}>
            Streak {member.streak} 🔥  ·  Goal {member.goalOz} oz
          </Text>
        </View>
        <View style={{ alignItems: 'center', gap: 2 }}>
          <MiniDropFill pct={member.hydrationPct} />
          <Text style={{ color: hitGoal ? GOLD : 'rgba(255,255,255,0.6)', fontSize: 11, fontWeight: '700' }}>
            {hitGoal ? '🎯' : `${Math.round(member.hydrationPct * 100)}%`}
          </Text>
        </View>
      </View>

      {/* Beverage bar */}
      {totalBev > 0 && (
        <View style={{ marginBottom: 6 }}>
          <BevBar breakdown={breakdown} total={totalBev} />
        </View>
      )}

      {/* Week history dots */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <WeekDots history={weekHistory} />
        <Text style={{ color: 'rgba(255,255,255,0.3)', fontSize: 9 }}>last 7 days</Text>
        <View style={{ flex: 1 }} />
        <Text style={{ color: GOLD, fontSize: 11 }}>🏆 {member.lifetimeJackpots}</Text>
      </View>

      {/* Action buttons */}
      <View style={{ flexDirection: 'row', gap: 7 }}>
        <TouchableOpacity style={s.cardBtn} onPress={onUpdate}>
          <Text style={s.cardBtnTxt}>🔄 Update</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[s.cardBtn, { backgroundColor: 'rgba(255,215,0,0.12)', borderColor: 'rgba(255,215,0,0.35)' }]} onPress={onCheer}>
          <Text style={[s.cardBtnTxt, { color: GOLD }]}>📣 Cheer On</Text>
        </TouchableOpacity>
        <TouchableOpacity style={s.cardBtn} onPress={() =>
          Share.share({ message: `Hey ${member.username}!${myUsername ? ` ${myUsername} here —` : ''} could you send me your Hydro Hero progress code so I can see how you're doing? Tap to open your Share screen: hydrohero://share` })
        }>
          <Text style={s.cardBtnTxt}>💬 Request</Text>
        </TouchableOpacity>
      </View>

      {/* Updated time */}
      <Text style={{ color: 'rgba(255,255,255,0.25)', fontSize: 10, marginTop: 8, textAlign: 'right' }}>
        Updated {timeAgo(member.savedAt)}
      </Text>
    </TouchableOpacity>
  );
}

// ─── Squad Stats ──────────────────────────────────────────────────────────────
function SquadStats({
  members, myPct, myHydration,
}: { members: SquadMember[]; myPct: number; myHydration: number }) {
  const all = [{ username: 'You', hydrationPct: myPct, hydrationOz: myHydration }, ...members];
  const avg = all.reduce((a, m) => a + m.hydrationPct, 0) / all.length;
  const hits = all.filter(m => m.hydrationPct >= 1.0).length;
  const combined = all.reduce((a, m) => a + m.hydrationOz, 0);
  const best = all.reduce((b, m) => m.hydrationPct > b.hydrationPct ? m : b, all[0]);
  const allHit = hits === all.length;

  return (
    <View style={s.squadStats}>
      <Text style={s.sectionTitle}>SQUAD STATS</Text>
      {allHit && (
        <Text style={{ color: GOLD, fontSize: 14, fontWeight: '800', textAlign: 'center', marginBottom: 10 }}>
          🎯 The whole squad hit their goal today!
        </Text>
      )}
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <View style={s.statCard}>
          <Text style={s.statLbl}>SQUAD AVG</Text>
          <Text style={s.statVal}>{Math.round(avg * 100)}%</Text>
        </View>
        <View style={s.statCard}>
          <Text style={s.statLbl}>GOAL HITS</Text>
          <Text style={s.statVal}>{hits}/{all.length}</Text>
        </View>
        <View style={s.statCard}>
          <Text style={s.statLbl}>COMBINED</Text>
          <Text style={s.statVal}>{combined.toFixed(0)} oz</Text>
        </View>
      </View>
      <View style={[s.statCard, { marginTop: 8, flexDirection: 'row', alignItems: 'center', gap: 8 }]}>
        <Text style={{ color: GOLD, fontSize: 18 }}>👑</Text>
        <View>
          <Text style={s.statLbl}>MOST HYDRATED</Text>
          <Text style={{ color: '#fff', fontSize: 14, fontWeight: '700' }}>
            {best.username}  <Text style={{ color: GOLD }}>{Math.round(best.hydrationPct * 100)}%</Text>
          </Text>
        </View>
      </View>
    </View>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────
export default function PartnersScreen() {
  const { isPro, openPaywall } = useProContext();

  // My profile state
  const [username, setUsername]       = useState('');
  const [avatar, setAvatar]           = useState('💧');
  const [myHydration, setMyHydration] = useState(0);
  const [myGoal, setMyGoal]           = useState(64);
  const [myPct, setMyPct]             = useState(0);
  const [myStreak, setMyStreak]       = useState(0);
  const [myBreakdown, setMyBreakdown] = useState<Record<string, number>>({});
  const [myWeekHist, setMyWeekHist]   = useState<WeekDay[]>([]);
  const [myJackpots, setMyJackpots]   = useState(0);

  // Squad state
  const [members, setMembers]         = useState<SquadMember[]>([]);

  // Modal visibility
  const [showShare, setShowShare]     = useState(false);
  const [showEmoji, setShowEmoji]     = useState(false);
  const [showAdd, setShowAdd]         = useState(false);
  const [showScan, setShowScan]       = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [previewPayload, setPreviewPayload] = useState<CodePayload | null>(null);
  const [isUpdateFor, setIsUpdateFor] = useState<string | null>(null); // username being updated
  const [cheerFor, setCheerFor]       = useState<string | null>(null);

  const [myCode, setMyCode] = useState('');

  const { addCode, showShare: showShareParam } = useLocalSearchParams<{ addCode?: string; showShare?: string }>();
  const processedAddCode = useRef<string | null>(null);
  const processedShowShare = useRef<string | null>(null);

  useFocusEffect(useCallback(() => { loadAll(); }, []));

  useEffect(() => {
    if (addCode && addCode !== processedAddCode.current) {
      processedAddCode.current = addCode;
      handleCodeSubmit(addCode);
      router.setParams({ addCode: undefined });
    }
  }, [addCode]);

  useEffect(() => {
    if (showShareParam && showShareParam !== processedShowShare.current) {
      processedShowShare.current = showShareParam;
      generateCode();
      router.setParams({ showShare: undefined });
    }
  }, [showShareParam]);

  // ── Data loading ────────────────────────────────────────────────────────────
  async function loadAll() {
    try {
      const [
        rawUsername, rawAvatar, rawMembers,
        rawHyd, rawGoal, rawGoalHist, rawBreakdown, rawJackpots,
      ] = await Promise.all([
        AsyncStorage.getItem('partner_username'),
        AsyncStorage.getItem('partner_avatar'),
        AsyncStorage.getItem('squad_members'),
        AsyncStorage.getItem('water_total_hydration'),
        AsyncStorage.getItem('water_goal'),
        AsyncStorage.getItem('goal_history'),
        AsyncStorage.getItem('water_category_breakdown'),
        AsyncStorage.getItem('lifetime_jackpots'),
      ]);

      if (rawUsername) setUsername(rawUsername);
      if (rawAvatar)   setAvatar(rawAvatar);
      if (rawMembers)  setMembers(JSON.parse(rawMembers));

      const hyd       = rawHyd ? JSON.parse(rawHyd) : 0;
      const goal      = rawGoal ? JSON.parse(rawGoal) : 64;
      const goalHist  = rawGoalHist ? JSON.parse(rawGoalHist) : {};
      const breakdown = rawBreakdown ? JSON.parse(rawBreakdown) : {};
      const jackpots  = rawJackpots ? JSON.parse(rawJackpots) : 0;

      setMyHydration(hyd);
      setMyGoal(goal);
      setMyPct(goal > 0 ? hyd / goal : 0);
      setMyStreak(computeStreak(goalHist));
      setMyBreakdown(breakdown);
      setMyWeekHist(getLast7Days(goalHist));
      setMyJackpots(jackpots);
    } catch {}
  }

  // ── Generate my progress code ────────────────────────────────────────────────
  function buildAndShowCode() {
    const now = Date.now();
    const payload = {
      v: 2,
      u: username.trim() || 'Anonymous',
      a: avatar,
      h: Math.round(myHydration * 10) / 10,
      p: Math.round(myPct * 1000) / 1000,
      g: myGoal,
      s: myStreak,
      w: myWeekHist,
      j: myJackpots,
      t: now,
      e: now + 24 * 60 * 60 * 1000,
    };
    const code = encodePayload(payload);
    setMyCode(code);
    setShowShare(true);
  }

  function generateCode() {
    if (!username.trim()) {
      Alert.alert(
        'Share as Anonymous?',
        'You haven\'t set a display name yet. Your squad will see you as "Anonymous". Set a name first so they know it\'s you.',
        [
          { text: 'Edit Name', style: 'cancel' },
          { text: 'Share Anyway', onPress: buildAndShowCode },
        ],
      );
      return;
    }
    buildAndShowCode();
  }

  // ── Save username / avatar ───────────────────────────────────────────────────
  async function saveUsername(val: string) {
    setUsername(val);
    try { await AsyncStorage.setItem('partner_username', val); } catch {}
  }
  async function pickAvatar(e: string) {
    setAvatar(e);
    setShowEmoji(false);
    try { await AsyncStorage.setItem('partner_avatar', e); } catch {}
  }

  // ── Decode an incoming code ──────────────────────────────────────────────────
  function handleCodeSubmit(raw: string) {
    const payload = decodePayload(raw);
    if (!payload || !payload.username) {
      Alert.alert('Invalid Code', 'This code could not be decoded. Make sure you copied the full code.');
      return;
    }
    if (!isUpdateFor && members.some(m => m.username === payload.username)) {
      setShowAdd(false);
      Alert.alert(
        `${payload.username} is already in your squad`,
        `To refresh their progress, tap 🔄 Update on their card.`
      );
      return;
    }
    setPreviewPayload(payload);
    setShowPreview(true);
    setShowAdd(false);
  }

  // ── Confirm adding / updating ────────────────────────────────────────────────
  async function confirmAdd() {
    if (!previewPayload) return;
    // Free tier: max 1 squad member. Adding a new (non-update) member when already at limit → paywall.
    if (!isPro && !isUpdateFor && members.length >= 1) {
      openPaywall();
      return;
    }
    const member: SquadMember = {
      username:       previewPayload.username,
      avatar:         previewPayload.avatar,
      hydrationOz:    previewPayload.hydrationOz,
      hydrationPct:   previewPayload.hydrationPct,
      goalOz:         previewPayload.goalOz,
      streak:         previewPayload.streak,
      breakdown:      previewPayload.breakdown,
      weekHistory:    previewPayload.weekHistory,
      lifetimeJackpots: previewPayload.lifetimeJackpots,
      savedAt:        Date.now(),
      codeTimestamp:  previewPayload.timestamp,
    };

    let updated: SquadMember[];
    if (isUpdateFor) {
      updated = members.map(m => m.username === isUpdateFor ? member : m);
    } else {
      // avoid duplicates by username
      updated = [...members.filter(m => m.username !== member.username), member];
    }

    setMembers(updated);
    try { await AsyncStorage.setItem('squad_members', JSON.stringify(updated)); } catch {}

    // Fire jackpot notification if partner hit goal today
    if (previewPayload.hydrationPct >= 1.0) {
      await fireJackpotNotif(previewPayload.username);
    }

    setShowPreview(false);
    setPreviewPayload(null);
    setIsUpdateFor(null);
  }

  // ── Remove member ────────────────────────────────────────────────────────────
  async function removeMember(uname: string) {
    const updated = members.filter(m => m.username !== uname);
    setMembers(updated);
    try { await AsyncStorage.setItem('squad_members', JSON.stringify(updated)); } catch {}
  }

  const myTotalBev = Object.values(myBreakdown).reduce((a, b) => a + b, 0);

  return (
    <View style={s.root}>
      <StatusBar barStyle="light-content" backgroundColor={BG} />

      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false} bounces={false}
        keyboardShouldPersistTaps="handled">

        {/* Header */}
        <View style={s.header}>
          <Text style={s.title}>HYDRATION SQUAD</Text>
          <Text style={s.subtitle}>Stay hydrated together</Text>
        </View>

        {/* My Profile Card */}
        <View style={s.card}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 }}>
            <AvatarCircle value={avatar} size={58} onPress={() => setShowEmoji(true)} />
            <View style={{ flex: 1 }}>
              <TextInput
                value={username}
                onChangeText={saveUsername}
                placeholder="Set your display name..."
                placeholderTextColor="rgba(255,255,255,0.3)"
                style={s.usernameInput}
                maxLength={24}
                returnKeyType="done"
                onSubmitEditing={Keyboard.dismiss}
              />
              <Text style={{ color: 'rgba(255,255,255,0.3)', fontSize: 10, marginTop: 2 }}>
                Tap avatar to change • Tap name to edit
              </Text>
            </View>
          </View>

          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 }}>
            <MiniDropFill pct={myPct} />
            <Text style={{ color: myPct >= 1 ? GOLD : '#fff', fontSize: 22, fontWeight: '900' }}>
              {Math.round(myPct * 100)}%
            </Text>
            <Text style={{ color: 'rgba(255,255,255,0.5)', fontSize: 13 }}>
              {myStreak > 0 ? `🔥 ${myStreak} day streak` : 'No streak yet'}
            </Text>
            <View style={{ flex: 1 }} />
            <Text style={{ color: 'rgba(255,255,255,0.4)', fontSize: 12 }}>Goal: {myGoal} oz · {ozToMl(myGoal)} ml</Text>
          </View>

          {myTotalBev > 0 && (
            <View style={{ marginBottom: 8 }}>
              <BevBar breakdown={myBreakdown} total={myTotalBev} />
            </View>
          )}
          <WeekDots history={myWeekHist} />

          <TouchableOpacity style={[s.actionBtn, { backgroundColor: GOLD, marginTop: 14 }]} onPress={generateCode}>
            <Text style={[s.actionBtnTxt, { color: '#0a0520', fontWeight: '800' }]}>📤 Share My Progress</Text>
          </TouchableOpacity>
        </View>

        {/* Add Squad Member */}
        <Text style={s.sectionTitle}>➕ ADD A SQUAD MEMBER</Text>
        <View style={s.card}>
          <Text style={{ color: 'rgba(255,255,255,0.5)', fontSize: 12, marginBottom: 10 }}>
            Ask a friend to share their progress code, then paste it here.
          </Text>
          <TouchableOpacity style={s.actionBtn} onPress={() => { setIsUpdateFor(null); setShowAdd(true); }}>
            <Text style={s.actionBtnTxt}>📋 Paste a Progress Code</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[s.actionBtn, { marginTop: 8 }]}
            onPress={() => { setIsUpdateFor(null); setShowScan(true); }}
          >
            <Text style={s.actionBtnTxt}>📷 Scan QR Code</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[s.actionBtn, { marginTop: 8 }]}
            onPress={() => Share.share({
              message: `Hey!${username ? ` ${username} here —` : ''} I'm using Hydro Hero to track my hydration and I want you on my squad. Download it here: https://apps.apple.com/app/id6764692053`,
            })}
          >
            <Text style={s.actionBtnTxt}>✉️ Invite a Friend</Text>
          </TouchableOpacity>
        </View>

        {/* Squad Members or Empty State */}
        {members.length === 0 ? (
          <View style={[s.card, { alignItems: 'center', paddingVertical: 32 }]}>
            <Text style={{ fontSize: 48, marginBottom: 12 }}>👥</Text>
            <Text style={{ color: GOLD, fontSize: 16, fontWeight: '800', marginBottom: 6 }}>Your squad is empty!</Text>
            <Text style={{ color: 'rgba(255,255,255,0.45)', fontSize: 13, textAlign: 'center', lineHeight: 20, marginBottom: 18, maxWidth: 300 }}>
              {isPro
                ? 'Add friends and family to hydrate together — cheer each other on and compare streaks.'
                : 'Add a hydration buddy. Free includes 1 squad member — upgrade to Pro for unlimited.'}
            </Text>
            <TouchableOpacity style={[s.actionBtn, { backgroundColor: GOLD }]} onPress={generateCode}>
              <Text style={[s.actionBtnTxt, { color: '#0a0520', fontWeight: '800' }]}>📤 Share My Progress</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            <Text style={s.sectionTitle}>YOUR SQUAD · {members.length}</Text>
            {members.map(m => (
              <SquadMemberCard
                key={m.username}
                member={m}
                myUsername={username}
                onCheer={() => setCheerFor(m.username)}
                onUpdate={() => { setIsUpdateFor(m.username); setShowAdd(true); }}
                onRemove={() => removeMember(m.username)}
              />
            ))}
          </>
        )}

        {/* Squad Stats (2+ members) */}
        {members.length >= 1 && (
          <SquadStats members={members} myPct={myPct} myHydration={myHydration} />
        )}

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* Modals */}
      <ShareCodeModal visible={showShare} code={myCode} onClose={() => setShowShare(false)} />

      <EmojiPickerModal
        visible={showEmoji} current={avatar}
        onPick={pickAvatar} onClose={() => setShowEmoji(false)}
      />

      <PasteCodeModal
        visible={showAdd}
        title={isUpdateFor ? `Update ${isUpdateFor}'s Progress` : '📥 Add Squad Member'}
        onSubmit={handleCodeSubmit}
        onClose={() => { setShowAdd(false); setIsUpdateFor(null); }}
      />

      <ScanCodeModal
        visible={showScan}
        onScan={(raw) => { setShowScan(false); handleCodeSubmit(raw); }}
        onClose={() => setShowScan(false)}
      />

      <PreviewModal
        visible={showPreview}
        preview={previewPayload}
        isUpdate={!!isUpdateFor}
        onConfirm={confirmAdd}
        onCancel={() => { setShowPreview(false); setPreviewPayload(null); setIsUpdateFor(null); }}
      />

      {cheerFor && (
        <CheerOnModal
          visible
          username={cheerFor}
          myUsername={username}
          onClose={() => setCheerFor(null)}
        />
      )}
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  root:  { flex: 1, backgroundColor: BG },
  scroll: { paddingHorizontal: 16, paddingBottom: 20 },

  header: {
    paddingTop: 58, paddingBottom: 16,
    borderBottomWidth: 1, borderBottomColor: 'rgba(255,215,0,0.15)',
    marginBottom: 16, marginHorizontal: -16, paddingHorizontal: 16,
    backgroundColor: BG,
  },
  title:    { color: GOLD, fontSize: 26, fontWeight: '900', letterSpacing: 3, textAlign: 'center' },
  subtitle: { color: 'rgba(255,255,255,0.45)', fontSize: 13, textAlign: 'center', marginTop: 4 },

  sectionTitle: {
    color: GOLD, fontSize: 11, fontWeight: '800', letterSpacing: 1.2,
    marginTop: 20, marginBottom: 8,
  },

  card: {
    backgroundColor: CARD_BG, borderRadius: 16, borderWidth: 1,
    borderColor: CARD_BORD, padding: 16, marginBottom: 10,
  },
  memberCard: {
    backgroundColor: CARD_BG, borderRadius: 16, borderWidth: 1,
    borderColor: CARD_BORD, padding: 14, marginBottom: 10,
  },

  avatar: {
    backgroundColor: 'rgba(255,215,0,0.12)',
    borderWidth: 1.5, borderColor: 'rgba(255,215,0,0.4)',
    alignItems: 'center', justifyContent: 'center',
  },

  usernameInput: {
    color: '#fff', fontSize: 17, fontWeight: '700',
    borderBottomWidth: 1, borderBottomColor: 'rgba(255,215,0,0.3)',
    paddingVertical: 4,
  },

  memberName: { color: GOLD, fontSize: 15, fontWeight: '800' },
  memberSub:  { color: 'rgba(255,255,255,0.45)', fontSize: 11, marginTop: 1 },

  cardBtn: {
    flex: 1, height: 34, borderRadius: 8, borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)', backgroundColor: 'rgba(255,255,255,0.05)',
    alignItems: 'center', justifyContent: 'center',
  },
  cardBtnTxt: { color: 'rgba(255,255,255,0.7)', fontSize: 11, fontWeight: '600' },

  squadStats: {
    backgroundColor: CARD_BG, borderRadius: 16, borderWidth: 1,
    borderColor: CARD_BORD, padding: 16, marginTop: 10,
  },
  statCard: {
    flex: 1, backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 10,
    padding: 10, alignItems: 'center',
  },
  statLbl: { color: GOLD, fontSize: 8, fontWeight: '800', letterSpacing: 0.8, marginBottom: 3 },
  statVal: { color: '#fff', fontSize: 16, fontWeight: '800' },

  // Modals
  overlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.85)',
    justifyContent: 'flex-end',
  },
  modalBox: {
    backgroundColor: '#1a0a3a', borderTopLeftRadius: 24, borderTopRightRadius: 24,
    borderWidth: 1, borderColor: CARD_BORD,
    padding: 22, paddingBottom: 36, maxHeight: '88%',
  },
  closeBtn: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center', alignSelf: 'flex-end' },
  closeTxt: { color: 'rgba(255,255,255,0.55)', fontSize: 18 },
  modalTitle: {
    color: GOLD, fontSize: 18, fontWeight: '800', marginBottom: 6, textAlign: 'center',
  },
  modalSub: {
    color: 'rgba(255,255,255,0.45)', fontSize: 12, textAlign: 'center', marginBottom: 14, lineHeight: 18,
  },

  codeBox: {
    backgroundColor: 'rgba(0,0,0,0.4)', borderRadius: 10, borderWidth: 1,
    borderColor: 'rgba(255,215,0,0.2)', padding: 12, marginVertical: 12,
  },
  codeTxt: {
    color: GOLD, fontSize: 11, fontFamily: 'monospace', letterSpacing: 0.5,
  },
  codeInput: {
    backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 10, borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)', color: '#fff', fontSize: 12,
    padding: 12, marginBottom: 12, fontFamily: 'monospace',
  },

  actionBtn: {
    height: 48, borderRadius: 14, backgroundColor: 'rgba(255,215,0,0.12)',
    borderWidth: 1, borderColor: 'rgba(255,215,0,0.3)',
    alignItems: 'center', justifyContent: 'center', marginBottom: 8,
  },
  actionBtnTxt: { color: GOLD, fontSize: 15, fontWeight: '700' },
  cancelBtn: {
    height: 44, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.06)',
    alignItems: 'center', justifyContent: 'center',
  },
  cancelBtnTxt: { color: 'rgba(255,255,255,0.55)', fontSize: 15 },

  emojiBtn: {
    width: 52, height: 52, borderRadius: 26,
    backgroundColor: 'rgba(255,255,255,0.06)', borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.12)', alignItems: 'center', justifyContent: 'center',
  },
  emojiBtnActive: {
    backgroundColor: 'rgba(255,215,0,0.15)', borderColor: GOLD,
  },

  previewCard: {
    backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 12, padding: 14,
    marginBottom: 14, gap: 6,
  },

  cheerRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 10, padding: 14,
    marginBottom: 8,
  },
  cheerTxt: { color: 'rgba(255,255,255,0.8)', fontSize: 13, flex: 1, lineHeight: 18 },
  cheerInput: {
    backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 10, borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)', color: '#fff', fontSize: 13,
    padding: 10, minHeight: 60,
  },
});
