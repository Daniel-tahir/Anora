import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { blogPosts } from "@/lib/products";

export const Route = createFileRoute("/blogs/$slug")({
  loader: ({ params }) => {
    const post = blogPosts.find((b) => b.slug === params.slug);
    if (!post) throw notFound();
    return { post };
  },
  head: ({ loaderData }) => {
    const p = loaderData?.post;
    return {
      meta: [
        { title: p ? `${p.title} — ANORA Journal` : "Journal — ANORA" },
        { name: "description", content: p?.excerpt ?? "" },
        { property: "og:title", content: p ? `${p.title} — ANORA` : "ANORA Journal" },
        { property: "og:description", content: p?.excerpt ?? "" },
        { property: "og:image", content: p?.cover ?? "" },
      ],
    };
  },
  component: BlogPost,
  notFoundComponent: () => (
    <div className="py-32 text-center">
      <h1 className="font-serif text-4xl">Story not found</h1>
      <Link
        to="/blogs"
        className="mt-6 inline-block text-[11px] tracking-[0.32em] uppercase hover-underline"
      >
        Back to Journal
      </Link>
    </div>
  ),
});

function BlogPost() {
  const { post } = Route.useLoaderData();
  const recent = blogPosts.filter((b) => b.slug !== post.slug).slice(0, 2);
  return (
    <article className="pb-24">
      <header className="px-5 lg:px-10 pt-16 pb-12 text-center max-w-3xl mx-auto">
        <span className="eyebrow text-gold">{post.category}</span>
        <h1 className="font-serif text-4xl md:text-6xl mt-5 leading-[1.05]">{post.title}</h1>
        <p className="mt-6 text-sm text-muted-foreground">
          {post.date} · {post.readTime}
        </p>
      </header>
      <img
        src={post.cover}
        alt={post.title}
        className="w-full max-w-5xl mx-auto aspect-[16/9] object-cover"
      />
      <div className="max-w-2xl mx-auto px-6 py-14 space-y-6 text-[17px] leading-[1.85] text-foreground/90 font-serif">
        {post.content.map((p, i) => (
          <p key={i}>{p}</p>
        ))}
      </div>

      <section className="px-5 lg:px-10 max-w-5xl mx-auto pt-10 border-t border-border">
        <p className="eyebrow mb-6 text-center">Continue Reading</p>
        <div className="grid md:grid-cols-2 gap-10">
          {recent.map((b) => (
            <Link key={b.slug} to="/blogs/$slug" params={{ slug: b.slug }} className="group">
              <div className="overflow-hidden aspect-[4/3] bg-neutral">
                <img
                  src={b.cover}
                  alt={b.title}
                  loading="lazy"
                  className="h-full w-full object-cover transition-transform duration-[1200ms] group-hover:scale-105"
                />
              </div>
              <h3 className="font-serif text-2xl mt-4 group-hover:text-gold transition-colors">
                {b.title}
              </h3>
              <p className="text-sm text-muted-foreground mt-2">{b.excerpt}</p>
            </Link>
          ))}
        </div>
      </section>
    </article>
  );
}
