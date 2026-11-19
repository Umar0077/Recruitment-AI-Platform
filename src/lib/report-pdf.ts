"use client";
import { toast } from "sonner";

/**
 * Exports the authoritative HR Assessment Report (.print-area) to A4 PDF via browser print.
 * - Never includes unsaved form drafts (inputs live in .no-print; warns if a draft is dirty).
 * - Temporarily opens collapsible <details> inside .print-area so evidence is complete in the PDF.
 * - Sets a clean document title for the saved PDF filename and restores state after printing.
 */
export function exportAssessmentReportPdf({
  reference,
  candidateName,
  hasUnsavedDraft = false,
}: {
  reference: string;
  candidateName: string;
  hasUnsavedDraft?: boolean;
}) {
  if (typeof window === "undefined") return;

  const dirty = hasUnsavedDraft || !!document.querySelector('[data-report-draft-dirty="true"]');
  if (dirty) {
    toast.warning("Unsaved draft excluded from PDF.", {
      description: "Only saved, persisted HR decisions and notes are included in exported reports.",
    });
  } else {
    toast.info("Opening PDF export — choose “Save as PDF” to download.");
  }

  const prevTitle = document.title;
  const safeName = candidateName.replace(/[^a-zA-Z0-9_-]+/g, "-").replace(/^-|-$/g, "");
  const safeRef = reference.replace(/[^a-zA-Z0-9_-]+/g, "-");
  document.title = `InterviewOS-Report-${safeRef}-${safeName}`;

  const closedDetails: HTMLDetailsElement[] = [];
  document.querySelectorAll<HTMLDetailsElement>(".print-area details:not([open])").forEach((el) => {
    closedDetails.push(el);
    el.open = true;
  });

  const restore = () => {
    document.title = prevTitle;
    closedDetails.forEach((el) => {
      el.open = false;
    });
    window.removeEventListener("afterprint", restore);
  };

  window.addEventListener("afterprint", restore);
  try {
    window.print();
  } finally {
    // Fallback restore for headless/test environments where afterprint does not fire synchronously
    setTimeout(restore, 1000);
  }
}
