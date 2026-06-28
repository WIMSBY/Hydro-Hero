/**
 * Family Mode — bottom-sheet profile switcher.
 *
 * Props are pure data so the sheet is dumb; the ProfileProvider owns the
 * actual storage mutations and visibility.
 */

import React from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Profile, FREE_PROFILE_CAP } from '../../utils/ProfileStore';
import { resolveAvatar } from './avatars';

const GOLD = '#FFD700';
const NAVY = '#0a0520';

type Props = {
  visible: boolean;
  profiles: Profile[];
  activeProfileId: string | null;
  cap: number;
  isPro: boolean;
  onClose: () => void;
  onSwitch: (id: string) => void;
  onAdd: () => void;
  onEdit: (profile: Profile) => void;
};

export function ProfileSwitcherSheet({
  visible,
  profiles,
  activeProfileId,
  cap,
  isPro,
  onClose,
  onSwitch,
  onAdd,
  onEdit,
}: Props) {
  const atCap = profiles.length >= cap;
  const showProHint = !isPro && profiles.length >= FREE_PROFILE_CAP;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
          <View style={styles.handle} />
          <Text style={styles.eyebrow}>FAMILY MODE</Text>
          <Text style={styles.title}>Switch profile</Text>

          <ScrollView style={{ maxHeight: 340 }} showsVerticalScrollIndicator={false}>
            {profiles.map((p) => {
              const isActive = p.id === activeProfileId;
              return (
                <TouchableOpacity
                  key={p.id}
                  activeOpacity={0.8}
                  onPress={() => onSwitch(p.id)}
                  onLongPress={() => onEdit(p)}
                  style={[styles.row, isActive && styles.rowActive]}
                >
                  <View style={styles.rowAvatar}>
                    <Text style={styles.rowAvatarText}>{resolveAvatar(p.avatarKey)}</Text>
                  </View>
                  <Text style={[styles.rowName, isActive && styles.rowNameActive]} numberOfLines={1}>
                    {p.name}
                  </Text>
                  {isActive && <Text style={styles.activeBadge}>ACTIVE</Text>}
                  <TouchableOpacity
                    onPress={() => onEdit(p)}
                    style={styles.editBtn}
                    hitSlop={10}
                    accessibilityLabel={`Edit ${p.name}`}
                  >
                    <Text style={styles.editBtnText}>✏️</Text>
                  </TouchableOpacity>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          <TouchableOpacity
            activeOpacity={0.85}
            onPress={onAdd}
            style={[styles.addRow, atCap && !isPro && styles.addRowLocked]}
          >
            <Text style={styles.addPlus}>＋</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.addText}>Add Profile</Text>
              {showProHint && (
                <Text style={styles.addProHint}>
                  Free includes {FREE_PROFILE_CAP}. Upgrade to Pro for up to {cap === FREE_PROFILE_CAP ? 5 : cap}.
                </Text>
              )}
              {isPro && atCap && (
                <Text style={styles.addProHint}>
                  Max of {cap} profiles.
                </Text>
              )}
            </View>
            {showProHint && <Text style={styles.proPill}>PRO</Text>}
          </TouchableOpacity>

          <Text style={styles.tip}>Long-press a profile to rename or remove.</Text>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: NAVY,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    paddingHorizontal: 22,
    paddingTop: 12,
    paddingBottom: 36,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,215,0,0.35)',
  },
  handle: {
    alignSelf: 'center',
    width: 38,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.2)',
    marginBottom: 12,
  },
  eyebrow: {
    color: GOLD,
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 1.4,
    marginBottom: 4,
  },
  title: { color: '#fff', fontSize: 22, fontWeight: '800', marginBottom: 14 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    marginBottom: 8,
    gap: 12,
  },
  rowActive: {
    backgroundColor: 'rgba(255,215,0,0.10)',
    borderColor: 'rgba(255,215,0,0.55)',
  },
  rowAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,215,0,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowAvatarText: { fontSize: 24 },
  rowName: { flex: 1, color: '#fff', fontSize: 16, fontWeight: '700' },
  rowNameActive: { color: GOLD },
  activeBadge: {
    color: GOLD,
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1.1,
    marginRight: 4,
  },
  editBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  editBtnText: { fontSize: 16 },
  addRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 12,
    paddingVertical: 14,
    marginTop: 6,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: 'rgba(255,215,0,0.45)',
    borderStyle: 'dashed',
    backgroundColor: 'rgba(255,215,0,0.06)',
  },
  addRowLocked: { opacity: 0.85 },
  addPlus: { color: GOLD, fontSize: 26, fontWeight: '800', width: 28, textAlign: 'center' },
  addText: { color: GOLD, fontSize: 15, fontWeight: '800', letterSpacing: 0.3 },
  addProHint: { color: 'rgba(255,255,255,0.55)', fontSize: 12, marginTop: 2, lineHeight: 16 },
  proPill: {
    color: NAVY,
    backgroundColor: GOLD,
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    overflow: 'hidden',
  },
  tip: {
    color: 'rgba(255,255,255,0.45)',
    fontSize: 11,
    textAlign: 'center',
    marginTop: 12,
  },
});
