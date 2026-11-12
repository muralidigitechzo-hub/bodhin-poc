/** Session store. Swap persistence to expo-secure-store when the real backend lands. */
import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import type { Session } from '@/core/types';

const KEY = 'bodhin.session.v1';
const web = typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';

export type Mode = 'learner' | 'educator';

/** The workspace this user manages (owner or tutor), if any. */
export function educatorMembership(session: Session | null) {
  return session?.memberships.find((m) => m.role === 'owner' || m.role === 'tutor') ?? null;
}

/** Bodhin staff role (Super Admin portal), if any. */
export function adminMembership(session: Session | null) {
  return session?.memberships.find((m) => m.role === 'super_admin' || m.role === 'finance' || m.role === 'moderator' || m.role === 'support') ?? null;
}

/** Where "my courses" lives: Bodhin staff manage Bodhin's own courses from the admin portal. */
export function coursesHome(session: Session | null) {
  return adminMembership(session) && !educatorMembership(session) ? '/admin/content' : '/educator/courses';
}

/** Where a signed-in user lands. One login: role decides the area. */
export function homePath(session: Session | null, mode: Mode | null) {
  if (!session) return '/sign-in';
  if (adminMembership(session)) return '/admin';
  const edu = educatorMembership(session);
  return edu && mode !== 'learner' ? '/educator/home' : '/home';
}

interface AuthState {
  session: Session | null;
  ready: boolean;
  onboarded: boolean;
  mode: Mode | null;
  setMode: (m: Mode) => void;
  setSession: (s: Session | null) => void;
  markOnboarded: () => void;
  signOut: () => void;
}

const Ctx = createContext<AuthState | null>(null);

/**
 * Login and view mode are kept per browser TAB (sessionStorage) and also remembered for the next tab (localStorage).
 * So a tutor tab and a student tab can stay signed in as different people, and refreshing one never switches its account.
 */
const read = (k: string) => {
  try {
    if (!web) return null;
    return window.sessionStorage.getItem(k) ?? window.localStorage.getItem(k);
  } catch {
    return null;
  }
};
const write = (k: string, v: string | null) => {
  try {
    if (!web) return;
    if (v == null) {
      window.sessionStorage.removeItem(k);
      window.localStorage.removeItem(k);
    } else {
      window.sessionStorage.setItem(k, v);
      window.localStorage.setItem(k, v);
    }
  } catch {
    /* ignore */
  }
};

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSessionState] = useState<Session | null>(null);
  const [onboarded, setOnboarded] = useState(false);
  const [mode, setModeState] = useState<Mode | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const raw = read(KEY);
    if (raw) {
      try {
        setSessionState(JSON.parse(raw));
      } catch {
        /* corrupted → signed out */
      }
    }
    setOnboarded(read('bodhin.onboarded') === '1');
    setModeState((read('bodhin.mode') as Mode | null) ?? null);
    setReady(true);
  }, []);

  const setSession = useCallback((s: Session | null) => {
    setSessionState(s);
    write(KEY, s ? JSON.stringify(s) : null);
  }, []);

  const markOnboarded = useCallback(() => {
    setOnboarded(true);
    write('bodhin.onboarded', '1');
  }, []);

  const setMode = useCallback((m: Mode) => {
    setModeState(m);
    write('bodhin.mode', m);
  }, []);

  const signOut = useCallback(() => {
    setSession(null);
    setModeState(null);
    write('bodhin.mode', null);
  }, [setSession]);

  return <Ctx.Provider value={{ session, ready, onboarded, mode, setMode, setSession, markOnboarded, signOut }}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAuth must be used inside AuthProvider');
  return v;
}
