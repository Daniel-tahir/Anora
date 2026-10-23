import { createFileRoute } from "@tanstack/react-router";
import { SITE_URL } from "@/lib/config";

export const Route = createFileRoute("/robots.txt")({
  server: {
    handlers: {
      GET: async () => {
        const content = [
          "User-agent: *",
          "Allow: /",
          "",
          "Disallow: /admin",
          "Disallow: /account",
          "Disallow: /checkout",
          "Disallow: /cart",
          "Disallow: /login",
          "Disallow: /register",
          "Disallow: /forgot-password",
          "",
          `Sitemap: ${SITE_URL}/sitemap.xml`,
        ].join("\n");

        return new Response(content, {
          headers: {
            "Content-Type": "text/plain",
            "Cache-Control": "public, max-age=86400",
          },
        });
      },
    },
  },
});
