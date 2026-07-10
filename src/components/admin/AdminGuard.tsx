import { useEffect, useState, type ReactNode } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/lib/supabase";

interface AdminGuardProps {
  children: ReactNode;
}

export function AdminGuard({ children }: AdminGuardProps) {
  const { user, loading, isAdmin } = useAuth();
  const navigate = useNavigate();
  const [serverVerified, setServerVerified] = useState(false);

  useEffect(() => {
    if (loading) return;

    if (!user) {
      navigate({
        to: "/login",
        search: { redirectTo: "/admin", confirmed: undefined },
        replace: true,
      });
      return;
    }

    if (!isAdmin) {
      navigate({ to: "/account", replace: true });
      return;
    }

    // Server-side role verification via RPC
    supabase.rpc("has_admin_role", { required: "admin" }).then(({ data, error }) => {
      if (error || !data) {
        navigate({
          to: "/login",
          search: { redirectTo: "/admin", confirmed: undefined },
          replace: true,
        });
        return;
      }
      setServerVerified(true);
    });
  }, [user, loading, isAdmin, navigate]);

  if (loading || (!loading && user && isAdmin && !serverVerified)) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="h-8 w-8 rounded-full border-2 border-foreground/20 border-t-foreground animate-spin" />
      </div>
    );
  }

  if (!user || !isAdmin || !serverVerified) return null;

  return <>{children}</>;
}
