import { useState, useEffect, useRef, useMemo } from "react";
import { toast } from "sonner";
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
import { Switch } from "@/components/ui/switch";
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
  sale_active: boolean;
  discount_percent: string;
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

export interface VariantFormImage {
  id: string;
  image_url?: string;
  previewUrl?: string;
  file?: File;
  alt_text?: string | null;
  sort_order?: number;
}

function isLocalVariantImage(img: unknown): img is { id: string; file: File; previewUrl: string } {
  return (
    typeof img === "object" &&
    img !== null &&
    "file" in img &&
    "previewUrl" in img &&
    typeof (img as any).previewUrl === "string"
  );
}

function getVariantImageUrl(img: unknown): string {
  if (!img) return "";
  if (typeof img === "string") return img;
  if (typeof img === "object" && img !== null) {
    if ("previewUrl" in img && typeof (img as any).previewUrl === "string") {
      return (img as any).previewUrl;
    }
    if ("image_url" in img && typeof (img as any).image_url === "string") {
      return (img as any).image_url;
    }
  }
  return "";
}

export function ProductForm({ open, onClose, onSaved, productId }: Props) {
  const isEdit = !!productId;
  const [saving, setSaving] = useState(false);
  const [loadingData, setLoadingData] = useState(false);
  const [allCategories, setAllCategories] = useState<CategoryOption[]>([]);
  const [images, setImages] = useState<AdminProductImage[]>([]);
  const [localImages, setLocalImages] = useState<{ id: string; file: File; previewUrl: string }[]>([]);
  const [uploadProgressText, setUploadProgressText] = useState("");
  const [dragActive, setDragActive] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [colorName, setColorName] = useState("");
  const [colorHex, setColorHex] = useState("#000000");
  const [enableColors, setEnableColors] = useState(true);
  const [sizeInventoryEnabled, setSizeInventoryEnabled] = useState(true);
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
    size_stock: {},
    sale_active: false,
    discount_percent: "10",
  });
  const [variants, setVariants] = useState<{
    id?: string;
    name: string;
    color_hex: string;
    sku: string;
    price: string;
    compare_price: string;
    stock: string;
    sizes: string[];
    size_stock: Record<string, number>;
    images: VariantFormImage[];
    is_active: boolean;
    sort_order: number;
  }[]>([]);
  const [newlyCreatedVariantIds, setNewlyCreatedVariantIds] = useState<string[]>([]);

  async function addVariant() {
    let newId: string | undefined = undefined;
    if (isEdit && productId) {
      try {
        const variantData = {
          product_id: productId,
          name: "New Color",
          color_hex: "#FFFFFF",
          sku: form.sku ? `${form.sku}-${variants.length + 1}` : `SKU-${Date.now()}`,
          price: form.price ? parseFloat(form.price) : null,
          compare_price: form.compare_price ? parseFloat(form.compare_price) : null,
          stock: 0,
          sizes: form.sizes,
          size_stock: form.sizes.reduce((acc, s) => ({ ...acc, [s]: 0 }), {}),
          is_active: true,
          sort_order: variants.length,
        };
        const { data, error } = await supabase
          .from("product_variants")
          .insert(variantData)
          .select("id")
          .single();
        if (error) throw error;
        if (data) {
          newId = data.id;
          setNewlyCreatedVariantIds((prev) => [...prev, data.id]);
        }
      } catch (err: any) {
        toast.error(`Failed to add variant to database: ${err.message}`);
        return;
      }
    }

    setVariants((prev) => [
      ...prev,
      {
        id: newId,
        name: "New Color",
        color_hex: "#FFFFFF",
        sku: form.sku ? `${form.sku}-${prev.length + 1}` : `SKU-${Date.now()}`,
        price: form.price,
        compare_price: form.compare_price,
        stock: "0",
        sizes: form.sizes,
        size_stock: form.sizes.reduce((acc, s) => ({ ...acc, [s]: 0 }), {}),
        images: [],
        is_active: true,
        sort_order: prev.length,
      },
    ]);
  }

  async function removeVariant(index: number) {
    const v = variants[index];
    if (v.id) {
      try {
        const { error } = await supabase.from("product_variants").delete().eq("id", v.id);
        if (error) throw error;
      } catch (err: any) {
        toast.error(`Failed to remove variant from database: ${err.message}`);
        return;
      }
    }
    setVariants((prev) => {
      const next = prev.filter((_, i) => i !== index);
      syncVariantColors(next);
      return next;
    });
  }

  function updateVariant(index: number, key: string, value: any) {
    setVariants((prev) =>
      prev.map((v, i) => (i === index ? { ...v, [key]: value } : v)),
    );
  }

  async function handleVariantFilesAdded(idx: number, selectedFiles: File[]) {
    const v = variants[idx];
    if (isEdit && v.id) {
      setUploading(true);
      try {
        for (const file of selectedFiles) {
          const result = await uploadProductImage(productId!, file, v.id);
          const newImg: VariantFormImage = {
            id: result.id,
            image_url: result.image_url,
            alt_text: null,
            sort_order: v.images.length,
          };
          setVariants((prev) =>
            prev.map((item, i) => (i === idx ? { ...item, images: [...item.images, newImg] } : item)),
          );
        }
      } catch (err: any) {
        toast.error(`Variant image upload failed: ${err.message}`);
      } finally {
        setUploading(false);
      }
    } else {
      const nextImages = [...v.images];
      for (const file of selectedFiles) {
        nextImages.push({
          id: crypto.randomUUID(),
          file,
          previewUrl: URL.createObjectURL(file),
          sort_order: nextImages.length,
        });
      }
      updateVariant(idx, "images", nextImages);
    }
  }

  async function handleVariantDeleteImage(idx: number, imgId: string) {
    const v = variants[idx];
    const isLocal = v.images.some((img) => isLocalVariantImage(img) && img.id === imgId);
    if (!isLocal) {
      try {
        await deleteProductImage(imgId);
      } catch (err: any) {
        toast.error(`Failed to delete variant image: ${err.message}`);
        return;
      }
    } else {
      const localImg = v.images.find((img) => img.id === imgId);
      if (localImg && isLocalVariantImage(localImg) && localImg.previewUrl) {
        URL.revokeObjectURL(localImg.previewUrl);
      }
    }
    updateVariant(idx, "images", v.images.filter((img) => img.id !== imgId));
  }

  async function handleVariantSetPrimaryImage(idx: number, imgIdx: number) {
    if (imgIdx === 0) return;
    const v = variants[idx];
    const newImages = [...v.images];
    const [primary] = newImages.splice(imgIdx, 1);
    newImages.unshift(primary);
    const reordered = newImages.map((img, i) => ({ ...img, sort_order: i }));
    updateVariant(idx, "images", reordered);
    if (v.id) {
      try {
        await reorderProductImages(
          reordered.map((img) => ({ id: img.id, sort_order: img.sort_order })),
        );
      } catch {
        toast.error("Failed to update main image sorting");
      }
    }
  }

  async function handleVariantMoveImage(idx: number, imgIdx: number, direction: -1 | 1) {
    const v = variants[idx];
    const newImages = [...v.images];
    const target = imgIdx + direction;
    if (target < 0 || target >= newImages.length) return;
    [newImages[imgIdx], newImages[target]] = [newImages[target], newImages[imgIdx]];
    const reordered = newImages.map((img, i) => ({ ...img, sort_order: i }));
    updateVariant(idx, "images", reordered);
    if (v.id) {
      try {
        await reorderProductImages(
          reordered.map((img) => ({ id: img.id, sort_order: img.sort_order })),
        );
      } catch {
        toast.error("Failed to update image sorting");
      }
    }
  }

  const [errors, setErrors] = useState<FormErrors>({});

  const localImagesRef = useRef(localImages);
  useEffect(() => {
    localImagesRef.current = localImages;
  }, [localImages]);

  // Cleanup local URLs on component unmount
  useEffect(() => {
    return () => {
      localImagesRef.current.forEach((img) => URL.revokeObjectURL(img.previewUrl));
    };
  }, []);

  // Cleanup when dialog closes
  useEffect(() => {
    if (!open) {
      localImagesRef.current.forEach((img) => URL.revokeObjectURL(img.previewUrl));
      setLocalImages([]);
      setUploadProgressText("");
    }
  }, [open]);

  // Synchronize top Colors section with active variants
  const prevVariantColorNamesRef = useRef<Set<string>>(new Set());

  function syncVariantColors(variantsList: typeof variants = variants) {
    if (variantsList.length === 0) {
      const staleNames = prevVariantColorNamesRef.current;
      if (staleNames.size > 0) {
        setForm((prev) => ({
          ...prev,
          colors: prev.colors.filter((c) => !staleNames.has(c.name.trim().toLowerCase())),
        }));
      }
      prevVariantColorNamesRef.current = new Set();
      return;
    }

    const variantColors = variantsList.map((v) => ({
      name: v.name.trim(),
      hex: v.color_hex.trim(),
    }));
    const variantColorNames = new Set(variantColors.map((vc) => vc.name.toLowerCase()));
    const staleNames = prevVariantColorNamesRef.current;

    setForm((prev) => {
      // Drop colors that were variant-linked before but no longer match any current variant (removed/renamed)
      const filtered = prev.colors.filter((c) => {
        const lower = c.name.trim().toLowerCase();
        if (staleNames.has(lower) && !variantColorNames.has(lower)) return false;
        return true;
      });

      // Combine remaining colors and variant colors, avoiding duplicates by name
      const combinedColors: ColorEntry[] = [...filtered];
      const addedNames = new Set(combinedColors.map((c) => c.name.toLowerCase()));

      for (const vc of variantColors) {
        if (!addedNames.has(vc.name.toLowerCase())) {
          combinedColors.push(vc);
          addedNames.add(vc.name.toLowerCase());
        } else {
          // If the name exists but the hex is different, update the hex to match the variant
          const index = combinedColors.findIndex((c) => c.name.toLowerCase() === vc.name.toLowerCase());
          if (index !== -1) {
            combinedColors[index].hex = vc.hex;
          }
        }
      }

      // Check if colors actually changed to avoid infinite loop
      const equal =
        combinedColors.length === prev.colors.length &&
        combinedColors.every(
          (c, idx) => c.name === prev.colors[idx].name && c.hex === prev.colors[idx].hex
        );

      if (equal) return prev;

      return {
        ...prev,
        colors: combinedColors,
      };
    });

    prevVariantColorNamesRef.current = variantColorNames;
  }

  // Keep category_id and subcategory_id in sync with the category hierarchy
  useEffect(() => {
    if (allCategories.length > 0 && form.subcategory_id) {
      const currentSubId = form.subcategory_id;
      const subCat = allCategories.find((c) => c.id === currentSubId);
      if (subCat) {
        const expectedParentId = subCat.parent_id || currentSubId;
        if (form.category_id !== expectedParentId) {
          setForm((prev) => ({
            ...prev,
            category_id: expectedParentId,
          }));
        }
      }
    }
  }, [allCategories, form.subcategory_id, form.category_id]);

  const hierarchicalCategories = useMemo(() => {
    if (allCategories.length === 0) return [];

    const map = new Map<string, CategoryOption>();
    allCategories.forEach((cat) => map.set(cat.id, cat));

    const childrenMap = new Map<string, CategoryOption[]>();
    allCategories.forEach((cat) => {
      if (cat.parent_id) {
        if (!childrenMap.has(cat.parent_id)) {
          childrenMap.set(cat.parent_id, []);
        }
        childrenMap.get(cat.parent_id)!.push(cat);
      }
    });

    const roots = allCategories.filter(
      (cat) => !cat.parent_id || !map.has(cat.parent_id)
    );

    roots.sort((a, b) => a.name.localeCompare(b.name));

    interface HierarchicalCategory {
      id: string;
      name: string;
      parent_id: string | null;
      depth: number;
    }

    const result: HierarchicalCategory[] = [];

    function traverse(cat: CategoryOption, depth: number) {
      result.push({
        id: cat.id,
        name: cat.name,
        parent_id: cat.parent_id,
        depth,
      });

      const children = childrenMap.get(cat.id) || [];
      children.sort((a, b) => a.name.localeCompare(b.name));
      children.forEach((child) => traverse(child, depth + 1));
    }

    roots.forEach((root) => traverse(root, 0));
    return result;
  }, [allCategories]);

  useEffect(() => {
    getAllActiveCategories()
      .then(setAllCategories)
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (open && productId) {
      setNewlyCreatedVariantIds([]);
      setLoadingData(true);
      getAdminProduct(productId)
        .then(async (data: AdminProductResponse) => {
          const p = data.product;
          setForm({
            name: p.name,
            slug: p.slug,
            sku: p.sku ?? "",
            description: p.description ?? "",
            short_description: p.short_description ?? "",
            price: (p.sale_active && p.compare_price && Number(p.compare_price) > Number(p.price)) ? String(p.compare_price) : String(p.price),
            compare_price: (p.sale_active && p.compare_price && Number(p.compare_price) > Number(p.price)) ? "" : (p.compare_price ? String(p.compare_price) : ""),
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
            sale_active: p.sale_active ?? false,
            discount_percent: p.discount_percent ? String(p.discount_percent) : "10",
          });
          setImages(data.images ?? []);
          const colorsExist = !!(p.colors && p.colors.length > 0);
          const sizesExist = !!(p.sizes && p.sizes.length > 0);
          setSizeInventoryEnabled(sizesExist);

          try {
            const { data: vRows } = await supabase
              .from("product_variants")
              .select("*")
              .eq("product_id", productId)
              .order("sort_order", { ascending: true });

            const { data: imgRows } = await supabase
              .from("product_images")
              .select("id, image_url, alt_text, variant_id, sort_order")
              .eq("product_id", productId)
              .not("variant_id", "is", null);

            if (vRows) {
              const mapped = vRows.map((v, idx) => {
                const vImages: VariantFormImage[] = (imgRows ?? [])
                  .filter((img) => img.variant_id === v.id)
                  .sort((a, b) => a.sort_order - b.sort_order)
                  .map((img) => ({
                    id: img.id,
                    image_url: img.image_url,
                    alt_text: img.alt_text || null,
                    sort_order: img.sort_order,
                  }));

                return {
                  id: v.id,
                  name: v.name,
                  color_hex: v.color_hex || "#FFFFFF",
                  sku: v.sku || "",
                  price: v.price ? String(v.price) : "",
                  compare_price: v.compare_price ? String(v.compare_price) : "",
                  stock: String(v.stock),
                  sizes: v.sizes || [],
                  size_stock: v.size_stock || {},
                  images: vImages,
                  is_active: v.is_active ?? true,
                  sort_order: v.sort_order ?? idx,
                };
              });
              setVariants(mapped);
              setEnableColors(colorsExist || mapped.length > 0);
            } else {
              setVariants([]);
              setEnableColors(colorsExist);
            }
          } catch (err) {
            console.error("Failed to load product variants", err);
            setEnableColors(colorsExist);
          }

          setLoadingData(false);
        })
        .catch(() => setLoadingData(false));
    } else if (open) {
      setNewlyCreatedVariantIds([]);
      setEnableColors(true);
      setSizeInventoryEnabled(true);
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
        sale_active: false,
        discount_percent: "10",
      });
      setImages([]);
      setVariants([]);
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
    setForm((prev) => {
      const nextSizes = prev.sizes.includes(size)
        ? prev.sizes.filter((s) => s !== size)
        : [...prev.sizes, size];

      const nextSizeStock = { ...prev.size_stock };
      Object.keys(nextSizeStock).forEach((k) => {
        if (!nextSizes.includes(k)) {
          delete nextSizeStock[k];
        }
      });
      nextSizes.forEach((sz) => {
        if (nextSizeStock[sz] === undefined) {
          nextSizeStock[sz] = 0;
        }
      });

      setVariants((vPrev) =>
        vPrev.map((v) => {
          const vSizeStock = { ...v.size_stock };
          Object.keys(vSizeStock).forEach((k) => {
            if (!nextSizes.includes(k)) {
              delete vSizeStock[k];
            }
          });
          nextSizes.forEach((sz) => {
            if (vSizeStock[sz] === undefined) {
              vSizeStock[sz] = 0;
            }
          });
          const nextStock = Object.values(vSizeStock).reduce((sum, val) => sum + val, 0);
          return {
            ...v,
            sizes: nextSizes,
            size_stock: vSizeStock,
            stock: String(nextStock),
          };
        })
      );

      return {
        ...prev,
        sizes: nextSizes,
        size_stock: nextSizeStock,
      };
    });
  }

  function addColor() {
    if (!colorName.trim()) return;
    const nameLower = colorName.trim().toLowerCase();
    const isDuplicate = form.colors.some((c) => c.name.trim().toLowerCase() === nameLower) ||
                        variants.some((v) => v.name.trim().toLowerCase() === nameLower);
    if (isDuplicate) {
      toast.error("Color name already exists");
      return;
    }
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

  const computedProductStock = useMemo(() => {
    if (variants.length > 0) {
      return variants.reduce((sum, v) => sum + (parseInt(v.stock, 10) || 0), 0);
    }
    return calculateProductStock(form.size_stock);
  }, [variants, form.size_stock]);

  const computedStock = computedProductStock;

  function setSizeStock(size: string, value: number) {
    setForm((prev) => ({
      ...prev,
      size_stock: { ...prev.size_stock, [size]: value },
    }));
  }

  // ─── Image Upload Handlers ──────────────────────────────────────────────────
  function handleFilesAdded(selectedFiles: File[]) {
    const supportedFormats = ["image/jpeg", "image/jpg", "image/png", "image/webp"];
    const invalidFiles = selectedFiles.filter(
      (f) => !supportedFormats.includes(f.type) && 
             !f.name.toLowerCase().endsWith(".jpg") &&
             !f.name.toLowerCase().endsWith(".jpeg") &&
             !f.name.toLowerCase().endsWith(".png") &&
             !f.name.toLowerCase().endsWith(".webp")
    );
    if (invalidFiles.length > 0) {
      setErrors((prev) => ({
        ...prev,
        images: "Only JPG, JPEG, PNG, and WEBP formats are supported."
      }));
      return;
    }

    setErrors((prev) => ({ ...prev, images: undefined }));

    if (isEdit) {
      if (!productId) return;
      setUploading(true);
      (async () => {
        try {
          for (const file of selectedFiles) {
            const result = await uploadProductImage(productId, file);
            setImages((prev) => [
              ...prev,
              { id: result.id, image_url: result.image_url, alt_text: null, sort_order: prev.length },
            ]);
          }
        } catch (err) {
          setErrors((prev) => ({
            ...prev,
            images: err instanceof Error ? err.message : "Upload failed",
          }));
        } finally {
          setUploading(false);
          if (fileRef.current) fileRef.current.value = "";
        }
      })();
    } else {
      setLocalImages((prev) => {
        const next = [...prev];
        for (const file of selectedFiles) {
          const isDuplicate = next.some(
            (img) => img.file.name === file.name && img.file.size === file.size
          );
          if (isDuplicate) continue;

          next.push({
            id: crypto.randomUUID(),
            file,
            previewUrl: URL.createObjectURL(file),
          });
        }
        return next;
      });
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  function handleDrag(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFilesAdded(Array.from(e.dataTransfer.files));
    }
  }

  // Database Image Handlers (Edit Mode)
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

  async function handleSetPrimaryImage(index: number) {
    if (index === 0) return;
    const newImages = [...images];
    const [primary] = newImages.splice(index, 1);
    newImages.unshift(primary);
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

  // Local Image Handlers (Create Mode)
  function handleDeleteLocalImage(id: string, previewUrl: string) {
    URL.revokeObjectURL(previewUrl);
    setLocalImages((prev) => prev.filter((img) => img.id !== id));
  }

  function handleMoveLocalImage(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= localImages.length) return;
    setLocalImages((prev) => {
      const next = [...prev];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  function handleSetPrimaryLocalImage(index: number) {
    if (index === 0) return;
    setLocalImages((prev) => {
      const next = [...prev];
      const [primary] = next.splice(index, 1);
      next.unshift(primary);
      return next;
    });
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
    setUploadProgressText("");
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
        sizes: sizeInventoryEnabled ? form.sizes : ["OS"],
        size_stock: sizeInventoryEnabled ? sizeStock : { "OS": parseInt(form.stock, 10) || 0 },
        colors: enableColors ? form.colors : [],
        fabric: form.fabric.trim() || undefined,
        material: form.material.trim() || undefined,
        is_new: form.is_new,
        is_best_seller: form.is_best_seller,
        featured: form.featured,
        category_id: form.subcategory_id,
        status: form.status,
        sale_active: form.sale_active,
        discount_percent: form.sale_active ? parseInt(form.discount_percent, 10) || 0 : 0,
      };

      let targetProductId = productId;
      if (isEdit && productId) {
        const { stock, size_stock, ...productUpdateData } = productData;
        await updateProduct(productId, productUpdateData as any);
      } else {
        const newProductId = await createProduct(productData as any);
        targetProductId = newProductId;
        if (localImages.length > 0) {
          const uploadedIds: string[] = [];
          for (let i = 0; i < localImages.length; i++) {
            const item = localImages[i];
            setUploadProgressText(`Uploading image ${i + 1} of ${localImages.length}...`);
            const uploadResult = await uploadProductImage(newProductId, item.file);
            uploadedIds.push(uploadResult.id);
          }
          setUploadProgressText("Finalizing image order...");
          const reordered = uploadedIds.map((id, index) => ({ id, sort_order: index }));
          await reorderProductImages(reordered);
        }
      }

      if (targetProductId) {
        if (isEdit) {
          const keepIds = enableColors ? (variants.map((v) => v.id).filter(Boolean) as string[]) : [];
          if (keepIds.length > 0) {
            await supabase
              .from("product_variants")
              .delete()
              .eq("product_id", targetProductId)
              .not("id", "in", keepIds);
          } else {
            await supabase
              .from("product_variants")
              .delete()
              .eq("product_id", targetProductId);
          }
        }

        if (enableColors) {
          for (const v of variants) {
            const variantData = {
              product_id: targetProductId,
              name: v.name,
              color_hex: v.color_hex,
              sku: v.sku,
              price: v.price ? parseFloat(v.price) : null,
              compare_price: v.compare_price ? parseFloat(v.compare_price) : null,
              stock: parseInt(v.stock, 10) || 0,
              sizes: sizeInventoryEnabled ? v.sizes : ["OS"],
              size_stock: sizeInventoryEnabled ? v.size_stock : { "OS": parseInt(v.stock, 10) || 0 },
              is_active: v.is_active,
              sort_order: v.sort_order,
            };

            let resolvedVariantId = v.id;
            if (v.id) {
              await supabase.from("product_variants").update(variantData).eq("id", v.id);
            } else {
              const { data: newV, error: insertError } = await supabase
                .from("product_variants")
                .insert(variantData)
                .select("id")
                .single();

              if (!insertError && newV) {
                resolvedVariantId = newV.id;
              }
            }

            if (resolvedVariantId) {
              const finalImageIds: string[] = [];
              for (let i = 0; i < v.images.length; i++) {
                const img = v.images[i];
                if (isLocalVariantImage(img)) {
                  setUploadProgressText(`Uploading variant image ${i + 1} of ${v.images.length}...`);
                  const uploadResult = await uploadProductImage(targetProductId, img.file, resolvedVariantId);
                  finalImageIds.push(uploadResult.id);
                } else if (img && typeof img === "object" && "id" in img) {
                  finalImageIds.push(img.id);
                }
              }

              if (finalImageIds.length > 0) {
                const reorderedPayload = finalImageIds.map((id, index) => ({
                  id,
                  sort_order: index,
                }));
                await reorderProductImages(reorderedPayload);
              }
            }
          }
        }
      }
      onSaved();
      onClose();
    } catch (err) {
      setErrors({ submit: err instanceof Error ? err.message : "Failed to save product" });
    } finally {
      setSaving(false);
      setUploadProgressText("");
    }
  }

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
            <fieldset className="space-y-4 border border-border/40 p-5 rounded-md bg-stone-50/20 dark:bg-stone-900/5">
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

              <div className="border border-border p-4 space-y-4 rounded-sm bg-neutral/10">
                <p className="text-sm font-semibold tracking-wider uppercase font-sans text-gold">Sale / Discount Settings</p>
                <div className="grid grid-cols-2 gap-4">
                  <div className="flex items-center space-x-2 pt-2">
                    <input
                      id="sale_active"
                      type="checkbox"
                      checked={form.sale_active}
                      onChange={(e) => set("sale_active", e.target.checked)}
                      className="h-4 w-4 rounded border-border bg-transparent text-gold focus:ring-gold animate-none"
                    />
                    <Label htmlFor="sale_active" className="cursor-pointer font-medium">On Sale</Label>
                  </div>
                  {form.sale_active && (
                    <div className="space-y-2">
                      <Label htmlFor="discount_percent">Discount Percentage (%)</Label>
                      <select
                        id="discount_percent"
                        value={form.discount_percent}
                        onChange={(e) => set("discount_percent", e.target.value)}
                        className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                      >
                        <option value="5">5%</option>
                        <option value="10">10%</option>
                        <option value="15">15%</option>
                        <option value="20">20%</option>
                        <option value="25">25%</option>
                        <option value="30">30%</option>
                        <option value="40">40%</option>
                        <option value="50">50%</option>
                        <option value="60">60%</option>
                        <option value="70">70%</option>
                      </select>
                    </div>
                  )}
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
            <fieldset className="space-y-4 border border-border/40 p-5 rounded-md bg-stone-50/20 dark:bg-stone-900/5">
              <legend className="text-xs tracking-[0.2em] uppercase px-2 font-medium">
                Category
              </legend>

              <div className="space-y-2">
                <Label htmlFor="subcategory_id">Category *</Label>
                <select
                  id="subcategory_id"
                  value={form.subcategory_id}
                  onChange={(e) => {
                    const selectedId = e.target.value;
                    const cat = allCategories.find((c) => c.id === selectedId);
                    setForm((prev) => ({
                      ...prev,
                      subcategory_id: selectedId,
                      category_id: cat ? (cat.parent_id || selectedId) : "",
                    }));
                  }}
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
                >
                  <option value="">Select category</option>
                  {hierarchicalCategories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {"\u00a0\u00a0\u00a0\u00a0".repeat(c.depth) + c.name}
                    </option>
                  ))}
                </select>
                {errors.subcategory_id && (
                  <p className="text-xs text-red">{errors.subcategory_id}</p>
                )}
              </div>
            </fieldset>

            {/* ─── Sizes ─── */}
            <fieldset className="space-y-4 border border-border/40 p-5 rounded-md bg-stone-50/20 dark:bg-stone-900/5">
              <legend className="text-xs tracking-[0.2em] uppercase px-2 font-medium">
                Available Sizes
              </legend>
              <div className="flex items-center justify-between pb-2">
                <Label className="text-sm font-medium">Enable Size Inventory</Label>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-muted-foreground uppercase">{sizeInventoryEnabled ? "ON" : "OFF"}</span>
                  <Switch
                    checked={sizeInventoryEnabled}
                    onCheckedChange={setSizeInventoryEnabled}
                    aria-label="Enable Size Inventory"
                  />
                </div>
              </div>

              {sizeInventoryEnabled && (
                <div className="flex flex-wrap gap-2 border-t border-border/40 pt-4">
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
              )}
            </fieldset>

            {/* ─── Enable Colors Toggle ─── */}
            <div className="flex items-center justify-between p-4 border border-border/40 rounded-md bg-stone-50/10 dark:bg-stone-900/2">
              <div className="space-y-0.5">
                <Label className="text-sm font-medium">Enable Colors</Label>
                <p className="text-xs text-muted-foreground">Toggle color variations for this product</p>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-muted-foreground uppercase">{enableColors ? "ON" : "OFF"}</span>
                <Switch
                  checked={enableColors}
                  onCheckedChange={setEnableColors}
                  aria-label="Toggle colors"
                />
              </div>
            </div>

            {enableColors && (
              <>
                {/* ─── Colors ─── */}
                <fieldset className="space-y-4 border border-border/40 p-5 rounded-md bg-stone-50/20 dark:bg-stone-900/5">
                  <legend className="text-xs tracking-[0.2em] uppercase px-2 font-medium">
                    Colors
                  </legend>

                  {form.colors.length > 0 && (
                    <div className="flex flex-wrap gap-3 mb-3">
                      {form.colors.map((c, i) => {
                        const isOwnedByVariant = variants.some(
                          (v) => v.name.trim().toLowerCase() === c.name.trim().toLowerCase()
                        );
                        return (
                          <div
                            key={i}
                            className="flex items-center gap-2 border border-border/60 px-3 py-1.5"
                          >
                            <span
                              className="w-5 h-5 rounded-full border"
                              style={{ backgroundColor: c.hex }}
                            />
                            <span className="text-sm">{c.name}</span>
                            {!isOwnedByVariant && (
                              <button
                                type="button"
                                onClick={() => removeColor(i)}
                                className="text-xs text-muted-foreground hover:text-red ml-1"
                              >
                                ✕
                              </button>
                            )}
                          </div>
                        );
                      })}
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

                {/* ─── Product Color Variants ─── */}
                <fieldset className="space-y-4 border border-border/40 p-5 rounded-md bg-stone-50/20 dark:bg-stone-900/5">
                  <div className="flex items-center justify-between">
                    <legend className="text-xs tracking-[0.2em] uppercase px-2 font-medium">
                      Color Variants
                    </legend>
                    <Button type="button" variant="outline" size="sm" onClick={addVariant}>
                      + Add Variant
                    </Button>
                  </div>

                  {variants.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-4">No variants added yet. Add one to enable color variants.</p>
                  ) : (
                    <div className="space-y-6">
                      {variants.map((v, idx) => (
                        <div key={idx} className="border border-border p-4 rounded-sm space-y-4 bg-background">
                          <div className="flex items-center justify-between">
                            <span className="font-medium text-sm">Variant #{idx + 1}: {v.name}</span>
                            <Button type="button" variant="ghost" size="sm" className="text-red hover:bg-red/10" onClick={() => removeVariant(idx)}>
                              Remove
                            </Button>
                          </div>

                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                            <div className="space-y-1">
                              <Label className="text-xs">Color Name</Label>
                              <Input
                                value={v.name}
                                onChange={(e) => updateVariant(idx, "name", e.target.value)}
                                onBlur={() => syncVariantColors()}
                                className="h-8 text-sm"
                              />
                            </div>
                            <div className="space-y-1">
                              <Label className="text-xs">Color Hex</Label>
                              <div className="flex items-center gap-1">
                                <input
                                  type="color"
                                  value={v.color_hex}
                                  onChange={(e) => updateVariant(idx, "color_hex", e.target.value)}
                                  onBlur={() => syncVariantColors()}
                                  className="h-8 w-8 border p-0.5"
                                />
                                <Input
                                  value={v.color_hex}
                                  onChange={(e) => updateVariant(idx, "color_hex", e.target.value)}
                                  onBlur={() => syncVariantColors()}
                                  className="h-8 text-xs font-mono"
                                />
                              </div>
                            </div>
                            <div className="space-y-1">
                              <Label className="text-xs">SKU</Label>
                              <Input
                                value={v.sku}
                                onChange={(e) => updateVariant(idx, "sku", e.target.value)}
                                className="h-8 text-sm"
                              />
                            </div>
                            <div className="space-y-1">
                              <Label className="text-xs">Sort Order</Label>
                              <Input
                                type="number"
                                value={String(v.sort_order)}
                                onChange={(e) => updateVariant(idx, "sort_order", parseInt(e.target.value) || 0)}
                                className="h-8 text-sm"
                              />
                            </div>
                          </div>

                          <div className="grid grid-cols-3 gap-3">
                            <div className="space-y-1">
                              <Label className="text-xs">Price Override</Label>
                              <Input
                                type="number"
                                step="0.01"
                                value={v.price}
                                onChange={(e) => updateVariant(idx, "price", e.target.value)}
                                className="h-8 text-sm"
                              />
                            </div>
                            <div className="space-y-1">
                              <Label className="text-xs">Compare Price Override</Label>
                              <Input
                                type="number"
                                step="0.01"
                                value={v.compare_price}
                                onChange={(e) => updateVariant(idx, "compare_price", e.target.value)}
                                className="h-8 text-sm"
                              />
                            </div>
                            <div className="space-y-1">
                              <Label className="text-xs">Total Stock</Label>
                              <Input
                                type="number"
                                value={v.stock}
                                onChange={(e) => {
                                  if (!sizeInventoryEnabled) {
                                    updateVariant(idx, "stock", e.target.value);
                                  }
                                }}
                                disabled={sizeInventoryEnabled}
                                className={`h-8 text-sm ${sizeInventoryEnabled ? "opacity-60" : ""}`}
                              />
                            </div>
                          </div>

                          <div className="space-y-3">
                            <Label className="text-xs font-semibold block">Variant Images</Label>
                            
                            <div className="flex items-center gap-2">
                              <input
                                type="file"
                                multiple
                                accept="image/jpeg,image/jpg,image/png,image/webp"
                                onChange={(e) => {
                                  if (e.target.files) {
                                    void handleVariantFilesAdded(idx, Array.from(e.target.files));
                                  }
                                }}
                                className="hidden"
                                id={`variant-upload-${idx}`}
                              />
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => document.getElementById(`variant-upload-${idx}`)?.click()}
                              >
                                Upload Variant Images
                              </Button>
                              <span className="text-xs text-muted-foreground">JPG, JPEG, PNG, WEBP</span>
                            </div>

                            {v.images.length > 0 && (
                              <div className="grid grid-cols-3 sm:grid-cols-5 gap-3 pt-1">
                                {v.images.map((img, i) => {
                                  const url = getVariantImageUrl(img);
                                  const isPrimary = i === 0;
                                  return (
                                    <div key={img.id} className="relative aspect-[3/4] border rounded-md overflow-hidden bg-neutral/10 group shadow-sm">
                                      <img src={url} alt="Variant Preview" className="w-full h-full object-cover" />
                                      {isPrimary && (
                                        <span className="absolute top-1 left-1 bg-amber-500 text-stone-950 font-sans font-semibold text-[8px] uppercase px-1 rounded z-10 leading-none py-0.5 tracking-wider">
                                          Main
                                        </span>
                                      )}
                                      
                                      <div className="absolute inset-0 bg-stone-950/70 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col justify-between p-1.5">
                                        <div className="flex justify-between items-center">
                                          <button
                                            type="button"
                                            onClick={() => void handleVariantSetPrimaryImage(idx, i)}
                                            disabled={isPrimary}
                                            className={`p-1 rounded bg-background/95 hover:bg-amber-500 hover:text-stone-950 text-foreground transition-colors disabled:opacity-50`}
                                            title="Set as Main"
                                          >
                                            <svg className="h-3 w-3" fill={isPrimary ? "currentColor" : "none"} stroke="currentColor" viewBox="0 0 24 24">
                                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.907c.961 0 1.36 1.246.577 1.838l-3.97 2.883a1 1 0 00-.364 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.971-2.883a1 1 0 00-1.17 0l-3.97 2.883c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.364-1.118l-3.97-2.883c-.784-.592-.386-1.838.577-1.838h4.906a1 1 0 00.951-.69l1.519-4.674z" />
                                            </svg>
                                          </button>
                                          
                                          <button
                                            type="button"
                                            onClick={() => void handleVariantDeleteImage(idx, img.id)}
                                            className="p-1 rounded bg-red-600/90 text-white hover:bg-red-700 transition-colors"
                                            title="Delete"
                                          >
                                            <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                            </svg>
                                          </button>
                                        </div>
                                        
                                        <div className="flex justify-center gap-1">
                                          <button
                                            type="button"
                                            onClick={() => void handleVariantMoveImage(idx, i, -1)}
                                            disabled={i === 0}
                                            className="px-1 py-0.5 bg-background/95 hover:bg-foreground hover:text-background rounded disabled:opacity-40 disabled:hover:bg-background/95 text-[9px] font-sans"
                                          >
                                            ◀
                                          </button>
                                          <button
                                            type="button"
                                            onClick={() => void handleVariantMoveImage(idx, i, 1)}
                                            disabled={i === v.images.length - 1}
                                            className="px-1 py-0.5 bg-background/95 hover:bg-foreground hover:text-background rounded disabled:opacity-40 disabled:hover:bg-background/95 text-[9px] font-sans"
                                          >
                                            ▶
                                          </button>
                                        </div>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </div>

                          {/* Variant size stock */}
                          {sizeInventoryEnabled && (form.sizes.length > 0 || v.sizes.length > 0) && (
                            <div className="border-t border-border/40 pt-3">
                              <p className="text-xs font-semibold mb-2">Variant Sizes Stock</p>
                              <div className="grid grid-cols-6 gap-2">
                                {(form.sizes.length > 0 ? form.sizes : v.sizes).map((sz) => (
                                  <div key={sz} className="space-y-1">
                                    <Label className="text-[10px] text-center block">{sz}</Label>
                                    <Input
                                      type="number"
                                      min="0"
                                      value={v.size_stock[sz] ?? 0}
                                      onChange={(e) => {
                                        const nextStock = { ...v.size_stock, [sz]: Math.max(0, parseInt(e.target.value) || 0) };
                                        updateVariant(idx, "size_stock", nextStock);
                                        const total = Object.values(nextStock).reduce((sum, val) => sum + val, 0);
                                        updateVariant(idx, "stock", String(total));
                                      }}
                                      disabled={isEdit && !newlyCreatedVariantIds.includes(v.id || "")}
                                      className="h-7 text-center text-xs disabled:opacity-60"
                                    />
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </fieldset>
              </>
            )}

            {/* ─── Images ─── */}
            <fieldset className="space-y-4 border border-border/40 p-5 rounded-md bg-stone-50/20 dark:bg-stone-900/5">
              <legend className="text-xs tracking-[0.2em] uppercase px-2 font-medium">
                Images
              </legend>

              {/* Drag & Drop zone */}
              <div
                onDragEnter={handleDrag}
                onDragOver={handleDrag}
                onDragLeave={handleDrag}
                onDrop={handleDrop}
                onClick={() => fileRef.current?.click()}
                className={`border border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors duration-200 ${
                  dragActive 
                    ? "border-primary bg-primary/5 dark:bg-primary/10" 
                    : "border-border hover:border-primary/50"
                }`}
              >
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/jpeg,image/jpg,image/png,image/webp"
                  multiple
                  onChange={(e) => {
                    if (e.target.files) {
                      handleFilesAdded(Array.from(e.target.files));
                    }
                  }}
                  className="hidden"
                />
                <div className="flex flex-col items-center justify-center gap-2">
                  <svg
                    className="h-8 w-8 text-muted-foreground"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={1.5}
                      d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"
                    />
                  </svg>
                  <p className="text-sm font-medium">Drag & drop files here, or click to upload</p>
                  <p className="text-xs text-muted-foreground">Supports JPG, JPEG, PNG, WEBP</p>
                </div>
              </div>

              {uploadProgressText && (
                <div className="text-xs text-amber-600 dark:text-amber-400 font-medium py-1">
                  {uploadProgressText}
                </div>
              )}

              {uploading && (
                <div className="text-xs text-muted-foreground font-medium py-1">
                  Uploading to server...
                </div>
              )}

              {/* Image Grid */}
              {((isEdit ? images : localImages).length > 0) && (
                <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-5 gap-4 pt-2">
                  {(isEdit ? images : localImages).map((img, i) => {
                    const url = getVariantImageUrl(img);
                    const id = img.id;
                    const isPrimary = i === 0;
                    return (
                      <div
                        key={id}
                        className="relative aspect-[3/4] bg-stone-100 dark:bg-stone-900 border border-border/80 group rounded-md overflow-hidden shadow-sm"
                      >
                        <img
                          src={url}
                          alt="Product Preview"
                          className="h-full w-full object-cover"
                        />
                        {/* Primary Badge */}
                        {isPrimary && (
                          <div className="absolute top-2 left-2 bg-amber-500 text-stone-950 font-sans font-semibold text-[9px] uppercase px-1.5 py-0.5 rounded shadow-sm z-10 tracking-wider">
                            Primary
                          </div>
                        )}
                        {/* Hover Actions Menu */}
                        <div className="absolute inset-0 bg-stone-950/60 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col justify-between p-2">
                          {/* Top row actions (Set Primary, Delete) */}
                          <div className="flex justify-between items-start">
                            <button
                              type="button"
                              onClick={() => isEdit ? handleSetPrimaryImage(i) : handleSetPrimaryLocalImage(i)}
                              className={`p-1.5 rounded bg-background/90 text-foreground hover:bg-amber-500 hover:text-stone-950 transition-colors shadow-sm ${
                                isPrimary ? "opacity-50 cursor-default" : ""
                              }`}
                              disabled={isPrimary}
                              title="Set as Primary"
                            >
                              <svg className="h-3.5 w-3.5" fill={isPrimary ? "currentColor" : "none"} stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.907c.961 0 1.36 1.246.577 1.838l-3.97 2.883a1 1 0 00-.364 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.971-2.883a1 1 0 00-1.17 0l-3.97 2.883c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.364-1.118l-3.97-2.883c-.784-.592-.386-1.838.577-1.838h4.906a1 1 0 00.951-.69l1.519-4.674z" />
                              </svg>
                            </button>
                            <button
                              type="button"
                              onClick={() => isEdit ? handleDeleteImage(id) : handleDeleteLocalImage(id, url)}
                              className="p-1.5 rounded bg-red-600/90 text-white hover:bg-red-700 transition-colors shadow-sm"
                              title="Remove Image"
                            >
                              <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                              </svg>
                            </button>
                          </div>
                          {/* Bottom row actions (Move Left, Move Right) */}
                          <div className="flex justify-center gap-2">
                            <button
                              type="button"
                              onClick={() => isEdit ? handleMoveImage(i, -1) : handleMoveLocalImage(i, -1)}
                              disabled={i === 0}
                              className="h-7 px-2 bg-background/90 text-foreground hover:bg-foreground hover:text-background rounded disabled:opacity-40 disabled:hover:bg-background/90 disabled:hover:text-foreground text-xs font-semibold shadow-sm transition-colors"
                              title="Move Left"
                            >
                              ‹ Left
                            </button>
                            <button
                              type="button"
                              onClick={() => isEdit ? handleMoveImage(i, 1) : handleMoveLocalImage(i, 1)}
                              disabled={i === (isEdit ? images : localImages).length - 1}
                              className="h-7 px-2 bg-background/90 text-foreground hover:bg-foreground hover:text-background rounded disabled:opacity-40 disabled:hover:bg-background/90 disabled:hover:text-foreground text-xs font-semibold shadow-sm transition-colors"
                              title="Move Right"
                            >
                              Right ›
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {errors.images && <p className="text-xs text-red font-medium mt-1">{errors.images}</p>}
            </fieldset>

            {/* ─── Inventory ─── */}
            <fieldset className="space-y-4 border border-border/40 p-5 rounded-md bg-stone-50/20 dark:bg-stone-900/5">
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

              {sizeInventoryEnabled && form.sizes.length > 0 && (
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
                          disabled={isEdit}
                          className="h-8 text-center text-sm disabled:opacity-60"
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
            <fieldset className="space-y-4 border border-border/40 p-5 rounded-md bg-stone-50/20 dark:bg-stone-900/5">
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