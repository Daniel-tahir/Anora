import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { useAuth } from "@/lib/auth-context";
import { toast } from "sonner";
import { Eye, EyeOff } from "lucide-react";

export const Route = createFileRoute("/register")({
  head: () => ({ meta: [{ title: "Create Account — ANORA" }] }),
  component: RegisterPage,
});

function RegisterPage() {
  const { user, loading, signUp } = useAuth();
  const navigate = useNavigate();

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!loading && user) navigate({ to: "/account" });
  }, [user, loading]);

  if (loading) return null;
  if (user) return null;

  if (done) {
    return (
      <div className="px-5 lg:px-10 py-20 max-w-md mx-auto text-center">
        <span className="eyebrow">Check your inbox</span>
        <h1 className="font-serif text-4xl mt-4">Confirm your email</h1>
        <p className="text-sm text-muted-foreground mt-4 leading-relaxed">
          We've sent a confirmation link to <strong className="text-foreground">{email}</strong>.
          Click the link to activate your account.
        </p>
        <Link
          to="/login"
          search={{ redirectTo: "/account", confirmed: undefined }}
          className="inline-block mt-8 text-[11px] tracking-[0.32em] uppercase hover-underline"
        >
          Back to sign in
        </Link>
      </div>
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (password.length < 6) {
      setError("Password must be at least 6 characters");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    setSubmitting(true);
    const { error: signUpError, needsConfirmation } = await signUp(
      email,
      password,
      firstName,
      lastName,
    );
    setSubmitting(false);

    if (signUpError) {
      setError(signUpError.message);
      return;
    }

    if (needsConfirmation) {
      setDone(true);
    } else {
      toast.success("Account created");
      navigate({ to: "/account" });
    }
  };

  return (
    <div className="px-5 lg:px-10 py-20 max-w-md mx-auto">
      <div className="text-center mb-10">
        <span className="eyebrow">Welcome</span>
        <h1 className="font-serif text-5xl mt-3">Create Account</h1>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        {error && (
          <p className="text-[11px] tracking-wider uppercase text-red/80 bg-red/5 border border-red/20 px-4 py-3">
            {error}
          </p>
        )}

        <div className="grid grid-cols-2 gap-3">
          <Field label="First name" error={!!error}>
            <input
              required
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              className="w-full bg-background border border-border px-4 py-3 text-sm outline-none focus:border-foreground transition-colors"
              autoComplete="given-name"
            />
          </Field>
          <Field label="Last name" error={!!error}>
            <input
              required
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              className="w-full bg-background border border-border px-4 py-3 text-sm outline-none focus:border-foreground transition-colors"
              autoComplete="family-name"
            />
          </Field>
        </div>

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
              autoComplete="new-password"
              minLength={6}
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

        <Field label="Confirm password" error={!!error}>
          <input
            type="password"
            required
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            className="w-full bg-background border border-border px-4 py-3 text-sm outline-none focus:border-foreground transition-colors"
            autoComplete="new-password"
          />
        </Field>

        <button
          type="submit"
          disabled={submitting}
          className="w-full bg-foreground text-background py-3.5 text-[11px] tracking-[0.32em] uppercase hover:bg-gold hover:text-ink transition-all duration-300 disabled:opacity-50"
        >
          {submitting ? "Creating…" : "Create Account"}
        </button>

        <p className="text-center text-xs text-muted-foreground pt-2">
          Already have an account?{" "}
          <Link
            to="/login"
            search={{ redirectTo: "/account", confirmed: undefined }}
            className="hover-underline"
          >
            Sign in
          </Link>
        </p>
      </form>
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
