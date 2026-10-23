/**
 * Global application configuration.
 */

// Helper to sanitize and normalize the site URL.
const getSiteUrl = (): string => {
  // Use VITE_PUBLIC_APP_URL or PUBLIC_APP_URL
  let url = import.meta.env.VITE_PUBLIC_APP_URL || import.meta.env.PUBLIC_APP_URL;
  
  // Fallback to production URL
  if (!url) {
    url = "https://anora.com";
  }

  // Remove trailing slashes to prevent double slashes (e.g. https://anora.com//shop)
  return url.replace(/\/+$/, "");
};

export const SITE_URL = getSiteUrl();

/**
 * Build a canonical absolute URL for a given path.
 * Ensures no double slashes.
 */
export const getAbsoluteUrl = (path: string): string => {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${SITE_URL}${normalizedPath}`;
};
