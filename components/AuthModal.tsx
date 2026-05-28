/**
 * components/AuthModal.tsx
 *
 * Art Deco casino-themed authentication modal for Hydro Hero.
 * Handles both Sign In and Create Account flows via Supabase.
 * "Maybe Later" closes without signing in — local data is always preserved.
 */

import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from 'react-native';
import { useAuth } from '../contexts/AuthContext';

// ─── Design tokens ────────────────────────────────────────────────────────────
const BG       = '#0a0520';
const GOLD     = '#FFD700';
const BORDER   = 'rgba(255,215,0,0.35)';
const MUTED    = 'rgba(255,255,255,0.45)';

// ─── Props ────────────────────────────────────────────────────────────────────
interface AuthModalProps {
  visible:        boolean;
  onClose:        () => void;
  onAuthSuccess:  () => void;  // called after successful sign-in or sign-up
}

// ─── Sub-component: input field ───────────────────────────────────────────────
function GoldInput({
  value, onChangeText, placeholder, secureTextEntry = false,
  keyboardType = 'default', autoCapitalize = 'none', rightAdornment,
}: {
  value: string;
  onChangeText: (v: string) => void;
  placeholder: string;
  secureTextEntry?: boolean;
  keyboardType?: 'default' | 'email-address';
  autoCapitalize?: 'none' | 'words';
  rightAdornment?: React.ReactNode;
}) {
  return (
    <View style={styles.inputWrap}>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor="rgba(255,255,255,0.3)"
        secureTextEntry={secureTextEntry}
        keyboardType={keyboardType}
        autoCapitalize={autoCapitalize}
        autoCorrect={false}
        style={styles.input}
      />
      {rightAdornment}
    </View>
  );
}

// ─── Sign In tab ──────────────────────────────────────────────────────────────
function SignInTab({ onSuccess }: { onSuccess: () => void }) {
  const { signIn } = useAuth();
  const [email,     setEmail]     = useState('');
  const [password,  setPassword]  = useState('');
  const [showPwd,   setShowPwd]   = useState(false);
  const [loading,   setLoading]   = useState(false);
  const [error,     setError]     = useState<string | null>(null);

  async function handleSignIn() {
    if (!email.trim() || !password) {
      setError('Please enter your email and password.');
      return;
    }
    setError(null);
    setLoading(true);
    const { error: err } = await signIn(email.trim(), password);
    setLoading(false);
    if (err) {
      setError(err);
    } else {
      onSuccess();
    }
  }

  return (
    <View style={styles.formArea}>
      {error && (
        <View style={styles.errorBanner}>
          <Text style={styles.errorTxt}>{error}</Text>
        </View>
      )}

      <GoldInput
        value={email}
        onChangeText={setEmail}
        placeholder="Email address"
        keyboardType="email-address"
      />

      <GoldInput
        value={password}
        onChangeText={setPassword}
        placeholder="Password"
        secureTextEntry={!showPwd}
        rightAdornment={
          <TouchableOpacity onPress={() => setShowPwd(v => !v)} style={styles.eyeBtn}>
            <Text style={styles.eyeTxt}>{showPwd ? '🙈' : '👁️'}</Text>
          </TouchableOpacity>
        }
      />

      <TouchableOpacity
        style={[styles.primaryBtn, loading && styles.primaryBtnDisabled]}
        onPress={handleSignIn}
        disabled={loading}
        activeOpacity={0.85}
      >
        {loading
          ? <ActivityIndicator size="small" color="#0a0520" />
          : <Text style={styles.primaryBtnTxt}>SIGN IN</Text>
        }
      </TouchableOpacity>

      <TouchableOpacity
        style={{ marginTop: 12, alignSelf: 'center' }}
        onPress={() =>
          Alert.alert(
            'Reset Password',
            'Open the Hydro Hero website or check your email for a password reset link.\n\n(Password reset via email is sent by Supabase.)',
          )
        }
      >
        <Text style={styles.forgotTxt}>Forgot Password?</Text>
      </TouchableOpacity>
    </View>
  );
}

