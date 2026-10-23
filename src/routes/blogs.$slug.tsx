import { createFileRoute, Link } from "@tanstack/react-router";
import { BlogDetail } from "@/modules/blog";
import type { BlogPostWithDetails } from "@/modules/blog";
import { useBlogPostQuery } from "@/lib/products-query";
import { BlogService } from "@/modules/blog/services/blog.service";
import { supabase } from "@/lib/supabase";
import { SITE_URL } from "@/lib/config";

export const Route = createFileRoute("/blogs/$slug")({
  loader: async ({ params }) => {
    try {
      const service = new BlogService(supabase);
      const post = await service.getPostBySlug(params.slug);
      return post;
    } catch {
      return null;
    }
  },
  head: ({ params, loaderData }: { params: { slug: string }; loaderData?: unknown }) => {
    const post = loaderData as BlogPostWithDetails | null | undefined;
    const title = post ? `${post.title} | ANORA New York` : "Journal | ANORA New York";
    const desc = post
      ? post.excerpt || "Stories from the ANORA atelier"
      : "Stories from the ANORA atelier";
    const coverImage = post ? post.cover_image || `${SITE_URL}/logo.png` : `${SITE_URL}/logo.png`;
    return {
      meta: [
        { title },
        { name: "description", content: desc },
        { name: "robots", content: "index, follow" },
        { property: "og:title", content: title },
        { property: "og:description", content: desc },
        { property: "og:url", content: `${SITE_URL}/blogs/${params.slug}` },
        { property: "og:type", content: "article" },
        { property: "og:image", content: coverImage },
        { property: "og:site_name", content: "ANORA" },
        { property: "og:locale", content: "en_US" },
        { name: "twitter:card", content: "summary_large_image" },
        { name: "twitter:title", content: title },
        { name: "twitter:description", content: desc },
        { name: "twitter:image", content: coverImage },
      ],
      links: [{ rel: "canonical", href: `${SITE_URL}/blogs/${params.slug}` }],
    };
  },
  component: BlogPostWrapper,
});

function BlogPostWrapper() {
  const { slug } = Route.useParams();
  const { data: post, isLoading, error } = useBlogPostQuery(slug);

  if (isLoading) {
    return <div className="min-h-screen bg-background" />;
  }

  if (error || !post) {
    return (
      <div className="py-32 text-center font-serif">
        <h1 className="text-3xl font-light">Dispatch not found</h1>
        <Link
          to="/blogs"
          className="mt-6 inline-block text-[10px] tracking-[0.25em] uppercase hover:text-gold transition-colors"
        >
          Back to Journal
        </Link>
      </div>
    );
  }

  const schema = {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: post.title,
    description: post.excerpt,
    image: post.cover_image || `${SITE_URL}/logo.png`,
    datePublished: post.published_at || post.created_at,
    dateModified: post.last_updated_at || post.published_at || post.created_at,
    author: {
      "@type": "Person",
      name: post.author?.name || "ANORA Artisan",
    },
    publisher: {
      "@type": "Organization",
      name: "ANORA",
      logo: {
        "@type": "ImageObject",
        url: `${SITE_URL}/favicon.ico`,
      },
    },
    mainEntityOfPage: {
      "@type": "WebPage",
      "@id": `${SITE_URL}/blogs/${slug}`,
    },
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
      />
      <BlogDetail post={post} />
    </>
  );
}
