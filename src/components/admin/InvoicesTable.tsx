import { useState } from "react";
import {
  useInvoicesManagement,
  useInvoiceDetails,
  generateInvoice,
  updateInvoiceStatus,
  sendInvoiceEmail,
  type InvoiceRow,
} from "@/lib/admin-invoices";
import { DashboardCard } from "@/components/admin/DashboardCard";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { FileText, Eye, XCircle, CheckCircle, Download, Mail } from "lucide-react";
import { exportCSV, generateInvoicePDF } from "@/lib/admin-export";
import { useFinanceDashboard } from "@/lib/admin-finance";

const STATUS_BADGES: Record<string, string> = {
  draft: "bg-neutral-100 text-neutral-800 dark:bg-neutral-900/30 dark:text-neutral-300",
  issued: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
  paid: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300",
  cancelled: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
  refunded: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300",
};

function StatusBadge({ status }: { status: string }) {
  const classes = STATUS_BADGES[status] ?? "bg-neutral-100 text-muted-foreground";
  return (
    <span className={`inline-block px-2.5 py-1 text-[10px] tracking-[0.2em] uppercase ${classes}`}>
      {status}
    </span>
  );
}

export function InvoicesTable() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [sortBy, setSortBy] = useState("created_at");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [statusFilter, setStatusFilter] = useState("");
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<string | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [generateOrderId, setGenerateOrderId] = useState("");
  const [generateOpen, setGenerateOpen] = useState(false);

  const pageSize = 15;

  const {
    result: invResult,
    loading,
    error,
    refetch,
  } = useInvoicesManagement(page, pageSize, search, sortBy, sortDir, statusFilter);
  const { data: detailData, loading: detailLoading } = useInvoiceDetails(selectedInvoiceId);
  const { data: financeDash } = useFinanceDashboard();
  const [genLoading, setGenLoading] = useState(false);
  const [genError, setGenError] = useState<string | null>(null);
  const [statusLoading, setStatusLoading] = useState(false);

  const debouncedSearch = (() => {
    let timer: ReturnType<typeof setTimeout>;
    return (val: string) => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        setSearch(val);
        setPage(1);
      }, 300);
    };
  })();

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

  const totalPages = Math.max(1, Math.ceil((invResult?.total ?? 0) / pageSize));

  const invoiceCards = financeDash
    ? [
        { label: "Total Invoices", value: financeDash.totalInvoices.toLocaleString() },
        {
          label: "Draft",
          value: financeDash.draftInvoices.toLocaleString(),
          icon: <FileText className="h-4 w-4" />,
        },
        {
          label: "Issued",
          value: financeDash.issuedInvoices.toLocaleString(),
          icon: <FileText className="h-4 w-4" />,
        },
        {
          label: "Paid",
          value: financeDash.paidInvoices.toLocaleString(),
          icon: <CheckCircle className="h-4 w-4" />,
        },
      ]
    : [];

  function handleDownloadPDF(invoice: InvoiceRow) {
    if (!detailData) return;
    generateInvoicePDF({
      invoiceNumber: invoice.invoice_number,
      orderNumber: invoice.order_number,
      customerName: invoice.customer_name,
      customerEmail: invoice.customer_email,
      issuedAt: invoice.issued_at,
      items: (detailData.items || []).map((item) => ({
        productName: item.product_name,
        quantity: item.quantity,
        unitPrice: item.unit_price,
        totalPrice: item.total_price,
      })),
      subtotal: invoice.subtotal,
      taxAmount: invoice.tax_amount,
      discountAmount: invoice.discount_amount,
      shippingAmount: invoice.shipping_amount,
      totalAmount: invoice.total_amount,
    });
  }

  return (
    <div>
      <div className="mb-10">
        <p className="eyebrow">Admin</p>
        <h1 className="font-serif text-4xl mt-2">Invoices</h1>
        <p className="text-sm text-muted-foreground mt-2 max-w-lg">
          Generate, view, and manage invoices for orders.
        </p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        {invoiceCards.map((c) => (
          <DashboardCard key={c.label} label={c.label} value={c.value} icon={c.icon} />
        ))}
      </div>

      {/* Actions */}
      <div className="flex flex-col sm:flex-row gap-3 mb-6 items-start sm:items-center justify-between">
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setGenerateOpen(!generateOpen)}>
            Generate Invoice
          </Button>
          {invResult?.invoices && invResult.invoices.length > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                const data = invResult.invoices.map((inv) => ({
                  "Invoice #": inv.invoice_number,
                  Customer: inv.customer_name,
                  Email: inv.customer_email,
                  Total: inv.total_amount,
                  Status: inv.status,
                  Issued: inv.issued_at ? new Date(inv.issued_at).toLocaleDateString() : "",
                }));
                exportCSV(data, `invoices-${new Date().toISOString().split("T")[0]}`);
              }}
            >
              Export CSV
            </Button>
          )}
        </div>

        {generateOpen && (
          <div className="flex gap-2 items-center">
            <Input
              placeholder="Order ID"
              value={generateOrderId}
              onChange={(e) => setGenerateOrderId(e.target.value)}
              className="w-64 h-9 text-sm"
            />
            <Button
              size="sm"
              disabled={!generateOrderId || genLoading}
              onClick={async () => {
                setGenLoading(true);
                setGenError(null);
                try {
                  const res = await generateInvoice(generateOrderId);
                  if (res.success) {
                    setGenerateOrderId("");
                    setGenerateOpen(false);
                    refetch();
                  } else {
                    setGenError(res.error || "Failed to generate invoice");
                  }
                } catch (err) {
                  setGenError(err instanceof Error ? err.message : "An error occurred");
                } finally {
                  setGenLoading(false);
                }
              }}
            >
              {genLoading ? "Generating..." : "Create"}
            </Button>
          </div>
        )}
      </div>

      {genError && (
        <div className="border border-red/20 bg-red/5 p-4 text-sm text-red/80 mb-6">{genError}</div>
      )}

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <Input
          placeholder="Search invoices, customers…"
          value={searchInput}
          onChange={(e) => {
            setSearchInput(e.target.value);
            debouncedSearch(e.target.value);
          }}
          className="max-w-sm h-9 text-sm"
        />
        <select
          value={statusFilter}
          onChange={(e) => {
            setStatusFilter(e.target.value);
            setPage(1);
          }}
          className="h-9 rounded-md border border-input bg-background px-3 text-xs text-muted-foreground"
        >
          <option value="">All Statuses</option>
          <option value="draft">Draft</option>
          <option value="issued">Issued</option>
          <option value="paid">Paid</option>
          <option value="cancelled">Cancelled</option>
          <option value="refunded">Refunded</option>
        </select>
      </div>

      {/* Error */}
      {error && (
        <div className="border border-red/20 bg-red/5 p-6 text-center mb-6">
          <p className="text-sm text-red/80">{error}</p>
          <Button variant="outline" size="sm" onClick={() => refetch()} className="mt-3">
            Retry
          </Button>
        </div>
      )}

      {/* Loading */}
      {loading && !error && (
        <div className="space-y-3">
          <Skeleton className="h-10 w-full" />
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      )}

      {/* Empty */}
      {!loading && !error && invResult && invResult.invoices.length === 0 && (
        <div className="border border-border/60 p-12 text-center">
          <p className="text-sm text-muted-foreground">
            {search || statusFilter
              ? "No invoices match your filters"
              : "No invoices yet. Generate one from an order."}
          </p>
        </div>
      )}

      {/* Table */}
      {!loading && !error && invResult && invResult.invoices.length > 0 && (
        <>
          <div className="border border-border/60 overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border/60">
                  <Th onClick={() => toggleSort("number")}>
                    Invoice #<SortIcon column="number" />
                  </Th>
                  <Th onClick={() => toggleSort("customer")}>
                    Customer
                    <SortIcon column="customer" />
                  </Th>
                  <Th onClick={() => toggleSort("total")} className="text-right">
                    Total
                    <SortIcon column="total" />
                  </Th>
                  <Th onClick={() => toggleSort("status")}>
                    Status
                    <SortIcon column="status" />
                  </Th>
                  <Th onClick={() => toggleSort("issue_date")}>
                    Date
                    <SortIcon column="issue_date" />
                  </Th>
                  <Th className="text-right">Actions</Th>
                </tr>
              </thead>
              <tbody>
                {invResult.invoices.map((inv) => (
                  <tr
                    key={inv.id}
                    className="border-b border-border/40 hover:bg-muted/30 cursor-pointer"
                    onClick={() => {
                      setSelectedInvoiceId(inv.id);
                      setDetailOpen(true);
                    }}
                  >
                    <td className="px-4 py-3 text-sm font-medium">{inv.invoice_number}</td>
                    <td className="px-4 py-3 text-sm">
                      {inv.customer_name}
                      <br />
                      <span className="text-xs text-muted-foreground">{inv.customer_email}</span>
                    </td>
                    <td className="px-4 py-3 text-sm text-right font-serif tabular-nums">
                      ${Number(inv.total_amount).toLocaleString()}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={inv.status} />
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
                      {inv.issued_at
                        ? new Date(inv.issued_at).toLocaleDateString("en-US", {
                            month: "short",
                            day: "numeric",
                            year: "numeric",
                          })
                        : "—"}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                        <button
                          className="p-1.5 text-muted-foreground hover:text-foreground"
                          title="View"
                          onClick={() => {
                            setSelectedInvoiceId(inv.id);
                            setDetailOpen(true);
                          }}
                        >
                          <Eye className="h-3.5 w-3.5" />
                        </button>
                        <button
                          className="p-1.5 text-muted-foreground hover:text-foreground"
                          title="Download PDF"
                          onClick={() => {
                            setSelectedInvoiceId(inv.id);
                            setTimeout(() => handleDownloadPDF(inv), 200);
                          }}
                        >
                          <Download className="h-3.5 w-3.5" />
                        </button>
                        <button
                          className="p-1.5 text-muted-foreground hover:text-foreground"
                          title="Email Invoice"
                          onClick={async () => {
                            try {
                              const res = await sendInvoiceEmail(inv.id);
                              if (res.success) {
                                alert("Invoice sent to customer.");
                              } else {
                                alert(res.error || "Failed to send email.");
                              }
                            } catch {
                              alert("Failed to send email.");
                            }
                          }}
                        >
                          <Mail className="h-3.5 w-3.5" />
                        </button>
                        {inv.status === "draft" && (
                          <button
                            className="p-1.5 text-muted-foreground hover:text-emerald-600"
                            title="Mark Paid"
                            disabled={statusLoading}
                            onClick={async () => {
                              setStatusLoading(true);
                              try {
                                const res = await updateInvoiceStatus(inv.id, "paid");
                                if (res.success) refetch();
                              } finally {
                                setStatusLoading(false);
                              }
                            }}
                          >
                            <CheckCircle className="h-3.5 w-3.5" />
                          </button>
                        )}
                        {(inv.status === "draft" || inv.status === "issued") && (
                          <button
                            className="p-1.5 text-muted-foreground hover:text-red-600"
                            title="Cancel"
                            disabled={statusLoading}
                            onClick={async () => {
                              setStatusLoading(true);
                              try {
                                const res = await updateInvoiceStatus(inv.id, "cancelled");
                                if (res.success) refetch();
                              } finally {
                                setStatusLoading(false);
                              }
                            }}
                          >
                            <XCircle className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          <div className="flex items-center justify-between pt-4 text-sm text-muted-foreground">
            <span>
              {invResult.total} invoice{invResult.total !== 1 ? "s" : ""}
            </span>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1}
                onClick={() => setPage(page - 1)}
              >
                Previous
              </Button>
              <span className="text-xs">
                {page} of {totalPages}
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
        </>
      )}

      {/* Detail Drawer */}
      {detailOpen && selectedInvoiceId && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="absolute inset-0 bg-black/20" onClick={() => setDetailOpen(false)} />
          <div className="relative w-full max-w-lg bg-background border-l border-border/60 p-6 overflow-y-auto">
            <div className="flex justify-between items-start mb-6">
              <div>
                <h2 className="font-serif text-xl">
                  {detailData?.invoice?.invoice_number || "Invoice"}
                </h2>
                {detailData?.order?.order_number && (
                  <p className="text-xs text-muted-foreground mt-1">
                    Order: {detailData.order.order_number}
                  </p>
                )}
              </div>
              <button
                onClick={() => setDetailOpen(false)}
                className="text-muted-foreground hover:text-foreground text-lg leading-none"
              >
                &times;
              </button>
            </div>

            {detailLoading ? (
              <div className="space-y-3">
                <Skeleton className="h-6 w-48" />
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-32 w-full" />
              </div>
            ) : detailData ? (
              <>
                <div className="mb-6 p-4 bg-neutral/50 text-sm space-y-1.5">
                  <p>
                    <span className="text-muted-foreground">Status: </span>
                    <StatusBadge status={detailData.invoice.status} />
                  </p>
                  <p>
                    <span className="text-muted-foreground">Customer: </span>
                    {detailData.invoice.customer_name}
                  </p>
                  <p>
                    <span className="text-muted-foreground">Email: </span>
                    {detailData.invoice.customer_email}
                  </p>
                  {detailData.invoice.issued_at && (
                    <p>
                      <span className="text-muted-foreground">Issued: </span>
                      {new Date(detailData.invoice.issued_at).toLocaleDateString()}
                    </p>
                  )}
                </div>

                <h3 className="text-xs uppercase tracking-wider text-muted-foreground mb-3">
                  Items
                </h3>
                <div className="border border-border/60 mb-6">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border/60 text-xs text-muted-foreground">
                        <th className="text-left px-3 py-2 font-medium">Item</th>
                        <th className="text-center px-3 py-2 font-medium">Qty</th>
                        <th className="text-right px-3 py-2 font-medium">Price</th>
                        <th className="text-right px-3 py-2 font-medium">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {detailData.items.map((item) => (
                        <tr key={item.id} className="border-b border-border/40">
                          <td className="px-3 py-2">{item.product_name}</td>
                          <td className="px-3 py-2 text-center text-muted-foreground">
                            {item.quantity}
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums">
                            ${Number(item.unit_price).toFixed(2)}
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums">
                            ${Number(item.total_price).toFixed(2)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="text-sm space-y-1.5 ml-auto w-48">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Subtotal</span>
                    <span>${Number(detailData.invoice.subtotal).toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Tax</span>
                    <span>${Number(detailData.invoice.tax_amount).toFixed(2)}</span>
                  </div>
                  {Number(detailData.invoice.discount_amount) > 0 && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Discount</span>
                      <span>-${Number(detailData.invoice.discount_amount).toFixed(2)}</span>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Shipping</span>
                    <span>${Number(detailData.invoice.shipping_amount).toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between font-semibold pt-2 border-t border-border/40">
                    <span>Total</span>
                    <span>${Number(detailData.invoice.total_amount).toFixed(2)}</span>
                  </div>
                </div>

                <div className="mt-8 flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    className="flex-1"
                    onClick={() => handleDownloadPDF(detailData.invoice as any)}
                  >
                    <Download className="h-3.5 w-3.5 mr-1.5" /> PDF
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="flex-1"
                    onClick={async () => {
                      if (!selectedInvoiceId) return;
                      try {
                        const res = await sendInvoiceEmail(selectedInvoiceId);
                        if (res.success) {
                          alert("Invoice sent to customer.");
                        } else {
                          alert(res.error || "Failed to send email.");
                        }
                      } catch {
                        alert("Failed to send email.");
                      }
                    }}
                  >
                    <Mail className="h-3.5 w-3.5 mr-1.5" /> Email
                  </Button>
                </div>
              </>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}

function Th({
  children,
  onClick,
  className = "",
}: {
  children: React.ReactNode;
  onClick?: () => void;
  className?: string;
}) {
  return (
    <th
      className={`px-4 py-3 text-[10px] tracking-[0.2em] uppercase text-muted-foreground font-medium ${onClick ? "cursor-pointer hover:text-foreground" : ""} ${className}`}
      onClick={onClick}
    >
      {children}
    </th>
  );
}
