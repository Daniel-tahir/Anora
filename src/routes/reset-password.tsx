import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth-context";
import { toast } from "sonner";
import { Eye, EyeOff } from "lucide-react";

export const Route = createFileRoute("/reset-password")({
  head: () => ({ meta: [{ title: "Reset Password — ANORA" }] }),
  component: ResetPasswordPage,
});

function ResetPasswordPage() {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

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

    const { error: updateError } = await supabase.auth.updateUser({ password });
    setSubmitting(false);

    if (updateError) {
      setError(updateError.message);
      return;
    }

    toast.success("Password updated", {
      description: "Sign in with your new password.",
    });

    supabase.auth.signOut();
    window.location.href =
      "/login?confirmed=Password reset successful. Sign in with your new password.";
  };

  if (authLoading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="h-8 w-8 rounded-full border-2 border-foreground/20 border-t-foreground animate-spin" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="px-5 lg:px-10 py-20 max-w-md mx-auto text-center">
        <span className="eyebrow">Expired or invalid</span>
        <h1 className="font-serif text-4xl mt-4">Reset link not recognised</h1>
        <p className="text-sm text-muted-foreground mt-4 leading-relaxed">
          This password reset link may have expired or is invalid. Please request a new one.
        </p>
        <Link
          to="/forgot-password"
          className="inline-block mt-8 text-[11px] tracking-[0.32em] uppercase hover-underline"
        >
          Request new link
        </Link>
      </div>
    );
  }

  return (
    <div className="px-5 lg:px-10 py-20 max-w-md mx-auto">
      <div className="text-center mb-10">
        <span className="eyebrow">Reset</span>
        <h1 className="font-serif text-5xl mt-3">New Password</h1>
        <p className="text-sm text-muted-foreground mt-4 leading-relaxed">
          Enter your new password below.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        {error && (
          <p className="text-[11px] tracking-wider uppercase text-red/80 bg-red/5 border border-red/20 px-4 py-3">
            {error}
          </p>
        )}

        <label className="block">
          <span className="block text-[10px] tracking-[0.3em] uppercase text-muted-foreground mb-2">
            New password
          </span>
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
        </label>

        <label className="block">
          <span className="block text-[10px] tracking-[0.3em] uppercase text-muted-foreground mb-2">
            Confirm new password
          </span>
          <input
            type="password"
            required
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            className="w-full bg-background border border-border px-4 py-3 text-sm outline-none focus:border-foreground transition-colors"
            autoComplete="new-password"
          />
        </label>

        <button
          type="submit"
          disabled={submitting}
          className="w-full bg-foreground text-background py-3.5 text-[11px] tracking-[0.32em] uppercase hover:bg-gold hover:text-ink transition-all duration-300 disabled:opacity-50"
        >
          {submitting ? "Updating…" : "Update Password"}
        </button>
      </form>
    </div>
  );
}
