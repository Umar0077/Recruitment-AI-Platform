ALTER TABLE "interview_sessions" ADD COLUMN "initial_assignment_key" TEXT; CREATE UNIQUE INDEX "interview_sessions_initial_assignment_key_key" ON "interview_sessions"("initial_assignment_key");
