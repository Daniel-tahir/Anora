import {
  createContext,
  useContext,
  useEffect,
  useState,
  useRef,
  useCallback,
  type ReactNode,
} from "react";
import { useNavigate } from "@tanstack/react-router";
import { supabase } from "./supabase";
import type { User, AuthError } from "@supabase/supabase-js";

const INACTIVITY_TIMEOUT_MS = 15 * 60 * 1000; // 15 minutes

interface AuthState {
  user: User | null;
  loading: boolean;
  isAdmin: boolean;
  signIn: (
    email: string,
    password: string,
    remember?: boolean,
  ) => Promise<{ error: AuthError | null }>;
  signUp: (
    email: string,
    password: string,
    firstName: string,
    lastName: string,
  ) => Promise<{ error: AuthError | null; needsConfirmation: boolean }>;
  signOut: () => Promise<void>;
  backToStore: () => Promise<void>;
  resetPassword: (email: string) => Promise<{ error: AuthError | null }>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthState | undefined>(undefined);

function clearAdminStorage() {
  localStorage.removeItem("admin-session");
  sessionStorage.clear();
}

function hardRedirect(url: string) {
  window.location.href = url;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [profileRole, setProfileRole] = useState<string | null>(null);
  const inactivityTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isAdminRef = useRef(false);

  const isAdmin = profileRole === "admin";
  isAdminRef.current = isAdmin;

  const performSignOut = useCallback(async () => {
    if (inactivityTimer.current) clearTimeout(inactivityTimer.current);
    clearAdminStorage();
    setUser(null);
    setProfileRole(null);
    await supabase.auth.signOut();
  }, []);

  const scheduleInactivityLogout = useCallback(() => {
    if (inactivityTimer.current) clearTimeout(inactivityTimer.current);
    if (!isAdminRef.current) return;
    inactivityTimer.current = setTimeout(async () => {
      await performSignOut();
      hardRedirect("/login");
    }, INACTIVITY_TIMEOUT_MS);
  }, [performSignOut]);

  const resetInactivityTimer = useCallback(() => {
    scheduleInactivityLogout();
  }, [scheduleInactivityLogout]);

  useEffect(() => {
    if (!isAdmin) return;
    document.addEventListener("mousedown", resetInactivityTimer);
    document.addEventListener("mousemove", resetInactivityTimer);
    document.addEventListener("keydown", resetInactivityTimer);
    document.addEventListener("touchstart", resetInactivityTimer);
    scheduleInactivityLogout();
    return () => {
      document.removeEventListener("mousedown", resetInactivityTimer);
      document.removeEventListener("mousemove", resetInactivityTimer);
      document.removeEventListener("keydown", resetInactivityTimer);
      document.removeEventListener("touchstart", resetInactivityTimer);
      if (inactivityTimer.current) clearTimeout(inactivityTimer.current);
    };
  }, [isAdmin, resetInactivityTimer, scheduleInactivityLogout]);

  async function fetchAdminRole(userId: string): Promise<string | null> {
    try {
      const { data, error } = await supabase.rpc("has_admin_role", { required: "admin" });
      if (error) throw error;
      return data ? "admin" : null;
    } catch {
      try {
        const { data } = await supabase
          .from("admin_roles")
          .select("role")
          .eq("user_id", userId)
          .maybeSingle();
        return data?.role ?? null;
      } catch {
        return null;
      }
    }
  }

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      const u = session?.user ?? null;
      setUser(u);
      if (u) {
        const role = await fetchAdminRole(u.id);
        setProfileRole(role);
      }
      setLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      const u = session?.user ?? null;
      setUser(u);
      if (u) {
        fetchAdminRole(u.id).then(setProfileRole);
      } else {
        setProfileRole(null);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const signIn = async (email: string, password: string, _remember?: boolean) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error };
  };

  const signUp = async (email: string, password: string, firstName: string, lastName: string) => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { first_name: firstName, last_name: lastName },
      },
    });

    if (!error && data.user) {
      await supabase
        .from("profiles")
        .upsert(
          {
            id: data.user.id,
            email,
            first_name: firstName,
            last_name: lastName,
          },
          { onConflict: "id" },
        )
        .maybeSingle();
    }

    const needsConfirmation = !!data?.user?.identities && data.user.identities.length === 0;
    return { error, needsConfirmation };
  };

  const signOut = async () => {
    await performSignOut();
    hardRedirect("/login");
  };

  const backToStore = async () => {
    await performSignOut();
    hardRedirect("/");
  };

  const resetPassword = async (email: string) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/account`,
    });
    return { error };
  };

  const refreshUser = async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    setUser(user);
    if (user) {
      const role = await fetchAdminRole(user.id);
      setProfileRole(role);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        isAdmin,
        signIn,
        signUp,
        signOut,
        backToStore,
        resetPassword,
        refreshUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && !user) {
      navigate({
        to: "/login",
        search: { redirectTo: window.location.pathname, confirmed: undefined },
      });
    }
  }, [user, loading, navigate]);

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="h-8 w-8 rounded-full border-2 border-foreground/20 border-t-foreground animate-spin" />
      </div>
    );
  }

  if (!user) return null;

  return <>{children}</>;
}
