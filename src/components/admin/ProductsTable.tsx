import { useState, useCallback } from "react";
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
import { Checkbox } from "@/components/ui/checkbox";
import {
  useProductsManagement,
  useProductCategories,
  deleteProduct,
  duplicateProduct,
  bulkUpdateProducts,
  bulkDeleteProducts,
  type ProductManagementRow,
} from "@/lib/admin-products";
import { ProductForm } from "./ProductForm";

const STATUS_BADGES: Record<string, string> = {
  active: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300",
  draft: "bg-stone-100 text-stone-800 dark:bg-stone-900/30 dark:text-stone-300",
  archived: "bg-neutral-100 text-neutral-600 dark:bg-neutral-800/30 dark:text-neutral-400",
  out_of_stock: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300",
};

function StatusBadge({ status }: { status: string }) {
  const classes = STATUS_BADGES[status] ?? "bg-neutral-100 text-muted-foreground";
  return (
    <span className={`inline-block px-2.5 py-1 text-[10px] tracking-[0.2em] uppercase ${classes}`}>
      {status === "out_of_stock" ? "Out of Stock" : status}
    </span>
  );
}

function ProductsSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-10 w-full" />
      {Array.from({ length: 5 }).map((_, i) => (
        <Skeleton key={i} className="h-12 w-full" />
      ))}
    </div>
  );
}

function ProductsEmptyState({ hasFilters }: { hasFilters: boolean }) {
  return (
    <div className="border border-border/60 p-12 text-center">
      <p className="text-sm text-muted-foreground">
        {hasFilters
          ? "No products match your filters"
          : "No products yet — create your first product to get started."}
      </p>
    </div>
  );
}

function ProductsErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="border border-red/20 bg-red/5 p-6 text-center">
      <p className="text-sm text-red/80">{message}</p>
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
        {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
          const start = Math.max(1, Math.min(page - 2, totalPages - 4));
          const p = start + i;
          if (p > totalPages) return null;
          return (
            <button
              key={p}
              onClick={() => onPage(p)}
              className={`w-8 h-8 text-xs rounded-md ${p === page ? "bg-foreground text-background" : "border border-border/60 text-muted-foreground hover:border-foreground/30"}`}
            >
              {p}
            </button>
          );
        })}
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

function DeleteConfirmDialog({
  products,
  onConfirm,
  onCancel,
  deleting,
}: {
  products: ProductManagementRow[];
  onConfirm: () => void;
  onCancel: () => void;
  deleting: boolean;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80"
      onClick={onCancel}
    >
      <div
        className="w-full max-w-sm border bg-background p-6 shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="font-serif text-lg">Delete Product{products.length > 1 ? "s" : ""}</p>
        <p className="text-sm text-muted-foreground mt-2">
          {products.length === 1 ? (
            <>
              Are you sure you want to delete <strong>{products[0].name}</strong>? This cannot be
              undone.
            </>
          ) : (
            <>
              Are you sure you want to delete <strong>{products.length}</strong> products? This
              cannot be undone.
            </>
          )}
        </p>
        <div className="flex justify-end gap-3 mt-6">
          <Button variant="outline" size="sm" onClick={onCancel} disabled={deleting}>
            Cancel
          </Button>
          <Button variant="destructive" size="sm" onClick={onConfirm} disabled={deleting}>
            {deleting ? "Deleting…" : "Delete"}
          </Button>
        </div>
      </div>
    </div>
  );
}

function quickStatus(status: string): string {
  if (
    status === "active" ||
    status === "draft" ||
    status === "archived" ||
    status === "out_of_stock"
  )
    return status;
  return "active";
}

