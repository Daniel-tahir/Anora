import { useState, useCallback } from "react";
import {
  Table,
  TableHeader,
  TableRow,
  TableHead,
  TableBody,
  TableCell,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  useCustomersManagement,
  useCustomersAnalytics,
  type CustomerRow,
} from "@/lib/admin-customers";
import { CustomerProfileDrawer } from "./CustomerProfileDrawer";

const segmentBadge: Record<string, "secondary" | "default" | "outline"> = {
  new: "secondary",
  returning: "default",
  vip: "outline",
};

export function CustomersTable() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [sortBy, setSortBy] = useState("created_at");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [segment, setSegment] = useState("all");
  const [activity, setActivity] = useState("all");
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const pageSize = 20;

  const { result, loading, error, refetch } = useCustomersManagement(
    page,
    pageSize,
    search,
    sortBy,
    sortDir,
    segment === "all" ? "" : segment,
    activity === "all" ? "" : activity,
  );

  const { analytics, loading: analyticsLoading } = useCustomersAnalytics();

  const debouncedSearch = useCallback(
    (() => {
      let timer: ReturnType<typeof setTimeout>;
      return (val: string) => {
        clearTimeout(timer);
        timer = setTimeout(() => {
          setSearch(val);
          setPage(1);
        }, 300);
      };
    })(),
    [],
  );

  function handleSort(column: string) {
    if (sortBy === column) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortBy(column);
      setSortDir("desc");
    }
    setPage(1);
  }

  const sortIndicator = (column: string) => {
    if (sortBy !== column) return " ↕";
    return sortDir === "asc" ? " ↑" : " ↓";
  };

  function openDrawer(userId: string) {
    setSelectedUserId(userId);
    setDrawerOpen(true);
  }

  const totalPages = Math.max(1, Math.ceil((result?.total ?? 0) / pageSize));

  return (
    <div className="space-y-6">
      {/* Analytics */}
      {analyticsLoading ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="rounded-lg border p-4">
              <Skeleton className="h-3 w-20 mb-2" />
              <Skeleton className="h-7 w-12" />
            </div>
          ))}
        </div>
      ) : analytics ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="rounded-lg border p-4">
            <p className="text-xs text-muted-foreground uppercase tracking-wider">Total</p>
            <p className="text-2xl font-bold mt-1">{analytics.totalCustomers}</p>
          </div>
          <div className="rounded-lg border p-4">
            <p className="text-xs text-muted-foreground uppercase tracking-wider">New</p>
            <p className="text-2xl font-bold mt-1">{analytics.newCustomers}</p>
          </div>
          <div className="rounded-lg border p-4">
            <p className="text-xs text-muted-foreground uppercase tracking-wider">Returning</p>
            <p className="text-2xl font-bold mt-1">{analytics.returningCustomers}</p>
          </div>
          <div className="rounded-lg border p-4">
            <p className="text-xs text-muted-foreground uppercase tracking-wider">VIP</p>
            <p className="text-2xl font-bold mt-1">{analytics.vipCustomers}</p>
          </div>
        </div>
      ) : null}

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        <Input
          placeholder="Search by name or email..."
          value={searchInput}
          onChange={(e) => {
            setSearchInput(e.target.value);
            debouncedSearch(e.target.value);
          }}
          className="max-w-xs"
        />
        <Select
          value={segment}
          onValueChange={(val) => {
            setSegment(val);
            setPage(1);
          }}
        >
          <SelectTrigger className="w-32">
            <SelectValue placeholder="All segments" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All segments</SelectItem>
            <SelectItem value="new">New</SelectItem>
            <SelectItem value="returning">Returning</SelectItem>
            <SelectItem value="vip">VIP</SelectItem>
          </SelectContent>
        </Select>
        <Select
          value={activity}
          onValueChange={(val) => {
            setActivity(val);
            setPage(1);
          }}
        >
          <SelectTrigger className="w-32">
            <SelectValue placeholder="All activity" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All activity</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="inactive">Inactive</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Error */}
      {error && (
        <div className="border border-red/20 bg-red/5 p-4 text-center">
          <p className="text-sm text-red/80">{error}</p>
          <Button variant="outline" size="sm" onClick={refetch} className="mt-2">
            Retry
          </Button>
        </div>
      )}

      {/* Table */}
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="cursor-pointer select-none" onClick={() => handleSort("name")}>
                Customer{sortIndicator("name")}
              </TableHead>
              <TableHead
                className="cursor-pointer select-none"
                onClick={() => handleSort("orders_count")}
              >
                Orders{sortIndicator("orders_count")}
              </TableHead>
              <TableHead
                className="cursor-pointer select-none text-right"
                onClick={() => handleSort("total_spent")}
              >
                Total Spent{sortIndicator("total_spent")}
              </TableHead>
              <TableHead>Segment</TableHead>
              <TableHead
                className="cursor-pointer select-none"
                onClick={() => handleSort("created_at")}
              >
                Registered{sortIndicator("created_at")}
              </TableHead>
              <TableHead
                className="cursor-pointer select-none"
                onClick={() => handleSort("last_activity")}
              >
                Last Activity{sortIndicator("last_activity")}
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell>
                    <Skeleton className="h-4 w-32" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-4 w-8" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-4 w-16 ml-auto" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-5 w-16" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-4 w-24" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-4 w-24" />
                  </TableCell>
                </TableRow>
              ))
            ) : (result?.customers?.length ?? 0) === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                  {search || segment !== "all" || activity !== "all"
                    ? "No customers match your filters"
                    : "No customers found"}
                </TableCell>
              </TableRow>
            ) : (
              result?.customers.map((customer: CustomerRow) => (
                <TableRow
                  key={customer.id}
                  className="cursor-pointer hover:bg-muted/30"
                  onClick={() => openDrawer(customer.id)}
                >
                  <TableCell>
                    <div>
                      <p className="font-medium">
                        {customer.first_name ?? ""} {customer.last_name ?? ""}
                      </p>
                      <p className="text-xs text-muted-foreground">{customer.email}</p>
                    </div>
                  </TableCell>
                  <TableCell className="tabular-nums">{customer.orders_count}</TableCell>
                  <TableCell className="text-right font-serif tabular-nums">
                    ${Number(customer.total_spent).toLocaleString()}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={segmentBadge[customer.segment] ?? "secondary"}
                      className="capitalize"
                    >
                      {customer.segment}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                    {new Date(customer.registration_date).toLocaleDateString()}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                    {customer.last_activity
                      ? new Date(customer.last_activity).toLocaleDateString()
                      : "—"}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{result?.total ?? 0} total</p>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={page <= 1}
            onClick={() => setPage(page - 1)}
          >
            Previous
          </Button>
          <span className="text-sm text-muted-foreground">
            Page {page} of {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= totalPages}
            onClick={() => setPage(page + 1)}
          >
            Next
          </Button>
        </div>
      </div>

      <CustomerProfileDrawer
        userId={selectedUserId}
        open={drawerOpen}
        onClose={() => {
          setDrawerOpen(false);
          setSelectedUserId(null);
        }}
      />
    </div>
  );
}
