/**
 * contexts/AuthContext.tsx
 *
 * Supabase auth state management for Liquid Luck.
 * Session is persisted via expo-secure-store (handled by the Supabase client).
 * All async errors are caught and surfaced as return values — never thrown.
 *
 * When Supabase is not configured (placeholder credentials) all auth functions
 * return immediately and isAuthenticated stays false — the app works normally.
 */

import React, { createContext, useContext, useEffect, useState } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase, isSupabaseConfigured } from '../utils/supabase';

// ─── Types ────────────────────────────────────────────────────────────────────

interface AuthContextValue {
  user:            User | null;
  session:         Session | null;
  isLoading:       boolean;
  isAuthenticated: boolean;
  signUp:          (email: string, password: string, username: string) => Promise<{ error: string | null }>;
  signIn:          (email: string, password: string) => Promise<{ error: string | null }>;
  signOut:         () => Promise<void>;
  deleteAccount:   () => Promise<void>;
}

// ─── Context ──────────────────────────────────────────────────────────────────

const AuthContext = createContext<AuthContextValue>({
  user:            null,
  session:         null,
  isLoading:       false,
  isAuthenticated: false,
  signUp:          async () => ({ error: null }),
  signIn:          async () => ({ error: null }),
  signOut:         async () => {},
  deleteAccount:   async () => {},
});

// ─── Provider ─────────────────────────────────────────────────────────────────

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user,      setUser]      = useState<User | null>(null);
  const [session,   setSession]   = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(isSupabaseConfigured); // only load if configured

  useEffect(() => {
    // Skip entirely if Supabase is not configured — keeps app unblocked
    if (!isSupabaseConfigured || !supabase) {
      setIsLoading(false);
      return;
    }

    // Restore existing session (tokens live in SecureStore)
    supabase.auth.getSession()
      .then(({ data }) => {
        setSession(data.session);
        setUser(data.session?.user ?? null);
      })
      .catch(() => {})
      .finally(() => setIsLoading(false));

    // Keep state in sync with Supabase auth events
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, sess) => {
      setSession(sess);
      setUser(sess?.user ?? null);
    });

    return () => subscription.unsubscribe();
  }, []);

  // ── Auth operations ──────────────────────────────────────────────────────────

  async function signUp(
    email:    string,
    password: string,
    username: string,
  ): Promise<{ error: string | null }> {
    if (!isSupabaseConfigured || !supabase) return { error: null };
    try {
      const { data, error } = await supabase.auth.signUp({ email, password });
      if (error) return { error: error.message };

      if (data.user) {
        try {
          await supabase.from('profiles').upsert({
            id:         data.user.id,
            username:   username.trim(),
            avatar:     '💧',
            created_at: new Date().toISOString(),
          });
        } catch {}
      }
      return { error: null };
    } catch (e: unknown) {
      return { error: (e as Error)?.message ?? 'Sign up failed' };
    }
  }

  async function signIn(
    email:    string,
    password: string,
  ): Promise<{ error: string | null }> {
    if (!isSupabaseConfigured || !supabase) return { error: null };
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) return { error: error.message };
      return { error: null };
    } catch (e: unknown) {
      return { error: (e as Error)?.message ?? 'Sign in failed' };
    }
  }

  async function signOut(): Promise<void> {
    if (!isSupabaseConfigured || !supabase) return;
    try { await supabase.auth.signOut(); } catch {}
  }

  async function deleteAccount(): Promise<void> {
    if (!isSupabaseConfigured || !supabase) return;
    try {
      const uid = user?.id;
      if (!uid) return;
      await Promise.allSettled([
        supabase.from('hydration_logs').delete().eq('user_id', uid),
        supabase.from('beverage_logs').delete().eq('user_id', uid),
        supabase.from('achievements').delete().eq('user_id', uid),
        supabase.from('profiles').delete().eq('id', uid),
      ]);
      await supabase.auth.signOut();
    } catch {}
  }

  return (
    <AuthContext.Provider value={{
      user, session, isLoading, isAuthenticated: !!session,
      signUp, signIn, signOut, deleteAccount,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useAuth(): AuthContextValue {
  return useContext(AuthContext);
}
