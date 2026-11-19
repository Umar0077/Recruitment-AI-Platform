/** Describes current capture/storage behavior; no retention or legal-policy promises. */
export const INTERVIEW_PRIVACY = {
  text: "Confirmed answers, available original speech-recognition text and cleaned suggestions, and response times are saved when you confirm an answer. You can review and edit the answer before confirming. Practice answers are not saved for assessment.",
  camera: "Equipment and practice camera previews stay in your browser. For connected interviews, recording is offered only when approved retention and private storage are configured, with separate unchecked consent and a preview before starting. The recording screen describes the chosen screen, camera, microphone, optional shared audio, reviewer access, retention and stopping controls. You may continue without recording or request an alternative. InterviewOS does not assess images, appearance or emotions.",
  speech: "Speech recognition uses your browser's speech service, which may send microphone audio to the browser provider for processing. You can type instead. Review recognized words before confirming, especially any words marked as unfinalized.",
  voice: "Spoken questions use browser speech synthesis. Available voices may run on your device or use the browser's remote voice service. You can mute the interviewer and read every question on screen.",
  equipment: "The optional five-second microphone test makes a temporary recording for playback in this tab. InterviewOS does not upload it; it is discarded when you discard the clip or leave the equipment check.",
  apiStorage: "For a connected interview, confirmed text, retained transcript versions and response times are sent to the InterviewOS backend and stored with your application for authorized recruitment review.",
  demoStorage: "Demo Mode keeps confirmed text, retained transcript versions and response times in this browser's local storage for the demo review. Use fictional information only; the demo is not a real application or recruitment assessment.",
};

export function interviewStorageNotice(apiMode: boolean) { return apiMode ? INTERVIEW_PRIVACY.apiStorage : INTERVIEW_PRIVACY.demoStorage; }
export function interviewReviewNotice(apiMode: boolean) {
  return apiMode
    ? "Authorized recruitment staff can review your saved answers. Assessment uses the answer you confirm; original and cleaned versions are kept separately. AI observations are available only when assessment and its provider policy allow them."
    : "The demo review is available in this browser. Demo assessments are illustrative. Original and cleaned versions stay separate from the answer you confirm.";
}
