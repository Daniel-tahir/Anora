import { Link } from "@tanstack/react-router";
import { User, Heart, Package, LayoutDashboard, LogOut } from "lucide-react";
import { useEffect, useRef } from "react";
import { useAuth } from "@/lib/auth-context";

interface Props {
  open: boolean;
  onClose: () => void;
}

export function AccountDropdown({ open, onClose }: Props) {
  const { isAdmin, signOut } = useAuth();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose();
      }
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("click", handleClick);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("click", handleClick);
      document.removeEventListener("keydown", handleKey);
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      ref={ref}
      className="absolute right-0 top-full mt-2 w-56 border border-border/60 bg-background shadow-luxe z-50"
    >
      <div className="py-2">
        <DropdownLink to="/account" icon={<User className="h-4 w-4" />} onClick={onClose}>
          My Account
        </DropdownLink>
        <DropdownLink to="/account" icon={<Package className="h-4 w-4" />} onClick={onClose}>
          Orders
        </DropdownLink>
        <DropdownLink to="/wishlist" icon={<Heart className="h-4 w-4" />} onClick={onClose}>
          Wishlist
        </DropdownLink>

        {isAdmin && (
          <>
            <div className="mx-4 my-1.5 border-t border-border/40" />
            <Link
              to="/admin"
              onClick={onClose}
              className="flex items-center gap-3 px-4 py-2.5 text-sm text-muted-foreground hover:text-foreground hover:bg-neutral/50 transition-colors duration-200"
            >
              <LayoutDashboard className="h-4 w-4" />
              Admin Dashboard
            </Link>
          </>
        )}

        <div className="mx-4 my-1.5 border-t border-border/40" />
        <button
          onClick={() => {
            signOut();
            onClose();
          }}
          className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm text-muted-foreground hover:text-red/80 transition-colors duration-300"
        >
          <LogOut className="h-4 w-4" />
          Sign Out
        </button>
      </div>
    </div>
  );
}

function DropdownLink({
  to,
  icon,
  children,
  onClick,
}: {
  to: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <Link
      to={to as any}
      onClick={onClick}
      className="flex items-center gap-3 px-4 py-2.5 text-sm text-muted-foreground hover:text-foreground hover:bg-neutral/50 transition-colors duration-200"
    >
      {icon}
      {children}
    </Link>
  );
}
