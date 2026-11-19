/** Candidate-reviewed assessment text and separately retained capture/formatting versions. */
export function TranscriptVersions({ answer }: { answer: { transcript: string; originalTranscript?: string | null; cleanedTranscript?: string | null; hasUnfinalized?: boolean | null; interimTranscript?: string | null; originalFinalOnly?: boolean; language?: string | null } }) {
  return <div className="mt-3 space-y-3">
    <div className="border-l-2 border-brand/40 pl-3">
      <p className="text-[11px] font-semibold text-brand-cyan">Candidate-confirmed answer · assessment text</p>
      <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-relaxed text-fg-secondary">{answer.transcript}</p>
    </div>
    <details className="rounded-lg border border-subtle bg-overlay/[0.02] px-3 py-2">
      <summary className="cursor-pointer text-xs font-medium text-fg-secondary">Original and cleaned transcript</summary>
      <div className="mt-3 space-y-4">
        <div><h4 className="text-xs font-semibold text-fg">Original captured transcript</h4><p className="mt-1 whitespace-pre-wrap break-words text-sm leading-relaxed text-fg-secondary">{answer.originalTranscript == null ? "Original transcript unavailable for this answer." : answer.originalTranscript || "No original text was captured."}</p></div>
        {answer.hasUnfinalized && <p className="text-xs leading-relaxed text-amber-800 dark:text-amber-200">Recognition stopped with unfinished words. The candidate reviewed the answer before confirming it.</p>}
        {answer.interimTranscript && <div><h4 className="text-xs font-semibold text-fg">Unfinalized recognition</h4><p className="mt-1 whitespace-pre-wrap text-sm text-fg-secondary">{answer.interimTranscript}</p></div>}
        <div><h4 className="text-xs font-semibold text-fg">Cleaned transcript suggestion</h4><p className="mt-1 whitespace-pre-wrap break-words text-sm leading-relaxed text-fg-secondary">{answer.cleanedTranscript == null ? "No cleaned version was saved." : answer.cleanedTranscript || "The cleaned suggestion was empty."}</p><p className="mt-1 text-[11px] leading-relaxed text-fg-muted">Local formatting suggestion, retained separately. Assessment uses the candidate-confirmed answer above.</p></div>
        {answer.language && <p className="text-xs text-fg-muted">Capture language: {answer.language}</p>}
      </div>
    </details>
  </div>;
}
