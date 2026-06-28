/**
 * contexts/ProfileContext.tsx
 *
 * Family Mode — Day 2 UI glue. Holds the live list of profiles + active
 * profile in React state so the avatar pill, switcher sheet, and editor
 * modal share one source of truth. `profileVersion` bumps on every active-
 * profile switch; root layout keys the <Stack> off it so every screen
 * remounts and re-reads from namespaced storage against the new profile.
 *
 * ProfileSwitcherSheet, ProfileEditorModal, and FamilyWelcomeModal are
 * rendered at provider level so they survive the remount.
 */

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  Profile,
  FREE_PROFILE_CAP,
  PRO_PROFILE_CAP,
  ensureBootstrap,
  loadProfiles,
  addProfile as addProfileStore,
  updateProfile as updateProfileStore,
  deleteProfile as deleteProfileStore,
  setActiveProfileId as setActiveProfileIdStore,
  loadActiveProfileId,
} from '../utils/ProfileStore';
import { useProContext } from './ProContext';
import { ProfileSwitcherSheet } from '../components/family/ProfileSwitcherSheet';
import { ProfileEditorModal } from '../components/family/ProfileEditorModal';
import { FamilyWelcomeModal } from '../components/family/FamilyWelcomeModal';

const FAMILY_WELCOME_KEY = 'family_welcome_seen_v1';

type EditorState =
  | { mode: 'add' }
  | { mode: 'edit'; profile: Profile }
  | null;

interface ProfileContextValue {
  profiles: Profile[];
  activeProfile: Profile | null;
  profileVersion: number;
  cap: number;
  isAtCap: boolean;
  openSwitcher: () => void;
  closeSwitcher: () => void;
  openEditor: (state: Exclude<EditorState, null>) => void;
  switchProfile: (id: string) => Promise<void>;
  addProfile: (p: { name: string; avatarKey: string }) => Promise<Profile | null>;
  updateProfile: (id: string, patch: Partial<Pick<Profile, 'name' | 'avatarKey'>>) => Promise<void>;
  deleteProfile: (id: string) => Promise<void>;
  syncActiveProfileName: (name: string) => Promise<void>;
}

const ProfileContext = createContext<ProfileContextValue>({
  profiles: [],
  activeProfile: null,
  profileVersion: 0,
  cap: FREE_PROFILE_CAP,
  isAtCap: false,
  openSwitcher: () => {},
  closeSwitcher: () => {},
  openEditor: () => {},
  switchProfile: async () => {},
  addProfile: async () => null,
  updateProfile: async () => {},
  deleteProfile: async () => {},
  syncActiveProfileName: async () => {},
});

export function useProfile() {
  return useContext(ProfileContext);
}

