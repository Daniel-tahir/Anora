import type { SupabaseClient } from "@supabase/supabase-js";
import type { BlogPost, BlogPostWithDetails, BlogCategory, BlogTag, BlogAuthor, BlogComment } from "../types";

export class BlogService {
  private supabase: SupabaseClient;

  constructor(supabaseClient: SupabaseClient) {
    this.supabase = supabaseClient;
  }

  // 1. Fetch posts with filters
  async getPosts(options: {
    search?: string;
    categorySlug?: string;
    tagSlug?: string;
    status?: "draft" | "published" | "scheduled";
    limit?: number;
    offset?: number;
    isFeatured?: boolean;
  } = {}): Promise<BlogPostWithDetails[]> {
    const { search, categorySlug, tagSlug, status, limit, offset, isFeatured } = options;

    let query = this.supabase
      .from("blogs")
      .select(`
        *,
        author:blog_authors(*),
        category:blog_categories(*),
        tag_relations:blog_tag_relation(
          tag:blog_tags(*)
        )
      `);

    // Status filter
    if (status) {
      query = query.eq("status", status);
    } else {
      // Default public view: only show published and not future scheduled
      query = query.eq("status", "published");
    }

    // Featured filter
    if (isFeatured !== undefined) {
      query = query.eq("featured", isFeatured);
    }

    // Category filter
    if (categorySlug) {
      const { data: cat } = await this.supabase
        .from("blog_categories")
        .select("id")
        .eq("slug", categorySlug)
        .maybeSingle();
      if (cat) {
        query = query.eq("category_id", cat.id);
      } else {
        return [];
      }
    }

    // Tag filter
    if (tagSlug) {
      const { data: tag } = await this.supabase
        .from("blog_tags")
        .select("id")
        .eq("slug", tagSlug)
        .maybeSingle();
      if (tag) {
        const { data: relations } = await this.supabase
          .from("blog_tag_relation")
          .select("blog_id")
          .eq("tag_id", tag.id);
        const blogIds = relations?.map((r: any) => r.blog_id) || [];
        if (blogIds.length > 0) {
          query = query.in("id", blogIds);
        } else {
          return [];
        }
      } else {
        return [];
      }
    }

    // Text search
    if (search) {
      // Search title, content, or excerpt
      query = query.or(`title.ilike.%${search}%,content.ilike.%${search}%,excerpt.ilike.%${search}%`);
    }

    // Order by publish date
    query = query.order("published_at", { ascending: false, nullsFirst: false });

    // Pagination
    if (limit) {
      query = query.limit(limit);
    }
    if (offset) {
      query = query.range(offset, offset + (limit || 10) - 1);
    }

    const { data, error } = await query;
    if (error) throw error;

    return (data || []).map((post: any) => {
      const tags = post.tag_relations
        ?.map((r: any) => r.tag)
        .filter(Boolean) || [];
      const updatedPost = { ...post, tags };
      delete updatedPost.tag_relations;
      return updatedPost as BlogPostWithDetails;
    });
  }

  // 2. Fetch single post by slug
  async getPostBySlug(slug: string): Promise<BlogPostWithDetails | null> {
    const { data, error } = await this.supabase
      .from("blogs")
      .select(`
        *,
        author:blog_authors(*),
        category:blog_categories(*),
        tag_relations:blog_tag_relation(
          tag:blog_tags(*)
        )
      `)
      .eq("slug", slug)
      .maybeSingle();

    if (error) throw error;
    if (!data) return null;

    const tags = data.tag_relations?.map((r: any) => r.tag).filter(Boolean) || [];
    const updatedPost = { ...data, tags };
    delete updatedPost.tag_relations;
    return updatedPost as BlogPostWithDetails;
  }

  // 3. Increment views
  async incrementViews(postId: string): Promise<void> {
    // Increment local counter inside db column
    const { data: current } = await this.supabase
      .from("blogs")
      .select("views_count")
      .eq("id", postId)
      .single();

    if (current) {
      await this.supabase
        .from("blogs")
        .update({ views_count: (current.views_count || 0) + 1 })
        .eq("id", postId);
    }

    // Also log to detailed views table
    await this.supabase.from("blog_views").insert({ blog_id: postId });
  }

  // 4. Categories CRUD
  async getCategories(): Promise<BlogCategory[]> {
    const { data, error } = await this.supabase
      .from("blog_categories")
      .select("*")
      .order("name", { ascending: true });
    if (error) throw error;
    return data || [];
  }

  async createCategory(name: string, slug: string): Promise<BlogCategory> {
    const { data, error } = await this.supabase
      .from("blog_categories")
      .insert({ name, slug })
      .select()
      .single();
    if (error) throw error;
    return data;
  }

