import { SetMetadata } from "@nestjs/common";
import type { PermissionCode } from "./constants/permissions";

export const IS_PUBLIC = "isPublic";
/** Skips Firebase authentication (health checks, server-to-server integrations with their own auth). */
export const Public = () => SetMetadata(IS_PUBLIC, true);

export const REQUIRED_PERMISSIONS = "requiredPermissions";
/** Requires ALL listed permissions. Ownership rules are enforced additionally in services. */
export const RequirePermissions = (...perms: PermissionCode[]) => SetMetadata(REQUIRED_PERMISSIONS, perms);
