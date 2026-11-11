/**
 * Turn-based voice interview state machine.
 * AI speaks → candidate clicks mic → answers → reviews → confirms → next question.
 * Every event is checked against ALLOWED; anything else is ignored, which prevents double
 * playback, overlapping recordings, and skipped questions.
 */
export type VoiceState =
  | "idle"
  | "loading_question"
  | "tts_ready"
  | "ai_speaking"
  | "awaiting_candidate"
  | "microphone_initializing"
  | "listening"
  | "transcribing"
  | "answer_review"
  | "answer_confirmed"
  | "next_question"
  | "interview_complete"
  | "submission_complete"
  | "error";

export type InputMode = "voice" | "typed";

export interface VoiceMachine {
  status: VoiceState;
  index: number;
  draft: string;
  inputMode: InputMode;
  /** Non-blocking notice (e.g. voice playback failed). */
  notice?: string;
  error?: { kind: "microphone" | "recognition"; message: string };
  /** Epoch ms when this question's response time started. */
  responseStartedAt?: number;
  timedOut: boolean;
  /** Bumps on every replay so the playback effect re-runs. */
  playId: number;
  /** Where to return after a replay finishes (keeps a draft answer under review). */
  afterSpeech?: "awaiting_candidate" | "answer_review";
}

export type VoiceEvent =
  | { type: "START" }
  | { type: "QUESTION_READY" }
  | { type: "TTS_STARTED" }
  | { type: "TTS_DONE" }
  | { type: "TTS_SKIPPED"; notice?: string }
  | { type: "REPLAY" }
  | { type: "MIC_START" }
  | { type: "MIC_READY" }
  | { type: "MIC_FAILED"; kind: "microphone" | "recognition"; message: string }
  | { type: "STOP" }
  | { type: "TRANSCRIPT_READY"; text: string; notice?: string }
  | { type: "TYPE_INSTEAD" }
  | { type: "EDIT"; text: string }
  | { type: "RETRY" }
  | { type: "CONFIRM" }
  | { type: "NEXT"; total: number }
  | { type: "SUBMITTED" }
  | { type: "TIMEOUT" }
  | { type: "DISMISS_ERROR" };

const ALLOWED: Record<VoiceState, VoiceEvent["type"][]> = {
  idle: ["START"],
  loading_question: ["QUESTION_READY"],
  tts_ready: ["TTS_STARTED", "TTS_SKIPPED", "TTS_DONE"],
  ai_speaking: ["TTS_DONE", "TTS_SKIPPED", "REPLAY"],
  awaiting_candidate: ["MIC_START", "TYPE_INSTEAD", "REPLAY", "TIMEOUT"],
  microphone_initializing: ["MIC_READY", "MIC_FAILED"],
  listening: ["STOP", "TIMEOUT", "MIC_FAILED"],
  transcribing: ["TRANSCRIPT_READY"],
  answer_review: ["EDIT", "RETRY", "CONFIRM", "REPLAY", "MIC_START"],
  answer_confirmed: ["NEXT"],
  next_question: ["QUESTION_READY"],
  interview_complete: ["SUBMITTED"],
  submission_complete: [],
  error: ["DISMISS_ERROR", "MIC_START", "TYPE_INSTEAD", "REPLAY"],
};

export const initialVoice = (index = 0): VoiceMachine => ({ status: "idle", index, draft: "", inputMode: "voice", timedOut: false, playId: 0 });

export function voiceReducer(s: VoiceMachine, e: VoiceEvent): VoiceMachine {
  if (!ALLOWED[s.status].includes(e.type)) {
    if (process.env.NODE_ENV !== "production") console.debug(`[interview] ignored ${e.type} in ${s.status}`);
    return s;
  }
  switch (e.type) {
    case "START":
      return { ...s, status: "loading_question" };
    case "QUESTION_READY":
      return { ...s, status: "tts_ready", draft: "", inputMode: "voice", notice: undefined, error: undefined, responseStartedAt: undefined, timedOut: false, afterSpeech: undefined };
    case "TTS_STARTED":
      return { ...s, status: "ai_speaking" };
    case "TTS_DONE":
      return { ...s, status: s.afterSpeech ?? "awaiting_candidate", afterSpeech: undefined, responseStartedAt: s.responseStartedAt ?? Date.now() };
    case "TTS_SKIPPED":
      return { ...s, status: s.afterSpeech ?? "awaiting_candidate", afterSpeech: undefined, notice: e.notice, responseStartedAt: s.responseStartedAt ?? Date.now() };
    case "REPLAY":
      return { ...s, status: "ai_speaking", playId: s.playId + 1, notice: undefined, afterSpeech: s.status === "answer_review" ? "answer_review" : s.status === "ai_speaking" ? s.afterSpeech : "awaiting_candidate" };
    case "MIC_START":
      return { ...s, status: "microphone_initializing", error: undefined, notice: undefined, inputMode: "voice", responseStartedAt: s.responseStartedAt ?? Date.now() };
    case "MIC_READY":
      return { ...s, status: "listening" };
    case "MIC_FAILED":
      return { ...s, status: "error", error: { kind: e.kind, message: e.message } };
    case "STOP":
      return { ...s, status: "transcribing" };
    case "TRANSCRIPT_READY":
      return { ...s, status: "answer_review", draft: e.text, notice: e.notice };
    case "TYPE_INSTEAD":
      return { ...s, status: "answer_review", inputMode: "typed", error: undefined, responseStartedAt: s.responseStartedAt ?? Date.now() };
    case "EDIT":
      return { ...s, draft: e.text };
    case "RETRY":
      return { ...s, status: "awaiting_candidate", draft: "", notice: undefined, timedOut: false };
    case "CONFIRM":
      return { ...s, status: "answer_confirmed" };
    case "NEXT":
      return s.index + 1 >= e.total ? { ...s, status: "interview_complete" } : { ...s, status: "next_question", index: s.index + 1 };
    case "SUBMITTED":
      return { ...s, status: "submission_complete" };
    case "TIMEOUT":
      // Never discard: keep any transcript and move to review.
      return s.status === "listening" ? { ...s, status: "transcribing", timedOut: true } : { ...s, status: "answer_review", inputMode: "typed", timedOut: true, notice: "Response time is up. You can still type or confirm your answer." };
    case "DISMISS_ERROR":
      return { ...s, status: "awaiting_candidate", error: undefined };
  }
}

export const STATE_LABEL: Record<VoiceState, string> = {
  idle: "Ready to begin",
  loading_question: "Preparing Question",
  tts_ready: "Preparing Voice",
  ai_speaking: "AI Speaking",
  awaiting_candidate: "Your Turn",
  microphone_initializing: "Starting Microphone",
  listening: "Listening",
  transcribing: "Processing Speech",
  answer_review: "Review Your Answer",
  answer_confirmed: "Answer Saved",
  next_question: "Next Question",
  interview_complete: "Finishing Interview",
  submission_complete: "Submitted",
  error: "Needs Attention",
};
