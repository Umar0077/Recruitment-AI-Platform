import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { S3Client, ListMultipartUploadsCommand, HeadBucketCommand, GetBucketVersioningCommand, GetBucketLifecycleConfigurationCommand, GetBucketPolicyCommand, GetBucketAclCommand, GetBucketCorsCommand, CreateMultipartUploadCommand, UploadPartCommand, ListPartsCommand, CompleteMultipartUploadCommand, AbortMultipartUploadCommand, HeadObjectCommand, GetObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import type { EnvironmentVariables } from "../../config/env.validation";

export type StoredPart = { partNumber: number; size: number; etag: string };
/** Private multipart object storage. Controllers never accept object keys or upload IDs from clients. */
@Injectable()
export class RecordingStorage {
  private client: S3Client;
  private bucket: string;
  readonly configured: boolean;
  readinessIssue = "not_checked";
  constructor(private config: ConfigService<EnvironmentVariables, true>) {
    const get = <K extends keyof EnvironmentVariables>(key: K) => config.get(key, { infer: true });
    const endpoint = get("RECORDING_S3_ENDPOINT");
    this.bucket = get("RECORDING_S3_BUCKET");
    this.configured = !!(this.bucket && get("RECORDING_S3_ACCESS_KEY") && get("RECORDING_S3_SECRET_KEY"));
    this.client = new S3Client({ endpoint: endpoint || undefined, region: get("RECORDING_S3_REGION"), forcePathStyle: get("RECORDING_S3_PATH_STYLE"), credentials: { accessKeyId: get("RECORDING_S3_ACCESS_KEY"), secretAccessKey: get("RECORDING_S3_SECRET_KEY") }, requestChecksumCalculation: "WHEN_REQUIRED", responseChecksumValidation: "WHEN_REQUIRED", maxAttempts: 2, requestHandler: { requestTimeout: 15000, connectionTimeout: 5000 } });
  }
  async ready() {
    const fail = (issue: string) => { this.readinessIssue = issue; return false; };
    if (!this.configured) return fail("storage_configuration_missing");
    let stage = "bucket_unreachable";
    try {
      await this.client.send(new HeadBucketCommand({ Bucket: this.bucket }));
      // A delete marker is not deletion of old versions. Use a dedicated, never-versioned bucket.
      stage = "versioning_check_failed";
      if ((await this.client.send(new GetBucketVersioningCommand({ Bucket: this.bucket }))).Status) return fail("versioned_bucket_unsupported");
      stage = "lifecycle_check_failed";
      const lifecycle = await this.client.send(new GetBucketLifecycleConfigurationCommand({ Bucket: this.bucket }));
      const rules = (lifecycle.Rules ?? []).filter(rule => rule.Status === "Enabled" && !rule.Filter?.Tag && !rule.Filter?.And && !rule.Filter?.ObjectSizeGreaterThan && !rule.Filter?.ObjectSizeLessThan && ["", "interviews/"].includes(rule.Filter?.Prefix ?? rule.Prefix ?? ""));
      const localCleanup = this.config.get("RECORDING_MODE", { infer: true }) === "local_test";
      if ((!localCleanup && !rules.some(rule => (rule.AbortIncompleteMultipartUpload?.DaysAfterInitiation ?? Infinity) <= 1)) || !rules.some(rule => (rule.Expiration?.Days ?? Infinity) <= this.config.get("RECORDING_RETENTION_DAYS", { infer: true }))) return fail("lifecycle_rules_missing");
      stage = "private_acl_check_failed";
      const acl = await this.client.send(new GetBucketAclCommand({ Bucket: this.bucket }));
      if (acl.Grants?.some(g => /AllUsers|AuthenticatedUsers/.test(g.Grantee?.URI ?? ""))) return fail("public_bucket_acl");
      stage = "private_policy_check_failed";
      try {
        const policy = await this.client.send(new GetBucketPolicyCommand({ Bucket: this.bucket }));
        const statements = (JSON.parse(policy.Policy ?? "{}") as { Statement?: { Effect?: string; Principal?: unknown; NotPrincipal?: unknown }[] }).Statement ?? [];
        if (statements.some(s => s.Effect === "Allow" && (s.NotPrincipal || JSON.stringify(s.Principal ?? "*").includes("*")))) return fail("public_bucket_policy");
      } catch (e) { if (!(e instanceof Error) || e.name !== "NoSuchBucketPolicy") throw e; }
      const origins = this.config.get("FRONTEND_ORIGINS", { infer: true }).split(",").map(s => s.trim());
      stage = "cors_check_failed";
      if (this.config.get("RECORDING_S3_CORS_MODE", { infer: true }) === "probe") {
        // MinIO Community implements global CORS, not S3 bucket CORS. Validate real HTTP behavior.
        // This path is allowed only by the strict isolated-lab environment validator.
        const url = await this.playback("interviews/.cors-readiness-probe");
        for (const origin of origins) {
          const preflight = await fetch(url, { method: "OPTIONS", headers: { Origin: origin, "Access-Control-Request-Method": "PUT", "Access-Control-Request-Headers": "content-type" }, signal: AbortSignal.timeout(5000), redirect: "error" });
          if (!preflight.ok || preflight.headers.get("access-control-allow-origin") !== origin || !preflight.headers.get("access-control-allow-methods")?.includes("PUT")) return fail("upload_cors_rejected");
          const get = await fetch(url, { headers: { Origin: origin }, signal: AbortSignal.timeout(5000), redirect: "error" });
          await get.body?.cancel();
          if (get.headers.get("access-control-allow-origin") !== origin || !get.headers.get("access-control-expose-headers")?.toLowerCase().split(",").some(h => h.trim() === "etag")) return fail("playback_cors_rejected");
        }
        const rejected = await fetch(url, { method: "OPTIONS", headers: { Origin: "https://untrusted.example.test", "Access-Control-Request-Method": "PUT" }, signal: AbortSignal.timeout(5000), redirect: "error" });
        if (rejected.headers.get("access-control-allow-origin")) return fail("untrusted_cors_origin_allowed");
      } else {
        const cors = await this.client.send(new GetBucketCorsCommand({ Bucket: this.bucket }));
        if (!origins.every(origin => cors.CORSRules?.some(rule => rule.AllowedOrigins?.includes(origin) && rule.AllowedMethods?.includes("PUT") && rule.AllowedMethods?.includes("GET") && rule.ExposeHeaders?.some(h => h.toLowerCase() === "etag")))) return fail("bucket_cors_rules_missing");
      }
      this.readinessIssue = "ready"; return true;
    } catch { return fail(stage); }
  }
  /** MinIO Community omits S3 AbortIncompleteMultipartUpload lifecycle rules. The local lab
   * also scans storage for orphaned uploads, including uploads with no surviving DB row. */
  async cleanupAbandonedUploads() {
    if (this.config.get("RECORDING_MODE", { infer: true }) !== "local_test") return;
    let keyMarker: string | undefined, uploadIdMarker: string | undefined;
    for (let page = 0; page < 10; page++) {
      const result = await this.client.send(new ListMultipartUploadsCommand({ Bucket: this.bucket, Prefix: "interviews/", MaxUploads: 100, KeyMarker: keyMarker, UploadIdMarker: uploadIdMarker }));
      for (const upload of result.Uploads ?? []) {
        if (upload.Key?.startsWith("interviews/") && upload.UploadId && upload.Initiated && upload.Initiated.getTime() <= Date.now() - 86400000) await this.abort(upload.Key, upload.UploadId);
      }
      if (!result.IsTruncated) return;
      keyMarker = result.NextKeyMarker; uploadIdMarker = result.NextUploadIdMarker;
      if (!keyMarker) throw new Error("INCOMPLETE_UPLOAD_SCAN");
    }
  }
  async begin(key: string, contentType: string) {
    const r = await this.client.send(new CreateMultipartUploadCommand({ Bucket: this.bucket, Key: key, ContentType: contentType, CacheControl: "private, no-store" }));
    if (!r.UploadId) throw new Error("STORAGE_UNAVAILABLE"); return r.UploadId;
  }
  async partUrl(key: string, uploadId: string, partNumber: number, size: number) {
    return getSignedUrl(this.client, new UploadPartCommand({ Bucket: this.bucket, Key: key, UploadId: uploadId, PartNumber: partNumber, ContentLength: size }), { expiresIn: 60, signableHeaders: new Set(["content-length"]) });
  }
  async parts(key: string, uploadId: string): Promise<StoredPart[]> {
    const r = await this.client.send(new ListPartsCommand({ Bucket: this.bucket, Key: key, UploadId: uploadId, MaxParts: 1000 }));
    if (r.IsTruncated) throw new Error("UPLOAD_LIMIT");
    return (r.Parts ?? []).map(p => ({ partNumber: p.PartNumber!, size: p.Size!, etag: p.ETag! }));
  }
  async complete(key: string, uploadId: string, parts: StoredPart[]) {
    await this.client.send(new CompleteMultipartUploadCommand({ Bucket: this.bucket, Key: key, UploadId: uploadId, MultipartUpload: { Parts: parts.map(p => ({ PartNumber: p.partNumber, ETag: p.etag })) } }));
  }
  async head(key: string) {
    try { const h = await this.client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: key })); return { size: h.ContentLength ?? 0, type: h.ContentType ?? "" }; }
    catch (e) { if (e instanceof Error && ["NotFound", "NoSuchKey"].includes(e.name)) return null; throw e; }
  }
  async playback(key: string) { return getSignedUrl(this.client, new GetObjectCommand({ Bucket: this.bucket, Key: key, ResponseCacheControl: "private, no-store", ResponseContentDisposition: "inline" }), { expiresIn: 60 }); }
  async abort(key: string, uploadId: string) {
    try { await this.client.send(new AbortMultipartUploadCommand({ Bucket: this.bucket, Key: key, UploadId: uploadId })); }
    catch (e) { if (!(e instanceof Error) || e.name !== "NoSuchUpload") throw e; }
    // Concurrent in-flight parts may survive an abort. Never report deletion without verification.
    try { if ((await this.parts(key, uploadId)).length) throw new Error("ABORT_NOT_VERIFIED"); }
    catch (e) { if (!(e instanceof Error) || e.name !== "NoSuchUpload") throw e; }
  }
  async remove(key: string) {
    if ((await this.client.send(new GetBucketVersioningCommand({ Bucket: this.bucket }))).Status) throw new Error("VERSIONED_DELETION_UNSUPPORTED");
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
    if (await this.head(key)) throw new Error("DELETION_NOT_VERIFIED");
  }
}
