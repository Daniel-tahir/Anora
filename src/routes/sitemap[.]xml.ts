import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";

import { supabase } from "@/lib/supabase";
import { SITE_URL } from "@/lib/config";

interface SitemapEntry {
  path: string;
  changefreq?: "always" | "hourly" | "daily" | "weekly" | "monthly" | "yearly" | "never";
  priority?: string;
}

export const Route = createFileRoute("/sitemap.xml")({
  server: {
    handlers: {
      GET: async () => {
        const BASE_URL = SITE_URL;
        const entries: SitemapEntry[] = [
          { path: "/", changefreq: "weekly", priority: "1.0" },
          { path: "/shop", changefreq: "weekly", priority: "0.9" },
          { path: "/shop/clothing", changefreq: "weekly", priority: "0.9" },
          { path: "/shop/jewellery", changefreq: "weekly", priority: "0.9" },
          { path: "/shop/sale", changefreq: "weekly", priority: "0.8" },
          { path: "/blogs", changefreq: "weekly", priority: "0.7" },
          { path: "/faqs", changefreq: "monthly", priority: "0.5" },
          { path: "/returns", changefreq: "monthly", priority: "0.5" },
          { path: "/privacy", changefreq: "monthly", priority: "0.5" },
          { path: "/terms", changefreq: "monthly", priority: "0.5" },
          { path: "/contact", changefreq: "monthly", priority: "0.6" },
        ];

        // Fetch dynamic blog posts from Supabase database
        const { data: posts } = await (supabase.from("blogs") as any)
          .select("slug")
          .eq("status", "published");

        if (posts) {
          posts.forEach((p: { slug: string }) => {
            entries.push({
              path: `/blogs/${p.slug}`,
              changefreq: "weekly",
              priority: "0.6",
            });
          });
        }

        // Fetch dynamic products from Supabase database
        const { data: dbProducts } = await (supabase.from("products") as any)
          .select("slug")
          .eq("is_active", true)
          .eq("status", "active");

        if (dbProducts) {
          dbProducts.forEach((p: { slug: string }) => {
            entries.push({
              path: `/product/${p.slug}`,
              changefreq: "weekly",
              priority: "0.8",
            });
          });
        }

        const urls = entries.map(
          (e) =>
            `  <url>\n    <loc>${BASE_URL}${e.path}</loc>\n    <changefreq>${e.changefreq}</changefreq>\n    <priority>${e.priority}</priority>\n  </url>`,
        );

        const xml = [
          `<?xml version="1.0" encoding="UTF-8"?>`,
          `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">`,
          ...urls,
          `</urlset>`,
        ].join("\n");

        return new Response(xml, {
          headers: {
            "Content-Type": "application/xml",
            "Cache-Control": "public, max-age=3600",
          },
        });
      },
    },
  },
});
