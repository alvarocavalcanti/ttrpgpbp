# Product & Mobile UX & a11y Audit — 2026-09-20

## Audit Prompt

> You are a Principal Product Designer and UX specialist, mobile-first, auditing a Play-by-Post TTRPG web app (React 19, hand-rolled Tailwind — no Shadcn). This is a RESEARCH + REPORT task: you must NOT modify any code. Your only file output is one audit report file (path below).
>
> Repo root: /Users/alvaro.cavalcanti/Projects/Personal/ttrpgpbp-chore-audit-20260920 (a git worktree — treat it as the repo root).
>
> AUDIT CONTRACT: read-only audit. Do NOT modify any file except this report. Do NOT run `gh` or any git command. Do NOT run tests, builds, or database commands. Allowed verification: `npx tsc -p tsconfig.app.json --noEmit`, `npx oxlint`, plus reading files.
>
> Every finding must cite evidence as `file:line`. No evidence = no finding. Verify against code, not changelogs. Severity: P0 = correctness/security defect or launch blocker · P1 = significant gap, no data loss · P2 = polish/DX.
>
> First re-verify every 20260907 UX finding (P1.1, P1.2, P2.1–P2.6) against CURRENT code — mark [FIXED]/[OPEN]/[PARTIAL] with file:line. Then audit the new surface since 2026-09-07 (features page, drag-and-drop uploads + Channel Media browser, image viewer zoom/backdrop, reactions on dice-roll messages, legible default text, server admin abuse reports + admin console expansion, LoginPage age-gate, Terms/Privacy, lobby row polish, sidebar close buttons, Edit Character dark mode, mention sort). Apply the app's UI conventions (44px touch floor, empty states, loading/error + Retry, flex `w-full`, input validation at keystroke, accessible labels/aria, Escape-to-close, reduced-motion, free-text sanitization, token adoption). Tag every finding [NEW]/[OPEN]/[INTENTIONAL].

## Scope & Verification

**Date:** 2026-09-20

**Scope (components reviewed):** prior-finding re-verification across `MemberList.tsx`, `useSafetyCardEvents.ts`, `ChannelStatusBar.tsx`, `ChannelView.tsx`, `MessageComposer.tsx`, `MessageList.tsx`, `TextPromptSheet.tsx`, `NpcManagementModal.tsx`, `PermissionBanner.tsx`, `PwaInstallBanner.tsx`; new surface: `FeaturesPage.tsx`, `ChannelMediaPanel.tsx` + `useChannelMedia.ts`, `ImageViewerModal.tsx`, `useImageUpload.ts`, `useSignedImageUrl.ts`, `MessageItem.tsx` (dice-roll reactions), `AdminView.tsx`, `AdminChannelView.tsx`, `UserDetailModal.tsx`, `LoginPage.tsx`, `TermsPage.tsx`, `PrivacyPage.tsx`, `tokenAdoption.test.ts`, `App.tsx` (routes).

**Verification run this pass:**

- `npx tsc -p tsconfig.app.json --noEmit`: **passed** (no errors)
- `npx oxlint`: **passed** (exit 0, 46 warnings) — one jsx-a11y warning: `no-noninteractive-tabindex` at `src/features/chat/MessageList.tsx:438` (`tabIndex={0}` on the `role="log"` scroll container — deliberate, see below)
- Tests / coverage / build (run by the orchestrator, not this pass): **1770 passed** / coverage **92.82% statements · 84.83% branches · 90.4% functions · 95.65% lines**
- No builds, tests, git, or database commands were run by this pillar (audit contract).

## Executive Summary

| Vector | 2026-09-07 | 2026-09-20 | Notes |
|---|---|---|---|
| Mobile usability | **9.5/10** | **9.5/10** | Both P1s and all six P2s from 20260907 verified fixed in code (not changelog). New surface largely follows the conventions: 44px controls on the features page, image viewer, NPC roster, reaction chips; loading/empty/error + Retry on the media browser and admin views; drag-drop has a visible ring + input validation. |
| Aesthetic consistency | **8/10** | **8/10** | The 20260907 token migration held: the five unmigrated files are all 0 raw `indigo`/`gray`. But the migration's *replacement* step corrupted one file (TextPromptSheet, see P1-1), and three brand-new files shipped raw tokens because the guard is a blocklist. |
| Feature completeness | **9.5/10** | **9.5/10** | New surface (marketing page, media browser, image viewer, dice reactions, abuse-reports viewer, age gate) is complete and mostly disciplined. |

