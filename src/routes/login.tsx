import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { useAuth } from "@/lib/auth-context";
import { toast } from "sonner";
import { Eye, EyeOff } from "lucide-react";
import { supabase } from "@/lib/supabase";

export const Route = createFileRoute("/login")({
  validateSearch: (search: Record<string, unknown>) => ({
    redirectTo: typeof search.redirectTo === "string" ? search.redirectTo : "/account",
    confirmed: typeof search.confirmed === "string" ? search.confirmed : undefined,
  }),
  head: () => ({ meta: [{ title: "Sign In — ANORA" }] }),
  component: LoginPage,
});

function LoginPage() {
  const { user, loading, signIn } = useAuth();
  const { redirectTo, confirmed } = Route.useSearch();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(false);
  const [showPw, setShowPw] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const shouldRedirect = !loading && user && !confirmed;

  useEffect(() => {
    if (shouldRedirect) {
      window.location.href = redirectTo;
    }
  }, [shouldRedirect, redirectTo]);

  if (loading) return null;
  if (user && !confirmed) return null;

  const isLoggedInAndConfirmed = user && confirmed;

  async function determineRedirect(): Promise<string> {
    if (redirectTo !== "/account") return redirectTo;
    const { data } = await supabase.rpc("has_admin_role", { required: "admin" });
    return data ? "/admin" : "/account";
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSubmitting(true);

    const { error: signInError } = await signIn(email, password, remember);
    setSubmitting(false);

    if (signInError) {
      setError(signInError.message);
      return;
    }

    toast.success("Welcome back");
    window.location.href = await determineRedirect();
  };

  return (
    <div className="px-5 lg:px-10 py-20 max-w-md mx-auto">
      {confirmed && !isLoggedInAndConfirmed && (
        <div className="mb-8 p-4 border border-emerald-500/30 bg-emerald-50/50 text-sm text-emerald-800">
          {confirmed === "1" ? "Email confirmed. You can now sign in." : confirmed}
        </div>
      )}

      {isLoggedInAndConfirmed ? (
        <div className="text-center">
          <div className="mb-8 p-4 border border-emerald-500/30 bg-emerald-50/50 text-sm text-emerald-800">
            {confirmed === "1" ? "Email confirmed. Your account is ready." : confirmed}
          </div>
          <Link
            to="/account"
            className="inline-block bg-foreground text-background px-8 py-3.5 text-[11px] tracking-[0.32em] uppercase hover:bg-gold hover:text-ink transition-all duration-300"
          >
            Go to My Account
          </Link>
        </div>
      ) : (
        <>
          <div className="text-center mb-10">
            <span className="eyebrow">Welcome</span>
            <h1 className="font-serif text-5xl mt-3">Sign In</h1>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            {error && (
              <p className="text-[11px] tracking-wider uppercase text-red/80 bg-red/5 border border-red/20 px-4 py-3">
                {error}
              </p>
            )}

            <Field label="Email" error={!!error}>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full bg-background border border-border px-4 py-3 text-sm outline-none focus:border-foreground transition-colors"
                autoComplete="email"
              />
            </Field>

            <Field label="Password" error={!!error}>
              <div className="relative">
                <input
                  type={showPw ? "text" : "password"}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full bg-background border border-border px-4 py-3 text-sm outline-none focus:border-foreground transition-colors pr-11"
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPw((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                  tabIndex={-1}
                >
                  {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </Field>

            <label className="flex items-center gap-2.5 text-sm text-muted-foreground cursor-pointer select-none">
              <input
                type="checkbox"
                checked={remember}
                onChange={(e) => setRemember(e.target.checked)}
                className="h-4 w-4 accent-foreground"
              />
              Remember me
            </label>

            <button
              type="submit"
              disabled={submitting}
              className="w-full bg-foreground text-background py-3.5 text-[11px] tracking-[0.32em] uppercase hover:bg-gold hover:text-ink transition-all duration-300 disabled:opacity-50"
            >
              {submitting ? "Signing in…" : "Sign In"}
            </button>

            <div className="flex items-center justify-between text-xs pt-2">
              <Link to="/forgot-password" className="hover-underline text-muted-foreground">
                Forgot password?
              </Link>
              <Link to="/register" className="hover-underline">
                Create account
              </Link>
            </div>
          </form>
        </>
      )}
    </div>
  );
}

function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="block text-[10px] tracking-[0.3em] uppercase text-muted-foreground mb-2">
        {label}
      </span>
      {children}
    </label>
  );
}
