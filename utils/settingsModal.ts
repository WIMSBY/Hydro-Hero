/**
 * Tiny pub/sub for the Settings modal opener. Home registers its
 * setShowSettingsModal handler on mount; the Settings tab's tabPress listener
 * calls requestOpenSettings() to trigger it. Avoids depending on URL params
 * (which don't reliably re-fire when already on the destination route).
 */
import { router } from 'expo-router';

let listener: (() => void) | null = null;

export function setSettingsModalOpener(fn: (() => void) | null) {
  listener = fn;
}

export function requestOpenSettings() {
  // Make sure Home is the active tab so the modal mounts on a focused screen.
  router.navigate('/(tabs)');
  // Defer one tick so the navigation can take effect before opening.
  setTimeout(() => listener?.(), 0);
}