**Biggest strength — the remediation discipline held.** The #444 "Fix audit #432" wave actually landed: the kebab has a name + menu semantics + Escape, the X-Card closes the loop for the pressing player via an identity-free system message, the mention picker is a complete ARIA 1.2 combobox, and every named touch target from 20260907 now meets the 44px floor. This is the first round where the prior wave verifies 100% fixed in code.

**Biggest weakness — the token migration wrote a corrupt file, and the guard can't see it.** `TextPromptSheet` now has literal U+0008 backspace bytes wedged inside its `surface-*`/`primary-*` class names (verified by `xxd`), which kills the primary confirm button's background and the focus ring on the AFK/admin-suspend sheets. The `tokenAdoption.test.ts` guard only blocks raw `indigo|gray`, so it passes green over a file whose classes are silently broken — the exact blind spot a blocklist creates.

## Prior findings disposition

Every 20260907 UX finding re-verified against current code:

| Prior ID | Item | Status | Current evidence |
|---|---|---|---|
| P1.1 | Member kebab has no accessible name | **[FIXED]** | `aria-label` + `aria-haspopup="menu"` + `aria-expanded` on the trigger (`src/features/channels/MemberList.tsx:248-250`); popup is `role="menu"` with `role="menuitem"` children (`:260-320`); Escape closes via `useEscapeToClose(…, openMenuId !== null)` (`:58-60`). |
| P1.2 | X-Card resolution silent for players | **[FIXED]** | `dismissAlert` calls the `resolve_safety_card_events` RPC, which "resolves the unresolved events AND posts the identity-free system message every member already receives through the normal message pipeline" (`src/features/channels/useSafetyCardEvents.ts:204`, comment `:196-199`). Players receive the system message realtime with zero new subscriptions. |
| P2.1 | Touch-target stragglers below 44px | **[FIXED]** | Status-bar Edit `min-h-11` (`ChannelStatusBar.tsx:137`); messages-error Retry `min-h-11` (`ChannelView.tsx:402`); NPC portrait cluster now real `h-11 w-11` boxes (`NpcManagementModal.tsx:182,189,198,207,213,227`); banner buttons `min-h-11` (`PermissionBanner.tsx:65,75`, `PwaInstallBanner.tsx:40,47`); TextPromptSheet input `min-h-11` (`:47`); "Load older" `min-h-11` (`MessageList.tsx:448`). |
| P2.2 | `aria-expanded` missing on disclosure toggles | **[FIXED]** | Sidebar toggle `aria-expanded={showMobileSidebar}` (`ChannelView.tsx:369`); status-bar chevron `aria-label` + `aria-expanded` (`ChannelStatusBar.tsx:148-149`); kebab `aria-expanded` (`MemberList.tsx:250`). |
| P2.3 | Mention listbox incomplete combobox | **[FIXED]** | Textarea now `role="combobox"` `aria-autocomplete` `aria-expanded` `aria-controls` `aria-activedescendant` with stable option ids (`MessageComposer.tsx:742-746`). |
| P2.4 | X-Card catch-up failure toast-only | **[FIXED]** | Inline "Could not load X-Card alerts" banner with `min-h-11` Retry calling `retryCatchUp` (`ChannelView.tsx:409-419`). |
| P2.5 | Token adoption stalled; blobs grew; drawers duplicated | **[FIXED]** | AdminView, ChannelSettings, ProfileSettings, MemberList, Lobby all **0** raw `indigo\|gray` occurrences (rg-verified). `proseAmber`/`proseParchment` extracted to `composerChip` (`ChannelStatusBar.tsx:3`). Residual: the *guard* is a blocklist (see P2-3 below). |
| P2.6 | Member kebab popup lacks menu semantics + Escape | **[FIXED]** | Same evidence as P1.1: `role="menu"`/`role="menuitem"` + Escape. |

## P0

None. No correctness, security, or launch-blocking defect found in this pillar.

## P1

**1. TextPromptSheet class names are corrupted by embedded backspace bytes — the primary confirm button renders invisible and the focus ring is dead** — [NEW]

