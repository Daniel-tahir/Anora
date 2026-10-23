import React, { useEffect, useState, useMemo } from "react";
import { Link } from "@tanstack/react-router";
import {
  FileText,
  Plus,
  Edit,
  Trash2,
  CheckCircle,
  Clock,
  Eye,
  Settings,
  X,
  Upload,
  Globe,
  Star,
  Search,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { BlogService } from "../services/blog.service";
import { calculateReadingTime } from "../utils/readingTime";
import type { BlogPostWithDetails, BlogCategory, BlogTag, BlogAuthor } from "../types";
import { toast } from "sonner";

export function AdminBlogManagement() {
  const blogService = useMemo(() => new BlogService(supabase), []);

  const [posts, setPosts] = useState<BlogPostWithDetails[]>([]);
  const [categories, setCategories] = useState<BlogCategory[]>([]);
  const [tags, setTags] = useState<BlogTag[]>([]);
  const [authors, setAuthors] = useState<BlogAuthor[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  // Editor states
  const [isEditing, setIsEditing] = useState(false);
  const [editPostId, setEditPostId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [content, setContent] = useState("");
  const [excerpt, setExcerpt] = useState("");
  const [coverImage, setCoverImage] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("");
  const [selectedAuthor, setSelectedAuthor] = useState("");
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [status, setStatus] = useState<"draft" | "published" | "scheduled">("draft");
  const [featured, setFeatured] = useState(false);
  const [publishedAt, setPublishedAt] = useState("");

  // Meta fields
  const [metaTitle, setMetaTitle] = useState("");
  const [metaDescription, setMetaDescription] = useState("");
  const [metaKeywords, setMetaKeywords] = useState("");
  const [canonicalUrl, setCanonicalUrl] = useState("");

  // Quick creators
  const [showCatModal, setShowCatModal] = useState(false);
  const [newCatName, setNewCatName] = useState("");
  const [showTagModal, setShowTagModal] = useState(false);
  const [newTagName, setNewTagName] = useState("");
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [newAuthName, setNewAuthName] = useState("");

  // Load all dashboard content
  const loadDashboard = async () => {
    try {
      setLoading(true);
      const [allPosts, allCats, allTags, allAuthors] = await Promise.all([
        blogService.getPosts({ status: undefined }), // get all statuses
        blogService.getCategories(),
        blogService.getTags(),
        blogService.getAuthors(),
      ]);
      setPosts(allPosts);
      setCategories(allCats);
      setTags(allTags);
      setAuthors(allAuthors);

      // Pre-select defaults
      if (allAuthors.length > 0 && !selectedAuthor) setSelectedAuthor(allAuthors[0].id);
      if (allCats.length > 0 && !selectedCategory) setSelectedCategory(allCats[0].id);
    } catch (err) {
      console.error("Error loading dashboard data:", err);
      toast.error("Failed to load blog database");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDashboard();
  }, [blogService]);

  // Handle slug auto generation
  useEffect(() => {
    if (!editPostId) {
      const generated = title
        .toLowerCase()
        .replace(/[^\w\s-]/g, "")
        .replace(/\s+/g, "-");
      setSlug(generated);
    }
  }, [title, editPostId]);

  // Metrics
  const metrics = useMemo(() => {
    const total = posts.length;
    const published = posts.filter((p) => p.status === "published").length;
    const drafts = posts.filter((p) => p.status === "draft").length;
    const views = posts.reduce((sum, p) => sum + (p.views_count || 0), 0);
    return { total, published, drafts, views };
  }, [posts]);

  // Filter posts
  const filteredPosts = useMemo(() => {
    if (!search) return posts;
    return posts.filter((p) =>
      p.title.toLowerCase().includes(search.toLowerCase()) ||
      p.excerpt?.toLowerCase().includes(search.toLowerCase())
    );
  }, [posts, search]);

  const handleEdit = (post: BlogPostWithDetails) => {
    setEditPostId(post.id);
    setTitle(post.title);
    setSlug(post.slug);
    setContent(post.content);
    setExcerpt(post.excerpt || "");
    setCoverImage(post.cover_image || "");
    setSelectedCategory(post.category_id || "");
    setSelectedAuthor(post.author_id || "");
    setSelectedTags((post.tags || []).map((t) => t.id));
    setStatus(post.status);
    setFeatured(post.featured);
    setPublishedAt(post.published_at ? post.published_at.substring(0, 16) : "");
    setMetaTitle(post.meta_title || "");
    setMetaDescription(post.meta_description || "");
    setMetaKeywords(post.meta_keywords || "");
    setCanonicalUrl(post.canonical_url || "");
    setIsEditing(true);
  };

  const handleCreateNew = () => {
    setEditPostId(null);
    setTitle("");
    setSlug("");
    setContent("");
    setExcerpt("");
    setCoverImage("");
    if (categories.length > 0) setSelectedCategory(categories[0].id);
    if (authors.length > 0) setSelectedAuthor(authors[0].id);
    setSelectedTags([]);
    setStatus("draft");
    setFeatured(false);
    setPublishedAt("");
    setMetaTitle("");
    setMetaDescription("");
    setMetaKeywords("");
    setCanonicalUrl("");
    setIsEditing(true);
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm("Are you sure you want to delete this story?")) return;
    try {
      await blogService.deletePost(id);
      toast.success("Story deleted");
      loadDashboard();
    } catch (err) {
      console.error(err);
      toast.error("Failed to delete story");
    }
  };

  // Image Upload helper
  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const promise = blogService.uploadImage(file).then((url) => {
      setCoverImage(url);
      return url;
    });

    toast.promise(promise, {
      loading: "Uploading cover image...",
      success: "Image uploaded successfully",
      error: "Failed to upload image",
    });
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!title || !slug || !content) {
      toast.error("Please fill in required fields (Title, Slug, Content)");
      return;
    }

    const calculatedTime = calculateReadingTime(content);

    const postPayload = {
      title,
      slug,
      content,
      excerpt,
      cover_image: coverImage || null,
      author_id: selectedAuthor || null,
      category_id: selectedCategory || null,
      reading_time: calculatedTime,
      status,
      featured,
      published_at: publishedAt ? new Date(publishedAt).toISOString() : null,
      meta_title: metaTitle || null,
      meta_description: metaDescription || null,
      meta_keywords: metaKeywords || null,
      canonical_url: canonicalUrl || null,
    };

    try {
      if (editPostId) {
        await blogService.updatePost(editPostId, postPayload, selectedTags);
        toast.success("Story updated successfully");
      } else {
        await blogService.createPost(postPayload, selectedTags);
        toast.success("Story created successfully");
      }
      setIsEditing(false);
      loadDashboard();
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || "Failed to save story");
    }
  };

  // Insert markdown helpers in textarea
  const insertMarkdown = (syntax: string) => {
    const textarea = document.getElementById("content-textarea") as HTMLTextAreaElement;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const text = textarea.value;
    const selected = text.substring(start, end);

    let replacement = "";
    switch (syntax) {
      case "h2":
        replacement = `\n## ${selected || "Heading 2"}\n`;
        break;
      case "h3":
        replacement = `\n### ${selected || "Heading 3"}\n`;
        break;
      case "bold":
        replacement = `**${selected || "bold text"}**`;
        break;
      case "italic":
        replacement = `*${selected || "italic text"}*`;
        break;
      case "quote":
        replacement = `\n> ${selected || "Quote text"}\n`;
        break;
      case "list":
        replacement = `\n- ${selected || "List item"}\n`;
        break;
      case "image":
        replacement = `\n![Alt Text](https://image-url.com)\n`;
        break;
      case "table":
        replacement = `\n| Column 1 | Column 2 |\n|---|---|\n| Cell 1 | Cell 2 |\n`;
        break;
    }

    const nextContent = text.substring(0, start) + replacement + text.substring(end);
    setContent(nextContent);
    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(start + replacement.length, start + replacement.length);
    }, 50);
  };

  // Custom quick additions
  const handleCreateCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCatName) return;
    try {
      const slug = newCatName.toLowerCase().replace(/\s+/g, "-");
      const created = await blogService.createCategory(newCatName, slug);
      setCategories((prev) => [...prev, created]);
      setSelectedCategory(created.id);
      setShowCatModal(false);
      setNewCatName("");
      toast.success("Category added");
    } catch (err) {
      toast.error("Failed to add category");
    }
  };

  const handleCreateTag = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTagName) return;
    try {
      const slug = newTagName.toLowerCase().replace(/\s+/g, "-");
      const created = await blogService.createTag(newTagName, slug);
      setTags((prev) => [...prev, created]);
      setSelectedTags((prev) => [...prev, created.id]);
      setShowTagModal(false);
      setNewTagName("");
      toast.success("Tag added");
    } catch (err) {
      toast.error("Failed to add tag");
    }
  };

  const handleCreateAuthor = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newAuthName) return;
    try {
      const created = await blogService.createAuthor(newAuthName);
      setAuthors((prev) => [...prev, created]);
      setSelectedAuthor(created.id);
      setShowAuthModal(false);
      setNewAuthName("");
      toast.success("Author profile added");
    } catch (err) {
      toast.error("Failed to add author");
    }
  };

  return (
    <div className="space-y-10 min-h-screen">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-border/40 pb-6">
        <div>
          <h1 className="font-serif text-3xl font-light text-foreground">Blog Management</h1>
          <p className="text-xs text-muted-foreground mt-1">
            Author and publish articles in the ANORA Journal.
          </p>
        </div>
        {!isEditing && (
          <button
            onClick={handleCreateNew}
            className="inline-flex items-center gap-2 bg-foreground text-background text-[10px] tracking-[0.25em] uppercase px-5 py-3 hover:bg-gold hover:text-ink transition-colors duration-300 font-semibold rounded-[1px]"
          >
            <Plus className="h-4 w-4" />
            New Story
          </button>
        )}
      </div>

      {loading ? (
        <div className="py-24 text-center">
          <div className="inline-block h-8 w-8 animate-spin rounded-full border-2 border-solid border-gold border-r-transparent align-[-0.125em]" />
          <p className="mt-4 font-serif text-sm text-muted-foreground tracking-widest">
            Synchronizing database...
          </p>
        </div>
      ) : isEditing ? (
        /* ─── Editor Mode ─── */
        <form onSubmit={handleSave} className="bg-background border border-border/40 p-6 md:p-8 space-y-8 animate-fade-up">
          <div className="flex items-center justify-between border-b border-border/20 pb-4">
            <span className="font-serif text-lg text-foreground">
              {editPostId ? "Edit Story" : "Write New Story"}
            </span>
            <button
              type="button"
              onClick={() => setIsEditing(false)}
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            {/* Left side: Body content */}
            <div className="md:col-span-2 space-y-6">
              {/* Title & Slug */}
              <div className="space-y-4">
                <div>
                  <label className="text-[10px] tracking-[0.2em] uppercase text-muted-foreground block mb-2 font-semibold">
                    Story Title *
                  </label>
                  <input
                    type="text"
                    required
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="Enter heading..."
                    className="w-full bg-neutral/40 border border-border/80 px-4 py-3 text-sm focus:border-gold outline-none"
                  />
                </div>
                <div>
                  <label className="text-[10px] tracking-[0.2em] uppercase text-muted-foreground block mb-2 font-semibold">
                    Slug *
                  </label>
                  <input
                    type="text"
                    required
                    value={slug}
                    onChange={(e) => setSlug(e.target.value)}
                    placeholder="slug-path"
                    className="w-full bg-neutral/40 border border-border/80 px-4 py-3 text-sm focus:border-gold outline-none font-mono"
                  />
                </div>
              </div>

              {/* Excerpt */}
              <div>
                <label className="text-[10px] tracking-[0.2em] uppercase text-muted-foreground block mb-2 font-semibold">
                  Excerpt (Meta Summary)
                </label>
                <textarea
                  value={excerpt}
                  onChange={(e) => setExcerpt(e.target.value)}
                  placeholder="Enter a brief, engaging summary..."
                  className="w-full bg-neutral/40 border border-border/80 px-4 py-3 text-sm focus:border-gold outline-none h-20 resize-none font-serif"
                />
              </div>

              {/* Rich Content Editor */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-[10px] tracking-[0.2em] uppercase text-muted-foreground block font-semibold">
                    Rich Content (Markdown) *
                  </label>
                  <div className="flex flex-wrap gap-1">
                    {["h2", "h3", "bold", "italic", "quote", "list", "image", "table"].map((tool) => (
                      <button
                        key={tool}
                        type="button"
                        onClick={() => insertMarkdown(tool)}
                        className="text-[9px] tracking-wider uppercase border border-border/60 hover:border-gold px-2 py-1 transition-colors bg-neutral/40 text-foreground"
                      >
                        {tool}
                      </button>
                    ))}
                  </div>
                </div>
                <textarea
                  id="content-textarea"
                  required
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  placeholder="Draft your thoughts using Markdown..."
                  className="w-full bg-neutral/40 border border-border/80 p-5 text-sm focus:border-gold outline-none h-[420px] resize-y font-mono leading-relaxed"
                />
              </div>
            </div>

            {/* Right side: Settings & metadata */}
            <div className="space-y-6">
              {/* Category, Author & Cover */}
              <div className="border border-border/40 p-5 space-y-5 bg-neutral/10">
                <span className="text-[10px] tracking-[0.25em] uppercase text-gold block font-semibold border-b border-border/20 pb-2">
                  Dispatch Info
                </span>

                {/* Category Dropdown */}
                <div>
                  <div className="flex justify-between items-center mb-2">
                    <label className="text-[10px] tracking-[0.2em] uppercase text-muted-foreground font-semibold">
                      Category
                    </label>
                    <button
                      type="button"
                      onClick={() => setShowCatModal(true)}
                      className="text-[9px] uppercase text-gold hover:underline"
                    >
                      + Add
                    </button>
                  </div>
                  <select
                    value={selectedCategory}
                    onChange={(e) => setSelectedCategory(e.target.value)}
                    className="w-full bg-background border border-border/85 px-3 py-2 text-sm outline-none focus:border-gold"
                  >
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Author Dropdown */}
                <div>
                  <div className="flex justify-between items-center mb-2">
                    <label className="text-[10px] tracking-[0.2em] uppercase text-muted-foreground font-semibold">
                      Author
                    </label>
                    <button
                      type="button"
                      onClick={() => setShowAuthModal(true)}
                      className="text-[9px] uppercase text-gold hover:underline"
                    >
                      + Add
                    </button>
                  </div>
                  <select
                    value={selectedAuthor}
                    onChange={(e) => setSelectedAuthor(e.target.value)}
                    className="w-full bg-background border border-border/85 px-3 py-2 text-sm outline-none focus:border-gold"
                  >
                    {authors.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Cover Image */}
                <div>
                  <label className="text-[10px] tracking-[0.2em] uppercase text-muted-foreground block mb-2 font-semibold">
                    Cover Image
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={coverImage}
                      onChange={(e) => setCoverImage(e.target.value)}
                      placeholder="URL or upload image..."
                      className="flex-1 bg-background border border-border/85 px-3 py-2 text-xs outline-none focus:border-gold"
                    />
                    <label className="bg-foreground text-background px-3 py-2 text-xs flex items-center gap-1.5 hover:bg-gold hover:text-ink cursor-pointer transition-colors duration-300 font-semibold">
                      <Upload className="h-3 w-3" />
                      <input
                        type="file"
                        accept="image/*"
                        onChange={handleImageUpload}
                        className="hidden"
                      />
                    </label>
                  </div>
                  {coverImage && (
                    <div className="mt-3 aspect-[4/3] border border-border/30 overflow-hidden relative">
                      <img src={coverImage} alt="Cover preview" className="w-full h-full object-cover" />
                      <button
                        type="button"
                        onClick={() => setCoverImage("")}
                        className="absolute top-2 right-2 bg-ink/75 hover:bg-gold p-1 text-white hover:text-ink transition-colors rounded-full"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* Status & Featured Toggle */}
              <div className="border border-border/40 p-5 space-y-4 bg-neutral/10">
                <span className="text-[10px] tracking-[0.25em] uppercase text-gold block font-semibold border-b border-border/20 pb-2">
                  Publish Settings
                </span>

                <div>
                  <label className="text-[10px] tracking-[0.2em] uppercase text-muted-foreground block mb-2 font-semibold">
                    Status
                  </label>
                  <select
                    value={status}
                    onChange={(e) => setStatus(e.target.value as any)}
                    className="w-full bg-background border border-border/85 px-3 py-2 text-sm outline-none focus:border-gold"
                  >
                    <option value="draft">Draft</option>
                    <option value="published">Published</option>
                    <option value="scheduled">Scheduled</option>
                  </select>
                </div>

                {status === "scheduled" && (
                  <div>
                    <label className="text-[10px] tracking-[0.2em] uppercase text-muted-foreground block mb-2 font-semibold">
                      Release Date & Time
                    </label>
                    <input
                      type="datetime-local"
                      value={publishedAt}
                      onChange={(e) => setPublishedAt(e.target.value)}
                      className="w-full bg-background border border-border/85 px-3 py-2 text-xs outline-none focus:border-gold font-mono"
                    />
                  </div>
                )}

                <div className="flex items-center justify-between py-2">
                  <div className="flex items-center gap-2">
                    <Star className="h-4 w-4 text-gold fill-gold" />
                    <label className="text-[10px] tracking-[0.2em] uppercase text-foreground font-semibold">
                      Feature Story
                    </label>
                  </div>
                  <input
                    type="checkbox"
                    checked={featured}
                    onChange={(e) => setFeatured(e.target.checked)}
                    className="h-4.5 w-4.5 accent-gold cursor-pointer"
                  />
                </div>
              </div>

              {/* Tag Multi-Select */}
              <div className="border border-border/40 p-5 bg-neutral/10 space-y-3">
                <div className="flex justify-between items-center border-b border-border/20 pb-2">
                  <span className="text-[10px] tracking-[0.25em] uppercase text-gold font-semibold">
                    Tags
                  </span>
                  <button
                    type="button"
                    onClick={() => setShowTagModal(true)}
                    className="text-[9px] uppercase text-gold hover:underline"
                  >
                    + Add
                  </button>
                </div>
                <div className="flex flex-wrap gap-2 max-h-36 overflow-y-auto py-1">
                  {tags.map((t) => {
                    const active = selectedTags.includes(t.id);
                    return (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => {
                          setSelectedTags((prev) =>
                            active ? prev.filter((id) => id !== t.id) : [...prev, t.id]
                          );
                        }}
                        className={`text-[9px] tracking-wider uppercase px-2.5 py-1 border transition-all ${
                          active
                            ? "border-gold text-gold bg-gold/5"
                            : "border-border/60 text-muted-foreground"
                        }`}
                      >
                        {t.name}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>

          {/* SEO Metadata Settings Collapse */}
          <div className="border border-border/40 p-6 bg-neutral/5 space-y-6">
            <div className="flex items-center gap-2 text-gold">
              <Globe className="h-4 w-4" />
              <span className="text-xs tracking-[0.25em] uppercase font-semibold">
                SEO Search Engine Optimization
              </span>
            </div>

            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label className="text-[9px] tracking-[0.18em] uppercase text-muted-foreground block mb-1.5 font-semibold">
                  Meta Title
                </label>
                <input
                  type="text"
                  value={metaTitle}
                  onChange={(e) => setMetaTitle(e.target.value)}
                  placeholder="SEO Heading (max 60 chars)"
                  className="w-full bg-background border border-border/80 px-3 py-2 text-xs focus:border-gold outline-none"
                />
              </div>
              <div>
                <label className="text-[9px] tracking-[0.18em] uppercase text-muted-foreground block mb-1.5 font-semibold">
                  Meta Description
                </label>
                <input
                  type="text"
                  value={metaDescription}
                  onChange={(e) => setMetaDescription(e.target.value)}
                  placeholder="SEO Excerpt (max 160 chars)"
                  className="w-full bg-background border border-border/80 px-3 py-2 text-xs focus:border-gold outline-none"
                />
              </div>
              <div>
                <label className="text-[9px] tracking-[0.18em] uppercase text-muted-foreground block mb-1.5 font-semibold">
                  Meta Keywords
                </label>
                <input
                  type="text"
                  value={metaKeywords}
                  onChange={(e) => setMetaKeywords(e.target.value)}
                  placeholder="separated, by, commas"
                  className="w-full bg-background border border-border/80 px-3 py-2 text-xs focus:border-gold outline-none font-mono"
                />
              </div>
              <div>
                <label className="text-[9px] tracking-[0.18em] uppercase text-muted-foreground block mb-1.5 font-semibold">
                  Canonical URL
                </label>
                <input
                  type="url"
                  value={canonicalUrl}
                  onChange={(e) => setCanonicalUrl(e.target.value)}
                  placeholder="https://anora.com/blogs/..."
                  className="w-full bg-background border border-border/80 px-3 py-2 text-xs focus:border-gold outline-none font-mono"
                />
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-border/20">
            <button
              type="button"
              onClick={() => setIsEditing(false)}
              className="px-6 py-3 border border-border hover:bg-neutral text-[10px] tracking-[0.2em] uppercase transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-6 py-3 bg-foreground text-background hover:bg-gold hover:text-ink text-[10px] tracking-[0.2em] uppercase transition-colors font-semibold"
            >
              Save story
            </button>
          </div>
        </form>
      ) : (
        /* ─── Dashboard Table Mode ─── */
        <div className="space-y-8 animate-fade">
          {/* Dashboard Analytics Widgets */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="border border-border/40 p-5 bg-neutral/15">
              <span className="text-[9px] tracking-[0.18em] uppercase text-muted-foreground">
                Total Stories
              </span>
              <p className="font-serif text-3xl mt-1.5">{metrics.total}</p>
            </div>
            <div className="border border-border/40 p-5 bg-neutral/15">
              <span className="text-[9px] tracking-[0.18em] uppercase text-muted-foreground">
                Published
              </span>
              <p className="font-serif text-3xl mt-1.5 text-emerald-600 dark:text-emerald-400">
                {metrics.published}
              </p>
            </div>
            <div className="border border-border/40 p-5 bg-neutral/15">
              <span className="text-[9px] tracking-[0.18em] uppercase text-muted-foreground">
                Drafts
              </span>
              <p className="font-serif text-3xl mt-1.5 text-amber-600 dark:text-amber-400">
                {metrics.drafts}
              </p>
            </div>
            <div className="border border-border/40 p-5 bg-neutral/15">
              <span className="text-[9px] tracking-[0.18em] uppercase text-muted-foreground">
                Cumulative Views
              </span>
              <p className="font-serif text-3xl mt-1.5 text-sky-600 dark:text-sky-400">
                {metrics.views.toLocaleString()}
              </p>
            </div>
          </div>

          {/* Search Header */}
          <div className="relative max-w-sm">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by title..."
              className="w-full bg-transparent border-b border-border/80 pl-8 py-2 text-sm outline-none focus:border-gold"
            />
            <Search className="absolute left-1 top-2.5 h-4 w-4 text-muted-foreground/60" />
          </div>

          {/* Posts list grid / Table */}
          <div className="border border-border/40 overflow-hidden bg-background">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm border-collapse">
                <thead>
                  <tr className="bg-neutral border-b border-border/40 text-[10px] tracking-widest uppercase text-muted-foreground font-semibold">
                    <th className="p-4 pl-6">Title</th>
                    <th className="p-4">Category</th>
                    <th className="p-4">Status</th>
                    <th className="p-4 text-right">Views</th>
                    <th className="p-4 text-right pr-6">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/20 font-serif">
                  {filteredPosts.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="p-8 text-center text-muted-foreground">
                        No articles added yet. Click "New Story" to write one.
                      </td>
                    </tr>
                  ) : (
                    filteredPosts.map((post) => (
                      <tr key={post.id} className="hover:bg-neutral/10 transition-colors">
                        <td className="p-4 pl-6 font-medium">
                          <div className="flex items-center gap-2">
                            {post.featured && (
                              <span className="text-[8px] uppercase tracking-wider bg-gold/10 text-gold px-1.5 py-0.5 border border-gold/30">
                                Featured
                              </span>
                            )}
                            <span>{post.title}</span>
                          </div>
                        </td>
                        <td className="p-4 text-muted-foreground font-sans text-xs uppercase tracking-wider">
                          {post.category?.name || "Uncategorized"}
                        </td>
                        <td className="p-4 font-sans text-xs">
                          {post.status === "published" ? (
                            <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                              <CheckCircle className="h-3.5 w-3.5" />
                              Published
                            </span>
                          ) : post.status === "scheduled" ? (
                            <span className="inline-flex items-center gap-1 text-sky-600 dark:text-sky-450">
                              <Clock className="h-3.5 w-3.5" />
                              Scheduled
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-muted-foreground">
                              <FileText className="h-3.5 w-3.5" />
                              Draft
                            </span>
                          )}
                        </td>
                        <td className="p-4 text-right font-mono text-xs">{post.views_count || 0}</td>
                        <td className="p-4 text-right pr-6">
                          <div className="flex justify-end gap-2">
                            <Link
                              to="/blogs/$slug"
                              params={{ slug: post.slug }}
                              className="p-2 border border-border/40 hover:border-gold hover:text-gold transition-colors text-muted-foreground"
                            >
                              <Eye className="h-3.5 w-3.5" />
                            </Link>
                            <button
                              onClick={() => handleEdit(post)}
                              className="p-2 border border-border/40 hover:border-gold hover:text-gold transition-colors text-muted-foreground"
                            >
                              <Edit className="h-3.5 w-3.5" />
                            </button>
                            <button
                              onClick={() => handleDelete(post.id)}
                              className="p-2 border border-border/40 hover:border-red-500 hover:text-red-500 transition-colors text-muted-foreground"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ─── Category Quick Creator Modal ─── */}
      {showCatModal && (
        <div className="fixed inset-0 bg-ink/40 backdrop-blur-sm z-[90] flex items-center justify-center p-4">
          <form
            onSubmit={handleCreateCategory}
            className="bg-background border border-border/45 p-6 w-full max-w-sm space-y-4 shadow-luxe animate-fade-up"
          >
            <div className="flex justify-between items-center pb-2 border-b border-border/20">
              <span className="font-serif text-sm">Add Category</span>
              <button type="button" onClick={() => setShowCatModal(false)}>
                <X className="h-4 w-4" />
              </button>
            </div>
            <div>
              <label className="text-[10px] uppercase tracking-wider text-muted-foreground block mb-2 font-semibold">
                Category Name
              </label>
              <input
                type="text"
                required
                value={newCatName}
                onChange={(e) => setNewCatName(e.target.value)}
                className="w-full bg-neutral/40 border border-border/80 px-3 py-2 text-sm outline-none focus:border-gold"
              />
            </div>
            <button
              type="submit"
              className="w-full py-2.5 bg-foreground text-background text-[10px] tracking-widest uppercase hover:bg-gold hover:text-ink transition-colors font-semibold"
            >
              Add Category
            </button>
          </form>
        </div>
      )}

      {/* ─── Tag Quick Creator Modal ─── */}
      {showTagModal && (
        <div className="fixed inset-0 bg-ink/40 backdrop-blur-sm z-[90] flex items-center justify-center p-4">
          <form
            onSubmit={handleCreateTag}
            className="bg-background border border-border/45 p-6 w-full max-w-sm space-y-4 shadow-luxe animate-fade-up"
          >
            <div className="flex justify-between items-center pb-2 border-b border-border/20">
              <span className="font-serif text-sm">Add Tag</span>
              <button type="button" onClick={() => setShowTagModal(false)}>
                <X className="h-4 w-4" />
              </button>
            </div>
            <div>
              <label className="text-[10px] uppercase tracking-wider text-muted-foreground block mb-2 font-semibold">
                Tag Name
              </label>
              <input
                type="text"
                required
                value={newTagName}
                onChange={(e) => setNewTagName(e.target.value)}
                className="w-full bg-neutral/40 border border-border/80 px-3 py-2 text-sm outline-none focus:border-gold"
              />
            </div>
            <button
              type="submit"
              className="w-full py-2.5 bg-foreground text-background text-[10px] tracking-widest uppercase hover:bg-gold hover:text-ink transition-colors font-semibold"
            >
              Add Tag
            </button>
          </form>
        </div>
      )}

      {/* ─── Author Profile Quick Creator Modal ─── */}
      {showAuthModal && (
        <div className="fixed inset-0 bg-ink/40 backdrop-blur-sm z-[90] flex items-center justify-center p-4">
          <form
            onSubmit={handleCreateAuthor}
            className="bg-background border border-border/45 p-6 w-full max-w-sm space-y-4 shadow-luxe animate-fade-up"
          >
            <div className="flex justify-between items-center pb-2 border-b border-border/20">
              <span className="font-serif text-sm">Add Author</span>
              <button type="button" onClick={() => setShowAuthModal(false)}>
                <X className="h-4 w-4" />
              </button>
            </div>
            <div>
              <label className="text-[10px] uppercase tracking-wider text-muted-foreground block mb-2 font-semibold">
                Author Name
              </label>
              <input
                type="text"
                required
                value={newAuthName}
                onChange={(e) => setNewAuthName(e.target.value)}
                className="w-full bg-neutral/40 border border-border/80 px-3 py-2 text-sm outline-none focus:border-gold"
              />
            </div>
            <button
              type="submit"
              className="w-full py-2.5 bg-foreground text-background text-[10px] tracking-widest uppercase hover:bg-gold hover:text-ink transition-colors font-semibold"
            >
              Save Profile
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
