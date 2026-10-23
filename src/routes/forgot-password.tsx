import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { mapForgotPasswordError } from "@/lib/auth-errors";

export const Route = createFileRoute("/forgot-password")({
  head: () => ({
    meta: [{ title: "Reset Password — ANORA" }, { name: "robots", content: "noindex, nofollow" }],
  }),
  component: ForgotPasswordPage,
});

function ForgotPasswordPage() {
  const { resetPassword } = useAuth();
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSubmitting(true);

    const { error: resetError } = await resetPassword(email);
    setSubmitting(false);

    if (resetError) {
      setError(mapForgotPasswordError(resetError));
      return;
    }

    setSent(true);
  };

  if (sent) {
    return (
      <div className="px-5 lg:px-10 py-20 max-w-md mx-auto text-center">
        <span className="eyebrow">Check your inbox</span>
        <h1 className="font-serif text-4xl mt-4">Reset link sent</h1>
        <p className="text-sm text-muted-foreground mt-4 leading-relaxed">
          Password reset email sent.
        </p>
        <p className="text-sm text-muted-foreground mt-4 leading-relaxed">
          If an account exists for this email address, you'll receive a password reset link shortly.
        </p>
        <p className="text-sm text-muted-foreground mt-4 leading-relaxed">
          Please also check your Spam or Junk folder.
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

  return (
    <div className="px-5 lg:px-10 py-20 max-w-md mx-auto">
      <div className="text-center mb-10">
        <span className="eyebrow">Reset</span>
        <h1 className="font-serif text-5xl mt-3">Forgot Password</h1>
        <p className="text-sm text-muted-foreground mt-4 leading-relaxed">
          Enter your email and we'll send you a reset link.
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
            Email
          </span>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full bg-background border border-border px-4 py-3 text-sm outline-none focus:border-foreground transition-colors"
            autoComplete="email"
          />
        </label>

        <button
          type="submit"
          disabled={submitting}
          className="w-full bg-foreground text-background py-3.5 text-[11px] tracking-[0.32em] uppercase hover:bg-gold hover:text-ink transition-all duration-300 disabled:opacity-50"
        >
          {submitting ? "Sending…" : "Send Reset Link"}
        </button>

        <p className="text-center text-xs text-muted-foreground pt-2">
          <Link
            to="/login"
            search={{ redirectTo: "/account", confirmed: undefined }}
            className="hover-underline"
          >
            Back to sign in
          </Link>
        </p>
      </form>
    </div>
  );
}
