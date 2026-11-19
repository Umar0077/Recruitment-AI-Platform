import "reflect-metadata";
import { ConfigService } from "@nestjs/config";
import { S3Client } from "@aws-sdk/client-s3";
import { RecordingStorage } from "../../src/integrations/storage/recording-storage";
import { EnvironmentVariables } from "../../src/config/env.validation";
const config = () => new ConfigService<EnvironmentVariables, true>({ ...new EnvironmentVariables(), RECORDING_S3_ACCESS_KEY: "fictional-access", RECORDING_S3_SECRET_KEY: "fictional-secret-only", RECORDING_S3_BUCKET: "fictional-private", FRONTEND_ORIGINS: "https://interview.example.test", RECORDING_RETENTION_DAYS: 7 });
afterEach(() => jest.restoreAllMocks());
function mockStorage(overrides: Record<string, unknown> = {}) {
  const responses: Record<string, unknown> = { GetBucketPolicyCommand: { Policy: JSON.stringify({ Statement: [] }) }, GetBucketAclCommand: { Grants: [] }, GetBucketVersioningCommand: {}, GetBucketLifecycleConfigurationCommand: { Rules: [{ Status: "Enabled", Filter: { Prefix: "interviews/" }, Expiration: { Days: 7 }, AbortIncompleteMultipartUpload: { DaysAfterInitiation: 1 } }] }, GetBucketCorsCommand: { CORSRules: [{ AllowedOrigins: ["https://interview.example.test"], AllowedMethods: ["PUT", "GET"], ExposeHeaders: ["ETag"] }] }, ...overrides };
  const send = jest.spyOn(S3Client.prototype, "send").mockImplementation((async (command: { constructor: { name: string } }) => { const result = responses[command.constructor.name]; if (result instanceof Error) throw result; return result ?? {}; }) as never);
  return { service: new RecordingStorage(config()), send };
}
it("requires private ACL, lifecycle, versioning and exact CORS inspection", async () => { const s = mockStorage(); expect(await s.service.ready()).toBe(true); expect(s.send).toHaveBeenCalledTimes(6); });
it.each([
  { GetBucketAclCommand: { Grants: [{ Grantee: { URI: "http://acs.amazonaws.com/groups/global/AllUsers" } }] } },
  { GetBucketPolicyCommand: { Policy: JSON.stringify({ Statement: [{ Effect: "Allow", Principal: "*" }] }) } },
  { GetBucketPolicyCommand: { Policy: JSON.stringify({ Statement: [{ Effect: "Allow", NotPrincipal: { AWS: "fictional" } }] }) } },
  { GetBucketVersioningCommand: { Status: "Enabled" } },
  { GetBucketVersioningCommand: { Status: "Suspended" } },
  { GetBucketLifecycleConfigurationCommand: { Rules: [] } },
  { GetBucketCorsCommand: { CORSRules: [{ AllowedOrigins: ["*"], AllowedMethods: ["PUT", "GET"], ExposeHeaders: ["ETag"] }] } },
  { HeadBucketCommand: new Error("unavailable") },
])("fails closed for unsafe/unverifiable storage (%#)", async override => { expect(await mockStorage(override).service.ready()).toBe(false); });
it("signs part size and expires both capabilities after sixty seconds without cookies", async () => {
  const service = new RecordingStorage(config());
  const part = new URL(await service.partUrl("interviews/fictional", "upload", 1, 100));
  expect(part.searchParams.get("X-Amz-Expires")).toBe("60"); expect(part.searchParams.get("X-Amz-SignedHeaders")).toContain("content-length"); expect(part.searchParams.has("x-amz-checksum-crc32")).toBe(false);
  const playback = new URL(await service.playback("interviews/fictional")); expect(playback.searchParams.get("X-Amz-Expires")).toBe("60"); expect(playback.searchParams.get("response-cache-control")).toBe("private, no-store");
});
it("refuses to claim deletion on versioned buckets or when HEAD still finds the object", async () => {
  const s = mockStorage({ GetBucketVersioningCommand: { Status: "Enabled" } }); await expect(s.service.remove("fictional")).rejects.toThrow(/VERSIONED/);
  jest.restoreAllMocks(); const active = mockStorage({ HeadObjectCommand: { ContentLength: 100 } }); await expect(active.service.remove("fictional")).rejects.toThrow(/NOT_VERIFIED/);
});
it.each(["valid", "wildcard", "missing-etag", "untrusted"])("checks actual MinIO CORS behavior: %s", async mode => {
  mockStorage(); const settings = config(); settings.set("RECORDING_MODE", "local_test"); settings.set("RECORDING_S3_CORS_MODE", "probe");
  const service = new RecordingStorage(settings);
  jest.spyOn(global, "fetch").mockImplementation(async (_url, init) => {
    const origin = (init?.headers as Record<string, string>).Origin;
    const trusted = origin === "https://interview.example.test";
    return new Response(null, { status: 200, headers: { ...(trusted || mode === "untrusted" ? { "access-control-allow-origin": mode === "wildcard" ? "*" : origin } : {}), "access-control-allow-methods": "GET, PUT", "access-control-expose-headers": mode === "missing-etag" ? "Date" : "ETag" } });
  });
  expect(await service.ready()).toBe(mode === "valid");
});
it("cleans only stale lab multipart uploads and verifies their abort", async () => {
  const settings = config(); settings.set("RECORDING_MODE", "local_test"); const service = new RecordingStorage(settings);
  const old = new Date(Date.now() - 86400001);
  jest.spyOn(S3Client.prototype, "send").mockImplementation((async (command: { constructor: { name: string } }) => {
    if (command.constructor.name === "ListMultipartUploadsCommand") return { Uploads: [{ Key: "interviews/old", UploadId: "old", Initiated: old }, { Key: "interviews/new", UploadId: "new", Initiated: new Date() }, { Key: "elsewhere/old", UploadId: "unrelated", Initiated: old }] };
    if (command.constructor.name === "ListPartsCommand") throw Object.assign(new Error("gone"), { name: "NoSuchUpload" });
    return {};
  }) as never);
  const abort = jest.spyOn(service, "abort"); await service.cleanupAbandonedUploads();
  expect(abort).toHaveBeenCalledTimes(1); expect(abort).toHaveBeenCalledWith("interviews/old", "old");
});
