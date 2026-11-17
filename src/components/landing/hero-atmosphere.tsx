"use client";
import { useEffect, useRef } from "react";
import { useSpring } from "motion/react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useMediaQuery, usePrefersReducedMotion } from "@/hooks/use-demo";
import { subscribePointer } from "@/components/motion/pointer-system";

/** All SSR markup is fixed; springs, visibility and scroll effects begin after mount. */
export function HeroAtmosphere() {
  const root = useRef<HTMLDivElement>(null);
  const reduce = usePrefersReducedMotion();
  const fine = useMediaQuery("(min-width: 768px) and (hover: hover) and (pointer: fine)");
  const x = useSpring(0, { stiffness: 55, damping: 22 });
  const y = useSpring(0, { stiffness: 55, damping: 22 });
  useEffect(() => {
    const el = root.current; if (!el) return;
    let visible = false, idle = 0;
    const reset = () => { x.set(0); y.set(0); };
    const sync = () => {
      const paused = !visible || document.hidden || reduce;
      el.dataset.paused = String(paused);
      if (paused) { clearTimeout(idle); x.jump(0); y.jump(0); }
    };
    const stopX = x.on("change", value => el.style.setProperty("--field-x", value.toFixed(3)));
    const stopY = y.on("change", value => el.style.setProperty("--field-y", value.toFixed(3)));
    const stopPointer = fine && !reduce ? subscribePointer(p => {
      clearTimeout(idle);
      if (el.dataset.paused === "true") return;
      if (!p.active) { reset(); return; }
      x.set(p.x); y.set(p.y);
      idle = window.setTimeout(reset, 1600);
    }) : () => {};
    const observer = new IntersectionObserver(([entry]) => { visible = !!entry?.isIntersecting; sync(); });
    observer.observe(el); sync(); document.addEventListener("visibilitychange", sync);
    let context: gsap.Context | undefined;
    if (!reduce && fine) {
      gsap.registerPlugin(ScrollTrigger);
      context = gsap.context(() => {
        gsap.to(el, { "--field-scroll": "42px", ease: "none", scrollTrigger: { trigger: el.closest("section"), start: "top top", end: "bottom top", scrub: true } });
      });
    }
    return () => {
      context?.revert(); observer.disconnect(); clearTimeout(idle); stopPointer();
      document.removeEventListener("visibilitychange", sync); x.jump(0); y.jump(0); stopX(); stopY();
    };
  }, [fine, reduce, x, y]);

  return <div ref={root} className="hero-atmosphere" data-paused="true" aria-hidden="true">
    <div className="atmosphere-light"><div className="atmosphere-bloom" /></div>
    <div className="atmosphere-depth atmosphere-depth-far">
      <svg viewBox="0 0 1440 900" preserveAspectRatio="xMidYMid slice" className="atmosphere-traces">
        <path d="M650 870C700 590 940 690 1030 420S1240 100 1500 160" />
        <path d="M760 940C800 650 1070 660 1140 410S1320 210 1540 230" />
        <path d="M940 960C950 740 1260 650 1290 410S1440 290 1600 310" />
      </svg>
    </div>
    <div className="atmosphere-depth atmosphere-depth-near">
      <div className="atmosphere-contour" />
      {Array.from({ length: 18 }, (_, i) => <span key={i} className="atmosphere-particle" style={{
        left: `${34 + (i * 29) % 64}%`, top: `${12 + (i * 17) % 74}%`,
        animationDelay: `${-(i % 9)}s`, animationDuration: `${16 + (i % 5) * 3}s`,
        width: i % 4 === 0 ? 3 : 2, height: i % 4 === 0 ? 3 : 2,
      }} />)}
    </div>
  </div>;
}
