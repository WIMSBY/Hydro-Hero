/**
 * Family Mode — shared avatar palette.
 *
 * Two sources of avatar glyphs:
 *   1. Friendly animal/creature emojis (no licensing)
 *   2. The 5 Hero starter emblems (so kids who picked a Hero identity get
 *      a matching profile avatar). Stored by emblem id like "emblem-droplet"
 *      so the avatar key round-trips with the Hero schema.
 *
 * resolveAvatar(key) returns a display emoji for any stored key, falling
 * back to 🦊 if the key was deleted or never resolved.
 */

import { STARTER_EMBLEMS } from '../../constants/hero';

export const ANIMAL_AVATARS: string[] = [
  '🦊', '🐼', '🦁', '🦄', '🐢',
  '🦋', '🐙', '🐝', '🐳', '🐶',
  '🐱', '🦉', '🦒', '🦝', '🐧',
];

export type AvatarOption = { key: string; glyph: string; label?: string };

export const AVATAR_OPTIONS: AvatarOption[] = [
  ...ANIMAL_AVATARS.map((e) => ({ key: e, glyph: e })),
  ...STARTER_EMBLEMS.map((e) => ({ key: e.id, glyph: e.emoji, label: e.label })),
];

const DEFAULT_GLYPH = '🦊';

export function resolveAvatar(avatarKey: string | undefined | null): string {
  if (!avatarKey) return DEFAULT_GLYPH;
  // Hero emblem id?
  const emblem = STARTER_EMBLEMS.find((e) => e.id === avatarKey);
  if (emblem) return emblem.emoji;
  // Raw emoji (animal palette)
  return avatarKey;
}
