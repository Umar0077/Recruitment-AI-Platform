-- AlterTable
ALTER TABLE "assessment_reports" ADD COLUMN     "findings" JSONB,
ADD COLUMN     "next_attempt_at" TIMESTAMPTZ(3),
ADD COLUMN     "nlp" JSONB,
ADD COLUMN     "phase" TEXT NOT NULL DEFAULT 'NOT_GENERATED',
ADD COLUMN     "processing_at" TIMESTAMPTZ(3),
ADD COLUMN     "prompt_version" TEXT,
ADD COLUMN     "rubric_snapshot" JSONB;

-- CreateTable
CREATE TABLE "reference_rubric_versions" (
    "id" UUID NOT NULL,
    "question_id" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "content" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "approved_by_id" UUID,
    "approved_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "reference_rubric_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "llm_request_usage" (
    "id" UUID NOT NULL,
    "report_id" UUID,
    "model" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "attempt" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'RESERVED',
    "http_status" INTEGER,
    "tokens" INTEGER NOT NULL DEFAULT 0,
    "latency_ms" INTEGER,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finished_at" TIMESTAMPTZ(3),

    CONSTRAINT "llm_request_usage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assessment_corrections" (
    "id" UUID NOT NULL,
    "report_id" UUID NOT NULL,
    "actor_user_id" UUID NOT NULL,
    "question_code" TEXT,
    "relevance" TEXT,
    "note" TEXT NOT NULL,
    "reviewed" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "assessment_corrections_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "reference_rubric_versions_question_id_version_key" ON "reference_rubric_versions"("question_id", "version");

-- CreateIndex
CREATE INDEX "llm_request_usage_created_at_idx" ON "llm_request_usage"("created_at");

-- CreateIndex
CREATE INDEX "assessment_corrections_report_id_created_at_idx" ON "assessment_corrections"("report_id", "created_at");

-- AddForeignKey
ALTER TABLE "reference_rubric_versions" ADD CONSTRAINT "reference_rubric_versions_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "questions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "llm_request_usage" ADD CONSTRAINT "llm_request_usage_report_id_fkey" FOREIGN KEY ("report_id") REFERENCES "assessment_reports"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assessment_corrections" ADD CONSTRAINT "assessment_corrections_report_id_fkey" FOREIGN KEY ("report_id") REFERENCES "assessment_reports"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
