import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { Session, User } from "@supabase/supabase-js";
import { getSupabase } from "../services/supabase/client";

export interface AuthUser {
  id: string;
  email: string | null;
  displayName: string | null;
  avatarUrl: string | null;
}

export type AuthStatus = "loading" | "guest" | "authenticated";

interface AuthValue {
  status: AuthStatus;
  user: AuthUser | null;
  supabaseConfigured: boolean;
  signInWithGoogle: () => Promise<void>;
  signInWithEmail: (
    email: string
  ) => Promise<{ sent: boolean; error?: string }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthValue | null>(null);

function mapUser(user: User): AuthUser {
  const meta = user.user_metadata ?? {};
  return {
    id: user.id,
    email: user.email ?? null,
    displayName: (meta.full_name as string) ?? (meta.name as string) ?? null,
    avatarUrl: (meta.avatar_url as string) ?? (meta.picture as string) ?? null,
  };
}

function redirectUrl() {
  return window.location.origin;
}
export function AuthProvider({ children }: { children: ReactNode }) {
  const supabase = getSupabase();
  const [status, setStatus] = useState<AuthStatus>(
    supabase ? "loading" : "guest"
  );
  const [user, setUser] = useState<AuthUser | null>(null);

  useEffect(() => {
    if (!supabase) return;
    let active = true;

    const apply = (session: Session | null) => {
      if (!active) return;
      if (session?.user) {
        setUser(mapUser(session.user));
        setStatus("authenticated");
      } else {
        setUser(null);
        setStatus("guest");
      }
    };

    supabase.auth.getSession().then(({ data }) => apply(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) =>
      apply(session)
    );

    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, [supabase]);

  const value = useMemo<AuthValue>(
    () => ({
      status,
      user,
      supabaseConfigured: Boolean(supabase),
      async signInWithGoogle() {
        if (!supabase) return;
        await supabase.auth.signInWithOAuth({
          provider: "google",
          options: { redirectTo: redirectUrl() },
        });
      },
      async signInWithEmail(email: string) {
        if (!supabase)
          return { sent: false, error: "Sign-in is not configured." };
        const { error } = await supabase.auth.signInWithOtp({
          email,
          options: { emailRedirectTo: redirectUrl() },
        });
        return error ? { sent: false, error: error.message } : { sent: true };
      },
      async signOut() {
        if (!supabase) return;
        await supabase.auth.signOut();
      },
    }),
    [status, user, supabase]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an <AuthProvider>");
  return ctx;
}
