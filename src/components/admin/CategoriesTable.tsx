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
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Label } from "@/components/ui/label";
import {
  useCategoriesManagement,
  createCategory,
  updateCategory,
  deleteCategory,
  slugify,
  getParentCategories,
  type CategoryRow,
  type ParentCategoryOption,
} from "@/lib/admin-categories";

export function CategoriesTable() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<string>("name");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const pageSize = 20;

  const { result, loading, error, refetch } = useCategoriesManagement(
    page,
    pageSize,
    search,
    sortBy,
    sortDir,
  );

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
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">Categories</h2>
        <CreateCategoryDialog
          onSuccess={() => {
            setPage(1);
            refetch();
          }}
        />
      </div>

      <Input
        placeholder="Search categories..."
        value={search}
        onChange={(e) => {
          setSearch(e.target.value);
          setPage(1);
        }}
        className="max-w-sm"
      />

      {error && <p className="text-red-500 text-sm">{error}</p>}

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="cursor-pointer select-none" onClick={() => handleSort("name")}>
                Name{sortIndicator("name")}
              </TableHead>
              <TableHead>Parent</TableHead>
              <TableHead>Slug</TableHead>
              <TableHead
                className="cursor-pointer select-none text-right"
                onClick={() => handleSort("product_count")}
              >
                Products{sortIndicator("product_count")}
              </TableHead>
              <TableHead
                className="cursor-pointer select-none"
                onClick={() => handleSort("created_at")}
              >
                Created{sortIndicator("created_at")}
              </TableHead>
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
            ) : (result?.categories?.length ?? 0) === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                  No categories found
                </TableCell>
              </TableRow>
            ) : (
              result?.categories.map((cat) => (
                <TableRow key={cat.id}>
                  <TableCell className="font-medium">
                    {cat.parent_id ? (
                      <span className="ml-4">{cat.name}</span>
                    ) : (
                      <strong>{cat.name}</strong>
                    )}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {cat.parent_name ?? "—"}
                  </TableCell>
                  <TableCell className="font-mono text-sm">{cat.slug}</TableCell>
                  <TableCell className="text-right">{cat.product_count}</TableCell>
                  <TableCell>{new Date(cat.created_at).toLocaleDateString()}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <EditCategoryDialog category={cat} onSuccess={refetch} />
                      <DeleteCategoryDialog category={cat} onSuccess={refetch} />
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
    </div>
  );
}

function CreateCategoryDialog({ onSuccess }: { onSuccess: () => void }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [parentId, setParentId] = useState("");
  const [parents, setParents] = useState<ParentCategoryOption[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open)
      getParentCategories()
        .then(setParents)
        .catch(() => {});
  }, [open]);

  function handleNameChange(val: string) {
    setName(val);
    setSlug(slugify(val));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!name.trim()) {
      setError("Name is required");
      return;
    }
    if (!slug.trim()) {
      setError("Slug is required");
      return;
    }
    if (!parentId) {
      setError("Parent category is required");
      return;
    }
    setLoading(true);
    const result = await createCategory(name.trim(), slug.trim(), parentId);
    setLoading(false);
    if (result.success) {
      setOpen(false);
      setName("");
      setSlug("");
      setParentId("");
      onSuccess();
    } else {
      setError(result.error ?? "Failed to create category");
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button onClick={() => setOpen(true)}>Add Subcategory</Button>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create Subcategory</DialogTitle>
          <DialogDescription>Add a new subcategory under Clothing or Jewellery.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="cat-parent">Parent Category</Label>
            <select
              id="cat-parent"
              value={parentId}
              onChange={(e) => setParentId(e.target.value)}
              className="w-full bg-background border border-border px-4 py-3 text-sm outline-none focus:border-foreground transition-colors"
            >
              <option value="">Select parent...</option>
              {parents.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="cat-name">Name</Label>
            <Input
              id="cat-name"
              value={name}
              onChange={(e) => handleNameChange(e.target.value)}
              placeholder="Subcategory name"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="cat-slug">Slug</Label>
            <Input
              id="cat-slug"
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              placeholder="subcategory-slug"
            />
          </div>
          {error && <p className="text-red-500 text-sm">{error}</p>}
          <DialogFooter>
            <Button type="submit" disabled={loading}>
              {loading ? "Creating..." : "Create"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function EditCategoryDialog({
  category,
  onSuccess,
}: {
  category: CategoryRow;
  onSuccess: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(category.name);
  const [slug, setSlug] = useState(category.slug);
  const [parentId, setParentId] = useState(category.parent_id ?? "");
  const [parents, setParents] = useState<ParentCategoryOption[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const isRoot = !category.parent_id;

  useEffect(() => {
    if (open)
      getParentCategories()
        .then(setParents)
        .catch(() => {});
  }, [open]);

  function handleNameChange(val: string) {
    setName(val);
    setSlug(slugify(val));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!name.trim()) {
      setError("Name is required");
      return;
    }
    if (!slug.trim()) {
      setError("Slug is required");
      return;
    }
    setLoading(true);
    const result = await updateCategory(
      category.id,
      name.trim(),
      slug.trim(),
      isRoot ? null : parentId || null,
    );
    setLoading(false);
    if (result.success) {
      setOpen(false);
      onSuccess();
    } else {
      setError(result.error ?? "Failed to update category");
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => {
          setName(category.name);
          setSlug(category.slug);
          setParentId(category.parent_id ?? "");
          setError("");
          setOpen(true);
        }}
      >
        Edit
      </Button>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit Category</DialogTitle>
          <DialogDescription>Update category details.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          {!isRoot && (
            <div className="space-y-2">
              <Label htmlFor="edit-parent">Parent Category</Label>
              <select
                id="edit-parent"
                value={parentId}
                onChange={(e) => setParentId(e.target.value)}
                className="w-full bg-background border border-border px-4 py-3 text-sm outline-none focus:border-foreground transition-colors"
              >
                <option value="">Select parent...</option>
                {parents.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div className="space-y-2">
            <Label htmlFor="edit-name">Name</Label>
            <Input id="edit-name" value={name} onChange={(e) => handleNameChange(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="edit-slug">Slug</Label>
            <Input id="edit-slug" value={slug} onChange={(e) => setSlug(e.target.value)} />
          </div>
          {error && <p className="text-red-500 text-sm">{error}</p>}
          <DialogFooter>
            <Button type="submit" disabled={loading}>
              {loading ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function DeleteCategoryDialog({
  category,
  onSuccess,
}: {
  category: CategoryRow;
  onSuccess: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleDelete() {
    setError("");
    setLoading(true);
    const result = await deleteCategory(category.id);
    setLoading(false);
    if (result.success) {
      setOpen(false);
      onSuccess();
    } else {
      setError(result.error ?? "Failed to delete category");
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <Button variant="ghost" size="sm" onClick={() => setOpen(true)}>
        Delete
      </Button>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete Category</AlertDialogTitle>
          <AlertDialogDescription>
            Are you sure you want to delete "{category.name}"? This action cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        {error && <p className="text-red-500 text-sm">{error}</p>}
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={handleDelete} disabled={loading}>
            {loading ? "Deleting..." : "Delete"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