export function ProfileProvider({ children }: { children: React.ReactNode }) {
  const { isPro, openPaywall } = useProContext();

  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [activeProfile, setActiveProfile] = useState<Profile | null>(null);
  const [profileVersion, setProfileVersion] = useState(0);

  const [switcherVisible, setSwitcherVisible] = useState(false);
  const [editor, setEditor] = useState<EditorState>(null);
  const [welcomeVisible, setWelcomeVisible] = useState(false);

  const cap = isPro ? PRO_PROFILE_CAP : FREE_PROFILE_CAP;
  const isAtCap = profiles.length >= cap;

  // Initial load: bootstrap → mirror into state.
  useEffect(() => {
    (async () => {
      const { created } = await ensureBootstrap();
      const list = await loadProfiles();
      const activeId = await loadActiveProfileId();
      const active = list.find((p) => p.id === activeId) ?? list[0] ?? null;
      setProfiles(list);
      setActiveProfile(active);

      // Welcome-modal trigger: first time on Build 33+. For brand-new users
      // (created==true here), let Onboarding finish first by gating on the
      // returning-user path; brand-new installs see the welcome after their
      // first session ends and they re-open the app. Worth the simpler logic.
      if (!created) {
        try {
          const seen = await AsyncStorage.getItem(FAMILY_WELCOME_KEY);
          if (seen !== '1') setWelcomeVisible(true);
        } catch {}
      } else {
        // Brand-new install: mark welcome as seen so the modal never appears
        // for first-time users (they don't need a what's-new tour).
        try { await AsyncStorage.setItem(FAMILY_WELCOME_KEY, '1'); } catch {}
      }
    })();
  }, []);

  const refreshProfiles = useCallback(async () => {
    const list = await loadProfiles();
    setProfiles(list);
    const activeId = activeProfile?.id ?? null;
    const stillActive = list.find((p) => p.id === activeId);
    if (stillActive) {
      setActiveProfile(stillActive);
    } else if (list[0]) {
      setActiveProfile(list[0]);
      await setActiveProfileIdStore(list[0].id);
    }
  }, [activeProfile?.id]);

  const switchProfile = useCallback(async (id: string) => {
    if (id === activeProfile?.id) return;
    const target = profiles.find((p) => p.id === id);
    if (!target) return;
    await setActiveProfileIdStore(id);
    setActiveProfile(target);
    setProfileVersion((v) => v + 1);
  }, [activeProfile?.id, profiles]);

  const addProfile = useCallback(async (p: { name: string; avatarKey: string }) => {
    if (profiles.length >= cap) {
      if (!isPro) openPaywall('family-cap');
      return null;
    }
    const created = await addProfileStore(p);
    setProfiles((prev) => [...prev, created]);
    return created;
  }, [profiles.length, cap, isPro, openPaywall]);

  const updateProfile = useCallback(async (id: string, patch: Partial<Pick<Profile, 'name' | 'avatarKey'>>) => {
    await updateProfileStore(id, patch);
    setProfiles((prev) => prev.map((p) => (p.id === id ? { ...p, ...patch } : p)));
    setActiveProfile((prev) => (prev && prev.id === id ? { ...prev, ...patch } : prev));
  }, []);

  const deleteProfile = useCallback(async (id: string) => {
    await deleteProfileStore(id);
    // Pick a replacement if we just nuked the active profile.
    let nextActiveId: string | null = activeProfile?.id ?? null;
    const remaining = profiles.filter((p) => p.id !== id);
    if (id === activeProfile?.id) {
      nextActiveId = remaining[0]?.id ?? null;
      if (nextActiveId) await setActiveProfileIdStore(nextActiveId);
      setActiveProfile(remaining[0] ?? null);
      setProfileVersion((v) => v + 1);
    }
    setProfiles(remaining);
  }, [activeProfile?.id, profiles]);

  // Hero name = single source of truth: HeroSetupModal's save flow calls this
  // so the avatar pill + switcher show the same name the user just typed.
  const syncActiveProfileName = useCallback(async (name: string) => {
    if (!activeProfile) return;
    const trimmed = name.trim();
    if (!trimmed || trimmed === activeProfile.name) return;
    await updateProfile(activeProfile.id, { name: trimmed });
  }, [activeProfile, updateProfile]);

  const openSwitcher = useCallback(() => setSwitcherVisible(true), []);
  const closeSwitcher = useCallback(() => setSwitcherVisible(false), []);
  const openEditor = useCallback((state: Exclude<EditorState, null>) => setEditor(state), []);
  const closeEditor = useCallback(() => setEditor(null), []);

  const dismissWelcome = useCallback(async () => {
    setWelcomeVisible(false);
    try { await AsyncStorage.setItem(FAMILY_WELCOME_KEY, '1'); } catch {}
  }, []);

  const value = useMemo<ProfileContextValue>(() => ({
    profiles,
    activeProfile,
    profileVersion,
    cap,
    isAtCap,
    openSwitcher,
    closeSwitcher,
    openEditor,
    switchProfile,
    addProfile,
    updateProfile,
    deleteProfile,
    syncActiveProfileName,
  }), [
    profiles, activeProfile, profileVersion, cap, isAtCap,
    openSwitcher, closeSwitcher, openEditor,
    switchProfile, addProfile, updateProfile, deleteProfile, syncActiveProfileName,
  ]);

  return (
    <ProfileContext.Provider value={value}>
      {children}
      <ProfileSwitcherSheet
        visible={switcherVisible}
        profiles={profiles}
        activeProfileId={activeProfile?.id ?? null}
        cap={cap}
        isPro={isPro}
        onClose={closeSwitcher}
        onSwitch={async (id) => {
          await switchProfile(id);
          setSwitcherVisible(false);
        }}
        onAdd={() => {
          if (profiles.length >= cap) {
            if (!isPro) {
              setSwitcherVisible(false);
              openPaywall('family-cap');
              return;
            }
          }
          setEditor({ mode: 'add' });
        }}
        onEdit={(profile) => setEditor({ mode: 'edit', profile })}
      />
      <ProfileEditorModal
        state={editor}
        canDelete={profiles.length > 1}
        onClose={closeEditor}
        onSave={async (patch) => {
          if (!editor) return;
          if (editor.mode === 'add') {
            const created = await addProfile(patch);
            if (created) {
              setEditor(null);
              // Don't auto-switch — let the user pick from the sheet so the
              // switch is intentional (avoids accidental data-context blip
              // right after the editor closes).
            }
          } else {
            await updateProfile(editor.profile.id, patch);
            setEditor(null);
          }
        }}
        onDelete={async () => {
          if (!editor || editor.mode !== 'edit') return;
          await deleteProfile(editor.profile.id);
          setEditor(null);
        }}
      />
      <FamilyWelcomeModal
        visible={welcomeVisible}
        onDismiss={dismissWelcome}
        onMeetFamily={() => {
          dismissWelcome();
          setSwitcherVisible(true);
        }}
      />
    </ProfileContext.Provider>
  );
}
