import { createClient } from "@supabase/supabase-js";
import { env } from "../config/env";
import { config } from "../config";
import { StorageError } from "../lib/errors";
import { logger } from "../lib/logger";

export class StorageService {
  constructor(private readonly supabase: ReturnType<typeof createClient>) {}

  private get bucket() {
    return config.invoice.bucketName;
  }

  async upload(
    path: string,
    data: Uint8Array | ArrayBuffer | Blob | Buffer,
    contentType: string,
  ): Promise<string> {
    logger.debug("Storage upload", { path, contentType });

    const { error } = await this.supabase.storage.from(this.bucket).upload(path, data, {
      contentType,
      upsert: true,
    });

    if (error) throw new StorageError(`Upload failed: ${error.message}`, error);

    return path;
  }

  async download(path: string): Promise<{ data: Uint8Array; contentType: string }> {
    logger.debug("Storage download", { path });

    const { data, error } = await this.supabase.storage.from(this.bucket).download(path);

    if (error) throw new StorageError(`Download failed: ${error.message}`, error);

    const arrayBuf = await data.arrayBuffer();
    return {
      data: new Uint8Array(arrayBuf),
      contentType: data.type || "application/octet-stream",
    };
  }

  async exists(path: string): Promise<boolean> {
    const { data, error } = await this.supabase.storage
      .from(this.bucket)
      .list("", { search: path });

    if (error) return false;
    return data.some((f) => f.name === path);
  }

  async delete(path: string): Promise<void> {
    const { error } = await this.supabase.storage.from(this.bucket).remove([path]);

    if (error) throw new StorageError(`Delete failed: ${error.message}`, error);
  }

  async signedUrl(path: string): Promise<string> {
    const { data, error } = await this.supabase.storage
      .from(this.bucket)
      .createSignedUrl(path, config.invoice.signedUrlExpirySec);

    if (error) throw new StorageError(`Signed URL failed: ${error.message}`, error);
    return data.signedUrl;
  }

  async ensureBucket(): Promise<void> {
    const { data: buckets } = await this.supabase.storage.listBuckets();
    if (buckets?.some((b) => b.name === this.bucket)) return;

    try {
      const { error } = await this.supabase.storage.createBucket(this.bucket, {
        public: false,
        fileSizeLimit: 10 * 1024 * 1024, // 10MB
      });

      if (error) throw new StorageError(`Bucket creation failed: ${error.message}`, error);
      logger.info("Storage bucket created", { bucket: this.bucket });
    } catch (err) {
      if (err instanceof StorageError && err.message.toLowerCase().includes("already exists")) {
        logger.info("Storage bucket already exists (race)", { bucket: this.bucket });
        return;
      }
      throw err;
    }
  }
}
