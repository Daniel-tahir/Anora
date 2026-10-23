import React, { useEffect, useState, useMemo } from "react";
import { Link } from "@tanstack/react-router";
import { Search, BookOpen, Calendar, Clock, ArrowRight, User } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { BlogService } from "../services/blog.service";
import type { BlogPostWithDetails, BlogCategory } from "../types";

export function BlogList() {
  const blogService = useMemo(() => new BlogService(supabase), []);

  const [posts, setPosts] = useState<BlogPostWithDetails[]>([]);
  const [categories, setCategories] = useState<BlogCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("All");

  // Pagination states
  const [currentPage, setCurrentPage] = useState(1);
  const postsPerPage = 6;

  useEffect(() => {
    async function loadData() {
      try {
        setLoading(true);
        const [allPosts, allCats] = await Promise.all([
          blogService.getPosts({ status: "published" }),
          blogService.getCategories(),
        ]);
        setPosts(allPosts);
        setCategories(allCats);
      } catch (err) {
        console.error("Error loading blog posts:", err);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, [blogService]);

  // Filter posts based on category and search query
  const filteredPosts = useMemo(() => {
    return posts.filter((post) => {
      const matchesCategory =
        selectedCategory === "All" || post.category?.name === selectedCategory;
      const matchesSearch =
        post.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        post.excerpt?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        post.content.toLowerCase().includes(searchQuery.toLowerCase());
      return matchesCategory && matchesSearch;
    });
  }, [posts, selectedCategory, searchQuery]);

  // Paginated posts
  const paginatedPosts = useMemo(() => {
    const start = (currentPage - 1) * postsPerPage;
    return filteredPosts.slice(start, start + postsPerPage);
  }, [filteredPosts, currentPage]);

  const totalPages = Math.ceil(filteredPosts.length / postsPerPage);

  // Separate the featured post (takes top spotlight) if it exists
  const featuredPost = useMemo(() => {
    if (selectedCategory !== "All" || searchQuery !== "") return null;
    return posts.find((p) => p.featured) || posts[0] || null;
  }, [posts, selectedCategory, searchQuery]);

  // List of posts excluding the featured post in top spotlight
  const listPosts = useMemo(() => {
    if (featuredPost) {
      return paginatedPosts.filter((p) => p.id !== featuredPost.id);
    }
    return paginatedPosts;
  }, [paginatedPosts, featuredPost]);

  const formatDate = (dateStr?: string | null) => {
    if (!dateStr) return "";
    return new Date(dateStr).toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  };

  return (
    <div className="px-5 lg:px-10 py-16 max-w-7xl mx-auto min-h-screen">
      {/* Breadcrumbs */}
      <nav aria-label="Breadcrumb" className="mb-10 text-xs tracking-widest uppercase text-muted-foreground/60">
        <ol className="flex items-center gap-2">
          <li>
            <Link to="/" className="hover:text-gold transition-colors">
              Home
            </Link>
          </li>
          <li className="select-none">/</li>
          <li className="text-foreground font-semibold">Journal</li>
        </ol>
      </nav>

      {/* Header */}
      <div className="text-center mb-16">
        <span className="eyebrow text-gold">The Journal</span>
        <h1 className="font-serif text-5xl md:text-6xl mt-4 tracking-tight leading-tight">Quiet Dispatches</h1>
        <p className="mt-5 text-muted-foreground max-w-xl mx-auto font-serif text-base leading-relaxed">
          Stories from our atelier — explorations of timeless craft, material histories, and the quiet beauty of dress.
        </p>
      </div>

      {/* Search & Filter Bar */}
      <div className="flex flex-col md:flex-row items-center justify-between gap-6 border-b border-border/40 pb-8 mb-16">
        {/* Category Tabs */}
        <div className="flex flex-wrap gap-2 overflow-x-auto w-full md:w-auto scrollbar-hide py-1">
          <button
            onClick={() => {
              setSelectedCategory("All");
              setCurrentPage(1);
            }}
            className={`text-[10px] tracking-[0.25em] uppercase px-4 py-2 border transition-all duration-300 rounded-[1px] ${
              selectedCategory === "All"
                ? "border-foreground bg-foreground text-background font-semibold"
                : "border-border/60 text-muted-foreground hover:border-foreground hover:text-foreground"
            }`}
          >
            All Stories
          </button>
          {categories.map((cat) => (
            <button
              key={cat.id}
              onClick={() => {
                setSelectedCategory(cat.name);
                setCurrentPage(1);
              }}
              className={`text-[10px] tracking-[0.25em] uppercase px-4 py-2 border transition-all duration-300 rounded-[1px] ${
                selectedCategory === cat.name
                  ? "border-foreground bg-foreground text-background font-semibold"
                  : "border-border/60 text-muted-foreground hover:border-foreground hover:text-foreground"
              }`}
            >
              {cat.name}
            </button>
          ))}
        </div>

        {/* Search Input */}
        <div className="relative w-full md:w-80">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setCurrentPage(1);
            }}
            placeholder="Search our stories..."
            className="w-full bg-transparent border-b border-border/80 px-2 py-2 pl-9 text-sm outline-none focus:border-gold transition-all placeholder:text-muted-foreground/50"
          />
          <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground/60" />
        </div>
      </div>

      {loading ? (
        <div className="py-24 text-center">
          <div className="inline-block h-8 w-8 animate-spin rounded-full border-2 border-solid border-gold border-r-transparent align-[-0.125em] motion-reduce:animate-[spin_1.5s_linear_infinite]" />
          <p className="mt-4 font-serif text-sm text-muted-foreground tracking-widest">Loading dispatches...</p>
        </div>
      ) : filteredPosts.length === 0 ? (
        <div className="py-24 text-center border border-dashed border-border/40 bg-neutral/20">
          <BookOpen className="h-8 w-8 mx-auto text-muted-foreground/40 mb-4" />
          <p className="font-serif text-lg text-foreground/80">No stories found</p>
          <p className="text-sm text-muted-foreground mt-2">Try adjusting your keywords or category filters.</p>
        </div>
      ) : (
        <div className="space-y-16">
          {/* Featured Post Spotlight */}
          {featuredPost && (
            <div className="group border border-border/30 bg-neutral/10 overflow-hidden grid lg:grid-cols-[1.2fr_1fr] gap-0">
              <Link
                to="/blogs/$slug"
                params={{ slug: featuredPost.slug }}
                className="block overflow-hidden aspect-[16/10] lg:aspect-auto h-full"
              >
                <img
                  src={featuredPost.cover_image || "https://images.unsplash.com/photo-1611591437281-460bfbe1220a?q=80&w=1000"}
                  alt={featuredPost.title}
                  loading="lazy"
                  className="h-full w-full object-cover transition-transform duration-[1200ms] group-hover:scale-102"
                />
              </Link>
              <div className="p-8 lg:p-14 flex flex-col justify-between">
                <div>
                  <div className="flex items-center gap-4 text-[10px] tracking-[0.2em] uppercase text-gold font-semibold mb-6">
                    <span>{featuredPost.category?.name || "Editorial"}</span>
                    <span>·</span>
                    <span className="text-muted-foreground/80">Featured Story</span>
                  </div>
                  <Link
                    to="/blogs/$slug"
                    params={{ slug: featuredPost.slug }}
                    className="block hover:text-gold transition-colors duration-300"
                  >
                    <h2 className="font-serif text-3xl lg:text-4xl leading-tight mb-5">
                      {featuredPost.title}
                    </h2>
                  </Link>
                  <p className="text-sm sm:text-base text-muted-foreground/90 font-serif leading-relaxed mb-6">
                    {featuredPost.excerpt}
                  </p>
                </div>
                <div>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground border-t border-border/40 pt-6 mb-6">
                    {featuredPost.author?.image_url ? (
                      <img
                        src={featuredPost.author.image_url}
                        alt={featuredPost.author.name}
                        className="h-7 w-7 rounded-full object-cover border border-border"
                      />
                    ) : (
                      <User className="h-4 w-4" />
                    )}
                    <span>{featuredPost.author?.name || "ANORA Staff"}</span>
                    <span>·</span>
                    <Clock className="h-3.5 w-3.5" />
                    <span>{featuredPost.reading_time} min read</span>
                  </div>
                  <Link
                    to="/blogs/$slug"
                    params={{ slug: featuredPost.slug }}
                    className="inline-flex items-center gap-2 text-[10px] tracking-[0.3em] uppercase text-foreground hover:text-gold group/btn transition-colors"
                  >
                    Read Story
                    <ArrowRight className="h-3.5 w-3.5 transition-transform duration-300 group-hover/btn:translate-x-1" />
                  </Link>
                </div>
              </div>
            </div>
          )}

          {/* Grid List */}
          {listPosts.length > 0 && (
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-x-8 gap-y-14">
              {listPosts.map((post) => (
                <article key={post.id} className="group flex flex-col justify-between h-full">
                  <div>
                    <Link
                      to="/blogs/$slug"
                      params={{ slug: post.slug }}
                      className="block overflow-hidden aspect-[4/3] bg-neutral border border-border/30"
                    >
                      <img
                        src={post.cover_image || "https://images.unsplash.com/photo-1558603668-6570496b66f8?q=80&w=1000"}
                        alt={post.title}
                        loading="lazy"
                        className="h-full w-full object-cover transition-transform duration-[1200ms] group-hover:scale-103"
                      />
                    </Link>
                    <div className="mt-5 flex items-center gap-3 text-[10px] tracking-[0.2em] uppercase text-gold">
                      <span>{post.category?.name || "Dispatch"}</span>
                      <span>·</span>
                      <span className="text-muted-foreground/80 font-sans">{formatDate(post.published_at)}</span>
                    </div>
                    <Link
                      to="/blogs/$slug"
                      params={{ slug: post.slug }}
                      className="block mt-3 hover:text-gold transition-colors duration-300"
                    >
                      <h3 className="font-serif text-2xl leading-snug">{post.title}</h3>
                    </Link>
                    <p className="text-sm text-muted-foreground mt-3 font-serif leading-relaxed line-clamp-3">
                      {post.excerpt}
                    </p>
                  </div>
                  <div className="mt-6 pt-4 border-t border-border/30 flex items-center justify-between">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Clock className="h-3.5 w-3.5" />
                      <span>{post.reading_time} min read</span>
                    </div>
                    <Link
                      to="/blogs/$slug"
                      params={{ slug: post.slug }}
                      className="text-[10px] tracking-[0.3em] uppercase hover:text-gold transition-colors inline-flex items-center gap-1.5"
                    >
                      Read
                      <ArrowRight className="h-3 w-3" />
                    </Link>
                  </div>
                </article>
              ))}
            </div>
          )}

          {/* Pagination Indicators */}
          {totalPages > 1 && (
            <div className="flex justify-center items-center gap-2 pt-10 border-t border-border/30">
              <button
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="px-4 py-2 border border-border text-xs tracking-widest uppercase disabled:opacity-40 disabled:cursor-not-allowed hover:bg-neutral transition-colors"
              >
                Previous
              </button>
              <span className="text-xs tracking-widest font-serif mx-4">
                Page {currentPage} of {totalPages}
              </span>
              <button
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                className="px-4 py-2 border border-border text-xs tracking-widest uppercase disabled:opacity-40 disabled:cursor-not-allowed hover:bg-neutral transition-colors"
              >
                Next
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
