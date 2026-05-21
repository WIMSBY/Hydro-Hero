import * as SecureStore from 'expo-secure-store';
import { createClient } from '@supabase/supabase-js';

// ─── Credentials ──────────────────────────────────────────────────────────────
// Replace these with your real Supabase project URL and anon key.
// The app works fully without them — cloud sync is simply unavailable.

export const SUPABASE_URL      = 'https://uhmdjjdozsyraahtlull.supabase.co';
export const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVobWRqamRvenN5cmFhaHRsdWxsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDQwNjUyNjAsImV4cCI6MjA1OTY0MTI2MH0.fnwRyb4djDjs7b9xCcDyna6rQG7lMvKGLfJwFbx0RJg';

// ─── Configuration guard ──────────────────────────────────────────────────────
// True only when real (non-placeholder) credentials are present.

export const isSupabaseConfigured =
  SUPABASE_URL.startsWith('https://') &&
  !SUPABASE_URL.includes('YOUR_') &&
  SUPABASE_ANON_KEY.length > 20 &&
  !SUPABASE_ANON_KEY.includes('YOUR_');

// ─── SecureStore adapter (used for auth token persistence) ───────────────────

const ExpoSecureStoreAdapter = {
  getItem:    (key: string)               => SecureStore.getItemAsync(key),
  setItem:    (key: string, value: string) => SecureStore.setItemAsync(key, value),
  removeItem: (key: string)               => SecureStore.deleteItemAsync(key),
};

// ─── Client — null when not configured ───────────────────────────────────────
// Always check isSupabaseConfigured before using this.

export const supabase = isSupabaseConfigured
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        storage:            ExpoSecureStoreAdapter,
        autoRefreshToken:   true,
        persistSession:     true,
        detectSessionInUrl: false,
      },
    })
  : null;
