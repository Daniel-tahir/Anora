import { useState } from "react";
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
import { useReviewsManagement, useAdminReviewStats, type ReviewRow } from "@/lib/admin-reviews";
import { ReviewDetailsDrawer } from "./ReviewDetailsDrawer";

const ratingLabels = ["", "1 Star", "2 Stars", "3 Stars", "4 Stars", "5 Stars"];

const statusColors: Record<string, "outline" | "secondary" | "default"> = {
  pending: "secondary",
  approved: "default",
  rejected: "outline",
};

export function ReviewsTable() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState("created_at");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [statusFilter, setStatusFilter] = useState("all");
  const [ratingFilter, setRatingFilter] = useState(0);
  const [selectedReviewId, setSelectedReviewId] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const pageSize = 20;

  const { result, loading, error, refetch } = useReviewsManagement(
    page,
    pageSize,
    search,
    sortBy,
    sortDir,
    statusFilter === "all" ? "" : statusFilter,
    ratingFilter,
  );

  const { stats, loading: statsLoading } = useAdminReviewStats();

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

  function openDrawer(reviewId: string) {
    setSelectedReviewId(reviewId);
    setDrawerOpen(true);
  }

  const totalPages = Math.max(1, Math.ceil((result?.total ?? 0) / pageSize));

  return (
    <div className="space-y-6">
      {/* Stats */}
      {statsLoading ? (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="rounded-lg border p-4">
              <Skeleton className="h-3 w-16 mb-2" />
              <Skeleton className="h-7 w-10" />
            </div>
          ))}
        </div>
      ) : stats ? (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <div className="rounded-lg border p-4">
            <p className="text-xs text-muted-foreground uppercase tracking-wider">Total</p>
            <p className="text-2xl font-bold mt-1">{stats.total}</p>
          </div>
          <div className="rounded-lg border p-4">
            <p className="text-xs text-muted-foreground uppercase tracking-wider">Pending</p>
            <p className="text-2xl font-bold mt-1">{stats.pending}</p>
          </div>
          <div className="rounded-lg border p-4">
            <p className="text-xs text-muted-foreground uppercase tracking-wider">Approved</p>
            <p className="text-2xl font-bold mt-1">{stats.approved}</p>
          </div>
          <div className="rounded-lg border p-4">
            <p className="text-xs text-muted-foreground uppercase tracking-wider">Rejected</p>
            <p className="text-2xl font-bold mt-1">{stats.rejected}</p>
          </div>
          <div className="rounded-lg border p-4">
            <p className="text-xs text-muted-foreground uppercase tracking-wider">Avg Rating</p>
            <p className="text-2xl font-bold mt-1">
              {stats.average_rating ? Number(stats.average_rating).toFixed(1) : "—"}
            </p>
          </div>
        </div>
      ) : null}

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        <Input
          placeholder="Search by product, customer, or text..."
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
          className="max-w-xs"
        />
        <Select
          value={statusFilter}
          onValueChange={(val) => {
            setStatusFilter(val);
            setPage(1);
          }}
        >
          <SelectTrigger className="w-32">
            <SelectValue placeholder="All statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="approved">Approved</SelectItem>
            <SelectItem value="rejected">Rejected</SelectItem>
          </SelectContent>
        </Select>
        <Select
          value={String(ratingFilter)}
          onValueChange={(val) => {
            setRatingFilter(Number(val));
            setPage(1);
          }}
        >
          <SelectTrigger className="w-32">
            <SelectValue placeholder="All ratings" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="0">All ratings</SelectItem>
            <SelectItem value="1">1 Star</SelectItem>
            <SelectItem value="2">2 Stars</SelectItem>
            <SelectItem value="3">3 Stars</SelectItem>
            <SelectItem value="4">4 Stars</SelectItem>
            <SelectItem value="5">5 Stars</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Error */}
      {error && (
        <div className="border border-red/20 bg-red/5 p-4 text-center">
          <p className="text-sm text-red/80">{error}</p>
          <button onClick={refetch} className="text-sm underline mt-2">
            Retry
          </button>
        </div>
      )}

      {/* Table */}
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Product</TableHead>
              <TableHead>Customer</TableHead>
              <TableHead
                className="cursor-pointer select-none"
                onClick={() => handleSort("rating")}
              >
                Rating{sortIndicator("rating")}
              </TableHead>
              <TableHead
                className="cursor-pointer select-none"
                onClick={() => handleSort("status")}
              >
                Status{sortIndicator("status")}
              </TableHead>
              <TableHead
                className="cursor-pointer select-none"
                onClick={() => handleSort("created_at")}
              >
                Date{sortIndicator("created_at")}
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
                    <Skeleton className="h-4 w-24" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-4 w-16" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-5 w-16" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-4 w-24" />
                  </TableCell>
                </TableRow>
              ))
            ) : (result?.reviews?.length ?? 0) === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                  {search || statusFilter !== "all" || ratingFilter !== 0
                    ? "No reviews match your filters"
                    : "No reviews found"}
                </TableCell>
              </TableRow>
            ) : (
              result?.reviews.map((review: ReviewRow) => (
                <TableRow
                  key={review.id}
                  className="cursor-pointer hover:bg-muted/30"
                  onClick={() => openDrawer(review.id)}
                >
                  <TableCell className="font-medium">{review.product_name}</TableCell>
                  <TableCell className="text-sm">{review.customer_name}</TableCell>
                  <TableCell>
                    <span className="tabular-nums">{review.rating}/5</span>
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={statusColors[review.status] ?? "outline"}
                      className="capitalize"
                    >
                      {review.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                    {new Date(review.created_at).toLocaleDateString()}
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

      <ReviewDetailsDrawer
        reviewId={selectedReviewId}
        open={drawerOpen}
        onClose={() => {
          setDrawerOpen(false);
          setSelectedReviewId(null);
        }}
        onUpdated={refetch}
      />
    </div>
  );
}
