import { createFileRoute } from "@tanstack/react-router";
import { BlogList } from "@/modules/blog";
import { SITE_URL } from "@/lib/config";

export const Route = createFileRoute("/blogs/")({
  head: () => ({
    meta: [
      { title: "Journal | ANORA New York" },
      {
        name: "description",
        content:
          "Stories from the ANORA atelier — craft, material, and the quiet pleasures of dress.",
      },
      { name: "robots", content: "index, follow" },
      { property: "og:title", content: "Journal | ANORA New York" },
      {
        property: "og:description",
        content:
          "Stories from the ANORA atelier — craft, material, and the quiet pleasures of dress.",
      },
      { property: "og:url", content: `${SITE_URL}/blogs` },
      { property: "og:type", content: "website" },
      { property: "og:image", content: `${SITE_URL}/logo.png` },
      { property: "og:site_name", content: "ANORA" },
      { property: "og:locale", content: "en_US" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: "Journal | ANORA New York" },
      {
        name: "twitter:description",
        content:
          "Stories from the ANORA atelier — craft, material, and the quiet pleasures of dress.",
      },
      { name: "twitter:image", content: `${SITE_URL}/logo.png` },
    ],
    links: [{ rel: "canonical", href: `${SITE_URL}/blogs` }],
  }),
  component: BlogList,
});
