"use client";
import * as React from "react";
import { motion, useReducedMotion, type HTMLMotionProps } from "motion/react";

export const EASE = [0.22, 1, 0.36, 1] as const;
export const DURATION = { micro: 0.15, button: 0.2, dropdown: 0.22, modal: 0.28, card: 0.38, page: 0.32, reveal: 0.64 } as const;

/** Scroll reveal. Content is visible without JS / with reduced motion. */
export function Reveal({ children, delay = 0, y = 18, className, ...rest }: { children: React.ReactNode; delay?: number; y?: number; className?: string } & Omit<HTMLMotionProps<"div">, "children">) {
  const reduce = useReducedMotion();
  if (reduce) return <div className={className}>{children}</div>;
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0.4, y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "0px 0px -60px 0px" }}
      transition={{ duration: DURATION.reveal, ease: EASE, delay }}
      {...rest}
    >
      {children}
    </motion.div>
  );
}

/** Short page-level entrance used inside route templates. */
export function PageTransition({ children, className }: { children: React.ReactNode; className?: string }) {
  const reduce = useReducedMotion();
  return (
    <motion.div className={className} initial={reduce ? false : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: DURATION.page, ease: EASE }}>
      {children}
    </motion.div>
  );
}

export function Stagger({ children, className, delay = 0.05 }: { children: React.ReactNode; className?: string; delay?: number }) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      className={className}
      initial={reduce ? false : "hidden"}
      animate="show"
      variants={{ hidden: {}, show: { transition: { staggerChildren: delay } } }}
    >
      {children}
    </motion.div>
  );
}

export function StaggerItem({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <motion.div className={className} variants={{ hidden: { opacity: 0, y: 10 }, show: { opacity: 1, y: 0, transition: { duration: DURATION.card, ease: EASE } } }}>
      {children}
    </motion.div>
  );
}
