# Hero repair and hydration validation

17 November 2026. This repair restores the original InterviewOS SVG AI orb, preserves the hero headline, layout, branding, and controls, and replaces the rejected WebGL assembly with a restrained animated background. Backend, authentication, database, and assessment logic were not changed.

## Confirmed hydration cause and repair

The warning was reproduced in the Next.js development server before editing. `InterviewPreview` generated a waveform transform using `0.2 + Math.sin(i * 1.7) ** 2 * 0.8` during render. At index 19, Node returned `0.6784288198247557` and Edge returned `0.6784288198247559`. The development console pinpointed that span's `scaleY` style. The browser's CSS serialization also shortened the server style shown in the warning.

The waveform now uses a fixed array of short decimal strings. Its GSAP animation runs only after mount and is scoped to the preview component, with cleanup. No hydration suppression was added. The footer year is supplied by the server rather than recalculated in the browser. Viewport and pointer-dependent background styles are applied only in effects, using deterministic initial markup.

Only the decorative original SVG orb uses a shared client-only dynamic import with its existing static fallback. The headline, body copy, navigation, checklist, and calls to action retain server-rendered content. This also isolates the orb's detailed trigonometric SVG coordinates from cross-engine SSR serialization.

## Visual and interaction changes

- Restored the existing neural lattice, glass orb, metallic bezel, voice ring, and holographic dial. No globe-style geometry remains.
- Removed the shared WebGL scene, five immersive implementation files, `three`, `@types/three`, and their unused dependency entries. No new dependency was added.
- Added soft blue atmospheric lighting, three fine curved technical traces, a faint contour, and 18 drifting particles behind the hero content. Mobile uses six particles and simpler motion.
- Pointer-driven background layers use damped Motion springs and the existing shared passive listener. There are no per-frame React state updates or new global pointer listeners. Pointer idle returns the background to neutral.
- Hero orb parallax uses its existing spring controller. Pointer leave now settles smoothly instead of snapping to center. The primary CTA gently increases the orb's energy on hover/focus.
- Landing-only SVG traces and dial rotation are static after profiling their repaint cost. The original geometry, nucleus pulse, floating motion, and pointer response remain. This CSS is scoped to `landing-orb`; live interview voice animations are unaffected.
- Kept the glass navbar and its local pointer shimmer. Cards now tilt at most one degree. Main landing CTAs retain bounded magnetism and gain a restrained highlight sweep and press response.
- Kept native scrolling, section reveals, staggered journey cards, and the journey connection line. Background scroll parallax and the fictional conversation illustration have scoped GSAP timelines; nothing hijacks scrolling.
- Offscreen/hidden background animation pauses. Reduced-motion preferences disable background animation and pointer effects. The landing page uses no canvas, WebGL context, shader compilation, or particle render loop.

## Files changed in this repair

| File | Purpose |
| --- | --- |
| `src/components/landing/hero-atmosphere.tsx` (new) | Deterministic background layers, pointer springs, visibility and scroll lifecycle |
| `src/components/landing/landing-orb.tsx` (new) | Reuse the original AI orb with its original fallback |
| `src/components/landing/hero.tsx` | Restored hero orb, background and CTA response |
| `src/components/landing/sections.tsx` | Fixed waveform SSR values, scoped preview timeline, original orb in preview/final CTA |
| `src/components/visuals/ai-core.tsx` | Smooth spring return on pointer leave |
| `src/components/motion/pointer-system.tsx` | Reduced opt-in card tilt to one degree |
| `src/app/globals.css` | Background, CTA sweep, mobile/reduced-motion rules; removed WebGL styles |
| `src/app/page.tsx` | Removed scene mount; server-supplied footer year |
| `src/components/immersive/*` (five files removed) | Deleted the rejected WebGL assembly and its controller/fallback |
| `package.json`, `package-lock.json` | Removed Three.js and type dependencies |
| `docs/immersive-experience.md` | Marked the previous report as superseded |