- Evidence: `src/components/TextPromptSheet.tsx:36,47,49,57,63` — the `surface-*`/`primary-*` class tokens contain a literal U+0008 backspace character between the prefix and the color (e.g. `bg-\x08primary-600`, `text-\x08surface-700`, `focus:ring-\x08primary-500`). Verified byte-level with `xxd`: line 63 emits `bg-` then `0x08` then `primary-600`. `tokenAdoption.test.ts` does not catch this — its guard is `\b(?:indigo|gray)-\d`, which these `surface`/`primary` strings never match.
- Problem: Tailwind's JIT scanner sees `text-\x08surface-700`, not `text-surface-700`, so no utility is generated for any of these classes. Concretely: the confirm button (`:63`) loses `bg-primary-600` (transparent background), keeping only `text-white` — white text on a white BottomSheet = an **invisible primary CTA** — and loses `focus:ring-primary-500` (no focus ring). Dark-mode input/label/ring classes are equally dead. This is the confirm button on the AFK "Mark Away" sheet (`MemberList.tsx:405-418`) and the admin suspend sheet (`AdminView.tsx:744-758`, `UserDetailModal.tsx:292-302`).
- Fix: Rewrite the class names without the embedded control bytes (replace `\x08` with nothing). Add a test that fails on any non-printable control character in a `className` string, so the blocklist guard can't be blind to corruption again. ~15-line diff + one test.
- Effort: ~1h.

## P2

Ordered by return-on-effort.

**1. New surface shipped below the 44px touch floor** — [NEW]

- Evidence:
  - Composer NPC portrait controls (randomize / choose / upload) `p-1.5` + `w-5 h-5` ≈32px, no hit-expansion (`src/features/chat/MessageComposer.tsx:613,624,633`). These are touch-first controls on the mobile composer whenever NPC mode is active.
  - Channel Media browser selection checkbox `h-6 w-6` ≈24px (`src/features/channels/ChannelMediaPanel.tsx:102`) and the Insert button `px-4 py-2` ≈36px (`:122`).
  - Admin reports actions "View message" / "Suspend" / "Resolve" / "Dismiss" `px-2 py-1 text-xs` ≈26px (`src/features/admin/AdminView.tsx:606,617,624,631`); channel "Claim" ≈26px (`:543`); status filter buttons ≈34px (`:433`); "Copy opted-in emails" ≈34px (`:451`).
- Problem: The 20260907 fix established `min-h-11`/hit-expansion as the sanctioned patterns, and the NpcManagementModal + status bar got them — but the *composer* copy of the same portrait controls, the brand-new media browser, and the new abuse-reports table all shipped sub-floor. The 24px media-select checkbox is the worst offender: it is a selection toggle overlaid on a touch grid.
- Fix: `min-h-11 min-w-11` (or hit-expansion for the inline portrait icons), matching `NpcManagementModal.tsx:189`. Media checkbox → larger hit area via `after:-inset`; Insert → `min-h-11`. Admin report actions → `min-h-11` rows or `px-3 py-2` + hit-expansion.
- Effort: ~1–2h including sizing-assert tests.

**2. ImageViewerModal has no error state — a failed signed-URL resolution leaves a black screen** — [NEW]

- Evidence: `src/components/ImageViewerModal.tsx:151-179` — the body renders only `loading` (spinner) and `resolved && !loading` (the `<img>`). When `useSignedImageUrl` fails it sets `{ src: null, loading: false }` (`src/hooks/useSignedImageUrl.ts:194-196`), so the viewer shows the black `bg-black/90` backdrop plus zoom/close controls and **nothing else** — no message, no Retry.
- Problem: Every other async surface in the app now degrades gracefully (media browser, admin views, messages all have inline Retry). A transient signing failure here leaves a user staring at a void with no way to recover except closing and reopening.
- Fix: Add an error branch (the hook would need to surface `error`; today it swallows the failure into `src: null`). Alternatively, render a "Couldn't load this image." line + a Retry that re-invokes the sign. ~20 lines + hook field.
- Effort: ~1–1.5h.

