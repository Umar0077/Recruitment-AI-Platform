import "reflect-metadata";
import { validateEnv } from "../../src/config/env.validation";
const lab = { NODE_ENV: "development", DATABASE_URL: "postgresql://fixture:fixture@127.0.0.1/interviewos_recording_lab", AUTH_MODE: "firebase", FIREBASE_PROJECT_ID: "demo-interviewos-recording", FIREBASE_AUTH_EMULATOR_HOST: "127.0.0.1:9199", FRONTEND_ORIGINS: "http://127.0.0.1:3100", RECORDING_MODE: "local_test", RECORDING_RETENTION_DAYS: 1, RECORDING_S3_ENDPOINT: "http://127.0.0.1:9100", RECORDING_S3_BUCKET: "interviewos-recording-lab", RECORDING_S3_CORS_MODE: "probe", AI_ASSESSMENT_ENABLED: false, AI_ASSESSMENT_MODE: "disabled", OPENROUTER_API_KEY: "" };
it("accepts only the dedicated fictional local configuration", () => { expect(validateEnv(lab).RECORDING_MODE).toBe("local_test"); });
it.each([
  { NODE_ENV: "production" }, { DATABASE_URL: "postgresql://fixture:fixture@127.0.0.1/interviewos" },
  { FIREBASE_PROJECT_ID: "real-project" }, { FRONTEND_ORIGINS: "http://localhost:3000" },
  { RECORDING_S3_ENDPOINT: "https://storage.example.test" }, { RECORDING_S3_BUCKET: "real-bucket" },
  { RECORDING_RETENTION_DAYS: 30 }, { AI_ASSESSMENT_ENABLED: true }, { OPENROUTER_API_KEY: "fictional-not-a-real-key" },
  { RECORDING_MODE: "approved" },
])("rejects unsafe lab isolation changes (%#)", override => { expect(() => validateEnv({ ...lab, ...override })).toThrow(); });
