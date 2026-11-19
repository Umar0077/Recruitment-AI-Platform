import { RecruitmentStatus } from "@prisma/client";
import { ALLOWED_HR_TRANSITIONS, RECRUITMENT_STATUS_LABELS, isAllowedHrTransition } from "../../src/common/constants/recruitment";
import { ROLE_PERMISSIONS, PERMISSIONS } from "../../src/common/constants/permissions";

describe("recruitment status rules", () => {
  it("covers all 18 official statuses with labels", () => {
    expect(Object.keys(RECRUITMENT_STATUS_LABELS)).toHaveLength(18);
    expect(Object.keys(ALLOWED_HR_TRANSITIONS).sort()).toEqual(Object.values(RecruitmentStatus).sort());
  });
  it("never lets HR set the system-only interview statuses", () => {
    for (const targets of Object.values(ALLOWED_HR_TRANSITIONS)) {
      expect(targets).not.toContain("AI_INTERVIEW_IN_PROGRESS");
      expect(targets).not.toContain("AI_INTERVIEW_COMPLETED");
    }
  });
  it("treats JOINED and CANDIDATE_WITHDRAWN as final", () => {
    expect(ALLOWED_HR_TRANSITIONS.JOINED).toEqual([]);
    expect(ALLOWED_HR_TRANSITIONS.CANDIDATE_WITHDRAWN).toEqual([]);
    expect(isAllowedHrTransition("SHORTLISTED", "HR_INTERVIEW_SCHEDULED")).toBe(true);
    expect(isAllowedHrTransition("APPLICATION_RECEIVED", "SELECTED")).toBe(false);
  });
});

describe("role matrix", () => {
  it("only candidates can take interviews and only super admins manage users", () => {
    for (const [role, perms] of Object.entries(ROLE_PERMISSIONS)) {
      expect(perms.includes(PERMISSIONS.INTERVIEWS_TAKE)).toBe(role === "CANDIDATE");
      expect(perms.includes(PERMISSIONS.USERS_MANAGE)).toBe(role === "SUPER_ADMIN");
    }
  });
});
