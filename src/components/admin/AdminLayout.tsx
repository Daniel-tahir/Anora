import type { ReactNode } from "react";
import { useNavigate } from "@tanstack/react-router";
import { AdminGuard } from "@/components/admin/AdminGuard";
import { AdminSidebar } from "@/components/admin/AdminSidebar";
import { useAuth } from "@/lib/auth-context";
import { Store, LogOut } from "lucide-react";

interface AdminLayoutProps {
  children: ReactNode;
}

function AdminTopBar() {
  const { backToStore, signOut } = useAuth();

  return (
    <header className="sticky top-0 z-30 border-b border-border/60 bg-background/95 backdrop-blur-sm">
      <div className="pl-56 flex items-center justify-end gap-3 px-6 h-14">
        <button
          onClick={backToStore}
          className="flex items-center gap-2 text-xs tracking-[0.2em] uppercase text-muted-foreground hover:text-foreground transition-colors"
        >
          <Store className="h-3.5 w-3.5" />
          Back to Store
        </button>
        <span className="text-muted-foreground/40">|</span>
        <button
          onClick={signOut}
          className="flex items-center gap-2 text-xs tracking-[0.2em] uppercase text-muted-foreground hover:text-red/80 transition-colors"
        >
          <LogOut className="h-3.5 w-3.5" />
          Logout
        </button>
      </div>
    </header>
  );
}

export function AdminLayout({ children }: AdminLayoutProps) {
  return (
    <AdminGuard>
      <div className="min-h-screen bg-background">
        <AdminSidebar />
        <div className="pl-56">
          <AdminTopBar />
          <main className="px-6 sm:px-8 lg:px-12 py-10 max-w-7xl mx-auto w-full">{children}</main>
        </div>
      </div>
    </AdminGuard>
  );
}