  // 5. Tags CRUD
  async getTags(): Promise<BlogTag[]> {
    const { data, error } = await this.supabase
      .from("blog_tags")
      .select("*")
      .order("name", { ascending: true });
    if (error) throw error;
    return data || [];
  }

  async createTag(name: string, slug: string): Promise<BlogTag> {
    const { data, error } = await this.supabase
      .from("blog_tags")
      .insert({ name, slug })
      .select()
      .single();
    if (error) throw error;
    return data;
  }

  // 6. Authors CRUD
  async getAuthors(): Promise<BlogAuthor[]> {
    const { data, error } = await this.supabase
      .from("blog_authors")
      .select("*")
      .order("name", { ascending: true });
    if (error) throw error;
    return data || [];
  }

  async createAuthor(name: string, image_url?: string, bio?: string): Promise<BlogAuthor> {
    const { data, error } = await this.supabase
      .from("blog_authors")
      .insert({ name, image_url, bio })
      .select()
      .single();
    if (error) throw error;
    return data;
  }

  // 7. Blog CRUD (Write operations)
  async createPost(post: Partial<BlogPost>, tagIds: string[] = []): Promise<BlogPost> {
    const { data: createdPost, error: postError } = await this.supabase
      .from("blogs")
      .insert({
        title: post.title,
        slug: post.slug,
        content: post.content,
        excerpt: post.excerpt,
        cover_image: post.cover_image,
        gallery_images: post.gallery_images || [],
        author_id: post.author_id,
        category_id: post.category_id,
        reading_time: post.reading_time || 1,
        status: post.status || "draft",
        featured: post.featured || false,
        published_at: post.status === "published" ? (post.published_at || new Date().toISOString()) : post.published_at,
        meta_title: post.meta_title,
        meta_description: post.meta_description,
        meta_keywords: post.meta_keywords,
        canonical_url: post.canonical_url,
      })
      .select()
      .single();

    if (postError) throw postError;

    if (tagIds.length > 0 && createdPost) {
      const relations = tagIds.map((tagId) => ({
        blog_id: createdPost.id,
        tag_id: tagId,
      }));
      const { error: relError } = await this.supabase
        .from("blog_tag_relation")
        .insert(relations);
      if (relError) throw relError;
    }

    return createdPost;
  }

  async updatePost(id: string, post: Partial<BlogPost>, tagIds?: string[]): Promise<BlogPost> {
    const updateData: any = {
      title: post.title,
      slug: post.slug,
      content: post.content,
      excerpt: post.excerpt,
      cover_image: post.cover_image,
      gallery_images: post.gallery_images,
      author_id: post.author_id,
      category_id: post.category_id,
      reading_time: post.reading_time,
      status: post.status,
      featured: post.featured,
      published_at: post.status === "published" ? (post.published_at || new Date().toISOString()) : post.published_at,
      last_updated_at: new Date().toISOString(),
      meta_title: post.meta_title,
      meta_description: post.meta_description,
      meta_keywords: post.meta_keywords,
      canonical_url: post.canonical_url,
    };

    // Filter out undefined keys
    Object.keys(updateData).forEach((key) => {
      if (updateData[key] === undefined) {
        delete updateData[key];
      }
    });

    const { data: updatedPost, error: postError } = await this.supabase
      .from("blogs")
      .update(updateData)
      .eq("id", id)
      .select()
      .single();

    if (postError) throw postError;

    if (tagIds !== undefined) {
      // Clear current relationships
      const { error: clearError } = await this.supabase
        .from("blog_tag_relation")
        .delete()
        .eq("blog_id", id);
      if (clearError) throw clearError;

      // Re-insert tags
      if (tagIds.length > 0) {
        const relations = tagIds.map((tagId) => ({
          blog_id: id,
          tag_id: tagId,
        }));
        const { error: relError } = await this.supabase
          .from("blog_tag_relation")
          .insert(relations);
        if (relError) throw relError;
      }
    }

    return updatedPost;
  }

  async deletePost(id: string): Promise<void> {
    const { error } = await this.supabase.from("blogs").delete().eq("id", id);
    if (error) throw error;
  }

  // 8. Image upload
  async uploadImage(file: File): Promise<string> {
    const fileExt = file.name.split(".").pop();
    const fileName = `${Math.random().toString(36).substring(2)}-${Date.now()}.${fileExt}`;
    const filePath = `blog/${fileName}`;

    const { error: uploadError } = await this.supabase.storage
      .from("blog-images")
      .upload(filePath, file);

    if (uploadError) throw uploadError;

    const { data } = this.supabase.storage
      .from("blog-images")
      .getPublicUrl(filePath);

    return data.publicUrl;
  }
}
