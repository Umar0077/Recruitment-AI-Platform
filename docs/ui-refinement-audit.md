# UI refinement audit and plan — 19 November 2026

Source review before implementation; visual/device checks are recorded separately in the final verification report.

| Screen | Finding and planned treatment |
| --- | --- |
| HR dashboard | Eight metrics and four charts crowd out review work. Reduce to four truthful metrics, quick actions, five pending reviews and five persisted recent updates. Keep detailed charts in Analytics. |
| Candidate management | Existing filters/pagination are useful. Preserve them; improve shared table overflow/labels rather than remove data. |
| Candidate details | Six tabs, repeated metadata and too many header actions. Five business tabs; application details disclosed within Overview; explicit identity/role/date/status fields. |
| Interview management | Existing status tabs and deep links work. Preserve review filtering and pagination. |
| Interview review | Questions/answers appear twice; custom tab buttons lack full keyboard behavior; decision panel competes with content. Use five Radix tabs with one answer display and direct HR Decision access. |
| Assessment report | Long question analysis and lexical metrics dominate. Keep summary/evidence first, disclose each question and technical metrics; preserve human review/corrections. |
| Pipeline | Existing transitions/counts/filtering work; wide board requires horizontal navigation. Add a readable stacked mobile layout without changing stages. |
| Analytics | Real aggregates/date filters already exist. Preserve meaningful metrics and charts; disclose the large all-stage chart. |
| API usage | Existing privileged route, lazy charts and safe aggregates are appropriate. Move navigation to Administration; keep credential values absent. |
| Rubrics | Existing permissioned editor/approval workflow stays intact. Add discoverable advanced navigation. |
| Settings | Staff sign-in incorrectly falls back to Firebase wording, and technical unavailable-settings copy is distracting. Show correct password account type and permission-aware settings groups. |
| Security/accounts | Existing first-password-change and role gates must remain. Keep reachable through Settings/Administration. |
| Recording review | Real metadata/access/empty states present. Keep explicit short-lived authorization, no fabricated player or recording success. |
| Candidate login/signup | Labelled fields and server error handling already present. Preserve auth and email-verification boundaries. |
| Email verification | Bounded polling, resend cooldown and retry exist. No architecture change required. |
| Complete profile | Existing name-only update protects verified identity. Preserve it; expose safe profile link from status screen. |
| Onboarding | Explicit role choice and idempotent assignment already tested. Keep one primary continue action and existing recovery. |
| Instructions | Existing sequence/typed alternative appropriate. Keep essential privacy/consent information. |
| Equipment | Explicit permissions, timeout, audio meter, playback and typed fallback exist. Retain; document actual browser recognition device limitation. |
| Practice | Existing isolated practice flow appropriate. Do not imply that practice changes official answers. |
| Session | Original/cleaned/confirmed transcript handling, bounded restart and device cleanup exist. Audit with regressions; add repeatable WER evaluation for fictional references, not an invented accuracy percentage. |
| Completion | Correct SUBMITTED guard already exists; heading says Completed and fields truncate on mobile. Use requested Submitted message, blue success treatment, wrapped real profile/reference/date fields, and separate media status. |
| Candidate status | Identity is compressed into one line; add a readable profile summary with permitted name-update link. Preserve candidate-safe stage labels. |
| Shared shell/components | Collapsed icon links need explicit names; advanced routes need distinct active navigation; notifications need accurate pending/error text and retry; preserve existing logo and reduced-motion support. |

Implementation order: (1) dashboard/navigation and targeted tests; (2) detail screens/settings/candidate completion; (3) speech evaluation/loading/notifications and regression tests; (4) builds, responsive visual checks using fictional data, secret review and logical commits. No database resets, real-record edits, password changes, new frontend dependencies or automatic push.
