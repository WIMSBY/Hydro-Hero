/**
 * Family Mode — create / edit / delete a profile.
 *
 * One modal serves both add + edit; the editor `state` discriminator
 * drives copy and the Delete button. Delete fires a confirmation Alert.
 */

import React, { useEffect, useState } from 'react';
import {
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Profile } from '../../utils/ProfileStore';
import { AVATAR_OPTIONS } from './avatars';

const GOLD = '#FFD700';
const NAVY = '#0a0520';

type State =
  | { mode: 'add' }
  | { mode: 'edit'; profile: Profile }
  | null;

type Props = {
  state: State;
  canDelete: boolean;
  onClose: () => void;
  onSave: (patch: { name: string; avatarKey: string }) => void;
  onDelete: () => void;
};

export function ProfileEditorModal({ state, canDelete, onClose, onSave, onDelete }: Props) {
  const visible = state !== null;
  const editing = state?.mode === 'edit';
  const existing = state?.mode === 'edit' ? state.profile : null;

  const [name, setName] = useState('');
  const [avatarKey, setAvatarKey] = useState(AVATAR_OPTIONS[0].key);

  useEffect(() => {
    if (!visible) return;
    setName(existing?.name ?? '');
    setAvatarKey(existing?.avatarKey ?? AVATAR_OPTIONS[0].key);
  }, [visible, existing?.id]);

  const trimmedName = name.trim();
  const canSave = trimmedName.length > 0;

  const handleSave = () => {
    if (!canSave) return;
    onSave({ name: trimmedName, avatarKey });
  };

  const confirmDelete = () => {
    if (!existing) return;
    Alert.alert(
      `Delete "${existing.name}"?`,
      'This profile and all of its hydration data will be removed from this device. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: onDelete },
      ],
    );
  };

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
          <Text style={styles.eyebrow}>{editing ? 'EDIT PROFILE' : 'NEW PROFILE'}</Text>
          <Text style={styles.title}>
            {editing ? `Update ${existing?.name}` : 'Add a profile'}
          </Text>

          <Text style={styles.fieldLabel}>NAME</Text>
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder="Name"
            placeholderTextColor="rgba(255,255,255,0.35)"
            maxLength={20}
            style={styles.input}
            returnKeyType="done"
            onSubmitEditing={handleSave}
          />

          <Text style={styles.fieldLabel}>AVATAR</Text>
          <ScrollView style={{ maxHeight: 230 }} showsVerticalScrollIndicator={false}>
            <View style={styles.grid}>
              {AVATAR_OPTIONS.map((opt) => {
                const selected = opt.key === avatarKey;
                return (
                  <TouchableOpacity
                    key={opt.key}
                    activeOpacity={0.8}
                    onPress={() => setAvatarKey(opt.key)}
                    style={[styles.cell, selected && styles.cellSelected]}
                    accessibilityLabel={opt.label ?? opt.glyph}
                  >
                    <Text style={styles.cellGlyph}>{opt.glyph}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </ScrollView>

          <TouchableOpacity
            style={[styles.cta, !canSave && styles.ctaDisabled]}
            disabled={!canSave}
            onPress={handleSave}
            activeOpacity={0.85}
          >
            <Text style={styles.ctaText}>{editing ? 'Save Changes' : 'Create Profile'}</Text>
          </TouchableOpacity>

          {editing && canDelete && (
            <TouchableOpacity onPress={confirmDelete} style={styles.deleteBtn}>
              <Text style={styles.deleteText}>Delete Profile</Text>
            </TouchableOpacity>
          )}

          <TouchableOpacity onPress={onClose} style={styles.dismiss}>
            <Text style={styles.dismissText}>Cancel</Text>
          </TouchableOpacity>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const CELL_SIZE = 52;

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
  eyebrow: { color: GOLD, fontSize: 11, fontWeight: '900', letterSpacing: 1.4, marginBottom: 4 },
  title: { color: '#fff', fontSize: 20, fontWeight: '800', marginBottom: 12 },
  fieldLabel: {
    color: 'rgba(255,255,255,0.55)',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.1,
    marginBottom: 8,
    marginTop: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: 'rgba(255,215,0,0.35)',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  cell: {
    width: CELL_SIZE,
    height: CELL_SIZE,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.18)',
    backgroundColor: 'rgba(255,255,255,0.04)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cellSelected: { borderColor: GOLD, backgroundColor: 'rgba(255,215,0,0.16)' },
  cellGlyph: { fontSize: 26 },
  cta: {
    marginTop: 18,
    backgroundColor: GOLD,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  ctaDisabled: { opacity: 0.4 },
  ctaText: { color: NAVY, fontSize: 15, fontWeight: '900', letterSpacing: 0.4 },
  deleteBtn: { alignSelf: 'center', marginTop: 14, paddingVertical: 6 },
  deleteText: { color: '#ff6b6b', fontSize: 13, fontWeight: '700' },
  dismiss: { alignSelf: 'center', marginTop: 6, paddingVertical: 6 },
  dismissText: { color: 'rgba(255,255,255,0.5)', fontSize: 13, fontWeight: '600' },
});
