import { Link, useLocation } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth-context";
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
} from "lucide-react";

interface SidebarItem {
  label: string;
  to: string;
  icon: React.ReactNode;
}

const ITEMS: SidebarItem[] = [
  { label: "Dashboard", to: "/admin", icon: <LayoutDashboard className="h-4 w-4" /> },
  { label: "Orders", to: "/admin/orders", icon: <ListOrdered className="h-4 w-4" /> },
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
];

const USER_ITEMS: SidebarItem[] = [
  { label: "Back to Store", to: "/", icon: <Store className="h-4 w-4" /> },
];

export function AdminSidebar() {
  const location = useLocation();
  const { signOut } = useAuth();

  function isActive(to: string) {
    if (to === "/admin") return location.pathname === "/admin";
    return location.pathname.startsWith(to);
  }

  return (
    <aside className="fixed left-0 top-0 h-screen w-56 border-r border-border/60 bg-background hidden lg:flex lg:flex-col z-40">
      <div className="p-4 border-b border-border/40 shrink-0">
        <Link to="/admin" className="font-serif text-lg tracking-wide">
          ANORA
        </Link>
        <p className="text-[10px] tracking-[0.32em] uppercase text-muted-foreground mt-0.5">
          Admin
        </p>
      </div>
      <nav className="flex-1 overflow-y-auto p-3 space-y-1 min-h-0">
        {ITEMS.map((item) => (
          <Link
            key={item.to}
            to={item.to}
            className={`flex items-center gap-3 px-3 py-2 text-sm rounded transition-colors ${
              isActive(item.to)
                ? "bg-foreground/10 text-foreground"
                : "text-muted-foreground hover:text-foreground hover:bg-neutral/50"
            }`}
          >
            {item.icon}
            {item.label}
          </Link>
        ))}
      </nav>
      <div className="p-3 border-t border-border/40 space-y-1 shrink-0">
        {USER_ITEMS.map((item) => (
          <Link
            key={item.to + item.label}
            to={item.to}
            className="flex items-center gap-3 px-3 py-2 text-sm rounded text-muted-foreground hover:text-foreground hover:bg-neutral/50 transition-colors"
          >
            {item.icon}
            {item.label}
          </Link>
        ))}
        <button
          onClick={signOut}
          className="flex w-full items-center gap-3 px-3 py-2 text-sm rounded text-muted-foreground hover:text-red/80 hover:bg-neutral/50 transition-colors"
        >
          <LogOut className="h-4 w-4" />
          Logout
        </button>
      </div>
    </aside>
  );
}
