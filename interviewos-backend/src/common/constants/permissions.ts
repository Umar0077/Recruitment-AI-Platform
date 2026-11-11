import { RoleCode } from "@prisma/client";

/** Permission codes enforced by PermissionsGuard. The DB copy (roles/permissions tables) is seeded from this matrix. */
export const PERMISSIONS = {
  CANDIDATES_READ: "candidates:read",
  CANDIDATES_WRITE: "candidates:write",
  APPLICATIONS_READ: "applications:read",
  APPLICATIONS_UPDATE_STATUS: "applications:update_status",
  INTERVIEWS_READ: "interviews:read",
  INTERVIEWS_INVITE: "interviews:invite",
  INTERVIEWS_REVIEW: "interviews:review",
  INTERVIEWS_TAKE: "interviews:take",
  HR_REMARKS_WRITE: "hr_remarks:write",
  ASSESSMENTS_READ: "assessments:read",
  QUESTION_SETS_READ: "question_sets:read",
  QUESTION_SETS_MANAGE: "question_sets:manage",
  USERS_MANAGE: "users:manage",
  ANALYTICS_READ: "analytics:read",
  AUDIT_READ: "audit:read",
} as const;

export type PermissionCode = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

const P = PERMISSIONS;
const all = Object.values(P).filter((p) => p !== P.INTERVIEWS_TAKE);

/** Default matrix (configurable later via the roles/permissions tables). */
export const ROLE_PERMISSIONS: Record<RoleCode, PermissionCode[]> = {
  SUPER_ADMIN: all,
  HR_MANAGER: all.filter((p) => p !== P.USERS_MANAGE),
  RECRUITER: [P.CANDIDATES_READ, P.CANDIDATES_WRITE, P.APPLICATIONS_READ, P.APPLICATIONS_UPDATE_STATUS, P.INTERVIEWS_READ, P.INTERVIEWS_INVITE, P.INTERVIEWS_REVIEW, P.HR_REMARKS_WRITE, P.ASSESSMENTS_READ, P.QUESTION_SETS_READ, P.ANALYTICS_READ],
  REVIEWER: [P.CANDIDATES_READ, P.APPLICATIONS_READ, P.INTERVIEWS_READ, P.INTERVIEWS_REVIEW, P.HR_REMARKS_WRITE, P.ASSESSMENTS_READ, P.QUESTION_SETS_READ],
  CANDIDATE: [P.INTERVIEWS_TAKE],
};

export const STAFF_ROLES: RoleCode[] = ["SUPER_ADMIN", "HR_MANAGER", "RECRUITER", "REVIEWER"];
