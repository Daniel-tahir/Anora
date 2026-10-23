import { Skeleton } from "@/components/ui/skeleton";
import type { ReactNode } from "react";

interface DashboardCardProps {
  label: string;
  value?: string | number;
  icon?: ReactNode;
  loading?: boolean;
  accent?: string;
}

export function DashboardCard({ label, value, icon, loading, accent }: DashboardCardProps) {
  return (
    <div className="group relative border border-border/50 bg-card p-5 sm:p-6 transition-all duration-200 hover:border-border hover:shadow-sm min-w-0 overflow-hidden">
      <div className="flex items-start justify-between gap-2 mb-3">
        <span className="text-[10px] tracking-[0.3em] uppercase text-muted-foreground font-medium leading-tight">
          {label}
        </span>
        {icon && (
          <span className="shrink-0 mt-0.5 opacity-70 group-hover:opacity-100 transition-opacity">
            {icon}
          </span>
        )}
      </div>
      {loading ? (
        <Skeleton className="h-8 w-24" />
      ) : (
        <p className={`font-serif text-2xl sm:text-3xl tabular-nums tracking-tight leading-none ${accent ?? ""}`}>
          {value ?? "—"}
        </p>
      )}
    </div>
  );
}
