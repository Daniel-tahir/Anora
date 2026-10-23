import { useState, useEffect, useMemo } from "react";
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { useInventoryManagement } from "@/lib/admin-inventory";
import { supabase } from "@/lib/supabase";
import { InventoryHistoryDrawer } from "./InventoryHistoryDrawer";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";

export function InventoryTable() {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<string>("name");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [stockStatus, setStockStatus] = useState("all");
  const [categoryId, setCategoryId] = useState("all");
  const [categories, setCategories] = useState<{ id: string; name: string }[]>([]);
  const [historyProductId, setHistoryProductId] = useState<string | null>(null);
  const [reservations, setReservations] = useState<any[]>([]);
  const [reloadTrigger, setReloadTrigger] = useState(0);
  const pageSize = 20;

  // Modal State
  const [adjustRecord, setAdjustRecord] = useState<any | null>(null);
  const [sizeStock, setSizeStock] = useState<Record<string, number>>({});
  const [saving, setSaving] = useState(false);

  const { result, loading, error, refetch } = useInventoryManagement(
    page,
    pageSize,
    search,
    sortBy,
    sortDir,
    stockStatus === "all" ? "" : stockStatus,
    categoryId === "all" ? "" : categoryId,
  );

  useEffect(() => {
    supabase
      .from("categories")
      .select("id, name")
      .then(({ data }) => {
        if (data) setCategories(data);
      });
  }, []);

  // Fetch reservations whenever page or reload trigger changes
  useEffect(() => {
    supabase
      .from("inventory_reservations")
      .select("product_id, variant_id, size, quantity")
      .eq("status", "active")
      .gt("expires_at", new Date().toISOString())
      .then(({ data }) => {
        if (data) setReservations(data);
      });
  }, [page, reloadTrigger]);

  const triggerReload = () => {
    setReloadTrigger((prev) => prev + 1);
    refetch();
  };

  const getReservedQty = (productId: string, variantId: string | null, size: string) => {
    return reservations
      .filter(
        (r) =>
          r.product_id === productId &&
          (variantId ? r.variant_id === variantId : !r.variant_id) &&
          r.size === size
      )
      .reduce((sum, r) => sum + r.quantity, 0);
  };

  // Flattened inventory records for display (ONE ROW PER VARIANT/BASE PRODUCT)
  const flattenedRecords = useMemo(() => {
    if (!result?.products) return [];

    const list: any[] = [];
    result.products.forEach((product) => {
      const isSingle = !product.variants || product.variants.length === 0;
      if (isSingle) {
        // Single Product (Base variant)
        const currentStock = product.stock ?? 0;
        const reserved = product.sizes?.reduce((sum: number, sz: string) => sum + getReservedQty(product.id, null, sz), 0) ?? 0;
        const available = Math.max(0, currentStock - reserved);
        const image = product.images?.[0] || "";

        list.push({
          id: `${product.id}--base`,
          productId: product.id,
          variantId: null,
          productName: product.name,
          variantName: "Base",
          sku: product.sku || "—",
          stock: currentStock,
          reserved,
          available,
          image,
          categoryName: product.category_name,
          productObj: product,
          sizes: product.sizes || [],
          size_stock: product.size_stock || {},
        });
      } else {
        // Variant Product (One row per variant)
        product.variants?.forEach((v: any) => {
          const currentStock = v.stock ?? 0;
          const reserved = v.sizes?.reduce((sum: number, sz: string) => sum + getReservedQty(product.id, v.id, sz), 0) ?? 0;
          const available = Math.max(0, currentStock - reserved);
          const image = v.images?.[0] || product.images?.[0] || "";

          list.push({
            id: `${product.id}-${v.id}`,
            productId: product.id,
            variantId: v.id,
            productName: product.name,
            variantName: v.name,
            sku: v.sku || "—",
            stock: currentStock,
            reserved,
            available,
            image,
            categoryName: product.category_name,
            productObj: product,
            sizes: v.sizes || [],
            size_stock: v.size_stock || {},
          });
        });
      }
    });
    return list;
  }, [result, reservations]);

  // Set local state when record is loaded in the adjust modal
  useEffect(() => {
    if (adjustRecord) {
      if (adjustRecord.sizes.length === 0 || (adjustRecord.sizes.length === 1 && adjustRecord.sizes[0] === "OS")) {
        const initialVal = adjustRecord.size_stock?.OS ?? adjustRecord.stock ?? 0;
        setSizeStock({ OS: initialVal, _general: initialVal });
      } else {
        setSizeStock(adjustRecord.size_stock || {});
      }
    }
  }, [adjustRecord]);

  // Calculated live sum of the size stocks in the modal
  const computedTotal = useMemo(() => {
    const isGeneral = adjustRecord?.sizes.length === 0 || (adjustRecord?.sizes.length === 1 && adjustRecord?.sizes[0] === "OS");
    if (isGeneral) {
      return sizeStock.OS ?? sizeStock._general ?? 0;
    }
    return Object.values(sizeStock).reduce((sum, val) => sum + (val || 0), 0);
  }, [sizeStock, adjustRecord]);

  const handleClose = () => {
    const isGeneral = adjustRecord?.sizes.length === 0 || (adjustRecord?.sizes.length === 1 && adjustRecord?.sizes[0] === "OS");
    const currentStockVal = isGeneral ? (sizeStock.OS ?? sizeStock._general ?? 0) : 0;
    const isChanged = isGeneral
      ? (currentStockVal !== (adjustRecord?.stock || 0))
      : JSON.stringify(sizeStock) !== JSON.stringify(adjustRecord?.size_stock || {});
    if (isChanged && !confirm("You have unsaved changes. Are you sure you want to close?")) {
      return;
    }
    setAdjustRecord(null);
  };

  async function handleSaveStock() {
    if (!adjustRecord) return;
    setSaving(true);
    try {
      const isGeneral = adjustRecord.sizes.length === 0 || (adjustRecord.sizes.length === 1 && adjustRecord.sizes[0] === "OS");
      const newTotalStock = isGeneral
        ? (sizeStock.OS ?? sizeStock._general ?? 0)
        : Object.values(sizeStock).reduce((sum, val) => sum + (val || 0), 0);
      const diff = newTotalStock - (adjustRecord.stock || 0);
      const finalSizeStock = isGeneral ? { "OS": newTotalStock } : sizeStock;

      if (adjustRecord.variantId) {
        // 1. Update variant size_stock and stock
        const { error: variantErr } = await supabase
          .from("product_variants")
          .update({
            size_stock: finalSizeStock,
            stock: newTotalStock,
          })
          .eq("id", adjustRecord.variantId);
        if (variantErr) throw variantErr;

        // 2. Fetch all sibling variants to compute new parent product stock sum
        const { data: siblingVariants, error: sibErr } = await supabase
          .from("product_variants")
          .select("id, stock, is_active")
          .eq("product_id", adjustRecord.productId);
        if (sibErr) throw sibErr;

        // Map and sum variant stocks (replacing the updated one with new total)
        const updatedTotalProductStock = (siblingVariants || []).reduce((sum, v) => {
          const vStock = v.id === adjustRecord.variantId ? newTotalStock : (v.stock || 0);
          return sum + (v.is_active !== false ? vStock : 0);
        }, 0);

        // 3. Update parent product stock
        const { error: productErr } = await supabase
          .from("products")
          .update({ stock: updatedTotalProductStock })
          .eq("id", adjustRecord.productId);
        if (productErr) throw productErr;

        // 4. Log to inventory_logs
        await supabase
          .from("inventory_logs")
          .insert({
            product_id: adjustRecord.productId,
            variant_id: adjustRecord.variantId,
            change_type: diff > 0 ? "restock" : "adjustment",
            quantity_change: diff,
            quantity_after: newTotalStock,
            reference_id: "admin-adjustment",
            notes: isGeneral
              ? `Stock adjusted manually for variant ${adjustRecord.variantName}. Stock: ${newTotalStock}`
              : `Stock adjusted manually for variant ${adjustRecord.variantName}. Size changes: ${JSON.stringify(sizeStock)}`,
          });
      } else {
        // 1. Update base product size_stock and stock
        const { error: productErr } = await supabase
          .from("products")
          .update({
            size_stock: finalSizeStock,
            stock: newTotalStock,
          })
          .eq("id", adjustRecord.productId);
        if (productErr) throw productErr;

        // 2. Log to inventory_logs
        await supabase
          .from("inventory_logs")
          .insert({
            product_id: adjustRecord.productId,
            variant_id: null,
            change_type: diff > 0 ? "restock" : "adjustment",
            quantity_change: diff,
            quantity_after: newTotalStock,
            reference_id: "admin-adjustment",
            notes: isGeneral
              ? `Stock adjusted manually. Stock: ${newTotalStock}`
              : `Stock adjusted manually. Size changes: ${JSON.stringify(sizeStock)}`,
          });
      }

      toast.success("Stock updated successfully");
      queryClient.invalidateQueries({ queryKey: ["admin-inventory"] });
      queryClient.invalidateQueries({ queryKey: ["product-detail"] });
      queryClient.invalidateQueries({ queryKey: ["products"] });
      setAdjustRecord(null);
      triggerReload();
    } catch (err: any) {
      toast.error(`Failed to update stock: ${err.message}`);
    } finally {
      setSaving(false);
    }
  }

  function handleSort(column: string) {
    if (sortBy === column) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortBy(column);
      setSortDir("asc");
    }
    setPage(1);
  }

  const sortIndicator = (column: string) => {
    if (sortBy !== column) return " ↕";
    return sortDir === "asc" ? " ↑" : " ↓";
  };

  const totalPages = Math.max(1, Math.ceil((result?.total ?? 0) / pageSize));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <Input
          placeholder="Search products..."
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
          className="max-w-xs"
        />
        <Select
          value={stockStatus}
          onValueChange={(val) => {
            setStockStatus(val);
            setPage(1);
          }}
        >
          <SelectTrigger className="w-36">
            <SelectValue placeholder="All stock" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All stock</SelectItem>
            <SelectItem value="critical">Critical</SelectItem>
            <SelectItem value="low">Low</SelectItem>
            <SelectItem value="healthy">Healthy</SelectItem>
            <SelectItem value="overstock">Overstock</SelectItem>
          </SelectContent>
        </Select>
        <Select
          value={categoryId}
          onValueChange={(val) => {
            setCategoryId(val);
            setPage(1);
          }}
        >
          <SelectTrigger className="w-44">
            <SelectValue placeholder="All categories" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All categories</SelectItem>
            {categories.map((cat) => (
              <SelectItem key={cat.id} value={cat.id}>
                {cat.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {error && <p className="text-red-500 text-sm">{error}</p>}

      <div className="rounded-md border overflow-x-auto bg-background">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-20">Image</TableHead>
              <TableHead className="cursor-pointer select-none" onClick={() => handleSort("name")}>
                Product{sortIndicator("name")}
              </TableHead>
              <TableHead>Variant</TableHead>
              <TableHead>SKU</TableHead>
              <TableHead className="text-right">Total Stock</TableHead>
              <TableHead className="text-right">Reserved</TableHead>
              <TableHead className="text-right">Available</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                  Loading...
                </TableCell>
              </TableRow>
            ) : flattenedRecords.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                  No inventory records found
                </TableCell>
              </TableRow>
            ) : (
              flattenedRecords.map((record) => (
                <TableRow key={record.id} className="hover:bg-muted/50">
                  <TableCell className="p-2">
                    {record.image ? (
                      <img
                        src={record.image}
                        alt={record.productName}
                        className="w-12 h-16 object-cover border rounded bg-neutral"
                      />
                    ) : (
                      <div className="w-12 h-16 border rounded bg-neutral flex items-center justify-center text-[10px] text-muted-foreground leading-tight text-center">
                        No Image
                      </div>
                    )}
                  </TableCell>
                  <TableCell className="font-semibold text-sm">{record.productName}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{record.variantName}</TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">{record.sku}</TableCell>
                  <TableCell className="text-right font-mono text-sm font-semibold">{record.stock}</TableCell>
                  <TableCell className="text-right font-mono text-xs text-muted-foreground">{record.reserved}</TableCell>
                  <TableCell className="text-right font-mono text-sm font-semibold">{record.available}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button variant="outline" size="sm" onClick={() => setAdjustRecord(record)}>
                        Adjust
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => setHistoryProductId(record.productId)}>
                        History
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{result?.total ?? 0} products ({flattenedRecords.length} variants listed)</p>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
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
            onClick={() => setPage((p) => p + 1)}
          >
            Next
          </Button>
        </div>
      </div>

      {/* Adjust Inventory Modal */}
      <Dialog open={!!adjustRecord} onOpenChange={(open) => { if (!open) handleClose(); }}>
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle>Adjust Inventory</DialogTitle>
          </DialogHeader>
          {adjustRecord && (
            <div className="space-y-4">
              <div className="flex gap-4">
                {adjustRecord.image ? (
                  <img
                    src={adjustRecord.image}
                    alt={adjustRecord.productName}
                    className="w-16 h-20 object-cover border rounded bg-neutral"
                  />
                ) : (
                  <div className="w-16 h-20 border rounded bg-neutral flex items-center justify-center text-[10px] text-muted-foreground text-center">
                    No Image
                  </div>
                )}
                <div className="flex-1 space-y-1">
                  <h4 className="font-semibold text-sm leading-tight">{adjustRecord.productName}</h4>
                  <p className="text-xs text-muted-foreground">Variant: {adjustRecord.variantName}</p>
                  <p className="text-xs font-mono text-muted-foreground">SKU: {adjustRecord.sku}</p>
                </div>
              </div>

              <div className="h-px bg-border" />

              <div className="max-h-[300px] overflow-y-auto pr-1 space-y-1">
                {adjustRecord.sizes.length === 0 || (adjustRecord.sizes.length === 1 && adjustRecord.sizes[0] === "OS") ? (
                  <div className="flex items-center justify-between gap-4 py-2 border-b border-border/40">
                    <span className="font-semibold text-sm">Stock Quantity</span>
                    <Input
                      type="number"
                      min="0"
                      value={sizeStock.OS ?? sizeStock._general ?? 0}
                      onChange={(e) => {
                        const val = Math.max(0, parseInt(e.target.value) || 0);
                        setSizeStock({ OS: val, _general: val });
                      }}
                      className="h-8 w-24 text-right text-xs"
                      disabled={saving}
                    />
                  </div>
                ) : (
                  adjustRecord.sizes.map((sz: string) => {
                    const val = sizeStock[sz] ?? 0;
                    return (
                      <div key={sz} className="flex items-center justify-between gap-4 py-2 border-b border-border/40">
                        <span className="font-semibold text-sm">{sz}</span>
                        <Input
                          type="number"
                          min="0"
                          value={val}
                          onChange={(e) =>
                            setSizeStock((prev) => ({
                              ...prev,
                              [sz]: Math.max(0, parseInt(e.target.value) || 0),
                            }))
                          }
                          className="h-8 w-24 text-right text-xs"
                          disabled={saving}
                        />
                      </div>
                    );
                  })
                )}
              </div>

              <div className="flex justify-between items-center bg-stone-50 dark:bg-stone-900/40 p-3 rounded-lg border">
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Calculated Total Stock
                </span>
                <span className="text-lg font-bold font-mono">{computedTotal}</span>
              </div>

              <DialogFooter className="flex justify-end gap-2 pt-2 border-t">
                <Button variant="outline" size="sm" onClick={handleClose} disabled={saving}>
                  Cancel
                </Button>
                <Button
                  size="sm"
                  onClick={handleSaveStock}
                  disabled={saving}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold"
                >
                  {saving ? "Saving..." : "Save Changes"}
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <InventoryHistoryDrawer
        productId={historyProductId}
        onClose={() => setHistoryProductId(null)}
      />
    </div>
  );
}
