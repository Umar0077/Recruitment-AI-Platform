import type { RoleCode } from "@prisma/client";
import type { PermissionCode } from "./constants/permissions";

/** The authenticated principal, resolved server-side from a verified Firebase ID token. */
export interface AuthUser {
  id: string;
  firebaseUid: string;
  email: string | null;
  displayName: string | null;
  /** Sign-in providers seen for this user (google.com; historical records may hold others). */
  providers: string[];
  roles: RoleCode[];
  permissions: Set<PermissionCode>;
  /** Linked candidate record (candidates only). */
  candidateId: string | null;
}

export const hasPermission = (u: AuthUser, p: PermissionCode) => u.permissions.has(p);
export const isStaff = (u: AuthUser) => u.roles.some((r) => r !== "CANDIDATE");
