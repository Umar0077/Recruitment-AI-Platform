"use client";
import { useEffect, useState } from "react";

/** Server search starts only after typing settles and is cancelled immediately on close. */
export function useCommandSearch(open: boolean, query: string, enabled: boolean, delayMs = 250) {
  const [settled, setSettled] = useState("");
  const term = query.trim();
  useEffect(() => {
    if (!enabled || !open || term.length < 2) { setSettled(""); return; }
    const timer = setTimeout(() => setSettled(term), delayMs);
    return () => clearTimeout(timer);
  }, [open, enabled, term, delayMs]);
  return enabled && open && term.length >= 2 && settled === term ? settled : "";
}
