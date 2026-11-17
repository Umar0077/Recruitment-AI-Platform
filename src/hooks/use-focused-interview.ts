"use client";
import { useEffect, useState } from "react";
/** Fullscreen is voluntary and never intercepts browser/OS shortcuts. */
export function useFocusedInterview() {
  const [active, setActive] = useState(false), [supported, setSupported] = useState(false), [error, setError] = useState("");
  useEffect(() => {
    const changed = () => setActive(!!document.fullscreenElement);
    setSupported(!!document.fullscreenEnabled && typeof document.documentElement.requestFullscreen === "function"); changed();
    document.addEventListener("fullscreenchange", changed);
    return () => document.removeEventListener("fullscreenchange", changed);
  }, []);
  const toggle = async () => {
    setError("");
    try { if (document.fullscreenElement) await document.exitFullscreen(); else if (supported) await document.documentElement.requestFullscreen(); else setError("Fullscreen is unavailable. Your interview can continue normally."); }
    catch { setError("Fullscreen could not open. Your interview can continue normally."); }
  };
  return { active, supported, error, toggle };
}
