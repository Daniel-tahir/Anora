import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableHeader,
  TableRow,
  TableHead,
  TableBody,
  TableCell,
} from "@/components/ui/table";
import { useCustomerDetails } from "@/lib/admin-customers";

interface Props {
  userId: string | null;
  open: boolean;
  onClose: () => void;
}

const statusColors: Record<string, string> = {
  pending: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
  confirmed: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
  processing: "bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-300",
  shipped: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300",
  delivered: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300",
  cancelled: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
  refunded: "bg-stone-100 text-stone-800 dark:bg-stone-900/30 dark:text-stone-300",
};

const segmentColors: Record<string, string> = {
  new: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
  returning: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
  vip: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300",
};

export function CustomerProfileDrawer({ userId, open, onClose }: Props) {
  const { details, loading, error, refetch } = useCustomerDetails(userId);

  return (
    <Sheet
      open={open}
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
    >
      <SheetContent className="sm:max-w-xl overflow-y-auto">
        <SheetHeader className="mb-6">
          <SheetTitle>Customer Profile</SheetTitle>
          <SheetDescription>Detailed customer information and statistics.</SheetDescription>
        </SheetHeader>

        {loading ? (
          <div className="space-y-4">
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-4 w-60" />
            <Skeleton className="h-4 w-48" />
            <div className="grid grid-cols-2 gap-4 mt-6">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="rounded-lg border p-3">
                  <Skeleton className="h-3 w-16 mb-2" />
                  <Skeleton className="h-5 w-12" />
                </div>
              ))}
            </div>
          </div>
        ) : error ? (
          <div className="border border-red/20 bg-red/5 p-4 text-center">
            <p className="text-sm text-red/80">{error}</p>
            <button onClick={refetch} className="text-sm underline mt-2">
              Retry
            </button>
          </div>
        ) : !details ? (
          <p className="text-sm text-muted-foreground">Customer not found.</p>
        ) : (
          <div className="space-y-6">
            {/* Basic Info */}
            <div>
              <h3 className="font-semibold text-lg">
                {details.first_name ?? ""} {details.last_name ?? ""}
              </h3>
              <p className="text-sm text-muted-foreground">{details.email}</p>
              {details.phone && <p className="text-sm text-muted-foreground">{details.phone}</p>}
              <div className="flex items-center gap-2 mt-2">
                <span
                  className={`inline-block px-2 py-0.5 text-[10px] tracking-[0.2em] uppercase ${segmentColors[details.segment] ?? ""}`}
                >
                  {details.segment}
                </span>
              </div>
              <div className="text-xs text-muted-foreground mt-2 space-y-1">
                <p>Registered: {new Date(details.registration_date).toLocaleDateString()}</p>
                <p>
                  Last activity:{" "}
                  {details.last_activity
                    ? new Date(details.last_activity).toLocaleDateString()
                    : "—"}
                </p>
              </div>
            </div>

            {/* Statistics */}
            <div className="grid grid-cols-2 gap-4">
              <div className="rounded-lg border p-3">
                <p className="text-xs text-muted-foreground uppercase tracking-wider">Orders</p>
                <p className="text-xl font-bold mt-1">{details.orders_count}</p>
              </div>
              <div className="rounded-lg border p-3">
                <p className="text-xs text-muted-foreground uppercase tracking-wider">
                  Total Spent
                </p>
                <p className="text-xl font-bold mt-1">
                  ${Number(details.total_spent).toLocaleString()}
                </p>
              </div>
              <div className="rounded-lg border p-3">
                <p className="text-xs text-muted-foreground uppercase tracking-wider">
                  Avg Order Value
                </p>
                <p className="text-xl font-bold mt-1">
                  ${Number(details.avg_order_value).toLocaleString()}
                </p>
              </div>
              <div className="rounded-lg border p-3">
                <p className="text-xs text-muted-foreground uppercase tracking-wider">Last Order</p>
                <p className="text-sm font-medium mt-1">
                  {details.last_order_at
                    ? new Date(details.last_order_at).toLocaleDateString()
                    : "—"}
                </p>
              </div>
            </div>

            {/* Recent Orders */}
            {details.recent_orders.length > 0 && (
              <div>
                <h4 className="font-semibold mb-2">Recent Orders</h4>
                <div className="rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Order</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Total</TableHead>
                        <TableHead>Date</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {details.recent_orders.map((order) => (
                        <TableRow key={order.id}>
                          <TableCell className="font-mono text-xs">
                            {order.order_number ?? order.id.slice(0, 8)}
                          </TableCell>
                          <TableCell>
                            <span
                              className={`inline-block px-2 py-0.5 text-[10px] tracking-[0.2em] uppercase ${statusColors[order.status] ?? ""}`}
                            >
                              {order.status}
                            </span>
                          </TableCell>
                          <TableCell className="text-right font-serif tabular-nums">
                            ${Number(order.total).toLocaleString()}
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                            {new Date(order.created_at).toLocaleDateString()}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            )}

            {/* Addresses */}
            {details.addresses.length > 0 && (
              <div>
                <h4 className="font-semibold mb-2">Addresses</h4>
                <div className="space-y-2">
                  {details.addresses.map((addr) => (
                    <div key={addr.id} className="rounded-md border p-3 text-sm">
                      {addr.label && (
                        <p className="font-medium text-xs uppercase text-muted-foreground">
                          {addr.label}
                        </p>
                      )}
                      <p>
                        {addr.line1}
                        {addr.line2 ? `, ${addr.line2}` : ""}
                      </p>
                      <p>
                        {addr.city}
                        {addr.state ? `, ${addr.state}` : ""} {addr.postal_code}
                      </p>
                      <p>{addr.country}</p>
                      {addr.is_default && (
                        <Badge variant="outline" className="mt-1 text-[10px]">
                          Default
                        </Badge>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {details.addresses.length === 0 && details.recent_orders.length === 0 && (
              <p className="text-sm text-muted-foreground">No additional information available.</p>
            )}
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
