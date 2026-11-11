import { Test } from "@nestjs/testing";
import type { NestExpressApplication } from "@nestjs/platform-express";
import request from "supertest";
import { AppModule } from "../../src/app.module";
import { configureApp } from "../../src/bootstrap";
import { PrismaService } from "../../src/database/prisma.service";

const tok = (uid: string, email?: string) => ({ Authorization: `Bearer test:${uid}${email ? `:${email}` : ""}` });
const ADMIN = tok("dev-super-admin");
const HRM = tok("dev-hr-manager");
const REC = tok("dev-recruiter");
const REV = tok("dev-reviewer");
const CAND = tok("e2e-candidate", "e2e.candidate@example.test");
const OTHER = tok("e2e-other", "someone.else@example.test");

const ANSWER = (t: string) => ({ transcript: t, source: "TYPED_FALLBACK", responseDurationSec: 42 });

describe("InterviewOS API (e2e)", () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let http: ReturnType<typeof request>;
  let csrRoleId: string;
  let applicationId: string;
  let interviewId: string;

  beforeAll(async () => {
    const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = mod.createNestApplication<NestExpressApplication>({ bufferLogs: true });
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);
    http = request(app.getHttpServer());
    const roles = await http.get("/api/v1/job-roles").set(REC).expect(200);
    csrRoleId = roles.body.data.find((r: { code: string }) => r.code === "CSR-FRESHER").id;
  });

  afterAll(async () => {
    await app.close();
  });

  describe("authentication & authorization", () => {
    it("health is public and uses the envelope", async () => {
      const res = await http.get("/api/v1/health/ready").expect(200);
      expect(res.body).toMatchObject({ success: true, data: { status: "ok", checks: { database: "up" } } });
    });

    it("rejects missing and malformed tokens", async () => {
      expect((await http.get("/api/v1/auth/me").expect(401)).body.error.code).toBe("UNAUTHENTICATED");
      await http.get("/api/v1/auth/me").set({ Authorization: "Bearer not-a-real-token" }).expect(401);
      await http.get("/api/v1/auth/me").set({ Authorization: "Bearer test:x" }).expect(401);
    });

    it("a brand-new sign-in receives only the CANDIDATE role", async () => {
      const res = await http.get("/api/v1/auth/me").set(tok("brand-new-user", "new@example.test")).expect(200);
      expect(res.body.data.roles).toEqual(["CANDIDATE"]);
      expect(res.body.data.permissions).toEqual(["interviews:take"]);
      await http.get("/api/v1/candidates").set(tok("brand-new-user")).expect(403);
    });

    it("users cannot grant themselves roles; recruiters cannot manage users", async () => {
      const me = await http.get("/api/v1/auth/me").set(tok("brand-new-user")).expect(200);
      await http.patch(`/api/v1/users/${me.body.data.id}/roles`).set(tok("brand-new-user")).send({ roles: ["SUPER_ADMIN"] }).expect(403);
      await http.get("/api/v1/users").set(REC).expect(403);
    });

    it("repeat sign-ins reuse the same user (no duplicates), even when concurrent", async () => {
      const t = tok("e2e-concurrent", "concurrent@example.test:google.com");
      const results = await Promise.all([1, 2, 3, 4].map(() => http.get("/api/v1/auth/me").set(t)));
      expect(results.every((r) => r.status === 200)).toBe(true);
      expect(new Set(results.map((r) => r.body.data.id)).size).toBe(1);
      expect(await prisma.user.count({ where: { firebaseUid: "e2e-concurrent" } })).toBe(1);
    });

    it("a disabled account is refused with 403 ACCOUNT_DISABLED", async () => {
      const t = tok("e2e-disabled", "disabled@example.test");
      await http.get("/api/v1/auth/me").set(t).expect(200);
      await prisma.user.update({ where: { firebaseUid: "e2e-disabled" }, data: { status: "DISABLED" } });
      expect((await http.get("/api/v1/auth/me").set(t).expect(403)).body.error.code).toBe("ACCOUNT_DISABLED");
    });

    it("sign-in methods other than Google are refused", async () => {
      const res = await http.get("/api/v1/auth/me").set(tok("e2e-apple", "apple.user@example.test:apple.com")).expect(403);
      expect(res.body.error.code).toBe("SIGN_IN_METHOD_NOT_ALLOWED");
      await http.get("/api/v1/auth/me").set(tok("e2e-password", "pw.user@example.test:password")).expect(403);
      expect(await prisma.user.count({ where: { firebaseUid: { in: ["e2e-apple", "e2e-password"] } } })).toBe(0);
    });

    it("a super admin cannot remove their own admin role", async () => {
      const me = await http.get("/api/v1/auth/me").set(ADMIN).expect(200);
      const res = await http.patch(`/api/v1/users/${me.body.data.id}/roles`).set(ADMIN).send({ roles: ["HR_MANAGER"] }).expect(409);
      expect(res.body.error.code).toBe("CONFLICT");
    });
  });

  describe("validation & pagination", () => {
    it("rejects unknown fields, oversized pages and non-allowlisted sort fields", async () => {
      await http.post("/api/v1/candidates").set(REC).send({ fullName: "X Y", category: "CSR_FRESHER", jobRoleId: csrRoleId, isAdmin: true }).expect(400);
      await http.get("/api/v1/applications?limit=101").set(REC).expect(400);
      const bad = await http.get("/api/v1/applications?sortBy=password").set(REC).expect(400);
      expect(bad.body.error.code).toBe("VALIDATION_FAILED");
      const ok = await http.get("/api/v1/applications?limit=2&page=1").set(REC).expect(200);
      expect(ok.body.meta).toMatchObject({ page: 1, limit: 2 });
    });
  });

  describe("interview lifecycle", () => {
    let candidateId: string;
    it("signing in before an invitation exists links nothing", async () => {
      const res = await http
        .post("/api/v1/candidates")
        .set(REC)
        .send({ fullName: "E2E Candidate", email: "e2e.candidate@example.test", category: "CSR_FRESHER", jobRoleId: csrRoleId, details: { englishSelfRating: 4 } })
        .expect(201);
      applicationId = res.body.data.applications[0].id;
      candidateId = res.body.data.id;
      const me = await http.get("/api/v1/auth/me").set(CAND).expect(200);
      expect(me.body.data).toMatchObject({ roles: ["CANDIDATE"], candidateId: null, isStaff: false });
    });

    it("recruiter issues the interview pinned to HR-CSR-V1", async () => {
      const res = await http.post("/api/v1/interviews").set(REC).send({ applicationId }).expect(201);
      interviewId = res.body.data.interviewId;
      expect(res.body.data).toMatchObject({ status: "PENDING", questionSetVersion: "HR-CSR-V1", totalQuestions: 4, completedQuestions: 0 });
      expect(res.body.data.questions.map((q: { code: string }) => q.code)).toEqual(["CSR-001", "CSR-002", "CSR-003", "CSR-004"]);
      const window = new Date(res.body.data.expiresAt).getTime() - Date.now();
      expect(window).toBeGreaterThan(47.9 * 3600_000);
      expect(window).toBeLessThanOrEqual(48 * 3600_000);
      const appRes = await http.get(`/api/v1/applications/${applicationId}`).set(REC).expect(200);
      expect(appRes.body.data.status).toBe("AI_INTERVIEW_PENDING");
    });

    it("once invited, the verified email links the login to exactly that candidate", async () => {
      const me = await http.get("/api/v1/auth/me").set(CAND).expect(200);
      expect(me.body.data.candidateId).toBe(candidateId);
    });

    it("a second account with the same email is NOT merged or linked", async () => {
      const twin = tok("e2e-candidate-twin", "e2e.candidate@example.test:google.com");
      const me = await http.get("/api/v1/auth/me").set(twin).expect(200);
      const first = await http.get("/api/v1/auth/me").set(CAND).expect(200);
      expect(me.body.data.id).not.toBe(first.body.data.id);
      expect(me.body.data).toMatchObject({ candidateId: null, roles: ["CANDIDATE"], providers: ["google.com"] });
      await http.get(`/api/v1/interviews/${interviewId}`).set(twin).expect(404);
    });

    it("another candidate cannot see or answer this interview", async () => {
      await http.get(`/api/v1/interviews/${interviewId}`).set(OTHER).expect(404);
      await http.put(`/api/v1/interviews/${interviewId}/answers/CSR-001`).set(OTHER).send(ANSWER("hi")).expect(404);
      await http.post(`/api/v1/interviews/${interviewId}/submit`).set(OTHER).expect(404);
    });

    it("staff cannot answer on the candidate's behalf", async () => {
      await http.put(`/api/v1/interviews/${interviewId}/answers/CSR-001`).set(ADMIN).send(ANSWER("hi")).expect(403);
    });

    it("answers are refused before the interview starts", async () => {
      const res = await http.put(`/api/v1/interviews/${interviewId}/answers/CSR-001`).set(CAND).send(ANSWER("Hello")).expect(409);
      expect(res.body.error.code).toBe("INTERVIEW_NOT_STARTED");
    });

    it("the candidate portal shows only their own application with a candidate-safe stage", async () => {
      const res = await http.get("/api/v1/candidates/me").set(CAND).expect(200);
      expect(res.body.data.candidate.id).toBe(candidateId);
      expect(res.body.data.applications).toHaveLength(1);
      expect(res.body.data.applications[0]).toMatchObject({ id: applicationId, stage: { key: "ai_interview_pending" } });
      expect(res.body.data.applications[0].interviews[0]).toMatchObject({ id: interviewId, status: "PENDING", totalQuestions: 4, completedQuestions: 0, questionSetVersion: "HR-CSR-V1" });
      expect(JSON.stringify(res.body.data)).not.toMatch(/remark|review|assessment/i);
      expect((await http.get("/api/v1/candidates/me").set(OTHER).expect(200)).body.data).toEqual({ candidate: null, applications: [] });
      await http.get("/api/v1/candidates/me").set(REC).expect(403);
    });

    it("starting requires consent", async () => {
      const res = await http.post(`/api/v1/interviews/${interviewId}/start`).set(CAND).expect(422);
      expect(res.body.error.details).toMatchObject({ consentRequired: true });
    });

    it("start moves the interview and the application forward; repeated clicks add nothing", async () => {
      const res = await http.post(`/api/v1/interviews/${interviewId}/start`).set(CAND).send({ consent: true }).expect(200);
      await Promise.all([1, 2, 3].map(() => http.post(`/api/v1/interviews/${interviewId}/start`).set(CAND).send({ consent: true }).expect(200)));
      const events = await prisma.interviewProgressEvent.findMany({ where: { sessionId: interviewId, type: { in: ["STARTED", "RESUMED"] } } });
      expect(events).toHaveLength(1);
      expect(events[0]!.metadata).toMatchObject({ consentAcceptedAt: expect.any(String) });
      expect(res.body.data.reference).toMatch(/^INT-[0-9A-F]{8}$/);
      expect(res.body.data).toMatchObject({ status: "IN_PROGRESS", nextQuestion: { code: "CSR-001" } });
      const appRes = await http.get(`/api/v1/applications/${applicationId}`).set(REC).expect(200);
      expect(appRes.body.data.status).toBe("AI_INTERVIEW_IN_PROGRESS");
    });

    it("enforces order, membership, and one confirmed answer per question", async () => {
      expect((await http.put(`/api/v1/interviews/${interviewId}/answers/CSR-002`).set(CAND).send(ANSWER("skip")).expect(422)).body.error.details.nextQuestion).toBe("CSR-001");
      expect((await http.put(`/api/v1/interviews/${interviewId}/answers/FE-001`).set(CAND).send(ANSWER("wrong set")).expect(422)).body.error.code).toBe("QUESTION_NOT_IN_SESSION");
      await http.put(`/api/v1/interviews/${interviewId}/answers/CSR-001`).set(CAND).send({ ...ANSWER(""), transcript: "" }).expect(400);

      const first = await http.put(`/api/v1/interviews/${interviewId}/answers/CSR-001`).set(CAND).send(ANSWER("I studied business and enjoy talking to people.")).expect(200);
      expect(first.body.data).toMatchObject({ saved: true, idempotentReplay: false, progress: { completedQuestions: 1, nextQuestion: { code: "CSR-002" } } });
      const replay = await http.put(`/api/v1/interviews/${interviewId}/answers/CSR-001`).set(CAND).send(ANSWER("I studied business and enjoy talking to people.")).expect(200);
      expect(replay.body.data.idempotentReplay).toBe(true);
      expect((await http.put(`/api/v1/interviews/${interviewId}/answers/CSR-001`).set(CAND).send(ANSWER("Changed my mind")).expect(409)).body.error.code).toBe("ANSWER_ALREADY_CONFIRMED");
      expect(await prisma.interviewAnswer.count({ where: { sessionId: interviewId } })).toBe(1);
    });

    it("cannot submit an incomplete interview", async () => {
      expect((await http.post(`/api/v1/interviews/${interviewId}/submit`).set(CAND).expect(422)).body.error.code).toBe("INTERVIEW_INCOMPLETE");
    });

    it("interrupt then resume continues at the first unanswered question", async () => {
      expect((await http.post(`/api/v1/interviews/${interviewId}/interrupt`).set(CAND).expect(200)).body.data.status).toBe("INTERRUPTED");
      await http.put(`/api/v1/interviews/${interviewId}/answers/CSR-002`).set(CAND).send(ANSWER("x")).expect(409);
      const res = await http.post(`/api/v1/interviews/${interviewId}/resume`).set(CAND).expect(200);
      expect(res.body.data).toMatchObject({ status: "IN_PROGRESS", completedQuestions: 1, nextQuestion: { code: "CSR-002" } });
    });

    it("answering the remaining questions completes the interview", async () => {
      for (const code of ["CSR-002", "CSR-003", "CSR-004"]) {
        await http.put(`/api/v1/interviews/${interviewId}/answers/${code}`).set(CAND).send({ ...ANSWER(`Answer for ${code}`), source: "SPEECH_TO_TEXT", provisionalTranscript: `answer for ${code.toLowerCase()}` }).expect(200);
      }
      const p = await http.get(`/api/v1/interviews/${interviewId}/progress`).set(CAND).expect(200);
      expect(p.body.data).toMatchObject({ status: "COMPLETED", completedQuestions: 4, nextQuestion: null });
      expect(await prisma.interviewTranscript.count({ where: { kind: "PROVISIONAL", answer: { sessionId: interviewId } } })).toBe(3);
    });

    it("submit is idempotent and hands off to recruiter review exactly once", async () => {
      const a = await http.post(`/api/v1/interviews/${interviewId}/submit`).set(CAND).expect(200);
      expect(a.body.data).toMatchObject({ submitted: true, alreadySubmitted: false, progress: { status: "SUBMITTED" } });
      const b = await http.post(`/api/v1/interviews/${interviewId}/submit`).set(CAND).expect(200);
      expect(b.body.data.alreadySubmitted).toBe(true);

      expect(await prisma.hrReview.count({ where: { interviewSessionId: interviewId } })).toBe(1);
      expect(await prisma.recruitmentEvent.count({ where: { applicationId, type: "INTERVIEW_SUBMITTED" } })).toBe(1);
      const staffNotices = await prisma.notification.groupBy({ by: ["recipientId"], where: { entityId: interviewId, type: "INTERVIEW_COMPLETED" }, _count: { _all: true } });
      expect(staffNotices.length).toBeGreaterThan(0);
      expect(staffNotices.every((n) => n._count._all === 1)).toBe(true);
      const appRes = await http.get(`/api/v1/applications/${applicationId}`).set(REC).expect(200);
      expect(appRes.body.data.status).toBe("RECRUITER_REVIEW_PENDING");
      await http.put(`/api/v1/interviews/${interviewId}/answers/CSR-004`).set(CAND).send(ANSWER("late edit")).expect(409);
    });

    it("the candidate's view never includes HR review data; staff see answers with question snapshots", async () => {
      const mine = await http.get(`/api/v1/interviews/${interviewId}`).set(CAND).expect(200);
      expect(mine.body.data).not.toHaveProperty("review");
      const staff = await http.get(`/api/v1/interviews/${interviewId}`).set(REV).expect(200);
      expect(staff.body.data.review).toMatchObject({ status: "PENDING_REVIEW" });
      expect(staff.body.data.questions[0].answer.questionTextSnapshot).toMatch(/^Tell us about yourself/);
    });

    it("no assessment scores are fabricated", async () => {
      const res = await http.get(`/api/v1/assessments?interviewId=${interviewId}`).set(REV).expect(200);
      expect(res.body.data.reports).toHaveLength(1);
      expect(res.body.data.reports[0].status).toBe("PENDING");
      const one = await http.get(`/api/v1/assessments/${res.body.data.reports[0].id}`).set(REV).expect(200);
      expect(one.body.data.criteria).toEqual([]);
    });
  });

  describe("recruitment status changes", () => {
    it("rejects transitions outside the allowed map, including system-only statuses", async () => {
      expect((await http.patch(`/api/v1/applications/${applicationId}/status`).set(REC).send({ status: "JOINED" }).expect(409)).body.error.code).toBe("INVALID_STATUS_TRANSITION");
      await http.patch(`/api/v1/applications/${applicationId}/status`).set(REC).send({ status: "AI_INTERVIEW_COMPLETED" }).expect(409);
      await http.patch(`/api/v1/applications/${applicationId}/status`).set(REC).send({ status: "NOT_A_STATUS" }).expect(400);
    });

    it("reviewers cannot change status", async () => {
      await http.patch(`/api/v1/applications/${applicationId}/status`).set(REV).send({ status: "SHORTLISTED" }).expect(403);
    });

    it("a valid change is applied with timeline, remark and audit entries", async () => {
      const res = await http.patch(`/api/v1/applications/${applicationId}/status`).set(REC).send({ status: "SHORTLISTED", note: "Strong communication", remark: "Invite to HR round." }).expect(200);
      expect(res.body.data).toMatchObject({ status: "SHORTLISTED", statusLabel: "Shortlisted" });
      const tl = await http.get(`/api/v1/applications/${applicationId}/timeline`).set(REV).expect(200);
      expect(tl.body.data.events.some((e: { toStatus: string }) => e.toStatus === "SHORTLISTED")).toBe(true);
      expect(tl.body.data.remarks[0].body).toBe("Invite to HR round.");
      const audit = await http.get(`/api/v1/audit-logs?entityId=${applicationId}&action=application.status_changed`).set(ADMIN).expect(200);
      expect(audit.body.data[0].summary).toMatchObject({ from: "RECRUITER_REVIEW_PENDING", to: "SHORTLISTED" });
      await http.get("/api/v1/audit-logs").set(REC).expect(403);
    });

    it("pipeline counts reflect the change", async () => {
      const res = await http.get("/api/v1/recruitment/pipeline").set(REC).expect(200);
      expect(res.body.data.stages).toHaveLength(18);
      expect(res.body.data.stages.find((s: { status: string }) => s.status === "SHORTLISTED").count).toBeGreaterThanOrEqual(1);
    });
  });

  describe("expiry", () => {
    it("an interview past its 48-hour window cannot be started", async () => {
      const c = await http.post("/api/v1/candidates").set(REC).send({ fullName: "Late Candidate", email: "late@example.test", category: "CSR_FRESHER", jobRoleId: csrRoleId }).expect(201);
      const iv = await http.post("/api/v1/interviews").set(REC).send({ applicationId: c.body.data.applications[0].id }).expect(201);
      await http.get("/api/v1/auth/me").set(tok("e2e-late", "late@example.test")).expect(200);
      await prisma.interviewSession.update({ where: { id: iv.body.data.interviewId }, data: { expiresAt: new Date(Date.now() - 1000) } });
      const res = await http.post(`/api/v1/interviews/${iv.body.data.interviewId}/start`).set(tok("e2e-late")).expect(410);
      expect(res.body.error.code).toBe("INTERVIEW_EXPIRED");
      expect((await prisma.interviewSession.findUniqueOrThrow({ where: { id: iv.body.data.interviewId } })).status).toBe("EXPIRED");
    });
  });

  describe("question-set versioning", () => {
    it("publishing V2 retires V1 but existing interviews keep V1", async () => {
      const v1 = await http.get("/api/v1/question-sets/versions/HR-CSR-V1").set(HRM).expect(200);
      const questions = v1.body.data.questions.map((q: { code: string; category: string; text: string; responseSeconds: number }) => ({ code: q.code, category: q.category, text: q.text, responseSeconds: q.responseSeconds }));
      await http.post("/api/v1/question-sets/HR-CSR/drafts").set(REC).send({ questions }).expect(403);
      const draft = await http.post("/api/v1/question-sets/HR-CSR/drafts").set(HRM).send({ source: "e2e", questions }).expect(201);
      expect(draft.body.data.versionCode).toBe("HR-CSR-V2");
      await http.post("/api/v1/question-sets/versions/HR-CSR-V2/publish").set(HRM).expect(200);
      await http.put("/api/v1/question-sets/versions/HR-CSR-V2").set(HRM).send({ questions }).expect(409);
      const v1After = await http.get("/api/v1/question-sets/versions/HR-CSR-V1").set(HRM).expect(200);
      expect(v1After.body.data.status).toBe("RETIRED");
      const iv = await http.get(`/api/v1/interviews/${interviewId}`).set(REC).expect(200);
      expect(iv.body.data.questionSetVersion).toBe("HR-CSR-V1");
    });
  });

  describe("careers integration", () => {
    const body = { externalApplicationRef: "careers-app-1", externalCandidateId: "careers-cand-1", jobRef: "FE-CLOSER", fullName: "Web Applicant", email: "web@example.test", submittedAt: new Date().toISOString() };

    it("requires the integration key", async () => {
      await http.post("/api/v1/integrations/careers/applications").send(body).expect(401);
      await http.post("/api/v1/integrations/careers/applications").set("X-Integration-Key", "wrong").send(body).expect(401);
    });

    it("is idempotent by external application reference", async () => {
      const key = process.env.CAREERS_INTEGRATION_KEY!;
      const a = await http.post("/api/v1/integrations/careers/applications").set("X-Integration-Key", key).send(body).expect(201);
      const b = await http.post("/api/v1/integrations/careers/applications").set("X-Integration-Key", key).send(body).expect(201);
      expect(a.body.data.created).toBe(true);
      expect(b.body.data).toMatchObject({ created: false, applicationId: a.body.data.applicationId });
      expect(await prisma.application.count({ where: { externalApplicationRef: "careers-app-1" } })).toBe(1);
    });
  });

  describe("analytics", () => {
    it("weekly activity is computed server-side and includes this week's submission", async () => {
      const res = await http.get("/api/v1/analytics/activity?weeks=4").set(HRM).expect(200);
      expect(res.body.data.weeks).toHaveLength(4);
      expect(res.body.data.weeks.at(-1).interviews).toBeGreaterThanOrEqual(1);
      await http.get("/api/v1/analytics/activity").set(CAND).expect(403);
    });

    it("interviews can be filtered by review status", async () => {
      const res = await http.get("/api/v1/interviews?reviewStatus=PENDING_REVIEW").set(REV).expect(200);
      expect(res.body.data.every((r: { review: { status: string } }) => r.review.status === "PENDING_REVIEW")).toBe(true);
    });

    it("returns aggregates for staff with analytics access only", async () => {
      const res = await http.get("/api/v1/analytics/overview").set(HRM).expect(200);
      expect(res.body.data.interviews.byStatus.SUBMITTED).toBeGreaterThanOrEqual(1);
      expect(res.body.data.applications.byStatus).toHaveLength(18);
      await http.get("/api/v1/analytics/overview").set(REV).expect(403);
    });
  });
});
