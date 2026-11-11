import type { Config } from "tailwindcss";

/**
 * All colors resolve to CSS variables defined in src/styles/tokens.css,
 * so a future light theme only needs a new variable set.
 */
const v = (name: string) => `rgb(var(--${name}) / <alpha-value>)`;

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  darkMode: "class",
  theme: {
    container: { center: true, padding: { DEFAULT: "1rem", sm: "1.5rem", lg: "2rem" }, screens: { "2xl": "1280px" } },
    extend: {
      colors: {
        ink: { 950: v("ink-950"), 900: v("ink-900"), 800: v("ink-800"), 700: v("ink-700") },
        brand: { DEFAULT: v("brand"), hover: v("brand-hover"), electric: v("electric"), cyan: v("cyan"), indigo: v("indigo") },
        fg: { DEFAULT: v("fg"), secondary: v("fg-secondary"), muted: v("fg-muted"), disabled: v("fg-disabled") },
        success: v("success"),
        warning: v("warning"),
        danger: v("danger"),
        info: v("info"),
        overlay: v("overlay"),
        scrim: v("scrim"),
        "accent-soft": "var(--accent-soft)",
        "accent-soft-border": "var(--accent-soft-border)",
      },
      backgroundColor: {
        glass: "var(--surface-glass)",
        "glass-elevated": "var(--surface-glass-elevated)",
        panel: "var(--surface-panel)",
      },
      borderColor: {
        subtle: "var(--border-subtle)",
        glow: "var(--border-glow)",
      },
      fontFamily: {
        display: ["var(--font-manrope)", "system-ui", "sans-serif"],
        sans: ["var(--font-inter)", "system-ui", "sans-serif"],
      },
      borderRadius: {
        sm: "8px",
        md: "12px",
        lg: "16px",
        xl: "20px",
        "2xl": "24px",
        "3xl": "28px",
        hero: "32px",
      },
      boxShadow: {
        glass: "var(--shadow-glass)",
        glow: "0 0 0 1px rgba(96,165,250,0.25), 0 10px 40px -10px rgba(37,99,235,0.55)",
        "glow-sm": "0 6px 24px -8px rgba(37,99,235,0.6)",
        float: "var(--shadow-float)",
      },
      transitionTimingFunction: {
        premium: "cubic-bezier(0.22, 1, 0.36, 1)",
        "premium-in": "cubic-bezier(0.64, 0, 0.78, 0)",
      },
      transitionDuration: { micro: "150ms", button: "200ms", dropdown: "220ms", modal: "280ms" },
      keyframes: {
        "fade-in": { from: { opacity: "0" }, to: { opacity: "1" } },
        "fade-out": { from: { opacity: "1" }, to: { opacity: "0" } },
        "dialog-in": { from: { opacity: "0", transform: "translate(-50%, -48%) scale(0.97)" }, to: { opacity: "1", transform: "translate(-50%, -50%) scale(1)" } },
        "dialog-out": { from: { opacity: "1", transform: "translate(-50%, -50%) scale(1)" }, to: { opacity: "0", transform: "translate(-50%, -48%) scale(0.97)" } },
        "pop-in": { from: { opacity: "0", transform: "translateY(-4px) scale(0.98)" }, to: { opacity: "1", transform: "translateY(0) scale(1)" } },
        "drawer-in": { from: { transform: "translateX(100%)" }, to: { transform: "translateX(0)" } },
        "drawer-out": { from: { transform: "translateX(0)" }, to: { transform: "translateX(100%)" } },
        "drawer-left-in": { from: { transform: "translateX(-100%)" }, to: { transform: "translateX(0)" } },
        "drawer-left-out": { from: { transform: "translateX(0)" }, to: { transform: "translateX(-100%)" } },
        "accordion-down": { from: { height: "0" }, to: { height: "var(--radix-accordion-content-height)" } },
        "accordion-up": { from: { height: "var(--radix-accordion-content-height)" }, to: { height: "0" } },
        shimmer: { "0%": { opacity: "0.45" }, "50%": { opacity: "0.8" }, "100%": { opacity: "0.45" } },
      },
      animation: {
        "fade-in": "fade-in 220ms cubic-bezier(0.22,1,0.36,1)",
        "fade-out": "fade-out 180ms ease-in",
        "dialog-in": "dialog-in 280ms cubic-bezier(0.22,1,0.36,1)",
        "dialog-out": "dialog-out 180ms ease-in",
        "pop-in": "pop-in 200ms cubic-bezier(0.22,1,0.36,1)",
        "drawer-in": "drawer-in 320ms cubic-bezier(0.22,1,0.36,1)",
        "drawer-out": "drawer-out 220ms ease-in",
        "drawer-left-in": "drawer-left-in 320ms cubic-bezier(0.22,1,0.36,1)",
        "drawer-left-out": "drawer-left-out 220ms ease-in",
        "accordion-down": "accordion-down 260ms cubic-bezier(0.22,1,0.36,1)",
        "accordion-up": "accordion-up 220ms cubic-bezier(0.22,1,0.36,1)",
        shimmer: "shimmer 2.2s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};

export default config;
