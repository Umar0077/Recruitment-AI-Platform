# InterviewOS interactive 3D implementation

> Superseded on 17 November 2026 by [Hero repair and hydration validation](hero-repair.md). The globe-style WebGL assembly and its Three.js dependencies have been removed; this document records the previous implementation only.

Implemented 16 November 2026. The landing page now uses an original procedural Three.js intelligence core. Backend APIs, PostgreSQL, Firebase, NLP, LLM assessment, candidate interview logic, and branding were not changed in this phase.

## Reference research

Inspected [Lusion](https://lusion.co/) and its [WebGL scroll synchronization demo](https://webgl-scroll-sync.lusion.co/) in headless Edge using pointer movement, wheel scrolling, and screenshots. Lusion's first capture showed its loader; a later capture after waiting showed the interactive homepage. The design takes inspiration from material depth, restrained inertia, and keeping WebGL aligned with DOM content. No Lusion assets, source code, models, or layouts were copied.

Implementation references: [Three.js documentation](https://threejs.org/docs/), [GSAP ticker](https://gsap.com/docs/v3/GSAP/gsap.ticker/), and [ScrollTrigger](https://gsap.com/docs/v3/Plugins/ScrollTrigger/).

## Architecture and visual changes

- A single landing-only WebGL renderer shares one scene and one procedural assembly across five DOM windows: hero, journey, conversation, preparation, and final CTA. Scissor rectangles follow live element bounds, including their reveal transforms. Graphics stay within reserved illustration space instead of crossing text or controls.
- The core has four separated blue panels, metallic gimbals, emissive traces, a faceted energy center, neural wire connections, a Fresnel shell shader, 64 instanced calibration markers, and 48 buffered particles. Reflections use a procedurally generated room environment. There are no downloaded 3D models, images, or textures.
- The scene uses GSAP's existing ticker, with accumulated frame budgeting targeting 60 renders/second. It has no independent animation-frame loop. Native scrolling remains authoritative; Lenis was evaluated and omitted because existing smooth anchors and ScrollTrigger meet the synchronization needs without scroll interception.
- Shader warm-up uses `KHR_parallel_shader_compile` when available, with a bounded completion poll that is cancelled on unmount or context loss. The SVG stays visible until the first rendered frame. This avoids an uncancellable background compile poll when someone navigates away immediately.
- A GSAP timeline continuously maps document scroll to assembly rotation, tilt, panel spread, camera distance, scale, and illumination. The same assembly reappears in the reserved section windows; it does not fly over page content. ResizeObserver rebuilds the timeline after layout changes.
- Pointer input comes from the existing shared passive listener. The scene controller tracks normalized position, previous position, velocity, spring target, current position, and idle state. Camera, internal layers, particles, and lights react at restrained amplitudes; input settles to center after inactivity.
- Journey cards have a bounded two-degree tilt, localized highlights, and existing hover easing. Navbar illumination uses the same pointer infrastructure. Existing primary CTA magnetic motion remains bounded. Administrative tables receive no tilt.
- The conversation preview adds a clearly labeled fictional transcript, scroll-linked waveform, question panel, and completion illustration. It never requests camera or microphone access. The final CTA now reads “Start Your Interview.”
- Theme changes update materials and exposure in place. They do not recreate the renderer.

## Lifecycle, fallbacks, and performance controls

- Three.js imports after the initial content paint, only at widths of at least 768 px with a fine pointer and without reduced motion. Other devices receive the new static SVG core, with the same reserved dimensions and full content access.
- OS and in-app reduced motion remove the decorative WebGL scene. Touch devices require no hover or device-motion permissions.
- A failed WebGL constructor or context-loss event preserves the SVG illustration and all navigation. Context loss deliberately stays in fallback mode until refresh.
- Rendering stops when all core windows are offscreen or the document is hidden. The shared GSAP ticker continues serving ordinary app motion, but this scene callback is removed.
- DPR is capped at 1 on smaller capable viewports and 1.5 on larger screens. Sustained slow rendering lowers DPR, removes particles, and simplifies the blue material's clearcoat. There are no post-processing passes or real-time shadows.
- Unmount removes the scene ticker callback, pointer subscription, observers, visibility/resize/context listeners, and owned ScrollTriggers. It disposes geometries, materials, environment target, renderer, and WebGL context. The canvas does not mount on admin, login, or candidate interview routes.

## Changed files and dependencies

New runtime dependency: `three@0.180.0`. New development dependency: `@types/three@0.180.0` (including its transitive type dependencies). Direct Three.js integration avoids additional React Three Fiber/Drei dependencies; React remains responsible for mounting and cleanup. Existing GSAP and Motion versions are reused.

| File | Change |
| --- | --- |
| `src/components/immersive/core-slot.tsx` | Reserved DOM windows and static SVG fallback |
| `src/components/immersive/intelligence-mesh.ts` | Original procedural assembly, materials, shader, instancing, particles |
| `src/components/immersive/pointer-inertia.ts` | Shared-input spring controller and velocity tracking |
| `src/components/immersive/scene-runtime.ts` | Renderer, scroll state, clipping, theme, performance and lifecycle |
| `src/components/immersive/landing-experience.tsx` | Capability gate and deferred import |
| `src/app/page.tsx` | Landing-only scene mount |
| `src/components/landing/hero.tsx` | 3D window, caption, and badge placement |
| `src/components/landing/sections.tsx` | Journey windows, fictional conversation illustration, final CTA |
| `src/components/landing/navbar.tsx` | Shared pointer highlight |
| `src/components/motion/pointer-system.tsx` | Opt-in bounded card tilt coordinates |
| `src/app/globals.css` | Canvas, fallback, depth-card, caption, and print styles |
| `package.json`, `package-lock.json` | Pinned Three.js dependencies |

Other pre-existing working-tree changes belong to earlier phases and were preserved.

## Tests executed

- Production build, including TypeScript and lint validation: passed, 31 generated pages. Standalone TypeScript and targeted ESLint also passed.
- Desktop Edge and Chrome: both themes at 360, 390, 430, 768, 1024, 1440, and 1920 px. All 28 browser/theme/width combinations had no horizontal document overflow.
- Both browsers passed all 18 recorded checks: single canvas, pointer movement/leave, five section windows, backward/rapid scrolling, theme changes, direct anchor load, route departure/return, reduced motion, simulated context loss, unavailable-WebGL fallback, accessible fallback CTA, touch fallback, and mobile menu anchor navigation. No page or console errors in these suites.
- After the shader warm-up change, the full Edge suite passed again. Chrome also passed three immediate exits during scene initialization and returned to one working canvas without page errors.
- Pointer telemetry after movement was `0.78,0.33`, then returned to `0.00,0.00` after leave/settling. Offscreen rendering paused. Simulated document-hidden/visibility events paused and resumed rendering. This is not a real OS tab-suspension benchmark.
- Ten route round trips retained one landing canvas and no landing canvas on login. After warm-up, DOM nodes stayed at 2,144 and event listeners at 489–490. Heap varied from approximately 11.8 to 15.2 MB rather than monotonically increasing; it ended at 14.5 MB. This finite run found no accumulating canvases/listeners, but does not prove absence of every possible GPU/driver leak.
- Fictional local demo interview: login, consent, equipment bypass, practice skip, four typed answers, submission, completion refresh persistence, and reset passed. Submission held four answers; reset returned to `not_started` with consent false. Interviewer audio was muted.
- Demo HR login and seven admin routes at seven widths: 49 dark-theme layout checks passed, with no horizontal overflow or page errors.
- Screenshots captured before implementation and after implementation, including both themes, all requested widths, and section views. Representative images were visually inspected; the hero status badge was moved away from the scene markers after review.

## Benchmarks

Local production builds, headless browsers on this Windows machine. These are short observations, not a controlled cross-device benchmark or guaranteed frame rate.

| Metric | Before | After |
| --- | --- | --- |
| Next.js landing initial JS | 295 kB | 294 kB |
| Deferred desktop 3D JS | None | About 135 kB compressed / 539 kB decoded |
| External 3D assets | None | None |
| Edge DOM interactive event | 196 ms | 74.3 ms |
| Edge load event | 304.5 ms | 327 ms |
| Edge animation-frame interval median / p95 | 6.9 / 7.1 ms | 6.9 / 7.2 ms |
| Scene renders per second | Not applicable (SVG) | Edge 59.9; Chrome 59.0 |
| Three-second steady-state long tasks / intervals over 50 ms | Not collected / not collected | 0 / 0 in both browsers |
| GPU submission complexity | Not applicable | 15 draw calls, 10 geometries per visible view |

The table uses the final Edge suite. An earlier Edge run measured DOM interactive at 155.5 ms and load at 542.6 ms, illustrating timing variation. Browser animation-frame measurements reflect the high-refresh test environment, not GPU completion time. The scene has its own 60 Hz work cap on the shared ticker. The DOM interactive event is a parser milestone, not a measurement of complete React hydration or standardized time-to-interactive. Chrome's observed cold load was 1,166.8 ms; there is no Chrome before baseline. Browser/process startup, caches, and system load affect these single-run timings.

The ten-round-trip forced-GC stress test recorded navigation from 105 to 3,189 ms, including two outliers above one second. These should not be hidden by reporting only the median. A separate final ordinary-navigation run measured 106, 139, 60, 62, and 70 ms (median 70 ms), without forced garbage collection.

Final startup profiling found one 186 ms long task, down from two tasks of 173 and 279 ms before shader warm-up was added. This is still a measurable desktop initialization cost; zero startup blocking is not claimed. The final steady scene sample reported 59.9 renders/second and 0.289 seconds of main-thread task time over a three-second observation. This is browser task time, not whole-system CPU/GPU utilization. The final touch-mobile run downloaded zero Three.js chunks, reached DOM interactive at 159.6 ms, and completed its load event at 328.9 ms. Keyboard Escape/focus restoration and page refresh also passed on the final build. Raw values are in `finish-results.json`.

## Remaining limits

- Safari and physical mobile devices were unavailable; mobile checks used Chromium touch emulation and a static scene.
- No real microphone, STT, audible TTS, Firebase production login, database persistence, or backend assessment tests were run in this visual-only phase. No candidate data was sent to an AI provider.
- GPU utilization and driver-level memory were not measured. Draw calls, geometry counts, JS heap, DOM/listener counts, render cadence, and browser long tasks are the available proxies.
- Adaptive quality exists but its threshold was not driven by a calibrated slow-device test. It is not a guarantee for every GPU.
- Native 200% browser zoom was not automated; a 720 × 500 viewport was tested as a layout proxy with no overflow and static fallback.

Raw scripts, before/after screenshots, reference captures, and JSON results are outside the repository:
`C:\Users\aliah\.codex\visualizations\2026\11\16\01a1e527-14d3-71d2-b927-b7b6f9e47936\immersive`.