Other existing working-tree changes belong to earlier phases and were preserved.

## Development validation

- Reproduced the warning before the fix and captured its exact component trace and numeric difference.
- Edge and Chrome each passed fresh reloads in Light and Dark Mode at 360, 390, 430, 768, 1024, 1440, and 1920 px: 28 development browser/theme/width combinations, no horizontal overflow.
- Both corrected development suites captured zero console errors, zero page errors, and no visible Next.js error dialog. No hydration warning remained.
- Each browser passed 15 interaction checks covering background/orb response, spring settling, CTA highlight, offscreen pause, bounded card tilt, checklist, theme switching, reduced motion, no canvas/WebGL, keyboard menu focus, route cleanup/return, and direct anchor navigation.
- Initial test assertions were corrected to move the hero fully offscreen, allow native smooth anchor scrolling to settle, and inspect visible error dialogs rather than matching the word “hydration” in the development overlay's stylesheet. These were test-harness corrections, not suppressed application errors.
- Desktop Light/Dark screenshots and mobile screenshots were visually reviewed against the original orb identity. The hero message and GO Connectivo branding remain intact.

## Production validation and performance

- TypeScript, full-project ESLint, and the final production build passed; 31 pages generated. The final build also reran its type/lint checks.
- Production Edge passed both themes at all seven widths, the 15 interaction checks, and console/error-overlay checks. The production suite was repeated after the landing-only idle optimization.
- Fictional demo login, consent, equipment bypass, practice skip, all four typed answers, submission, completion refresh, and new-interview reset passed. Submitted state contained four answers; reset returned to `not_started` with consent false.
- Demo HR login and seven admin routes at seven widths passed 49 dark-theme layout checks with no overflow or page errors.
- A persisted in-app reduced-motion preference was tested in a fresh browser context: the atmosphere remained paused and emitted no hydration errors. Touch emulation showed six visible background particles, no canvas, and no horizontal overflow.

| Final production observation | Result |
| --- | --- |
| Landing initial JavaScript | 298 kB; shared bundle 103 kB |
| Previous WebGL version | 294 kB initial plus approximately 135 kB deferred 3D code |
| WebGL dependency/chunk loading now | Removed entirely; original SVG visual is dynamically loaded |
| DOM interactive / load event | 212.9 / 314.9 ms |
| Startup long tasks | None in the final run; an earlier repaired build recorded one 51 ms task |
| Three-second frame sample | 433 intervals; median 6.9 ms; p95 7.1 ms |
| Intervals above 50 ms / steady-state long tasks | 0 / 0 |
| Browser main-thread task time over sample | 0.460 seconds |
| Four client-side login navigations | 193, 130, 267, 184 ms |
| Landing canvas count | 0 on desktop and mobile |

The initial bundle increased by roughly 4 kB compared with the rejected WebGL version, while its deferred Three.js payload and shader initialization were removed. An isolated idle comparison measured 1.204 seconds of browser task time with the original idle traces/dials, 0.526 seconds with static traces, and 0.425 seconds with static traces and dials, each over three seconds. The final production sample above corroborates the reduction.

These are local headless observations on a high-refresh Windows system, not a guaranteed device frame rate or a controlled network benchmark. Animation-frame intervals are not GPU completion times. Browser task time is not whole-system CPU utilization. The DOM interactive event is not a standardized measure of complete hydration or time-to-interactive. Startup/cache conditions affect short measurements.

## Scope and limits

Browser checks use local headless Edge/Chrome and responsive/touch emulation, not physical mobile devices or Safari. Functional regression uses fictional local demo data, muted interviewer audio, and typed answers; it does not validate real microphones, audible TTS, STT, production Firebase, or backend persistence. No real candidate data or LLM requests are involved.

Raw before/after evidence and scripts are stored outside the repository at:
`C:\Users\aliah\.codex\visualizations\2026\11\16\01a1e527-14d3-71d2-b927-b7b6f9e47936\hero-repair`.
