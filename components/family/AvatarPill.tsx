/**
 * Family Mode — Avatar pill rendered in the top-right of Home.
 *
 * Tap → opens ProfileSwitcherSheet via ProfileContext.
 */

import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useProfile } from '../../contexts/ProfileContext';
import { resolveAvatar } from './avatars';

const GOLD = '#FFD700';

export function AvatarPill() {
  const { activeProfile, openSwitcher } = useProfile();
  if (!activeProfile) return null;
  return (
    <TouchableOpacity
      onPress={openSwitcher}
      activeOpacity={0.85}
      accessibilityLabel={`Switch profile (current: ${activeProfile.name})`}
      style={styles.pill}
      hitSlop={8}
    >
      <View style={styles.avatarWrap}>
        <Text style={styles.avatar}>{resolveAvatar(activeProfile.avatarKey)}</Text>
      </View>
      <Text style={styles.name} numberOfLines={1} ellipsizeMode="tail">{activeProfile.name}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingLeft: 4,
    paddingRight: 12,
    paddingVertical: 4,
    backgroundColor: 'rgba(18,6,58,0.92)',
    borderRadius: 22,
    borderWidth: 1.5,
    borderColor: 'rgba(255,215,0,0.55)',
    maxWidth: 260,
  },
  avatarWrap: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255,215,0,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatar: { fontSize: 20 },
  name: { color: GOLD, fontSize: 13, fontWeight: '800', letterSpacing: 0.3, flexShrink: 1 },
});
