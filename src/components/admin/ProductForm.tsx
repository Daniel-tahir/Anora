import { useState, useEffect, useRef, useMemo } from "react";
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
import {
  createProduct,
  updateProduct,
  getAdminProduct,
  getAllActiveCategories,
  uploadProductImage,
  deleteProductImage,
  reorderProductImages,
  slugify,
  type AdminProductResponse,
  type AdminProductFull,
  type AdminProductImage,
} from "@/lib/admin-products";
import { supabase } from "@/lib/supabase";
import {
  SIZE_OPTIONS,
  buildSizeStock,
  calculateProductStock,
  isSizeInventoryEnabled,
} from "@/lib/inventory-admin";
const STATUS_OPTIONS = ["active", "draft", "archived", "out_of_stock"];

interface CategoryOption {
  id: string;
  name: string;
  parent_id: string | null;
}

interface ColorEntry {
  name: string;
  hex: string;
}

interface FormData {
  name: string;
  slug: string;
  sku: string;
  description: string;
  short_description: string;
  price: string;
  compare_price: string;
  stock: string;
  low_stock_threshold: string;
  status: string;
  category_id: string;
  subcategory_id: string;
  sizes: string[];
  colors: ColorEntry[];
  fabric: string;
  material: string;
  is_new: boolean;
  is_best_seller: boolean;
  featured: boolean;
  size_stock: Record<string, number>;
}

interface FormErrors {
  [key: string]: string | undefined;
}

interface Props {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  productId?: string | null;
}

