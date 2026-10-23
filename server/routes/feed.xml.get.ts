import { defineEventHandler, setHeader } from "h3";
import { initContainer } from "../container";
import { env } from "../config/env";

export default defineEventHandler(async (event) => {
  const container = await initContainer();
  const { supabase } = container;

  // Query published blog posts from the database
  const { data: posts, error } = await (supabase
    .from("blogs") as any)
    .select("*, author:blog_authors(*), category:blog_categories(*)")
    .eq("status", "published")
    .order("published_at", { ascending: false });

  if (error) {
    throw error;
  }

  const siteUrl = env.publicAppUrl; // Target application URL
  let rssXml = `<?xml version="1.0" encoding="UTF-8" ?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
<channel>
  <title>ANORA Journal</title>
  <link>${siteUrl}/blogs</link>
  <description>Stories from our atelier — craft, material, and the quiet pleasures of dress.</description>
  <language>en-US</language>
  <atom:link href="${siteUrl}/feed.xml" rel="self" type="application/rss+xml" />
`;

  if (posts) {
    posts.forEach((post: any) => {
      const pubDate = new Date(post.published_at || post.created_at).toUTCString();
      const contentDescription = post.excerpt
        ? `<description><![CDATA[${post.excerpt}]]></description>`
        : "";
      rssXml += `  <item>
    <title><![CDATA[${post.title}]]></title>
    <link>${siteUrl}/blogs/${post.slug}</link>
    <guid isPermaLink="true">${siteUrl}/blogs/${post.slug}</guid>
    <pubDate>${pubDate}</pubDate>
    ${contentDescription}
    <category><![CDATA[${post.category?.name || "Editorial"}]]></category>
  </item>
`;
    });
  }

  rssXml += `</channel>
</rss>`;

  setHeader(event, "Content-Type", "application/xml; charset=utf-8");
  return rssXml;
});
