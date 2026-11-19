-- CreateEnum
CREATE TYPE "AccountStatus" AS ENUM ('ACTIVE', 'INVITED', 'DISABLED');

-- CreateEnum
CREATE TYPE "RoleCode" AS ENUM ('SUPER_ADMIN', 'HR_MANAGER', 'RECRUITER', 'REVIEWER', 'CANDIDATE');

-- CreateEnum
CREATE TYPE "CandidateTrack" AS ENUM ('EXPERIENCED_FE_CLOSER', 'CSR_FRESHER');

-- CreateEnum
CREATE TYPE "RecruitmentStatus" AS ENUM ('APPLICATION_RECEIVED', 'AI_INTERVIEW_PENDING', 'AI_INTERVIEW_IN_PROGRESS', 'AI_INTERVIEW_COMPLETED', 'RECRUITER_REVIEW_PENDING', 'SHORTLISTED', 'HR_INTERVIEW_SCHEDULED', 'HR_INTERVIEW_COMPLETED', 'FINAL_ASSESSMENT_PENDING', 'FINAL_ASSESSMENT_COMPLETED', 'SELECTED', 'OFFER_RELEASED', 'OFFER_ACCEPTED', 'DOCUMENTATION_ONBOARDING', 'PRODUCTION_ONBOARDING', 'JOINED', 'NOT_SELECTED', 'CANDIDATE_WITHDRAWN');

-- CreateEnum
CREATE TYPE "ApplicationSource" AS ENUM ('CAREERS_WEBSITE', 'MANUAL', 'IMPORT');

-- CreateEnum
CREATE TYPE "InterviewStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'COMPLETED', 'SUBMITTED', 'INTERRUPTED', 'EXPIRED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "QuestionSetVersionStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'RETIRED');

-- CreateEnum
CREATE TYPE "AnswerSource" AS ENUM ('SPEECH_TO_TEXT', 'TYPED_FALLBACK');

-- CreateEnum
CREATE TYPE "TranscriptKind" AS ENUM ('PROVISIONAL', 'CONFIRMED');

-- CreateEnum
CREATE TYPE "ProgressEventType" AS ENUM ('INVITED', 'STARTED', 'RESUMED', 'ANSWER_CONFIRMED', 'INTERRUPTED', 'SUBMITTED', 'EXPIRED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "RecruitmentEventType" AS ENUM ('APPLICATION_RECEIVED', 'STATUS_CHANGED', 'INTERVIEW_INVITED', 'INTERVIEW_STARTED', 'INTERVIEW_SUBMITTED', 'HR_REMARK_ADDED', 'HR_REVIEW_UPDATED');

-- CreateEnum
CREATE TYPE "HrReviewStatus" AS ENUM ('PENDING_REVIEW', 'IN_REVIEW', 'REVIEWED', 'FURTHER_REVIEW_REQUIRED');

-- CreateEnum
CREATE TYPE "AssessmentStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'REVIEW_REQUIRED');

-- CreateEnum
CREATE TYPE "ObservationKind" AS ENUM ('CRITERION', 'QUESTION', 'STRENGTH', 'REVIEW_AREA');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('INTERVIEW_COMPLETED', 'REVIEW_REQUIRED', 'CANDIDATE_SHORTLISTED', 'SESSION_EXPIRING', 'HR_REMARK_ADDED');

-- CreateEnum
CREATE TYPE "MediaKind" AS ENUM ('INTERVIEW_AUDIO', 'INTERVIEW_VIDEO', 'ATTACHMENT', 'REPORT');

-- CreateEnum
CREATE TYPE "MediaStatus" AS ENUM ('PENDING_UPLOAD', 'AVAILABLE', 'DELETED');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "firebase_uid" TEXT NOT NULL,
    "email" TEXT,
    "email_verified" BOOLEAN NOT NULL DEFAULT false,
    "display_name" TEXT,
    "status" "AccountStatus" NOT NULL DEFAULT 'ACTIVE',
    "last_login_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auth_identities" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "provider" TEXT NOT NULL,
    "provider_uid" TEXT,
    "email" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "auth_identities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "roles" (
    "id" UUID NOT NULL,
    "code" "RoleCode" NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,

    CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "permissions" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT,

    CONSTRAINT "permissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "role_permissions" (
    "role_id" UUID NOT NULL,
    "permission_id" UUID NOT NULL,

    CONSTRAINT "role_permissions_pkey" PRIMARY KEY ("role_id","permission_id")
);

