export interface BlogAuthor {
  id: string;
  name: string;
  image_url?: string | null;
  bio?: string | null;
  created_at?: string;
}

export interface BlogCategory {
  id: string;
  name: string;
  slug: string;
  created_at?: string;
}

export interface BlogTag {
  id: string;
  name: string;
  slug: string;
  created_at?: string;
}

export interface BlogPost {
  id: string;
  title: string;
  slug: string;
  content: string;
  excerpt?: string | null;
  cover_image?: string | null;
  gallery_images?: string[] | null;
  author_id?: string | null;
  category_id?: string | null;
  reading_time: number;
  status: "draft" | "published" | "scheduled";
  featured: boolean;
  published_at?: string | null;
  last_updated_at: string;
  views_count: number;
  created_at: string;
  meta_title?: string | null;
  meta_description?: string | null;
  meta_keywords?: string | null;
  canonical_url?: string | null;
}

export interface BlogPostWithDetails extends BlogPost {
  author?: BlogAuthor | null;
  category?: BlogCategory | null;
  tags?: BlogTag[] | null;
}

export interface BlogComment {
  id: string;
  blog_id: string;
  author_name: string;
  author_email: string;
  content: string;
  approved: boolean;
  created_at: string;
}
