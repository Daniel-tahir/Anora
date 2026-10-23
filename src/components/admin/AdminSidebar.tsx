import { Link, useLocation } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth-context";
import { useRef, useEffect } from "react";
import { BRAND_NAME } from "@/lib/brand";
import {
  LayoutDashboard,
  PackagePlus,
  ListOrdered,
  LayoutList,
  Warehouse,
  Users,
  MessageSquare,
  Tag,
  Gift,
  Store,
  LogOut,
  DollarSign,
  FileText,
  BarChart3,
  Clock,
  Shield,
  ShoppingCart,
  X,
  BookOpen,
  Settings,
  RotateCcw,
} from "lucide-react";

interface SidebarItem {
  label: string;
  to: string;
  icon: React.ReactNode;
}

const ITEMS: SidebarItem[] = [
  { label: "Dashboard", to: "/admin", icon: <LayoutDashboard className="h-4 w-4" /> },
  { label: "Orders", to: "/admin/orders", icon: <ListOrdered className="h-4 w-4" /> },
  { label: "Refunds", to: "/admin/refunds", icon: <RotateCcw className="h-4 w-4" /> },
  { label: "Products", to: "/admin/products", icon: <PackagePlus className="h-4 w-4" /> },
  { label: "Categories", to: "/admin/categories", icon: <LayoutList className="h-4 w-4" /> },
  { label: "Inventory", to: "/admin/inventory", icon: <Warehouse className="h-4 w-4" /> },
  { label: "Customers", to: "/admin/customers", icon: <Users className="h-4 w-4" /> },
  { label: "Reviews", to: "/admin/reviews", icon: <MessageSquare className="h-4 w-4" /> },
  { label: "Coupons", to: "/admin/coupons", icon: <Tag className="h-4 w-4" /> },
  { label: "Gift Cards", to: "/admin/gift-cards", icon: <Gift className="h-4 w-4" /> },
  { label: "Finance", to: "/admin/finance", icon: <DollarSign className="h-4 w-4" /> },
  { label: "Invoices", to: "/admin/finance/invoices", icon: <FileText className="h-4 w-4" /> },
  { label: "Reports", to: "/admin/reports", icon: <BarChart3 className="h-4 w-4" /> },
  { label: "Activity", to: "/admin/activity", icon: <Clock className="h-4 w-4" /> },
  { label: "Audit Logs", to: "/admin/security/audit-logs", icon: <Shield className="h-4 w-4" /> },
  {
    label: "Abandoned Carts",
    to: "/admin/abandoned-carts",
    icon: <ShoppingCart className="h-4 w-4" />,
  },
  {
    label: "Blog Posts",
    to: "/admin/blogs",
    icon: <BookOpen className="h-4 w-4" />,
  },
  {
    label: "Website Settings",
    to: "/admin/settings",
    icon: <Settings className="h-4 w-4" />,
  },
];

const USER_ITEMS: SidebarItem[] = [
  { label: "Back to Store", to: "/", icon: <Store className="h-4 w-4" /> },
];

const NAV_GROUPS = [
  {
    label: "Core",
    items: ITEMS.slice(0, 7),
  },
  {
    label: "Commerce",
    items: ITEMS.slice(7, 10),
  },
  {
    label: "Finance & Reports",
    items: ITEMS.slice(10, 13),
  },
  {
    label: "System",
    items: ITEMS.slice(13),
  },
];

interface AdminSidebarProps {
  onClose?: () => void;
  className?: string;
}

let persistedScrollTop = 0;

export function AdminSidebar({ onClose, className }: AdminSidebarProps) {
  const location = useLocation();
  const { signOut } = useAuth();
  const navRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (navRef.current) {
      navRef.current.scrollTop = persistedScrollTop;
    }
  }, []);

  const handleScroll = (e: React.UIEvent<HTMLElement>) => {
    persistedScrollTop = e.currentTarget.scrollTop;
  };

  function isActive(to: string) {
    if (to === "/admin") return location.pathname === "/admin";
    return location.pathname.startsWith(to);
  }

  return (
    <aside className={className ?? "fixed left-0 top-0 h-screen w-56 border-r border-border/50 bg-background hidden lg:flex lg:flex-col z-40"}>
      <div className="px-5 py-5 border-b border-border/40 shrink-0 flex items-center justify-between">
        <div>
          <Link to="/admin" className="font-serif text-lg tracking-wide" onClick={onClose}>
            {BRAND_NAME}
          </Link>
          <p className="text-[9px] tracking-[0.4em] uppercase text-muted-foreground/60 mt-0.5">
            Admin Panel
          </p>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            className="lg:hidden p-1 text-muted-foreground hover:text-foreground transition-colors"
            aria-label="Close menu"
          >
            <X className="h-4.5 w-4.5" />
          </button>
        )}
      </div>

      <nav
        ref={navRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto py-4 px-3 min-h-0 space-y-5"
      >
        {NAV_GROUPS.map((group) => (
          <div key={group.label}>
            <p className="text-[9px] tracking-[0.35em] uppercase text-muted-foreground/40 font-medium px-2 mb-1.5">
              {group.label}
            </p>
            <div className="space-y-0.5">
              {group.items.map((item) => (
                <Link
                  key={item.to}
                  to={item.to}
                  onClick={onClose}
                  className={`flex items-center gap-2.5 px-2.5 py-2 text-sm rounded-md transition-all duration-150 ${
                    isActive(item.to)
                      ? "bg-foreground/8 text-foreground font-medium [--tw-bg-opacity:0.08]"
                      : "text-muted-foreground hover:text-foreground hover:bg-foreground/5"
                  }`}
                >
                  <span
                    className={`shrink-0 transition-colors ${
                      isActive(item.to) ? "text-foreground" : "text-muted-foreground/70"
                    }`}
                  >
                    {item.icon}
                  </span>
                  <span className="truncate">{item.label}</span>
                  {isActive(item.to) && (
                    <span className="ml-auto h-1.5 w-1.5 rounded-full bg-foreground/50 shrink-0" />
                  )}
                </Link>
              ))}
            </div>
          </div>
        ))}
      </nav>

      <div className="px-3 py-3 border-t border-border/40 space-y-0.5 shrink-0">
        {USER_ITEMS.map((item) => (
          <Link
            key={item.to + item.label}
            to={item.to}
            onClick={onClose}
            className="flex items-center gap-2.5 px-2.5 py-2 text-sm rounded-md text-muted-foreground hover:text-foreground hover:bg-foreground/5 transition-all duration-150"
          >
            <span className="shrink-0 text-muted-foreground/70">{item.icon}</span>
            {item.label}
          </Link>
        ))}
        <button
          onClick={() => {
            signOut();
            onClose?.();
          }}
          className="flex w-full items-center gap-2.5 px-2.5 py-2 text-sm rounded-md text-muted-foreground hover:text-red-500 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/20 transition-all duration-150"
        >
          <LogOut className="h-4 w-4 shrink-0 text-muted-foreground/70" />
          Logout
        </button>
      </div>
    </aside>
  );
}