-- CreateTable
CREATE TABLE "user_roles" (
    "user_id" UUID NOT NULL,
    "role_id" UUID NOT NULL,
    "assigned_by_id" UUID,
    "assigned_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_roles_pkey" PRIMARY KEY ("user_id","role_id")
);

-- CreateTable
CREATE TABLE "job_roles" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "external_job_id" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "track" "CandidateTrack" NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "default_question_set_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "job_roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "candidates" (
    "id" UUID NOT NULL,
    "external_candidate_id" TEXT,
    "user_id" UUID,
    "full_name" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "category" "CandidateTrack" NOT NULL,
    "location" TEXT,
    "is_sample" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "candidates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "applications" (
    "id" UUID NOT NULL,
    "candidate_id" UUID NOT NULL,
    "job_role_id" UUID NOT NULL,
    "source" "ApplicationSource" NOT NULL DEFAULT 'MANUAL',
    "external_application_ref" TEXT,
    "submitted_at" TIMESTAMPTZ(3) NOT NULL,
    "status" "RecruitmentStatus" NOT NULL DEFAULT 'APPLICATION_RECEIVED',
    "status_changed_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "details" JSONB NOT NULL DEFAULT '{}',
    "availability" JSONB NOT NULL DEFAULT '{}',
    "assigned_recruiter_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "applications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recruitment_events" (
    "id" UUID NOT NULL,
    "application_id" UUID NOT NULL,
    "type" "RecruitmentEventType" NOT NULL,
    "from_status" "RecruitmentStatus",
    "to_status" "RecruitmentStatus",
    "actor_user_id" UUID,
    "note" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "recruitment_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hr_remarks" (
    "id" UUID NOT NULL,
    "application_id" UUID NOT NULL,
    "author_id" UUID NOT NULL,
    "body" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "hr_remarks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hr_reviews" (
    "id" UUID NOT NULL,
    "application_id" UUID NOT NULL,
    "interview_session_id" UUID,
    "reviewer_id" UUID,
    "status" "HrReviewStatus" NOT NULL DEFAULT 'PENDING_REVIEW',
    "remarks" TEXT,
    "reviewed_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "hr_reviews_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "question_sets" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "track" "CandidateTrack" NOT NULL,
    "active_version_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "question_sets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "question_set_versions" (
    "id" UUID NOT NULL,
    "question_set_id" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "version_code" TEXT NOT NULL,
    "status" "QuestionSetVersionStatus" NOT NULL DEFAULT 'DRAFT',
    "source" TEXT,
    "published_at" TIMESTAMPTZ(3),
    "published_by_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "question_set_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "questions" (
    "id" UUID NOT NULL,
    "version_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "category" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "response_seconds" INTEGER NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "questions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "interview_sessions" (
    "id" UUID NOT NULL,
    "candidate_id" UUID NOT NULL,
    "application_id" UUID NOT NULL,
    "job_role_id" UUID NOT NULL,
    "question_set_version_id" UUID NOT NULL,
    "status" "InterviewStatus" NOT NULL DEFAULT 'PENDING',
    "invited_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "started_at" TIMESTAMPTZ(3),
    "completed_at" TIMESTAMPTZ(3),
    "submitted_at" TIMESTAMPTZ(3),
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "last_activity_at" TIMESTAMPTZ(3),
    "current_question_id" UUID,
    "reminder_due_at" TIMESTAMPTZ(3),
    "reminder_sent_at" TIMESTAMPTZ(3),
    "is_sample" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "interview_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "interview_session_questions" (
    "id" UUID NOT NULL,
    "session_id" UUID NOT NULL,
    "question_id" UUID NOT NULL,
    "position" INTEGER NOT NULL,
    "code" TEXT NOT NULL,
    "text_snapshot" TEXT NOT NULL,
    "category_snapshot" TEXT NOT NULL,
    "response_seconds" INTEGER NOT NULL,

    CONSTRAINT "interview_session_questions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "interview_answers" (
    "id" UUID NOT NULL,
    "session_id" UUID NOT NULL,
    "session_question_id" UUID NOT NULL,
    "question_code" TEXT NOT NULL,
    "question_set_version_id" UUID NOT NULL,
    "question_text_snapshot" TEXT NOT NULL,
    "category_snapshot" TEXT NOT NULL,
    "transcript" TEXT NOT NULL,
    "source" "AnswerSource" NOT NULL,
    "response_duration_sec" INTEGER NOT NULL,
    "confirmed" BOOLEAN NOT NULL DEFAULT true,
    "confirmed_at" TIMESTAMPTZ(3) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "interview_answers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "interview_transcripts" (
    "id" UUID NOT NULL,
    "answer_id" UUID NOT NULL,
    "kind" "TranscriptKind" NOT NULL,
    "text" TEXT NOT NULL,
    "engine" TEXT,
    "language" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "interview_transcripts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "interview_progress_events" (
    "id" UUID NOT NULL,
    "session_id" UUID NOT NULL,
    "type" "ProgressEventType" NOT NULL,
    "question_code" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "interview_progress_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assessment_reports" (
    "id" UUID NOT NULL,
    "session_id" UUID NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "status" "AssessmentStatus" NOT NULL DEFAULT 'PENDING',
    "is_sample" BOOLEAN NOT NULL DEFAULT false,
    "provider" TEXT,
    "model" TEXT,
    "summary" TEXT,
    "failure_reason" TEXT,
    "generated_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "assessment_reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assessment_criteria" (
    "id" UUID NOT NULL,
    "report_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "score" DECIMAL(4,2),
    "explanation" TEXT,

    CONSTRAINT "assessment_criteria_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assessment_observations" (
    "id" UUID NOT NULL,
    "report_id" UUID NOT NULL,
    "criterion_id" UUID,
    "question_code" TEXT,
    "kind" "ObservationKind" NOT NULL,
    "text" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "assessment_observations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" UUID NOT NULL,
    "recipient_id" UUID NOT NULL,
    "type" "NotificationType" NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "entity_type" TEXT,
    "entity_id" TEXT,
    "dedupe_key" TEXT,
    "read_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL,
    "actor_user_id" UUID,
    "action" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" TEXT NOT NULL,
    "summary" JSONB,
    "request_id" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "integration_references" (
    "id" UUID NOT NULL,
    "system" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "external_id" TEXT NOT NULL,
    "entity_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "integration_references_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "media_assets" (
    "id" UUID NOT NULL,
    "session_id" UUID,
    "candidate_id" UUID,
    "kind" "MediaKind" NOT NULL,
    "bucket" TEXT NOT NULL,
    "object_key" TEXT NOT NULL,
    "content_type" TEXT NOT NULL,
    "size_bytes" BIGINT,
    "status" "MediaStatus" NOT NULL DEFAULT 'PENDING_UPLOAD',
    "retention_until" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "media_assets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "system_settings" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updated_by_id" UUID,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "system_settings_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_firebase_uid_key" ON "users"("firebase_uid");

-- CreateIndex
CREATE INDEX "users_email_idx" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "auth_identities_user_id_provider_key" ON "auth_identities"("user_id", "provider");

-- CreateIndex
CREATE UNIQUE INDEX "roles_code_key" ON "roles"("code");

-- CreateIndex
CREATE UNIQUE INDEX "permissions_code_key" ON "permissions"("code");

-- CreateIndex
CREATE UNIQUE INDEX "job_roles_code_key" ON "job_roles"("code");

-- CreateIndex
CREATE UNIQUE INDEX "job_roles_external_job_id_key" ON "job_roles"("external_job_id");

-- CreateIndex
CREATE UNIQUE INDEX "candidates_external_candidate_id_key" ON "candidates"("external_candidate_id");

-- CreateIndex
CREATE UNIQUE INDEX "candidates_user_id_key" ON "candidates"("user_id");

-- CreateIndex
CREATE INDEX "candidates_email_idx" ON "candidates"("email");

-- CreateIndex
CREATE INDEX "candidates_full_name_idx" ON "candidates"("full_name");

-- CreateIndex
CREATE INDEX "applications_candidate_id_idx" ON "applications"("candidate_id");

-- CreateIndex
CREATE INDEX "applications_job_role_id_idx" ON "applications"("job_role_id");

-- CreateIndex
CREATE INDEX "applications_status_status_changed_at_idx" ON "applications"("status", "status_changed_at");

-- CreateIndex
CREATE INDEX "applications_assigned_recruiter_id_idx" ON "applications"("assigned_recruiter_id");

-- CreateIndex
CREATE UNIQUE INDEX "applications_source_external_application_ref_key" ON "applications"("source", "external_application_ref");

-- CreateIndex
CREATE INDEX "recruitment_events_application_id_created_at_idx" ON "recruitment_events"("application_id", "created_at");

-- CreateIndex
CREATE INDEX "hr_remarks_application_id_created_at_idx" ON "hr_remarks"("application_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "hr_reviews_interview_session_id_key" ON "hr_reviews"("interview_session_id");

-- CreateIndex
CREATE INDEX "hr_reviews_status_created_at_idx" ON "hr_reviews"("status", "created_at");

-- CreateIndex
CREATE INDEX "hr_reviews_application_id_idx" ON "hr_reviews"("application_id");

-- CreateIndex
CREATE UNIQUE INDEX "question_sets_code_key" ON "question_sets"("code");

-- CreateIndex
CREATE UNIQUE INDEX "question_sets_active_version_id_key" ON "question_sets"("active_version_id");

-- CreateIndex
CREATE UNIQUE INDEX "question_set_versions_version_code_key" ON "question_set_versions"("version_code");

-- CreateIndex
CREATE UNIQUE INDEX "question_set_versions_question_set_id_version_key" ON "question_set_versions"("question_set_id", "version");

-- CreateIndex
CREATE UNIQUE INDEX "questions_version_id_code_key" ON "questions"("version_id", "code");

-- CreateIndex
CREATE UNIQUE INDEX "questions_version_id_position_key" ON "questions"("version_id", "position");

-- CreateIndex
CREATE INDEX "interview_sessions_candidate_id_idx" ON "interview_sessions"("candidate_id");

-- CreateIndex
CREATE INDEX "interview_sessions_application_id_idx" ON "interview_sessions"("application_id");

-- CreateIndex
CREATE INDEX "interview_sessions_status_expires_at_idx" ON "interview_sessions"("status", "expires_at");

-- CreateIndex
CREATE INDEX "interview_sessions_completed_at_idx" ON "interview_sessions"("completed_at");

-- CreateIndex
CREATE INDEX "interview_sessions_reminder_due_at_idx" ON "interview_sessions"("reminder_due_at");

-- CreateIndex
CREATE UNIQUE INDEX "interview_session_questions_session_id_question_id_key" ON "interview_session_questions"("session_id", "question_id");

-- CreateIndex
CREATE UNIQUE INDEX "interview_session_questions_session_id_position_key" ON "interview_session_questions"("session_id", "position");

-- CreateIndex
CREATE UNIQUE INDEX "interview_answers_session_question_id_key" ON "interview_answers"("session_question_id");

-- CreateIndex
CREATE INDEX "interview_answers_session_id_idx" ON "interview_answers"("session_id");

-- CreateIndex
CREATE INDEX "interview_transcripts_answer_id_idx" ON "interview_transcripts"("answer_id");

-- CreateIndex
CREATE INDEX "interview_progress_events_session_id_created_at_idx" ON "interview_progress_events"("session_id", "created_at");

-- CreateIndex
CREATE INDEX "assessment_reports_status_idx" ON "assessment_reports"("status");

-- CreateIndex
CREATE UNIQUE INDEX "assessment_reports_session_id_version_key" ON "assessment_reports"("session_id", "version");

-- CreateIndex
CREATE UNIQUE INDEX "assessment_criteria_report_id_code_key" ON "assessment_criteria"("report_id", "code");

-- CreateIndex
CREATE INDEX "assessment_observations_report_id_idx" ON "assessment_observations"("report_id");

-- CreateIndex
CREATE UNIQUE INDEX "notifications_dedupe_key_key" ON "notifications"("dedupe_key");

-- CreateIndex
CREATE INDEX "notifications_recipient_id_read_at_created_at_idx" ON "notifications"("recipient_id", "read_at", "created_at");

-- CreateIndex
CREATE INDEX "audit_logs_entity_type_entity_id_created_at_idx" ON "audit_logs"("entity_type", "entity_id", "created_at");

-- CreateIndex
CREATE INDEX "audit_logs_actor_user_id_created_at_idx" ON "audit_logs"("actor_user_id", "created_at");

-- CreateIndex
CREATE INDEX "integration_references_entity_type_entity_id_idx" ON "integration_references"("entity_type", "entity_id");

-- CreateIndex
CREATE UNIQUE INDEX "integration_references_system_entity_type_external_id_key" ON "integration_references"("system", "entity_type", "external_id");

-- CreateIndex
CREATE UNIQUE INDEX "media_assets_object_key_key" ON "media_assets"("object_key");

-- CreateIndex
CREATE INDEX "media_assets_session_id_idx" ON "media_assets"("session_id");

-- AddForeignKey
ALTER TABLE "auth_identities" ADD CONSTRAINT "auth_identities_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_permission_id_fkey" FOREIGN KEY ("permission_id") REFERENCES "permissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_assigned_by_id_fkey" FOREIGN KEY ("assigned_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_roles" ADD CONSTRAINT "job_roles_default_question_set_id_fkey" FOREIGN KEY ("default_question_set_id") REFERENCES "question_sets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "candidates" ADD CONSTRAINT "candidates_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "applications" ADD CONSTRAINT "applications_candidate_id_fkey" FOREIGN KEY ("candidate_id") REFERENCES "candidates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "applications" ADD CONSTRAINT "applications_job_role_id_fkey" FOREIGN KEY ("job_role_id") REFERENCES "job_roles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "applications" ADD CONSTRAINT "applications_assigned_recruiter_id_fkey" FOREIGN KEY ("assigned_recruiter_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recruitment_events" ADD CONSTRAINT "recruitment_events_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "applications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recruitment_events" ADD CONSTRAINT "recruitment_events_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hr_remarks" ADD CONSTRAINT "hr_remarks_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "applications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hr_remarks" ADD CONSTRAINT "hr_remarks_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hr_reviews" ADD CONSTRAINT "hr_reviews_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "applications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hr_reviews" ADD CONSTRAINT "hr_reviews_interview_session_id_fkey" FOREIGN KEY ("interview_session_id") REFERENCES "interview_sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hr_reviews" ADD CONSTRAINT "hr_reviews_reviewer_id_fkey" FOREIGN KEY ("reviewer_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "question_sets" ADD CONSTRAINT "question_sets_active_version_id_fkey" FOREIGN KEY ("active_version_id") REFERENCES "question_set_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "question_set_versions" ADD CONSTRAINT "question_set_versions_question_set_id_fkey" FOREIGN KEY ("question_set_id") REFERENCES "question_sets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "question_set_versions" ADD CONSTRAINT "question_set_versions_published_by_id_fkey" FOREIGN KEY ("published_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "questions" ADD CONSTRAINT "questions_version_id_fkey" FOREIGN KEY ("version_id") REFERENCES "question_set_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interview_sessions" ADD CONSTRAINT "interview_sessions_candidate_id_fkey" FOREIGN KEY ("candidate_id") REFERENCES "candidates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interview_sessions" ADD CONSTRAINT "interview_sessions_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "applications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interview_sessions" ADD CONSTRAINT "interview_sessions_job_role_id_fkey" FOREIGN KEY ("job_role_id") REFERENCES "job_roles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interview_sessions" ADD CONSTRAINT "interview_sessions_question_set_version_id_fkey" FOREIGN KEY ("question_set_version_id") REFERENCES "question_set_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interview_session_questions" ADD CONSTRAINT "interview_session_questions_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "interview_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interview_session_questions" ADD CONSTRAINT "interview_session_questions_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "questions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interview_answers" ADD CONSTRAINT "interview_answers_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "interview_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interview_answers" ADD CONSTRAINT "interview_answers_session_question_id_fkey" FOREIGN KEY ("session_question_id") REFERENCES "interview_session_questions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interview_transcripts" ADD CONSTRAINT "interview_transcripts_answer_id_fkey" FOREIGN KEY ("answer_id") REFERENCES "interview_answers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interview_progress_events" ADD CONSTRAINT "interview_progress_events_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "interview_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assessment_reports" ADD CONSTRAINT "assessment_reports_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "interview_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assessment_criteria" ADD CONSTRAINT "assessment_criteria_report_id_fkey" FOREIGN KEY ("report_id") REFERENCES "assessment_reports"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assessment_observations" ADD CONSTRAINT "assessment_observations_report_id_fkey" FOREIGN KEY ("report_id") REFERENCES "assessment_reports"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assessment_observations" ADD CONSTRAINT "assessment_observations_criterion_id_fkey" FOREIGN KEY ("criterion_id") REFERENCES "assessment_criteria"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_recipient_id_fkey" FOREIGN KEY ("recipient_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "media_assets" ADD CONSTRAINT "media_assets_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "interview_sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "media_assets" ADD CONSTRAINT "media_assets_candidate_id_fkey" FOREIGN KEY ("candidate_id") REFERENCES "candidates"("id") ON DELETE SET NULL ON UPDATE CASCADE;
