import { useState, useEffect, useMemo } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/lib/supabase";
import { createProduct, updateProduct, slugify } from "@/lib/admin-products";
import {
  SIZE_OPTIONS,
  buildSizeStock,
  calculateProductStock,
  isSizeInventoryEnabled,
} from "@/lib/inventory-admin";

interface CategoryOption {
  id: string;
  name: string;
}

interface FormData {
  name: string;
  sku: string;
  price: string;
  stock: string;
  description: string;
  status: string;
  category_id: string;
  sizes: string[];
  size_stock: Record<string, number>;
}

interface FormErrors {
  name?: string;
  sku?: string;
  price?: string;
  stock?: string;
  category_id?: string;
  description?: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  product?: {
    id: string;
    name: string;
    sku: string | null;
    price: number;
    stock: number;
    status: string;
    description?: string | null;
    sizes?: string[];
    size_stock?: Record<string, number>;
  } | null;
}

export function ProductFormDialog({ open, onClose, onSaved, product }: Props) {
  const isEdit = !!product;
  const [saving, setSaving] = useState(false);
  const [categories, setCategories] = useState<CategoryOption[]>([]);
  const [form, setForm] = useState<FormData>({
    name: "",
    sku: "",
    price: "",
    stock: "",
    description: "",
    status: "draft",
    category_id: "",
    sizes: [],
    size_stock: {},
  });
  const [errors, setErrors] = useState<FormErrors>({});

  useEffect(() => {
    supabase
      .from("categories")
      .select("id, name")
      .eq("is_active", true)
      .order("name")
      .then(({ data }) => setCategories(data ?? []));
  }, []);

  useEffect(() => {
    if (open) {
      if (product) {
        const isActive = product.status === "active" || product.status === "out_of_stock";
        setForm({
          name: product.name,
          sku: product.sku ?? "",
          price: String(product.price),
          stock: String(product.stock),
          description: product.description ?? "",
          status:
            !isActive && product.status
              ? product.status
              : product.stock > 0
                ? "active"
                : "out_of_stock",
          category_id: "",
          sizes: product.sizes ?? [],
          size_stock: (product.size_stock ?? {}) as Record<string, number>,
        });
      } else {
        setForm({
          name: "",
          sku: "",
          price: "",
          stock: "",
          description: "",
          status: "draft",
          category_id: "",
          sizes: [],
          size_stock: {},
        });
      }
      setErrors({});
    }
  }, [open, product]);

  const computedStock = useMemo(() => calculateProductStock(form.size_stock), [form.size_stock]);

  const sizeInventoryEnabled = useMemo(
    () => isSizeInventoryEnabled(form.size_stock),
    [form.size_stock],
  );

  function validate(): boolean {
    const e: FormErrors = {};
    if (!form.name.trim()) e.name = "Name is required";
    if (!form.sku.trim()) e.sku = "SKU is required";
    const price = parseFloat(form.price);
    if (!form.price || isNaN(price) || price <= 0) e.price = "Price must be greater than 0";
    if (sizeInventoryEnabled) {
      if (computedStock < 0) e.stock = "Stock must be 0 or greater";
    } else {
      const stock = parseInt(form.stock, 10);
      if (form.stock === "" || isNaN(stock) || stock < 0) e.stock = "Stock must be 0 or greater";
    }
    if (!form.category_id) e.category_id = "Category is required";
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) return;
    setSaving(true);
    try {
      const sizeStock = buildSizeStock(form.sizes, form.size_stock);
      const common = {
        name: form.name.trim(),
        sku: form.sku.trim(),
        price: parseFloat(form.price),
        stock: sizeInventoryEnabled ? computedStock : parseInt(form.stock, 10),
        status: form.status,
        sizes: form.sizes,
        size_stock: sizeStock,
      };
      if (isEdit && product) {
        await updateProduct(product.id, {
          ...common,
          description: form.description.trim() || undefined,
        });
      } else {
        await createProduct({
          ...common,
          slug: slugify(form.name.trim()),
          category_id: form.category_id,
          description: form.description.trim() || undefined,
        });
      }
      onSaved();
      onClose();
    } catch (err) {
      setErrors({ name: err instanceof Error ? err.message : "Failed to save product" });
    } finally {
      setSaving(false);
    }
  }

  function set<K extends keyof FormData>(key: K, value: FormData[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function toggleSize(size: string) {
    setForm((prev) => {
      const sizes = prev.sizes.includes(size)
        ? prev.sizes.filter((s) => s !== size)
        : [...prev.sizes, size];
      return { ...prev, sizes };
    });
  }

  function setSizeStock(size: string, value: number) {
    setForm((prev) => ({
      ...prev,
      size_stock: { ...prev.size_stock, [size]: value },
    }));
  }

  const showSizes = form.sizes.length > 0;

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
    >
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit Product" : "Create Product"}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? "Update the product details below."
              : "Fill in the details to add a new product."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-5 max-h-[70vh] overflow-y-auto pr-1">
          <div className="space-y-2">
            <Label htmlFor="name">Name *</Label>
            <Input id="name" value={form.name} onChange={(e) => set("name", e.target.value)} />
            {errors.name && <p className="text-xs text-red">{errors.name}</p>}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="sku">SKU *</Label>
              <Input id="sku" value={form.sku} onChange={(e) => set("sku", e.target.value)} />
              {errors.sku && <p className="text-xs text-red">{errors.sku}</p>}
            </div>

            <div className="space-y-2">
              <Label htmlFor="status">Status</Label>
              <select
                id="status"
                value={form.status}
                onChange={(e) => set("status", e.target.value)}
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
              >
                <option value="active">Active</option>
                <option value="draft">Draft</option>
                <option value="archived">Archived</option>
                <option value="out_of_stock">Out of Stock</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="price">Price *</Label>
              <Input
                id="price"
                type="number"
                step="0.01"
                min="0"
                value={form.price}
                onChange={(e) => set("price", e.target.value)}
              />
              {errors.price && <p className="text-xs text-red">{errors.price}</p>}
            </div>

            <div className="space-y-2">
              <Label htmlFor="stock">
                Stock *
                {sizeInventoryEnabled && (
                  <span className="text-xs text-muted-foreground ml-2">(auto-calculated)</span>
                )}
              </Label>
              <Input
                id="stock"
                type="number"
                min="0"
                value={sizeInventoryEnabled ? String(computedStock) : form.stock}
                onChange={(e) => set("stock", e.target.value)}
                disabled={sizeInventoryEnabled}
                className={sizeInventoryEnabled ? "opacity-60" : ""}
              />
              {errors.stock && <p className="text-xs text-red">{errors.stock}</p>}
            </div>
          </div>

          {/* ─── Sizes ─── */}
          <div className="space-y-3">
            <Label className="text-sm">Sizes</Label>
            <div className="flex flex-wrap gap-2">
              {SIZE_OPTIONS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => toggleSize(s)}
                  className={`min-w-9 h-9 px-2 text-xs border transition-all duration-300 ${
                    form.sizes.includes(s)
                      ? "border-foreground bg-foreground text-background"
                      : "border-border hover:border-foreground"
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>

          {showSizes && (
            <div className="space-y-2 border border-border/60 p-3">
              <Label className="text-xs tracking-[0.2em] uppercase">Per-Size Stock</Label>
              <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                {form.sizes.map((size) => (
                  <div key={size} className="space-y-1">
                    <Label className="text-xs text-center block">{size}</Label>
                    <Input
                      type="number"
                      min="0"
                      value={form.size_stock[size] ?? 0}
                      onChange={(e) =>
                        setSizeStock(size, Math.max(0, parseInt(e.target.value) || 0))
                      }
                      className="h-8 text-center text-sm"
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="category">Category *</Label>
            <select
              id="category"
              value={form.category_id}
              onChange={(e) => set("category_id", e.target.value)}
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
            >
              <option value="">Select a category</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            {errors.category_id && <p className="text-xs text-red">{errors.category_id}</p>}
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <textarea
              id="description"
              rows={3}
              value={form.description}
              onChange={(e) => set("description", e.target.value)}
              className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm resize-none"
            />
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? "Saving…" : isEdit ? "Save Changes" : "Create Product"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
