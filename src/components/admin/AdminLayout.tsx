import { ReactNode, useState } from "react";
import { AdminGuard } from "@/components/admin/AdminGuard";
import { AdminSidebar } from "@/components/admin/AdminSidebar";
import { useAuth } from "@/lib/auth-context";
import { Store, LogOut, Menu } from "lucide-react";

interface AdminLayoutProps {
  children: ReactNode;
}

interface TopBarProps {
  onMenuClick: () => void;
}

function AdminTopBar({ onMenuClick }: TopBarProps) {
  const { backToStore, signOut } = useAuth();

  return (
    <header className="sticky top-0 z-30 border-b border-border/40 bg-background/98 backdrop-blur-sm">
      <div className="lg:pl-56 flex items-center justify-between lg:justify-end gap-4 px-6 h-12">
        <button
          onClick={onMenuClick}
          className="lg:hidden flex items-center gap-2 text-[10px] tracking-[0.25em] uppercase text-muted-foreground/70 hover:text-foreground transition-colors"
          aria-label="Open Admin Menu"
        >
          <Menu className="h-4 w-4" />
          Menu
        </button>
        <div className="flex items-center gap-4">
          <button
            onClick={backToStore}
            className="flex items-center gap-2 text-[10px] tracking-[0.25em] uppercase text-muted-foreground/70 hover:text-foreground transition-colors"
          >
            <Store className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Back to Store</span>
          </button>
          <span className="text-border">|</span>
          <button
            onClick={signOut}
            className="flex items-center gap-2 text-[10px] tracking-[0.25em] uppercase text-muted-foreground/70 hover:text-red-500 dark:hover:text-red-400 transition-colors"
          >
            <LogOut className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Logout</span>
          </button>
        </div>
      </div>
    </header>
  );
}

export function AdminLayout({ children }: AdminLayoutProps) {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <AdminGuard>
      <div className="min-h-screen bg-background">
        {/* Desktop Sidebar */}
        <AdminSidebar className="fixed left-0 top-0 h-screen w-56 border-r border-border/50 bg-background hidden lg:flex lg:flex-col z-40" />

        {/* Mobile Sidebar Overlay */}
        {mobileOpen && (
          <div
            onClick={() => setMobileOpen(false)}
            className="fixed inset-0 z-40 bg-ink/40 backdrop-blur-sm lg:hidden"
          />
        )}

        {/* Mobile Sidebar Drawer */}
        <AdminSidebar
          onClose={() => setMobileOpen(false)}
          className={`fixed left-0 top-0 h-screen w-56 border-r border-border/50 bg-background z-50 transition-transform duration-300 lg:hidden ${
            mobileOpen ? "translate-x-0 flex flex-col" : "-translate-x-full"
          }`}
        />

        <div className="lg:pl-56">
          <AdminTopBar onMenuClick={() => setMobileOpen(true)} />
          <main className="px-4 sm:px-6 lg:px-12 py-10 max-w-7xl mx-auto w-full">{children}</main>
        </div>
      </div>
    </AdminGuard>
  );
}
