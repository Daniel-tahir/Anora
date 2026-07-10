import { useState, useEffect } from "react";
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
import { useInventoryManagement, type InventoryProductRow } from "@/lib/admin-inventory";
import { supabase } from "@/lib/supabase";
import { AdjustStockDialog } from "./AdjustStockDialog";
import { InventoryHistoryDrawer } from "./InventoryHistoryDrawer";

function getStockBadge(stock: number) {
  if (stock <= 2) return <Badge variant="destructive">Critical</Badge>;
  if (stock <= 10) return <Badge variant="secondary">Low</Badge>;
  if (stock > 100) return <Badge>Overstock</Badge>;
  return <Badge variant="outline">Healthy</Badge>;
}

export function InventoryTable() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<string>("name");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [stockStatus, setStockStatus] = useState("all");
  const [categoryId, setCategoryId] = useState("all");
  const [categories, setCategories] = useState<{ id: string; name: string }[]>([]);
  const [adjustProduct, setAdjustProduct] = useState<InventoryProductRow | null>(null);
  const [historyProductId, setHistoryProductId] = useState<string | null>(null);
  const pageSize = 20;

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

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="cursor-pointer select-none" onClick={() => handleSort("name")}>
                Product{sortIndicator("name")}
              </TableHead>
              <TableHead className="cursor-pointer select-none" onClick={() => handleSort("sku")}>
                SKU{sortIndicator("sku")}
              </TableHead>
              <TableHead>Category</TableHead>
              <TableHead
                className="cursor-pointer select-none text-right"
                onClick={() => handleSort("stock")}
              >
                Stock{sortIndicator("stock")}
              </TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                  Loading...
                </TableCell>
              </TableRow>
            ) : (result?.products?.length ?? 0) === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                  No products found
                </TableCell>
              </TableRow>
            ) : (
              result?.products.map((product) => (
                <TableRow key={product.id}>
                  <TableCell className="font-medium">{product.name}</TableCell>
                  <TableCell className="font-mono text-sm">{product.sku ?? "—"}</TableCell>
                  <TableCell className="text-sm">{product.category_name}</TableCell>
                  <TableCell className="text-right font-mono">{product.stock}</TableCell>
                  <TableCell>{getStockBadge(product.stock)}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button variant="ghost" size="sm" onClick={() => setAdjustProduct(product)}>
                        Adjust
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setHistoryProductId(product.id)}
                      >
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
        <p className="text-sm text-muted-foreground">{result?.total ?? 0} total</p>
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

      {adjustProduct && (
        <AdjustStockDialog
          product={adjustProduct}
          open={!!adjustProduct}
          onOpenChange={(open) => {
            if (!open) setAdjustProduct(null);
          }}
          onSuccess={() => {
            setAdjustProduct(null);
            refetch();
          }}
        />
      )}

      <InventoryHistoryDrawer
        productId={historyProductId}
        onClose={() => setHistoryProductId(null)}
      />
    </div>
  );
}