export function ProductForm({ open, onClose, onSaved, productId }: Props) {
  const isEdit = !!productId;
  const [saving, setSaving] = useState(false);
  const [loadingData, setLoadingData] = useState(false);
  const [allCategories, setAllCategories] = useState<CategoryOption[]>([]);
  const [images, setImages] = useState<AdminProductImage[]>([]);
  const [uploading, setUploading] = useState(false);
  const [colorName, setColorName] = useState("");
  const [colorHex, setColorHex] = useState("#000000");
  const fileRef = useRef<HTMLInputElement>(null);

  const [form, setForm] = useState<FormData>({
    name: "",
    slug: "",
    sku: "",
    description: "",
    short_description: "",
    price: "",
    compare_price: "",
    stock: "",
    low_stock_threshold: "5",
    status: "draft",
    category_id: "",
    subcategory_id: "",
    sizes: [],
    colors: [],
    fabric: "",
    material: "",
    is_new: false,
    is_best_seller: false,
    featured: false,
  });
  const [errors, setErrors] = useState<FormErrors>({});

  const parentCategories = allCategories.filter((c) => !c.parent_id);
  const subCategories = allCategories.filter((c) => c.parent_id === form.category_id);

  useEffect(() => {
    getAllActiveCategories()
      .then(setAllCategories)
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (open && productId) {
      setLoadingData(true);
      getAdminProduct(productId)
        .then((data: AdminProductResponse) => {
          const p = data.product;
          setForm({
            name: p.name,
            slug: p.slug,
            sku: p.sku ?? "",
            description: p.description ?? "",
            short_description: p.short_description ?? "",
            price: String(p.price),
            compare_price: p.compare_price ? String(p.compare_price) : "",
            stock: String(p.stock),
            low_stock_threshold: String(p.low_stock_threshold),
            status: p.status,
            category_id: p.category_id,
            subcategory_id: p.category_id,
            sizes: p.sizes ?? [],
            colors: (p.colors ?? []) as ColorEntry[],
            fabric: p.fabric ?? "",
            material: p.material ?? "",
            is_new: p.is_new,
            is_best_seller: p.is_best_seller,
            featured: p.featured,
            size_stock: (p.size_stock ?? {}) as Record<string, number>,
          });
          setImages(data.images ?? []);
          setLoadingData(false);
        })
        .catch(() => setLoadingData(false));
    } else if (open) {
      setForm({
        name: "",
        slug: "",
        sku: "",
        description: "",
        short_description: "",
        price: "",
        compare_price: "",
        stock: "",
        low_stock_threshold: "5",
        status: "draft",
        category_id: "",
        subcategory_id: "",
        sizes: [],
        colors: [],
        fabric: "",
        material: "",
        is_new: false,
        is_best_seller: false,
        featured: false,
        size_stock: {},
      });
      setImages([]);
      setErrors({});
    }
  }, [open, productId]);

  function handleNameChange(name: string) {
    setForm((prev) => ({
      ...prev,
      name,
      slug: isEdit ? prev.slug : slugify(name),
    }));
  }

  function set<K extends keyof FormData>(key: K, value: FormData[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function toggleSize(size: string) {
    setForm((prev) => ({
      ...prev,
      sizes: prev.sizes.includes(size)
        ? prev.sizes.filter((s) => s !== size)
        : [...prev.sizes, size],
    }));
  }

  function addColor() {
    if (!colorName.trim()) return;
    setForm((prev) => ({
      ...prev,
      colors: [...prev.colors, { name: colorName.trim(), hex: colorHex }],
    }));
    setColorName("");
    setColorHex("#000000");
  }

  function removeColor(index: number) {
    setForm((prev) => ({
      ...prev,
      colors: prev.colors.filter((_, i) => i !== index),
    }));
  }

  const computedStock = useMemo(() => calculateProductStock(form.size_stock), [form.size_stock]);

  const sizeInventoryEnabled = useMemo(
    () => isSizeInventoryEnabled(form.size_stock),
    [form.size_stock],
  );

  function setSizeStock(size: string, value: number) {
    setForm((prev) => ({
      ...prev,
      size_stock: { ...prev.size_stock, [size]: value },
    }));
  }

  async function handleImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !productId) return;
    setUploading(true);
    try {
      const result = await uploadProductImage(productId, file);
      setImages((prev) => [
        ...prev,
        { id: result.id, image_url: result.image_url, alt_text: null, sort_order: prev.length },
      ]);
    } catch (err) {
      setErrors({ images: err instanceof Error ? err.message : "Upload failed" });
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function handleDeleteImage(imageId: string) {
    try {
      await deleteProductImage(imageId);
      setImages((prev) => prev.filter((img) => img.id !== imageId));
    } catch {
      /* ignore */
    }
  }

  async function handleMoveImage(index: number, direction: -1 | 1) {
    const newImages = [...images];
    const target = index + direction;
    if (target < 0 || target >= newImages.length) return;
    [newImages[index], newImages[target]] = [newImages[target], newImages[index]];
    const reordered = newImages.map((img, i) => ({ ...img, sort_order: i }));
    setImages(reordered);
    try {
      await reorderProductImages(
        reordered.map((img) => ({ id: img.id, sort_order: img.sort_order })),
      );
    } catch {
      /* ignore */
    }
  }

  function validate(): boolean {
    const e: FormErrors = {};
    if (!form.name.trim()) e.name = "Name is required";
    if (!form.slug.trim()) e.slug = "Slug is required";
    if (!form.sku.trim()) e.sku = "SKU is required";
    const price = parseFloat(form.price);
    if (!form.price || isNaN(price) || price <= 0) e.price = "Price must be greater than 0";
    if (sizeInventoryEnabled) {
      if (computedStock < 0) e.stock = "Stock must be 0 or greater";
    } else {
      const stock = parseInt(form.stock, 10);
      if (form.stock === "" || isNaN(stock) || stock < 0) e.stock = "Stock must be 0 or greater";
    }
    const threshold = parseInt(form.low_stock_threshold, 10);
    if (form.low_stock_threshold === "" || isNaN(threshold) || threshold < 0)
      e.low_stock_threshold = "Must be 0 or greater";
    if (!form.category_id) e.category_id = "Parent category is required";
    if (!form.subcategory_id) e.subcategory_id = "Subcategory is required";
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) return;
    setSaving(true);
    try {
      const sizeStock = buildSizeStock(form.sizes, form.size_stock);
      const productData = {
        name: form.name.trim(),
        slug: form.slug.trim(),
        sku: form.sku.trim(),
        description: form.description.trim() || undefined,
        short_description: form.short_description.trim() || undefined,
        price: parseFloat(form.price),
        compare_price: form.compare_price ? parseFloat(form.compare_price) : undefined,
        stock: sizeInventoryEnabled ? computedStock : parseInt(form.stock, 10),
        low_stock_threshold: parseInt(form.low_stock_threshold, 10),
        sizes: form.sizes,
        size_stock: sizeStock,
        colors: form.colors,
        fabric: form.fabric.trim() || undefined,
        material: form.material.trim() || undefined,
        is_new: form.is_new,
        is_best_seller: form.is_best_seller,
        featured: form.featured,
        category_id: form.subcategory_id,
        status: form.status,
      };

      if (isEdit && productId) {
        await updateProduct(productId, productData as any);
      } else {
        await createProduct(productData as any);
      }
      onSaved();
      onClose();
    } catch (err) {
      setErrors({ submit: err instanceof Error ? err.message : "Failed to save product" });
    } finally {
      setSaving(false);
    }
  }

  const canUpload = isEdit;

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
    >
      <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit Product" : "Create Product"}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? "Update product details, images, sizes, colors, and inventory."
              : "Fill in the details to add a new product."}
          </DialogDescription>
        </DialogHeader>

        {loadingData ? (
          <div className="py-12 text-center text-sm text-muted-foreground">
            Loading product data...
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-8">
            {/* ─── Basic Information ─── */}
            <fieldset className="space-y-4 border border-border/60 p-4">
              <legend className="text-xs tracking-[0.2em] uppercase px-2 font-medium">
                Basic Information
              </legend>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Product Name *</Label>
                  <Input
                    id="name"
                    value={form.name}
                    onChange={(e) => handleNameChange(e.target.value)}
                  />
                  {errors.name && <p className="text-xs text-red">{errors.name}</p>}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="slug">Slug</Label>
                  <Input
                    id="slug"
                    value={form.slug}
                    onChange={(e) => set("slug", e.target.value)}
                  />
                  {errors.slug && <p className="text-xs text-red">{errors.slug}</p>}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="sku">SKU *</Label>
                  <Input id="sku" value={form.sku} onChange={(e) => set("sku", e.target.value)} />
                  {errors.sku && <p className="text-xs text-red">{errors.sku}</p>}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="status">Stock Status</Label>
                  <select
                    id="status"
                    value={form.status}
                    onChange={(e) => set("status", e.target.value)}
                    className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
                  >
                    {STATUS_OPTIONS.map((s) => (
                      <option key={s} value={s}>
                        {s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}
                      </option>
                    ))}
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
                  <Label htmlFor="compare_price">Compare At Price</Label>
                  <Input
                    id="compare_price"
                    type="number"
                    step="0.01"
                    min="0"
                    value={form.compare_price}
                    onChange={(e) => set("compare_price", e.target.value)}
                  />
                </div>
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

              <div className="space-y-2">
                <Label htmlFor="short_description">Short Description</Label>
                <textarea
                  id="short_description"
                  rows={2}
                  value={form.short_description}
                  onChange={(e) => set("short_description", e.target.value)}
                  className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm resize-none"
                />
              </div>
            </fieldset>

            {/* ─── Category Assignment ─── */}
            <fieldset className="space-y-4 border border-border/60 p-4">
              <legend className="text-xs tracking-[0.2em] uppercase px-2 font-medium">
                Category
              </legend>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="category_id">Parent Category *</Label>
                  <select
                    id="category_id"
                    value={form.category_id}
                    onChange={(e) => {
                      set("category_id", e.target.value);
                      set("subcategory_id", "");
                    }}
                    className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
                  >
                    <option value="">Select parent</option>
                    {parentCategories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                  {errors.category_id && <p className="text-xs text-red">{errors.category_id}</p>}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="subcategory_id">Subcategory *</Label>
                  <select
                    id="subcategory_id"
                    value={form.subcategory_id}
                    onChange={(e) => set("subcategory_id", e.target.value)}
                    className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
                    disabled={!form.category_id}
                  >
                    <option value="">Select subcategory</option>
                    {subCategories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                  {errors.subcategory_id && (
                    <p className="text-xs text-red">{errors.subcategory_id}</p>
                  )}
                </div>
              </div>
            </fieldset>

            {/* ─── Sizes ─── */}
            <fieldset className="space-y-3 border border-border/60 p-4">
              <legend className="text-xs tracking-[0.2em] uppercase px-2 font-medium">
                Available Sizes
              </legend>
              <div className="flex flex-wrap gap-2">
                {SIZE_OPTIONS.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => toggleSize(s)}
                    className={`min-w-10 h-10 px-3 text-sm border transition-all duration-300 ${
                      form.sizes.includes(s)
                        ? "border-foreground bg-foreground text-background"
                        : "border-border hover:border-foreground"
                    }`}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </fieldset>

            {/* ─── Colors ─── */}
            <fieldset className="space-y-3 border border-border/60 p-4">
              <legend className="text-xs tracking-[0.2em] uppercase px-2 font-medium">
                Colors
              </legend>

              {form.colors.length > 0 && (
                <div className="flex flex-wrap gap-3 mb-3">
                  {form.colors.map((c, i) => (
                    <div
                      key={i}
                      className="flex items-center gap-2 border border-border/60 px-3 py-1.5"
                    >
                      <span
                        className="w-5 h-5 rounded-full border"
                        style={{ backgroundColor: c.hex }}
                      />
                      <span className="text-sm">{c.name}</span>
                      <button
                        type="button"
                        onClick={() => removeColor(i)}
                        className="text-xs text-muted-foreground hover:text-red ml-1"
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <div className="flex items-end gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Color Name</Label>
                  <Input
                    value={colorName}
                    onChange={(e) => setColorName(e.target.value)}
                    placeholder="e.g. Black"
                    className="h-8 text-sm"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Hex</Label>
                  <div className="flex items-center gap-1">
                    <input
                      type="color"
                      value={colorHex}
                      onChange={(e) => setColorHex(e.target.value)}
                      className="h-8 w-8 border border-border p-0.5 cursor-pointer"
                    />
                    <Input
                      value={colorHex}
                      onChange={(e) => setColorHex(e.target.value)}
                      className="h-8 w-24 text-xs font-mono"
                    />
                  </div>
                </div>
                <Button type="button" variant="outline" size="sm" onClick={addColor}>
                  Add
                </Button>
              </div>
            </fieldset>

            {/* ─── Images ─── */}
            <fieldset className="space-y-3 border border-border/60 p-4">
              <legend className="text-xs tracking-[0.2em] uppercase px-2 font-medium">
                Images
              </legend>

              {!canUpload ? (
                <p className="text-sm text-muted-foreground">
                  Save the product first to enable image upload.
                </p>
              ) : (
                <>
                  <div className="flex flex-wrap gap-3">
                    {images.map((img, i) => (
                      <div
                        key={img.id}
                        className="relative w-28 aspect-[3/4] bg-neutral border group"
                      >
                        <img
                          src={img.image_url}
                          alt={img.alt_text ?? ""}
                          className="h-full w-full object-cover"
                        />
                        <div className="absolute inset-0 bg-ink/0 group-hover:bg-ink/40 transition-colors flex items-center justify-center gap-1 opacity-0 group-hover:opacity-100">
                          <button
                            type="button"
                            onClick={() => handleMoveImage(i, -1)}
                            disabled={i === 0}
                            className="h-6 w-6 bg-background/80 grid place-items-center text-xs disabled:opacity-30"
                          >
                            ‹
                          </button>
                          <button
                            type="button"
                            onClick={() => handleMoveImage(i, 1)}
                            disabled={i === images.length - 1}
                            className="h-6 w-6 bg-background/80 grid place-items-center text-xs disabled:opacity-30"
                          >
                            ›
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteImage(img.id)}
                            className="h-6 w-6 bg-red/80 text-white grid place-items-center text-xs"
                          >
                            ✕
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="flex items-center gap-3">
                    <input
                      ref={fileRef}
                      type="file"
                      accept="image/*"
                      onChange={handleImageUpload}
                      className="hidden"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => fileRef.current?.click()}
                      disabled={uploading}
                    >
                      {uploading ? "Uploading..." : "Upload Image"}
                    </Button>
                    {uploading && (
                      <span className="text-xs text-muted-foreground">Uploading...</span>
                    )}
                  </div>
                  {errors.images && <p className="text-xs text-red">{errors.images}</p>}
                </>
              )}
            </fieldset>

            {/* ─── Inventory ─── */}
            <fieldset className="space-y-4 border border-border/60 p-4">
              <legend className="text-xs tracking-[0.2em] uppercase px-2 font-medium">
                Inventory
              </legend>

              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="stock">
                    Quantity *
                    {sizeInventoryEnabled && (
                      <span className="text-xs text-muted-foreground ml-2">
                        (auto-calculated from sizes)
                      </span>
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
                <div className="space-y-2">
                  <Label htmlFor="low_stock_threshold">Low Stock Threshold</Label>
                  <Input
                    id="low_stock_threshold"
                    type="number"
                    min="0"
                    value={form.low_stock_threshold}
                    onChange={(e) => set("low_stock_threshold", e.target.value)}
                  />
                  {errors.low_stock_threshold && (
                    <p className="text-xs text-red">{errors.low_stock_threshold}</p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="fabric">Fabric / Material</Label>
                  <Input
                    id="fabric"
                    value={form.fabric}
                    onChange={(e) => set("fabric", e.target.value)}
                  />
                </div>
              </div>

              {form.sizes.length > 0 && (
                <div className="border-t border-border/40 pt-4">
                  <p className="text-xs tracking-[0.2em] uppercase font-medium mb-3">
                    Per-Size Stock
                  </p>
                  <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
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
                <Label htmlFor="material">Material (for jewellery)</Label>
                <Input
                  id="material"
                  value={form.material}
                  onChange={(e) => set("material", e.target.value)}
                />
              </div>
            </fieldset>

            {/* ─── Labels ─── */}
            <fieldset className="space-y-3 border border-border/60 p-4">
              <legend className="text-xs tracking-[0.2em] uppercase px-2 font-medium">
                Labels
              </legend>
              <div className="flex flex-wrap gap-6">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.is_new}
                    onChange={(e) => set("is_new", e.target.checked)}
                    className="h-4 w-4 rounded border-border accent-foreground"
                  />
                  <span className="text-sm">New Arrival</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.is_best_seller}
                    onChange={(e) => set("is_best_seller", e.target.checked)}
                    className="h-4 w-4 rounded border-border accent-foreground"
                  />
                  <span className="text-sm">Best Seller</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.featured}
                    onChange={(e) => set("featured", e.target.checked)}
                    className="h-4 w-4 rounded border-border accent-foreground"
                  />
                  <span className="text-sm">Featured Product</span>
                </label>
              </div>
            </fieldset>

            {errors.submit && <p className="text-xs text-red text-center">{errors.submit}</p>}

            <div className="flex justify-end gap-3 pt-2 border-t border-border/60">
              <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
                Cancel
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? "Saving…" : isEdit ? "Save Changes" : "Create Product"}
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
