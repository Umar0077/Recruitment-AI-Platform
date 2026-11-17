CREATE TABLE "interview_recordings" (
"id" UUID NOT NULL, "session_id" UUID NOT NULL, "candidate_id" UUID NOT NULL, "client_id" UUID NOT NULL,
"status" TEXT NOT NULL DEFAULT 'RECORDING', "object_key" TEXT NOT NULL, "upload_id" TEXT, "content_type" TEXT NOT NULL,
"size_bytes" INTEGER, "duration_ms" INTEGER, "consent_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
"policy_reference" TEXT NOT NULL, "monitoring_consent" BOOLEAN NOT NULL DEFAULT false, "camera_consent" BOOLEAN NOT NULL,
"system_audio_consent" BOOLEAN NOT NULL, "display_surface" TEXT NOT NULL, "retention_until" TIMESTAMPTZ(3) NOT NULL,
"completed_at" TIMESTAMPTZ(3), "deleted_at" TIMESTAMPTZ(3), "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
"updated_at" TIMESTAMPTZ(3) NOT NULL, CONSTRAINT "interview_recordings_pkey" PRIMARY KEY ("id"),
CONSTRAINT "interview_recordings_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "interview_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE);
CREATE UNIQUE INDEX "interview_recordings_client_id_key" ON "interview_recordings"("client_id");
CREATE UNIQUE INDEX "interview_recordings_object_key_key" ON "interview_recordings"("object_key");
CREATE INDEX "interview_recordings_session_id_created_at_idx" ON "interview_recordings"("session_id", "created_at");
CREATE INDEX "interview_recordings_status_retention_until_idx" ON "interview_recordings"("status", "retention_until");
CREATE TABLE "recording_segments" ("id" UUID NOT NULL, "recording_id" UUID NOT NULL, "part_number" INTEGER NOT NULL, "size_bytes" INTEGER NOT NULL, "etag" TEXT,
CONSTRAINT "recording_segments_pkey" PRIMARY KEY ("id"), CONSTRAINT "recording_segments_recording_id_fkey" FOREIGN KEY ("recording_id") REFERENCES "interview_recordings"("id") ON DELETE CASCADE ON UPDATE CASCADE);
CREATE UNIQUE INDEX "recording_segments_recording_id_part_number_key" ON "recording_segments"("recording_id", "part_number");
CREATE TABLE "interview_session_events" ("id" UUID NOT NULL, "session_id" UUID NOT NULL, "recording_id" UUID NOT NULL, "type" TEXT NOT NULL, "occurred_at" TIMESTAMPTZ(3) NOT NULL, "received_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "duration_ms" INTEGER, "capture_state" TEXT NOT NULL,
CONSTRAINT "interview_session_events_pkey" PRIMARY KEY ("id"),
CONSTRAINT "interview_session_events_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "interview_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
CONSTRAINT "interview_session_events_recording_id_fkey" FOREIGN KEY ("recording_id") REFERENCES "interview_recordings"("id") ON DELETE CASCADE ON UPDATE CASCADE);
CREATE INDEX "interview_session_events_session_id_occurred_at_idx" ON "interview_session_events"("session_id", "occurred_at");