// ─── Create Account tab ───────────────────────────────────────────────────────
function CreateAccountTab({ onSuccess }: { onSuccess: () => void }) {
  const { signUp } = useAuth();
  const [username,       setUsername]       = useState('');
  const [email,          setEmail]          = useState('');
  const [password,       setPassword]       = useState('');
  const [confirmPwd,     setConfirmPwd]     = useState('');
  const [showPwd,        setShowPwd]        = useState(false);
  const [showConfirmPwd, setShowConfirmPwd] = useState(false);
  const [loading,        setLoading]        = useState(false);
  const [error,          setError]          = useState<string | null>(null);

  async function handleCreateAccount() {
    if (!username.trim()) { setError('Please choose a username.'); return; }
    if (username.trim().length < 3) { setError('Username must be at least 3 characters.'); return; }
    if (!email.trim())    { setError('Please enter your email address.'); return; }
    if (!password)        { setError('Please enter a password.'); return; }
    if (password.length < 8) { setError('Password must be at least 8 characters.'); return; }
    if (password !== confirmPwd) { setError('Passwords do not match.'); return; }

    setError(null);
    setLoading(true);
    const { error: err } = await signUp(email.trim(), password, username.trim());
    setLoading(false);
    if (err) {
      setError(err);
    } else {
      onSuccess();
    }
  }

  return (
    <View style={styles.formArea}>
      {error && (
        <View style={styles.errorBanner}>
          <Text style={styles.errorTxt}>{error}</Text>
        </View>
      )}

      <GoldInput
        value={username}
        onChangeText={setUsername}
        placeholder="Username (visible to squad)"
        autoCapitalize="words"
      />

      <GoldInput
        value={email}
        onChangeText={setEmail}
        placeholder="Email address"
        keyboardType="email-address"
      />

      <GoldInput
        value={password}
        onChangeText={setPassword}
        placeholder="Password (min 8 characters)"
        secureTextEntry={!showPwd}
        rightAdornment={
          <TouchableOpacity onPress={() => setShowPwd(v => !v)} style={styles.eyeBtn}>
            <Text style={styles.eyeTxt}>{showPwd ? '🙈' : '👁️'}</Text>
          </TouchableOpacity>
        }
      />

      <GoldInput
        value={confirmPwd}
        onChangeText={setConfirmPwd}
        placeholder="Confirm password"
        secureTextEntry={!showConfirmPwd}
        rightAdornment={
          <TouchableOpacity onPress={() => setShowConfirmPwd(v => !v)} style={styles.eyeBtn}>
            <Text style={styles.eyeTxt}>{showConfirmPwd ? '🙈' : '👁️'}</Text>
          </TouchableOpacity>
        }
      />

      <TouchableOpacity
        style={[styles.primaryBtn, loading && styles.primaryBtnDisabled]}
        onPress={handleCreateAccount}
        disabled={loading}
        activeOpacity={0.85}
      >
        {loading
          ? <ActivityIndicator size="small" color="#0a0520" />
          : <Text style={styles.primaryBtnTxt}>CREATE ACCOUNT</Text>
        }
      </TouchableOpacity>
    </View>
  );
}

