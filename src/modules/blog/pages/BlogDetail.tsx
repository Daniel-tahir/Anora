import React, { useEffect, useState, useMemo } from "react";
import { Link } from "@tanstack/react-router";
import {
  Clock,
  Calendar,
  Share2,
  Copy,
  Twitter,
  Facebook,
  ArrowLeft,
  ArrowRight,
  User,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { BlogService } from "../services/blog.service";
import { RichTextRenderer } from "../components/RichTextRenderer";
import { TableOfContents } from "../components/TableOfContents";
import type { BlogPostWithDetails } from "../types";
import { toast } from "sonner";
import { SITE_URL } from "@/lib/config";

export function BlogDetail({ post }: { post: BlogPostWithDetails }) {
  const blogService = useMemo(() => new BlogService(supabase), []);
  const [relatedPosts, setRelatedPosts] = useState<BlogPostWithDetails[]>([]);
  const [prevPost, setPrevPost] = useState<BlogPostWithDetails | null>(null);
  const [nextPost, setNextPost] = useState<BlogPostWithDetails | null>(null);

  // Increment views and load related/adjacent posts on mount
  useEffect(() => {
    if (!post) return;

    // Increment view count
    blogService.incrementViews(post.id).catch((err) => {
      console.error("Error incrementing views:", err);
    });

    // Load related and adjacent posts
    async function loadExtraContext() {
      try {
        // Query related posts (same category, excluding current post)
        const related = await blogService.getPosts({
          categorySlug: post.category?.slug,
          limit: 3,
        });
        setRelatedPosts(related.filter((p) => p.id !== post.id).slice(0, 2));

        // Get adjacent articles (to build prev/next layout)
        const allPosts = await blogService.getPosts({ status: "published" });
        const currentIndex = allPosts.findIndex((p) => p.id === post.id);

        if (currentIndex > 0) {
          setNextPost(allPosts[currentIndex - 1]); // newer post
        } else {
          setNextPost(null);
        }

        if (currentIndex >= 0 && currentIndex < allPosts.length - 1) {
          setPrevPost(allPosts[currentIndex + 1]); // older post
        } else {
          setPrevPost(null);
        }
      } catch (err) {
        console.error("Error loading adjacent/related posts:", err);
      }
    }

    loadExtraContext();
  }, [post, blogService]);

  const formatDate = (dateStr?: string | null) => {
    if (!dateStr) return "";
    return new Date(dateStr).toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  };

  const handleCopyLink = () => {
    if (typeof window === "undefined") return;
    navigator.clipboard.writeText(window.location.href);
    toast.success("Link copied to clipboard");
  };

  const shareUrl = typeof window !== "undefined" ? encodeURIComponent(window.location.href) : "";
  const shareTitle = encodeURIComponent(post.title);

  // Generate article and breadcrumb schema dynamically
  const jsonLdSchema = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "NewsArticle",
        headline: post.title,
        description: post.excerpt || "",
        image: post.cover_image || "",
        datePublished: post.published_at || post.created_at,
        dateModified: post.last_updated_at || post.created_at,
        author: {
          "@type": "Person",
          name: post.author?.name || "ANORA Staff",
        },
        publisher: {
          "@type": "Organization",
          name: "ANORA",
          logo: {
            "@type": "ImageObject",
            url: `${SITE_URL}/logo.png`,
          },
        },
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          {
            "@type": "ListItem",
            position: 1,
            name: "Home",
            item: `${SITE_URL}`,
          },
          {
            "@type": "ListItem",
            position: 2,
            name: "Journal",
            item: `${SITE_URL}/blogs`,
          },
          {
            "@type": "ListItem",
            position: 3,
            name: post.title,
            item: `${SITE_URL}/blogs/${post.slug}`,
          },
        ],
      },
    ],
  };

  return (
    <>
      {/* Schema Injection */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLdSchema) }}
      />

      <article className="pb-24">
        {/* Hero Section */}
        <header className="px-5 lg:px-10 pt-16 pb-12 text-center max-w-4xl mx-auto">
          <Link
            to="/blogs"
            className="inline-flex items-center gap-2 text-[10px] tracking-[0.25em] uppercase text-muted-foreground hover:text-gold transition-colors mb-6"
          >
            <ArrowLeft className="h-3 w-3" />
            Back to Journal
          </Link>

          <div className="flex justify-center items-center gap-3 text-[10px] tracking-[0.2em] uppercase text-gold mb-5">
            <span>{post.category?.name || "Editorial"}</span>
            <span>·</span>
            <span>{formatDate(post.published_at)}</span>
          </div>

          <h1 className="font-serif text-4xl sm:text-5xl md:text-6xl font-light text-foreground leading-[1.1] tracking-tight">
            {post.title}
          </h1>

          <div className="mt-8 flex justify-center items-center gap-6 text-xs text-muted-foreground/80">
            <div className="flex items-center gap-2">
              {post.author?.image_url ? (
                <img
                  src={post.author.image_url}
                  alt={post.author.name}
                  className="h-6 w-6 rounded-full object-cover border border-border/50"
                />
              ) : (
                <User className="h-4 w-4" />
              )}
              <span className="font-medium text-foreground">
                {(() => {
                  const name = post.author?.name || "ANORA Atelier";
                  if (name.includes("ANORA")) {
                    const parts = name.split("ANORA");
                    return (
                      <>
                        {parts[0]}
                        <span className="font-brand">ANORA</span>
                        {parts[1]}
                      </>
                    );
                  }
                  return name;
                })()}
              </span>
            </div>
            <span>·</span>
            <div className="flex items-center gap-1.5">
              <Clock className="h-3.5 w-3.5" />
              <span>{post.reading_time} min read</span>
            </div>
          </div>
        </header>

        {/* Hero Cover Image */}
        <div className="px-5 lg:px-10 max-w-5xl mx-auto mb-16">
          <div className="aspect-[16/9] overflow-hidden bg-neutral border border-border/20">
            <img
              src={
                post.cover_image ||
                "https://images.unsplash.com/photo-1611591437281-460bfbe1220a?q=80&w=1000"
              }
              alt={post.title}
              className="w-full h-full object-cover"
            />
          </div>
        </div>

        {/* Content Layout with Table of Contents */}
        <div className="max-w-7xl mx-auto px-5 lg:px-10 grid lg:grid-cols-[1fr_260px] gap-12 lg:gap-16">
          {/* Main Body */}
          <div className="max-w-2xl mx-auto lg:mx-0 w-full">
            <div className="rich-content">
              <RichTextRenderer content={post.content} />
            </div>

            {/* Tags footer */}
            {post.tags && post.tags.length > 0 && (
              <div className="mt-12 flex flex-wrap gap-2 border-t border-border/30 pt-6">
                {post.tags.map((tag) => (
                  <span
                    key={tag.id}
                    className="text-[9px] tracking-widest uppercase border border-border/80 text-muted-foreground bg-neutral/10 px-3 py-1.5 rounded-full"
                  >
                    #{tag.name}
                  </span>
                ))}
              </div>
            )}

            {/* Share & Controls */}
            <div className="mt-8 flex items-center justify-between border-y border-border/30 py-6 mb-16">
              <span className="text-[10px] tracking-[0.2em] uppercase text-muted-foreground">
                Share this Dispatch
              </span>
              <div className="flex items-center gap-3">
                <button
                  onClick={handleCopyLink}
                  aria-label="Copy Link"
                  className="h-8 w-8 grid place-items-center border border-border/60 hover:border-gold hover:text-gold transition-colors rounded-full"
                >
                  <Copy className="h-3.5 w-3.5" />
                </button>
                <a
                  href={`https://twitter.com/intent/tweet?url=${shareUrl}&text=${shareTitle}`}
                  target="_blank"
                  rel="noreferrer"
                  aria-label="Share on Twitter"
                  className="h-8 w-8 grid place-items-center border border-border/60 hover:border-gold hover:text-gold transition-colors rounded-full"
                >
                  <Twitter className="h-3.5 w-3.5" />
                </a>
                <a
                  href={`https://www.facebook.com/sharer/sharer.php?u=${shareUrl}`}
                  target="_blank"
                  rel="noreferrer"
                  aria-label="Share on Facebook"
                  className="h-8 w-8 grid place-items-center border border-border/60 hover:border-gold hover:text-gold transition-colors rounded-full"
                >
                  <Facebook className="h-3.5 w-3.5" />
                </a>
              </div>
            </div>

            {/* Adjacent Navigation */}
            {(prevPost || nextPost) && (
              <div className="grid sm:grid-cols-2 gap-6 border-b border-border/30 pb-12 mb-16">
                {prevPost ? (
                  <Link
                    to="/blogs/$slug"
                    params={{ slug: prevPost.slug }}
                    className="group border border-border/40 p-6 flex flex-col justify-between hover:border-gold transition-colors rounded-[1px] text-left"
                  >
                    <span className="text-[9px] tracking-[0.2em] uppercase text-muted-foreground flex items-center gap-1 mb-2">
                      <ArrowLeft className="h-3 w-3" />
                      Previous Story
                    </span>
                    <span className="font-serif text-base text-foreground group-hover:text-gold transition-colors line-clamp-2">
                      {prevPost.title}
                    </span>
                  </Link>
                ) : (
                  <div className="hidden sm:block" />
                )}

                {nextPost && (
                  <Link
                    to="/blogs/$slug"
                    params={{ slug: nextPost.slug }}
                    className="group border border-border/40 p-6 flex flex-col justify-between hover:border-gold transition-colors rounded-[1px] text-right"
                  >
                    <span className="text-[9px] tracking-[0.2em] uppercase text-muted-foreground flex items-center justify-end gap-1 mb-2">
                      Next Story
                      <ArrowRight className="h-3 w-3" />
                    </span>
                    <span className="font-serif text-base text-foreground group-hover:text-gold transition-colors line-clamp-2">
                      {nextPost.title}
                    </span>
                  </Link>
                )}
              </div>
            )}
          </div>

          {/* Sticky Table of Contents Sidebar */}
          <aside className="hidden lg:block">
            <div className="sticky top-28 space-y-8 max-w-[240px]">
              <TableOfContents content={post.content} />
            </div>
          </aside>
        </div>

        {/* Related Articles Section */}
        {relatedPosts.length > 0 && (
          <section className="px-5 lg:px-10 max-w-5xl mx-auto pt-10 border-t border-border/30">
            <p className="eyebrow mb-8 text-center text-gold">Continue Reading</p>
            <div className="grid md:grid-cols-2 gap-8">
              {relatedPosts.map((b) => (
                <Link
                  key={b.slug}
                  to="/blogs/$slug"
                  params={{ slug: b.slug }}
                  className="group flex gap-4 items-start"
                >
                  <div className="overflow-hidden w-28 sm:w-36 aspect-[4/3] bg-neutral shrink-0 border border-border/20">
                    <img
                      src={
                        b.cover_image ||
                        "https://images.unsplash.com/photo-1558603668-6570496b66f8?q=80&w=1000"
                      }
                      alt={b.title}
                      loading="lazy"
                      className="h-full w-full object-cover transition-transform duration-[1200ms] group-hover:scale-103"
                    />
                  </div>
                  <div>
                    <span className="text-[9px] tracking-widest uppercase text-gold">
                      {b.category?.name}
                    </span>
                    <h3 className="font-serif text-lg leading-tight mt-1.5 group-hover:text-gold transition-colors line-clamp-2">
                      {b.title}
                    </h3>
                    <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{b.excerpt}</p>
                  </div>
                </Link>
              ))}
            </div>
          </section>
        )}
      </article>
    </>
  );
}
