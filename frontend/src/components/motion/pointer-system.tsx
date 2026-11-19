"use client";
import { useEffect } from "react";
import { useMediaQuery, usePrefersReducedMotion } from "@/hooks/use-demo";

type Point = { x: number; y: number; active: boolean };
const subscribers = new Set<(point: Point) => void>();
export function subscribePointer(callback: (point: Point) => void) {
  subscribers.add(callback);
  return () => { subscribers.delete(callback); };
}

/** One passive pointer listener for the app. No React state updates during pointer movement.
 * Only the hovered surface is painted; magnetic motion runs until its spring settles.
 */
export function PointerSystem() {
  const fine = useMediaQuery("(hover: hover) and (pointer: fine)");
  const reduce = usePrefersReducedMotion();
  useEffect(() => {
    if (!fine || reduce) return;
    let raf = 0, last = 0, dirty = false;
    let x = 0, y = 0, target: Element | null = null;
    let surface: HTMLElement | null = null, ambient: HTMLElement | null = null, magnet: HTMLElement | null = null;
    let sx = 0, sy = 0, vx = 0, vy = 0, tx = 0, ty = 0;
    const resetMagnet = () => {
      if (magnet) { magnet.style.removeProperty("--magnet-x"); magnet.style.removeProperty("--magnet-y"); }
      magnet = null; sx = sy = vx = vy = tx = ty = 0;
    };
    const frame = (time: number) => {
      raf = 0;
      const dt = Math.min((time - (last || time - 16)) / 1000, 0.032); last = time;
      if (dirty) {
        dirty = false;
        const next = target?.closest<HTMLElement>("[data-pointer-surface]") ?? null;
        if (surface !== next) { surface?.removeAttribute("data-pointer-active"); surface = next; }
        if (surface) {
          const box = surface.getBoundingClientRect();
          surface.style.setProperty("--spot-x", `${x - box.left}px`);
          surface.style.setProperty("--spot-y", `${y - box.top}px`);
          if (surface.hasAttribute("data-depth-card")) {
            surface.style.setProperty("--tilt-x", `${Math.max(-1, Math.min(1, (0.5 - (y - box.top) / box.height) * 2))}deg`);
            surface.style.setProperty("--tilt-y", `${Math.max(-1, Math.min(1, ((x - box.left) / box.width - 0.5) * 2))}deg`);
          }
          surface.setAttribute("data-pointer-active", "true");
        }
        const nextAmbient = target?.closest<HTMLElement>("[data-pointer-ambient]") ?? null;
        if (ambient && ambient !== nextAmbient) { ambient.style.removeProperty("--ambient-x"); ambient.style.removeProperty("--ambient-y"); }
        ambient = nextAmbient;
        if (ambient) {
          ambient.style.setProperty("--ambient-x", `${(x / innerWidth - 0.5) * 22}px`);
          ambient.style.setProperty("--ambient-y", `${(y / innerHeight - 0.5) * 16}px`);
        }
        const nextMagnet = target?.closest<HTMLElement>("[data-magnetic]:not(:disabled):not([aria-disabled=true])") ?? null;
        if (magnet !== nextMagnet) { resetMagnet(); magnet = nextMagnet; }
        if (magnet) {
          const box = magnet.getBoundingClientRect();
          tx = Math.max(-3, Math.min(3, (x - box.left - box.width / 2) * 0.035));
          ty = Math.max(-2, Math.min(2, (y - box.top - box.height / 2) * 0.04));
        }
        subscribers.forEach(fn => fn({ x: x / innerWidth * 2 - 1, y: y / innerHeight * 2 - 1, active: true }));
      }
      if (magnet) {
        vx += ((tx - sx) * 220 - vx * 25) * dt; vy += ((ty - sy) * 220 - vy * 25) * dt;
        sx += vx * dt; sy += vy * dt;
        magnet.style.setProperty("--magnet-x", `${sx.toFixed(2)}px`); magnet.style.setProperty("--magnet-y", `${sy.toFixed(2)}px`);
        if (Math.abs(tx - sx) + Math.abs(ty - sy) + Math.abs(vx) + Math.abs(vy) > 0.02) raf = requestAnimationFrame(frame);
      }
    };
    const move = (event: PointerEvent) => {
      if (event.pointerType === "touch") return;
      x = event.clientX; y = event.clientY; target = event.target instanceof Element ? event.target : null; dirty = true;
      if (!raf) { last = 0; raf = requestAnimationFrame(frame); }
    };
    const reset = () => {
      cancelAnimationFrame(raf); raf = 0; dirty = false; resetMagnet();
      surface?.removeAttribute("data-pointer-active"); surface = null;
      ambient?.style.removeProperty("--ambient-x"); ambient?.style.removeProperty("--ambient-y"); ambient = null;
      subscribers.forEach(fn => fn({ x: 0, y: 0, active: false }));
    };
    const visibility = () => { if (document.hidden) reset(); };
    window.addEventListener("pointermove", move, { passive: true });
    document.documentElement.addEventListener("pointerleave", reset);
    document.addEventListener("visibilitychange", visibility);
    window.addEventListener("blur", reset);
    window.addEventListener("scroll", reset, { passive: true });
    return () => {
      reset(); window.removeEventListener("pointermove", move); window.removeEventListener("blur", reset); window.removeEventListener("scroll", reset);
      document.documentElement.removeEventListener("pointerleave", reset); document.removeEventListener("visibilitychange", visibility);
    };
  }, [fine, reduce]);
  return null;
}