export function ProductsTable() {
  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState("created_at");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [statusFilter, setStatusFilter] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [stockFilter, setStockFilter] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editingProductId, setEditingProductId] = useState<string | null>(null);
  const [duplicating, setDuplicating] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [deletingProducts, setDeletingProducts] = useState<ProductManagementRow[] | null>(null);
  const [deleting, setDeleting] = useState(false);
  const pageSize = 15;

  const { categories } = useProductCategories();

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

  const { result, loading, error, refetch } = useProductsManagement(
    page,
    pageSize,
    search,
    sortBy,
    sortDir,
    statusFilter === "out_of_stock" ? "out_of_stock" : statusFilter,
    categoryFilter,
    stockFilter,
  );

  const hasFilters = !!(search || statusFilter || categoryFilter || stockFilter);
  const products = result?.products ?? [];
  const allSelected = products.length > 0 && products.every((p) => selected.has(p.id));
  const someSelected = selected.size > 0;

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

  function toggleAll() {
    if (!result) return;
    if (allSelected) {
      setSelected(new Set());
    } else {
      setSelected(new Set(result.products.map((p) => p.id)));
    }
  }

  function toggleOne(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function handleCreate() {
    setEditingProductId(null);
    setModalOpen(true);
  }

  function handleEdit(product: ProductManagementRow) {
    setEditingProductId(product.id);
    setModalOpen(true);
  }

  async function handleDuplicate(productId: string) {
    setDuplicating(productId);
    try {
      await duplicateProduct(productId);
      refetch();
    } catch {
      /* error handled by parent */
    } finally {
      setDuplicating(null);
    }
  }

  async function handleBulkAction(action: "activate" | "deactivate" | "archive" | "delete") {
    const ids = Array.from(selected);
    if (ids.length === 0) return;

    if (action === "delete") {
      const productsToDelete = result?.products.filter((p) => selected.has(p.id)) ?? [];
      setDeletingProducts(productsToDelete);
      return;
    }

    try {
      if (action === "activate") {
        await bulkUpdateProducts(ids, { status: "active" });
      } else if (action === "deactivate") {
        await bulkUpdateProducts(ids, { status: "draft" });
      } else if (action === "archive") {
        await bulkUpdateProducts(ids, { status: "archived" });
      }
      setSelected(new Set());
      refetch();
    } catch {
      /* ignored */
    }
  }

  async function handleBulkDeleteConfirm() {
    if (!deletingProducts || deletingProducts.length === 0) return;
    setDeleting(true);
    try {
      await bulkDeleteProducts(deletingProducts.map((p) => p.id));
      setDeletingProducts(null);
      setSelected(new Set());
      refetch();
    } catch {
      /* ignored */
    } finally {
      setDeleting(false);
    }
  }

  async function handleDeleteSingle(product: ProductManagementRow) {
    setDeletingProducts([product]);
  }

  function handleSaved() {
    refetch();
  }

  return (
    <div>
      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-5">
        <div className="flex items-center gap-3 flex-1">
          <Input
            placeholder="Search by name or SKU…"
            value={searchInput}
            onChange={(e) => {
              setSearchInput(e.target.value);
              debouncedSearch(e.target.value);
            }}
            className="max-w-64 h-9 text-sm"
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
            <option value="active">Active</option>
            <option value="draft">Draft</option>
            <option value="archived">Archived</option>
            <option value="out_of_stock">Out of Stock</option>
          </select>
          <select
            value={categoryFilter}
            onChange={(e) => {
              setCategoryFilter(e.target.value);
              setPage(1);
            }}
            className="h-9 rounded-md border border-input bg-background px-3 text-xs text-muted-foreground max-w-40"
          >
            <option value="">All Categories</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <select
            value={stockFilter}
            onChange={(e) => {
              setStockFilter(e.target.value);
              setPage(1);
            }}
            className="h-9 rounded-md border border-input bg-background px-3 text-xs text-muted-foreground"
          >
            <option value="">All Stock</option>
            <option value="in_stock">In Stock</option>
            <option value="low_stock">Low Stock (≤10)</option>
            <option value="out_of_stock">Out of Stock</option>
          </select>
        </div>
        <Button onClick={handleCreate} size="sm">
          Create Product
        </Button>
      </div>

      {/* Bulk actions bar */}
      {someSelected && (
        <div className="flex items-center gap-3 mb-4 p-3 border border-border/60 bg-muted/30">
          <span className="text-xs text-muted-foreground">{selected.size} selected</span>
          <Button variant="outline" size="sm" onClick={() => handleBulkAction("activate")}>
            Activate
          </Button>
          <Button variant="outline" size="sm" onClick={() => handleBulkAction("deactivate")}>
            Deactivate
          </Button>
          <Button variant="outline" size="sm" onClick={() => handleBulkAction("archive")}>
            Archive
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => handleBulkAction("delete")}
            className="text-red/80 hover:text-red"
          >
            Delete
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setSelected(new Set())}>
            Clear
          </Button>
        </div>
      )}

      {error && <ProductsErrorState message={error} onRetry={refetch} />}
      {loading && <ProductsSkeleton />}

      {!loading && !error && result && result.products.length === 0 && (
        <ProductsEmptyState hasFilters={hasFilters} />
      )}

      {!loading && !error && result && result.products.length > 0 && (
        <>
          <div className="border border-border/60 overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">
                    {allSelected ? (
                      <Checkbox checked onCheckedChange={toggleAll} />
                    ) : (
                      <Checkbox
                        checked={false}
                        onCheckedChange={(v) => {
                          if (v) toggleAll();
                        }}
                      />
                    )}
                  </TableHead>
                  <TableHead className="w-14">Image</TableHead>
                  <TableHead
                    className="cursor-pointer min-w-[160px]"
                    onClick={() => toggleSort("name")}
                  >
                    Product Name
                    <SortIcon column="name" />
                  </TableHead>
                  <TableHead className="cursor-pointer" onClick={() => toggleSort("sku")}>
                    SKU
                    <SortIcon column="sku" />
                  </TableHead>
                  <TableHead className="cursor-pointer" onClick={() => toggleSort("category_name")}>
                    Category
                    <SortIcon column="category_name" />
                  </TableHead>
                  <TableHead
                    className="cursor-pointer text-right"
                    onClick={() => toggleSort("price")}
                  >
                    Price
                    <SortIcon column="price" />
                  </TableHead>
                  <TableHead
                    className="cursor-pointer text-right"
                    onClick={() => toggleSort("stock")}
                  >
                    Stock
                    <SortIcon column="stock" />
                  </TableHead>
                  <TableHead className="cursor-pointer" onClick={() => toggleSort("status")}>
                    Status
                    <SortIcon column="status" />
                  </TableHead>
                  <TableHead className="cursor-pointer" onClick={() => toggleSort("created_at")}>
                    Created
                    <SortIcon column="created_at" />
                  </TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {result.products.map((p: ProductManagementRow) => (
                  <TableRow key={p.id} className={selected.has(p.id) ? "bg-muted/20" : ""}>
                    <TableCell>
                      <Checkbox
                        checked={selected.has(p.id)}
                        onCheckedChange={() => toggleOne(p.id)}
                      />
                    </TableCell>
                    <TableCell>
                      {p.thumbnail ? (
                        <img src={p.thumbnail} alt="" className="w-10 h-13 object-cover rounded" />
                      ) : (
                        <div className="w-10 h-13 bg-neutral rounded" />
                      )}
                    </TableCell>
                    <TableCell className="font-medium">{p.name}</TableCell>
                    <TableCell className="text-xs text-muted-foreground font-mono">
                      {p.sku ?? "—"}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {p.category_name}
                    </TableCell>
                    <TableCell className="text-right font-serif tabular-nums">
                      ${Number(p.price).toLocaleString()}
                    </TableCell>
                    <TableCell className="text-right font-mono tabular-nums">{p.stock}</TableCell>
                    <TableCell>
                      <StatusBadge status={p.status} />
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                      {new Date(p.created_at).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      })}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button variant="outline" size="sm" onClick={() => handleEdit(p)}>
                          Edit
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleDuplicate(p.id)}
                          disabled={duplicating === p.id}
                        >
                          {duplicating === p.id ? "…" : "Duplicate"}
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleDeleteSingle(p)}
                          className="text-red/80 hover:text-red"
                        >
                          Delete
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <Pagination page={page} total={result?.total ?? 0} pageSize={pageSize} onPage={setPage} />
        </>
      )}

      <ProductForm
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onSaved={handleSaved}
        productId={editingProductId}
      />

      {deletingProducts && (
        <DeleteConfirmDialog
          products={deletingProducts}
          onConfirm={
            deletingProducts.length > 1
              ? handleBulkDeleteConfirm
              : async () => {
                  if (deletingProducts.length !== 1) return;
                  setDeleting(true);
                  try {
                    await deleteProduct(deletingProducts[0].id);
                    setDeletingProducts(null);
                    setSelected(new Set());
                    refetch();
                  } catch {
                    /* ignored */
                  } finally {
                    setDeleting(false);
                  }
                }
          }
          onCancel={() => setDeletingProducts(null)}
          deleting={deleting}
        />
      )}
    </div>
  );
}
