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
import { useAdminCustomers, type CustomerRow } from "@/lib/admin-data";

function CustomersSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-10 w-full" />
      {Array.from({ length: 5 }).map((_, i) => (
        <Skeleton key={i} className="h-12 w-full" />
      ))}
    </div>
  );
}

function CustomersEmptyState() {
  return (
    <div className="border border-border/40 bg-muted/20 p-14 text-center rounded-lg">
      <p className="text-sm text-muted-foreground">No customers found</p>
    </div>
  );
}

function CustomersErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
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
        {total} customer{total !== 1 ? "s" : ""}
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

export function RecentCustomersTable() {
  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [sortBy, setSortBy] = useState("created_at");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const pageSize = 10;

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchInput);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const { result, loading, error, refetch } = useAdminCustomers(
    page,
    pageSize,
    debouncedSearch,
    sortBy,
    sortDir,
  );

  function toggleSort(column: string) {
    if (sortBy === column) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortBy(column);
      setSortDir("desc");
    }
    setPage(1);
  }

  function SortIcon({ column }: { column: string }) {
    if (sortBy !== column) return <span className="text-muted-foreground/40 ml-1">↕</span>;
    return <span className="ml-1">{sortDir === "asc" ? "↑" : "↓"}</span>;
  }

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
        <div>
          <p className="text-[10px] tracking-[0.35em] uppercase text-muted-foreground/60 font-medium mb-0.5">Recent</p>
          <h3 className="font-serif text-xl">Customers</h3>
        </div>
        <Input
          placeholder="Search customers…"
          value={searchInput}
          onChange={(e) => {
            setSearchInput(e.target.value);
            setPage(1);
          }}
          className="max-w-60 h-9 text-sm"
        />
      </div>

      {error && <CustomersErrorState message={error} onRetry={refetch} />}
      {loading && <CustomersSkeleton />}
      {!loading && !error && result && result.customers.length === 0 && <CustomersEmptyState />}

      {!loading && !error && result && result.customers.length > 0 && (
        <>
          <div className="border border-border/60 overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="cursor-pointer" onClick={() => toggleSort("first_name")}>
                    Customer
                    <SortIcon column="first_name" />
                  </TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead className="cursor-pointer" onClick={() => toggleSort("created_at")}>
                    Registration Date
                    <SortIcon column="created_at" />
                  </TableHead>
                  <TableHead
                    className="cursor-pointer text-right"
                    onClick={() => toggleSort("total_orders")}
                  >
                    Total Orders
                    <SortIcon column="total_orders" />
                  </TableHead>
                  <TableHead>Last Activity</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {result.customers.map((c: CustomerRow) => (
                  <TableRow key={c.id} className="hover:bg-muted/40 transition-colors">
                    <TableCell className="font-medium">
                      {[c.first_name, c.last_name].filter(Boolean).join(" ") || "—"}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">{c.email}</TableCell>
                    <TableCell className="text-xs capitalize">{c.role}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {new Date(c.created_at).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      })}
                    </TableCell>
                    <TableCell className="text-right">{c.total_orders}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {new Date(c.updated_at).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      })}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <Pagination page={page} total={result.total} pageSize={pageSize} onPage={setPage} />
        </>
      )}
    </div>
  );
}
