/**
 * Family Mode — one-time welcome modal shown to upgraders on their first
 * launch of Build 33 (account-level flag family_welcome_seen_v1). Brand-
 * new installs never see this — the first-run onboarding already covers
 * them.
 */

import React from 'react';
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

const GOLD = '#FFD700';
const NAVY = '#0a0520';

type Props = {
  visible: boolean;
  onDismiss: () => void;
  onMeetFamily: () => void;
};

export function FamilyWelcomeModal({ visible, onDismiss, onMeetFamily }: Props) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onDismiss}>
      <Pressable style={styles.backdrop} onPress={onDismiss}>
        <Pressable style={styles.card} onPress={(e) => e.stopPropagation()}>
          <Text style={styles.emojiRow}>🦊  🐼  🦁  🦄</Text>
          <Text style={styles.eyebrow}>NEW IN HYDRO HERO</Text>
          <Text style={styles.title}>Meet Family Mode</Text>
          <Text style={styles.body}>
            Share Hydro Hero with the people you live with — each person gets
            their own profile with their own goal, drink log, and Hero. Free
            includes 2 profiles. Pro unlocks 5.
          </Text>
          <Text style={styles.body}>
            Your existing data is already saved to your profile. Tap the
            avatar in the top-right of Home to add the next one.
          </Text>

          <TouchableOpacity onPress={onMeetFamily} style={styles.primary} activeOpacity={0.85}>
            <Text style={styles.primaryText}>Show Me</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={onDismiss} style={styles.secondary}>
            <Text style={styles.secondaryText}>Later</Text>
          </TouchableOpacity>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.75)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  card: {
    width: '100%',
    backgroundColor: NAVY,
    borderRadius: 18,
    padding: 22,
    borderWidth: 1.5,
    borderColor: 'rgba(255,215,0,0.45)',
  },
  emojiRow: { fontSize: 28, textAlign: 'center', letterSpacing: 2, marginBottom: 10 },
  eyebrow: {
    color: GOLD,
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 1.4,
    textAlign: 'center',
    marginBottom: 4,
  },
  title: {
    color: '#fff',
    fontSize: 22,
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: 12,
  },
  body: {
    color: 'rgba(255,255,255,0.75)',
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 12,
  },
  primary: {
    marginTop: 4,
    backgroundColor: GOLD,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  primaryText: { color: NAVY, fontSize: 15, fontWeight: '900', letterSpacing: 0.4 },
  secondary: { alignSelf: 'center', marginTop: 10, paddingVertical: 8 },
  secondaryText: { color: 'rgba(255,255,255,0.55)', fontSize: 13, fontWeight: '700' },
});
