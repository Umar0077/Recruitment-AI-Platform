import { Global, HttpStatus, Injectable, Module } from "@nestjs/common";
import { AppError } from "../../common/errors";

/**
 * Object-storage abstraction for interview audio/video and attachments (S3 / MinIO later).
 * Bytes never go into PostgreSQL — only MediaAsset metadata does.
 */
export abstract class StorageProvider {
  abstract readonly enabled: boolean;
  /** Short-lived pre-signed URL the browser uploads to directly. */
  abstract createUploadUrl(input: { objectKey: string; contentType: string; maxBytes: number }): Promise<{ url: string; expiresAt: Date }>;
  abstract createDownloadUrl(objectKey: string): Promise<{ url: string; expiresAt: Date }>;
}

/** Default until a bucket, retention policy and consent wording are approved. */
@Injectable()
export class DisabledStorageProvider extends StorageProvider {
  readonly enabled = false;
  private fail(): never {
    throw new AppError("FEATURE_DISABLED", "Media storage is not enabled.", HttpStatus.SERVICE_UNAVAILABLE);
  }
  async createUploadUrl(): Promise<never> {
    this.fail();
  }
  async createDownloadUrl(): Promise<never> {
    this.fail();
  }
}

@Global()
@Module({ providers: [{ provide: StorageProvider, useClass: DisabledStorageProvider }], exports: [StorageProvider] })
export class StorageModule {}
