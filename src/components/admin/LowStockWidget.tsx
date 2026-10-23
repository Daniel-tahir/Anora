import { useState, useEffect } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useAdminLowStock, type LowStockProductRow } from "@/lib/admin-data";

const STOCK_STATUS: Record<string, { label: string; classes: string }> = {
  critical: {
    label: "Critical",
    classes: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
  },
  low: {
    label: "Low",
    classes: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
  },
  warning: {
    label: "Warning",
    classes: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300",
  },
};

function getStockStatus(stock: number): { label: string; classes: string } {
  if (stock <= 2) return STOCK_STATUS.critical;
  if (stock <= 5) return STOCK_STATUS.low;
  return STOCK_STATUS.warning;
}

function LowStockSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-10 w-full" />
      {Array.from({ length: 5 }).map((_, i) => (
        <Skeleton key={i} className="h-12 w-full" />
      ))}
    </div>
  );
}

function LowStockEmptyState() {
  return (
    <div className="border border-border/40 bg-muted/20 p-14 text-center rounded-lg">
      <p className="text-sm text-emerald-600 dark:text-emerald-400">✓ All products are well-stocked</p>
    </div>
  );
}

function LowStockErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="border border-red-200 dark:border-red-900/40 bg-red-50 dark:bg-red-950/20 p-6 text-center rounded-lg">
      <p className="text-sm text-red-700 dark:text-red-400">{message}</p>
      <Button variant="outline" size="sm" onClick={onRetry} className="mt-3">
        Retry
      </Button>
    </div>
  );
}

function Pagination({
  page,
  total,
  pageSize,
  onPage,
}: {
  page: number;
  total: number;
  pageSize: number;
  onPage: (p: number) => void;
}) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  return (
    <div className="flex items-center justify-between text-sm text-muted-foreground pt-4">
      <span>
        {total} product{total !== 1 ? "s" : ""}
      </span>
      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => onPage(page - 1)}>
          Previous
        </Button>
        <span className="text-xs">
          Page {page} of {totalPages}
        </span>
        <Button
          variant="outline"
          size="sm"
          disabled={page >= totalPages}
          onClick={() => onPage(page + 1)}
        >
          Next
        </Button>
      </div>
    </div>
  );
}

export function LowStockWidget() {
  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const pageSize = 10;

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchInput);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const { result, loading, error, refetch } = useAdminLowStock(page, pageSize, debouncedSearch);

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
        <div>
          <p className="text-[10px] tracking-[0.35em] uppercase text-muted-foreground/60 font-medium mb-0.5">Inventory Alert</p>
          <h3 className="font-serif text-xl">Low Stock Products</h3>
        </div>
        <Input
          placeholder="Search products…"
          value={searchInput}
          onChange={(e) => {
            setSearchInput(e.target.value);
            setPage(1);
          }}
          className="max-w-60 h-9 text-sm"
        />
      </div>

      {error && <LowStockErrorState message={error} onRetry={refetch} />}
      {loading && <LowStockSkeleton />}
      {!loading && !error && result && result.products.length === 0 && <LowStockEmptyState />}

      {!loading && !error && result && result.products.length > 0 && (
        <>
          <div className="border border-border/60 overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Product Name</TableHead>
                  <TableHead>SKU</TableHead>
                  <TableHead className="text-right">Current Stock</TableHead>
                  <TableHead>Stock Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {result.products.map((p: LowStockProductRow) => {
                  const status = getStockStatus(p.stock);
                  return (
                    <TableRow key={p.id} className="hover:bg-muted/40 transition-colors">
                      <TableCell className="font-medium">{p.name}</TableCell>
                      <TableCell className="text-xs text-muted-foreground font-mono">
                        {p.sku ?? "—"}
                      </TableCell>
                      <TableCell className="text-right font-mono">{p.stock}</TableCell>
                      <TableCell>
                        <span
                          className={`inline-block px-2.5 py-1 text-[10px] tracking-[0.2em] uppercase ${status.classes}`}
                        >
                          {status.label}
                        </span>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
          <Pagination page={page} total={result.total} pageSize={pageSize} onPage={setPage} />
        </>
      )}
    </div>
  );
}