**3. Token-adoption guard is a blocklist, and three new files shipped raw tokens** — [OPEN, residual of ux-20260907#P2.5]

- Evidence: `src/tokenAdoption.test.ts:10-17` guards an explicit `MIGRATED_FILES` array. Three files added since 20260907 are not on it and still carry raw tokens: `ChannelMediaPanel.tsx` **17** raw `indigo|gray`, `AdminChannelView.tsx` **57**, `LoginPage.tsx` **71** (rg-verified; `ImageViewerModal.tsx`, `FeaturesPage.tsx`, `UserDetailModal.tsx` are 0).
- Problem: The 20260907 audit predicted exactly this — "the guard is a blocklist of past offenders, not a rule; new files escape through the hole." It happened within two weeks. The drift isn't visual (the alias values are identical) but it means the next contrast/token sweep touches these files by hand.
- Fix: Replace the blocklist with a rule: a test that globs `src/**/*.tsx` and asserts no `\b(?:indigo|gray)-\d` outside an explicit allowlist (e.g. the `prose`/`typography` styles and any deliberate raw use). Add the three files to the migrated set now.
- Effort: ~1h.

## What's sound — do not touch

- **X-Card lifecycle** — the #444 wave closed the loop correctly: SUBSCRIBED-then-query catch-up, generation-token recount merge (`useSafetyCardEvents.ts:22,44,100-127`), inline Retry, and the atomic `resolve_safety_card_events` RPC that persists dismissal *and* posts the identity-free system message in one call (`:204`). The prior audit's "extend, don't reshape" held.
- **Mention combobox** — `role="combobox"` + `aria-activedescendant`/`aria-controls`/`aria-autocomplete` with stable option ids (`MessageComposer.tsx:742-746`), arrow/Enter/Tab/Escape keyboard, `stopPropagation` on Escape. A genuinely complete ARIA 1.2 pattern.
- **Features page** — clean h1→h2→h3 hierarchy, meaningful card `alt` text + lazy WebP thumbs, `aria-pressed` track toggle in a `role="group"`, `min-h-11` CTAs, empty/loading gated on auth. Footer links all resolve to real routes (`App.tsx:373-378`).
- **Terms/Privacy pages** — proper heading hierarchy, plain-language copy, no schema/RLS/API leakage, correct dark-mode link contrast. Player-friendly throughout.
- **Image viewer** — `role="dialog" aria-modal`, focus trap (`:44`), Escape (`:43`), `h-11 w-11` controls, `aria-live` zoom readout, no reduced-motion hazards (instant zoom, no CSS transitions).
- **Media browser** — spinner (`role="status"`), error + Retry, explicit empty state, and `role="checkbox"`/`aria-checked` selection semantics with per-item `aria-label`. Well-shaped.
- **Admin read-only channel view** — native `<details>/<summary>` roster (keyboard-operable, auto-announced state), loading/empty/error states for both messages and roster, prepend height-preservation (`AdminChannelView.tsx:66-78`).
- **Reactions on dice-roll messages** — `min-w-11` chips + `after:-inset-y-3` hit-expansion (`MessageItem.tsx:562`), descriptive `aria-label` with count, "who reacted" popover with its own `aria-label` and click-outside/Escape dismissal.
- **Sidebar close button (#511)** — `aria-label="Close sidebar"`, focus ring, rendered only while open so it never leaks into a11y queries (`ChannelView.tsx:508-520`).
- **Upload validation at input** — type, admin-enabled, and size caps all checked *before* upload (`useImageUpload.ts:29-37`); drag-drop shows a visible `ring-2` state (`MessageComposer.tsx:542`) and reports partial success + rejections inline.

## Intentional Exclusions

Carried from 20260907/20260904 and re-verified deliberate:

- Sidebar-only tools, no header icons (issue #382).
- No header X in drawers — backdrop, edge swipe, toggle, Escape (`ChannelView.tsx:107-117`).
- ~32–36px desktop hover-row convention for message actions (`MESSAGE_ACTION_SIZING`); touch-first always-visible controls still held to 44px.
- One-tap X-Card, no confirmation (safety tool, zero friction).
- Dice popup anchored on desktop, BottomSheet on mobile.
- `tabIndex={0}` on the `role="log"` chat container (`MessageList.tsx:438`) — the single jsx-a11y warning; deliberate, so keyboard users can reach the list for scrolling. Leave as-is or suppress with justification.
- Drag-and-drop as a desktop-only upload entry point (keyboard/single-file path is the always-present Upload button).
- The age-gate checkbox `h-4 w-4` (16px) — standard input with a large associated `<label>` row; the whole row is clickable, so the effective target is fine. Links (`/terms`, `/privacy`) nested inside the label are individually focusable.

## Suggested execution order

1. **P1-1** TextPromptSheet backspace corruption (~1h) — invisible primary CTA + dead focus ring on two flows; add a control-char guard test so the blocklist can't be blind again.
2. **P2-1** touch-target stragglers (~1–2h) — mechanical `min-h-11`/hit-expansion; the media checkbox and admin report actions are the priority.
3. **P2-2** ImageViewerModal error state (~1–1.5h).
4. **P2-3** widen the token guard to a rule + migrate the three raw files (~1h).

Items 1–3 are independent and small; 4 pairs naturally with the next token sweep.