// ─── Main modal ───────────────────────────────────────────────────────────────
export default function AuthModal({ visible, onClose, onAuthSuccess }: AuthModalProps) {
  const [tab, setTab] = useState<'signin' | 'create'>('signin');

  function handleSuccess() {
    onAuthSuccess();
    onClose();
  }

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <TouchableWithoutFeedback onPress={onClose}>
        <View style={styles.overlay}>
          <TouchableWithoutFeedback onPress={() => {}}>
            <KeyboardAvoidingView
              behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
              style={{ width: '100%' }}
            >
              <ScrollView
                contentContainerStyle={styles.sheet}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
                bounces={false}
              >
                {/* Decorative top bar */}
                <View style={styles.topBar} />

                {/* Header */}
                <Text style={styles.cloudEmoji}>☁️</Text>
                <Text style={styles.title}>SYNC YOUR LUCK</Text>
                <Text style={styles.subtitle}>
                  Create an account to back up your data and never lose your streak
                </Text>

                {/* Tab selector */}
                <View style={styles.tabs}>
                  <TouchableOpacity
                    style={[styles.tab, tab === 'signin' && styles.tabActive]}
                    onPress={() => setTab('signin')}
                  >
                    <Text style={[styles.tabTxt, tab === 'signin' && styles.tabTxtActive]}>
                      SIGN IN
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.tab, tab === 'create' && styles.tabActive]}
                    onPress={() => setTab('create')}
                  >
                    <Text style={[styles.tabTxt, tab === 'create' && styles.tabTxtActive]}>
                      CREATE ACCOUNT
                    </Text>
                  </TouchableOpacity>
                </View>

                {/* Form */}
                {tab === 'signin'
                  ? <SignInTab onSuccess={handleSuccess} />
                  : <CreateAccountTab onSuccess={handleSuccess} />
                }

                {/* Maybe Later */}
                <TouchableOpacity style={styles.laterBtn} onPress={onClose}>
                  <Text style={styles.laterTxt}>Maybe Later</Text>
                </TouchableOpacity>

                {/* Privacy note */}
                <Text style={styles.privacyNote}>
                  Your data stays on your device even without an account
                </Text>
              </ScrollView>
            </KeyboardAvoidingView>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: BG,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderTopWidth: 2,
    borderColor: BORDER,
    paddingHorizontal: 24,
    paddingBottom: 40,
    alignItems: 'center',
  },
  topBar: {
    width: 40, height: 4,
    backgroundColor: BORDER,
    borderRadius: 2,
    marginTop: 12, marginBottom: 20,
  },

  // Header
  cloudEmoji: { fontSize: 36, marginBottom: 8 },
  title: {
    color: GOLD, fontSize: 24, fontWeight: '900',
    letterSpacing: 3, textAlign: 'center', marginBottom: 8,
  },
  subtitle: {
    color: MUTED, fontSize: 13, textAlign: 'center',
    lineHeight: 20, marginBottom: 24,
  },

  // Tabs
  tabs: {
    flexDirection: 'row',
    width: '100%',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: BORDER,
    marginBottom: 20,
    overflow: 'hidden',
  },
  tab: {
    flex: 1, paddingVertical: 12, alignItems: 'center',
  },
  tabActive: { backgroundColor: 'rgba(255,215,0,0.12)' },
  tabTxt: {
    color: MUTED, fontSize: 12, fontWeight: '700', letterSpacing: 1,
  },
  tabTxtActive: { color: GOLD },

  // Form
  formArea: { width: '100%' },
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: BORDER,
    borderRadius: 12,
    marginBottom: 12,
    paddingHorizontal: 14,
  },
  input: {
    flex: 1,
    color: '#fff',
    fontSize: 15,
    paddingVertical: 14,
  },
  eyeBtn: { padding: 6 },
  eyeTxt: { fontSize: 16 },

  // Error
  errorBanner: {
    backgroundColor: 'rgba(255,60,60,0.12)',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,60,60,0.35)',
    padding: 12,
    marginBottom: 14,
  },
  errorTxt: { color: '#FF6B6B', fontSize: 13, textAlign: 'center' },

  // Primary button
  primaryBtn: {
    width: '100%',
    backgroundColor: GOLD,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 6,
  },
  primaryBtnDisabled: { opacity: 0.55 },
  primaryBtnTxt: {
    color: '#0a0520', fontSize: 16, fontWeight: '900', letterSpacing: 2,
  },

  // Forgot
  forgotTxt: { color: MUTED, fontSize: 12 },

  // Maybe later
  laterBtn: { marginTop: 20, paddingVertical: 10 },
  laterTxt: { color: 'rgba(255,255,255,0.35)', fontSize: 14 },

  // Privacy note
  privacyNote: {
    color: 'rgba(255,255,255,0.25)',
    fontSize: 11,
    textAlign: 'center',
    marginTop: 8,
    lineHeight: 16,
  },
});
