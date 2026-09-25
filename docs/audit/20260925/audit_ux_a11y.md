# Product & Mobile UX & a11y Audit — 2026-09-25 (final pre-release)

## Audit Prompt

> You are a Principal Product/Mobile UX + Accessibility reviewer writing ONE audit report for a pre-public-release FINAL audit of a Play-by-Post TTRPG web app (React 19, hand-rolled Tailwind — no Shadcn). This is a READ-ONLY research + report task: do NOT modify any code, do NOT run `gh`, tests, builds, or `supabase` (the orchestrator already ran the suite). Your only output file is `docs/audit/20260925/audit_ux_a11y.md`. Every finding MUST cite verified `file:line`; no evidence = no finding. Do not trust commit messages — read the current source, `tailwind.config.js`, and tests. Re-verify every 20260920 UX finding (P1 TextPromptSheet backspace corruption + guard test; P2 #10 touch targets; P2 #11 ImageViewerModal error state; P2 #12 token blocklist → glob rule) and the 20260923 message-heading implementation plan (`prose-chat` in `tailwind.config.js` + the four call sites, with tests). Then audit the deltas since 2026-09-20: image upload UX incl. dismissible error banner (#592/#593), dice favorite chips (#586/#589), status-bar chevron after reload (#577), update/reload banner (#576/#601), admin DM light-mode readability (#590), terms re-consent screen, system-alert thread. Apply the project UI conventions as the bar (flex `w-full`, input-time validation, empty/loading/error + Retry, no scroll yanking, plain-text sanitization, reuse of existing patterns, accessible labels/aria/focus/Escape, 44px touch targets, WCAG AA contrast light + dark, reduced motion), and cover mobile 360px, keyboard-only, screen-reader semantics, focus traps, and the heading-scale output. Mirror the structure of `docs/audit/20260920/audit_ux_a11y.md`. Severity: P0 = launch blocker/user-visible defect · P1 = significant UX/a11y gap · P2 = polish. Tag every finding [NEW]/[OPEN]/[INTENTIONAL].

## Scope & Verification

**Date:** 2026-09-25

**Scope (files reviewed):** prior-finding re-verification: `TextPromptSheet.tsx`, `tokenAdoption.test.ts`, `MessageComposer.tsx`, `ChannelMediaPanel.tsx`, `AdminView.tsx`, `ImageViewerModal.tsx`, `useSignedImageUrl.ts`; heading-scale plan: `tailwind.config.js`, `MessageItem.tsx`, `composerChip.ts`, `tailwind.config.test.ts`, and the literal-pinned tests; deltas: `useImageUpload.ts`, `DiceRoller.tsx`, `useDiceFavorites.ts`, `useRecentRolls.ts`, `useElementOverflow.ts`, `ChannelStatusBar.tsx`, `pwaUpdate.ts`, `hardReload.ts`, `PwaUpdateBanner.tsx`, `PwaInstallBanner.tsx`, `ReConsentGate.tsx`, `ThreadDetail.tsx`, `AdminMessagesView.tsx`, `MessageList.tsx`, `ProtectedRoute.tsx`, `App.tsx`.

**Verification run this pass:**

- Read-only source, `tailwind.config.js`, and test inspection only. No `gh`, no tests, no builds, no database (audit contract; the orchestrator ran the suite and reported it green).
- Byte-level check of `src/components/TextPromptSheet.tsx` (`charCodeAt` scan for control bytes `≤ 0x1f` / `0x7f`, excluding tab/LF/CR): **0 hits**.
- Raw-token check on the three files named by 20260920 P2-3: `ChannelMediaPanel.tsx`, `AdminChannelView.tsx`, `LoginPage.tsx` all **0** `indigo-*`/`gray-*` occurrences.
- Repo-wide search for `prose-chat`: **0 hits** in source, config, or tests (only the 20260923 plan doc mentions it).

## Executive Summary

| Vector | 2026-09-20 | 2026-09-25 | Notes |
|---|---|---|---|
| Mobile usability | **9.5/10** | **9/10** | All four 20260920 items verified fixed in code. The deltas largely hold the bar (dismissible upload error, chevron re-measure, PWA reload handshake, admin DM light mode). But the newly added upload-error dismiss button and the dice favorite star are both under the 44px floor, and the composer chip row plus reply-cancel control remain sub-floor. |
| Aesthetic consistency | **8/10** | **8/10** | The token ratchet is now a rule, not a blocklist, and the three raw-token offenders are clean. But the approved 20260923 heading-scale plan (`prose-chat`) was never implemented: message headings are still disproportionately large and h5/h6 are still indistinguishable from body text. |
| Accessibility | **8.5/10** | **8/10** | Chat `role="log"`/`aria-live` and the image-viewer error + Retry are solid. New gap: five file inputs are `display:none` inside non-focusable labels, so keyboard-only GMs cannot reach the composer/NPC/channel image uploads — the exact pattern the codebase already fixed elsewhere with `sr-only`. |

**Biggest strength — the remediation discipline held for a second consecutive round.** Every 20260920 finding verifies fixed in code, including the P2 touch-target items that are easy to half-do: the composer NPC portrait cluster is now real `h-11 w-11` boxes (`MessageComposer.tsx:613,624,634`), the media-select checkbox carries `after:-inset-2.5` hit expansion (`ChannelMediaPanel.tsx:102`), the admin report actions are `min-h-11` (`AdminView.tsx:610,621,628,635`), and the token guard was replaced with a real ratchet plus a control-byte scan (`tokenAdoption.test.ts:11-78`).

**Biggest weakness — an approved, merged implementation plan was never executed, and the keyboard blind spot the codebase already solved elsewhere is still open on five inputs.** The 20260923 heading plan (Option A, `prose-chat`) exists only as a doc: `tailwind.config.js` has no `typography` extend, all four call sites still carry the old classes, and no test guards the scale. Separately, `MessageComposer.tsx` fixed its NPC-portrait input to `sr-only` with a comment naming the `hidden` failure mode, yet the same defect remains on the composer's primary GM upload and four settings-modal inputs.

## Prior findings disposition

Every 20260920 UX finding re-verified against current code:

| Prior ID | Item | Status | Current evidence |
|---|---|---|---|
| P1-1 | TextPromptSheet class names corrupted by backspace bytes | **[FIXED]** | Byte-level scan of `src/components/TextPromptSheet.tsx` finds **0** control bytes. `tokenAdoption.test.ts:54-76` now adds a `hasControlByte` scan over every non-test source file, written with numeric comparisons so the guard file itself carries no literal control bytes. |
| P2-1 (#10) | Touch targets below 44px (composer NPC portrait, media-select checkbox + Insert, admin report actions) | **[FIXED]** | Composer NPC controls `h-11 w-11` (`MessageComposer.tsx:613,624,634`); media checkbox `h-6 w-6` + `after:-inset-2.5` hit expansion (`ChannelMediaPanel.tsx:102`); Insert `min-h-11` (`ChannelMediaPanel.tsx:128`); admin report actions `min-h-11` (`AdminView.tsx:610,621,628,635`). |
| P2-2 (#11) | `ImageViewerModal` no error state | **[FIXED]** | Error branch with `role="alert"`, "Couldn't load this image.", and a `min-h-11 min-w-11` Retry that re-signs (`ImageViewerModal.tsx:160-172`); the hook surfaces `error` + `retry` (`useSignedImageUrl.ts:31,40,158`). |
| P2-3 (#12) | Token guard is a blocklist; new files shipped raw tokens | **[FIXED]** | `tokenAdoption.test.ts:24-76` is now a ratchet: globs all non-test sources and asserts the dirty set equals a frozen `RAW_TOKEN_ALLOWLIST`. `ChannelMediaPanel.tsx`, `AdminChannelView.tsx`, `LoginPage.tsx` are **0** raw `indigo\|gray` and are absent from the allowlist. |
| — | 20260923 heading-scale plan (`prose-chat`) implemented in config + 4 call sites + tests | **[OPEN]** | Never implemented — see P1-1 below. Repo-wide `prose-chat` count is 0. |

## P0

None. No correctness, security, or launch-blocking defect found in this pillar.

## P1

**1. The approved message-heading scale plan was never implemented — headings still render out of proportion and h5/h6 are indistinguishable from body text** — [NEW]

- Evidence:
  - `tailwind.config.js:12-39` — `theme.extend` contains only `keyframes`, `animation`, `fontFamily`, and `colors`; there is **no `typography` key**. The plugin is registered with no overrides (`tailwind.config.js:45-47`).
  - Regular/NPC body still carries the old classes: `prose prose-sm prose-indigo dark:prose-invert max-w-none` (`src/features/chat/MessageItem.tsx:818`).
  - Dice card body has **no `prose` scope at all**: its wrapper is `text-surface-900 dark:text-surface-100` plus the `MESSAGE_BODY_TEXT` constant, with no prose class (`src/features/chat/MessageItem.tsx:736`).
  - Scene and channel-status prose constants are unchanged: `proseParchment` (`src/features/chat/composerChip.ts:12`) and `proseAmber` (`src/features/chat/composerChip.ts:14`) carry no `prose-chat`.
  - No heading-scale test exists: `src/tailwind.config.test.ts:1-38` asserts colors/fonts only; the literal-pinned tests still lock the pre-plan strings (`src/features/chat/MessageItem.test.tsx:1214,1222`, `src/features/channels/ChannelStatusBar.test.tsx:47`).
  - Plan of record: `docs/audit/20260923/audit_message_headings.md:69-116` (Option A: `theme.extend.typography.chat`, four call sites, tests). Section 5 also planned a changelog entry; `docs/CHANGELOG.md` has none mentioning headings.
- Problem: The merged plan fixed a real, user-visible defect on **every** message surface and none of it shipped. By the plan's own baseline (`audit_message_headings.md:28-49,123-127`), h1 still computes at **38.71px against 18.06px body (2.14×)** inside a chat bubble — it wraps badly at 360px — and h5/h6 still render at **18.06px / weight 400**, i.e. identical to the paragraph around them. The dice-card surface still styles no heading level at all. All five decisions the doc records as landed (shrink h1, keep six levels, fix four surfaces, keep h1 weight 800, accept dice side effects) are unimplemented.
- Fix: Implement Option A exactly as specified in `docs/audit/20260923/audit_message_headings.md:75-136`: add the `typography.chat` modifier to `tailwind.config.js`, add `prose-chat` at `MessageItem.tsx:818`, `composerChip.ts:12`, `composerChip.ts:14`, and wrap the dice body at `MessageItem.tsx:736` with `prose prose-sm prose-chat dark:prose-invert max-w-none`; add the value assertions + the postcss compile-order guard to `tailwind.config.test.ts`; update the pinned literals; add the player-facing changelog entry.
- Effort: ~2-3h including tests.

**2. Five file inputs are `display:none` inside non-focusable labels — keyboard-only users cannot reach the image-upload controls** — [NEW]

- Evidence:
  - Composer GM image upload: `<input type="file" … aria-label="Upload Image" … className="hidden" />` inside a `<label>` with `cursor-pointer` and no `tabIndex` (`src/features/chat/MessageComposer.tsx:422-428`; `hidden` at `:427`).
  - NPC roster portraits (two inputs): `className="hidden"` at `src/features/channels/NpcManagementModal.tsx:220` (`aria-label` "Upload portrait for" the NPC, `:217`) and `:282` (`aria-label="Upload new NPC portrait"`, `:281`).
  - Channel map/resources images: `className="hidden"` at `src/features/channels/ChannelSettings.tsx:385` (`aria-label="Upload map image"`, `:382`) and `:412` (`aria-label="Upload resources image"`, `:409`).
  - Contrast — the codebase already solved this exact defect elsewhere: the composer NPC-portrait input uses `className="sr-only"` (`src/features/chat/MessageComposer.tsx:646`) with an explicit comment naming the failure mode ("a `hidden` input inside a label can never receive focus, locking keyboard users out of the file picker (issue #561 review)", `:642-645`) and a `focus-within:ring-2 focus-within:ring-primary-500` ring on its label (`:623`).
- Problem: Tailwind `hidden` is `display:none`, which removes the input from the tab order; the wrapping `<label>` is not focusable. A keyboard-only GM therefore cannot trigger the composer's primary image upload, nor set an NPC portrait in the roster modal, nor upload a channel map or resources image. This is a WCAG 2.1.1 (Keyboard) failure and an inconsistency with the pattern the team already adopted in the same feature area.
- Fix: Replace `className="hidden"` with `className="sr-only"` on all five inputs and add `focus-within:ring-2 focus-within:ring-primary-500` to each wrapping label, matching `MessageComposer.tsx:623,646`. Add a test that fails if any `type="file"` input is `hidden`.
- Effort: ~1h including the guard test.

## P2

Ordered by return-on-effort.

**1. PWA "Reload" button is below the 44px touch floor** — [NEW]

- Evidence: `src/components/PwaUpdateBanner.tsx:20-23` — the banner's only action is `className="font-medium underline focus:outline-none focus:ring-2 focus:ring-indigo-500 rounded"`, with no `min-h-11`, no padding, and no hit expansion (≈20px tall). The sibling install banner's actions are correctly `min-h-11` (`src/components/PwaInstallBanner.tsx:39,46`).
- Problem: "Reload" is the single tap that completes a PWA update; on mobile it is a ~20px text target. This is exactly the straggler class the 20260920 P2-1 wave was meant to eliminate.
- Fix: Add `inline-flex items-center min-h-11` to the button, matching `PwaInstallBanner.tsx:39-47`; add a sizing assertion.
- Effort: ~15min.

**2. Dice favorite star toggle is ~28px** — [NEW]

- Evidence: `src/features/dice/DiceRoller.tsx:231` — the toggle label is `inline-flex items-center p-1 cursor-pointer` around a `w-5 h-5` (20px) SVG (`:240`), i.e. ~28px with no hit expansion.
- Problem: Pinning a favorite is a touch action on the roller's chip row, and it is the smallest target on that row (the notation button and star share a chip). Below the 44px floor.
- Fix: Expand the hit area on the label (`after:content-[''] after:absolute after:-inset-2.5` with `relative`) or bump the padding to `p-3`, keeping the 20px visual star. Add a sizing assertion.
- Effort: ~20min.

**3. Composer touch stragglers: reply-cancel, upload-error dismiss, and the chip row** — [NEW]

- Evidence:
  - Reply-cancel: `className="ml-auto p-0.5 …"` around a `w-4 h-4` icon (`src/features/chat/MessageComposer.tsx:558-561`) ≈20px.
  - Upload-error dismiss: icon `w-4 h-4` with only `after:-inset-2.5` (`src/features/chat/MessageComposer.tsx:675-677`) ≈36px — the button this same audit round added for #592 is itself under the floor.
  - Chip row: `chipBase = 'inline-flex items-center gap-2 px-3 py-2 text-sm …'` (`src/features/chat/composerChip.ts:1`) computes to ~36px and backs the always-visible Scene/NPC/X-Card/Upload chips (`MessageComposer.tsx:404,424,442,456`); the collapsed-mode indicator chips override to `!px-2 !py-1 text-xs` (`MessageComposer.tsx:691`) ≈28px, and the dice-roller toggle reuses `chipBase` (`DiceRoller.tsx:255`).
- Problem: The app's stated convention holds touch-first, always-visible controls to 44px (20260920 "Intentional exclusions"). The composer's primary action row and two newly added controls sit under it.
- Fix: `min-h-11 min-w-11` (or a larger `after:-inset`) on the cancel-reply and dismiss buttons; add `min-h-11` to `chipBase` or a hit-expansion so the chip row clears the floor. Assert the controls named above at test time.
- Effort: ~1h including tests.

**4. Terms re-consent screen declares `aria-modal="true"` but manages no focus** — [NEW]

- Evidence: `src/features/auth/ReConsentGate.tsx:32` renders `role="dialog" aria-modal="true"`; the component has no focus trap and never moves initial focus (no `ref`/effect — `ReConsentGate.tsx:1-60`). An existing `useFocusTrap` hook is available (`src/hooks/useFocusTrap.ts`). Escape is deliberately disabled (comment `ReConsentGate.tsx:13`).
- Problem: `aria-modal="true"` promises assistive tech that focus is contained inside the dialog. Here, on mount, focus stays on `<body>` (or whatever was focused), and Tab can walk the underlying document behind the gate. Screen-reader and keyboard users get a dialog with no announced entry point.
- Fix: Attach `useFocusTrap` to the dialog `ref` and move initial focus to the accept button (or the dialog container) on mount. Escape must remain disabled — do not add `useEscapeToClose`. Add a test asserting focus enters the dialog.
- Effort: ~30min.

## What's sound — do not touch

- **Image upload UX (#592/#593)** — validation happens before upload (type, admin-enabled, size) in `useImageUpload.ts:29-37`; the error banner is `role="alert"` (`MessageComposer.tsx:669`) and dismissible (`:672-680`); drag-drop shows a visible `ring-2` state (`:544`) and reports partial failures inline (`:288`).
- **Dice favorite chips (#586/#589)** — `useDiceFavorites` reconciles optimistic toggles against the in-flight snapshot and rolls back per-notation on error (`useDiceFavorites.ts:49-79,123-171`); the DB trigger is the race-proof cap and the client `MAX_FAVORITES` guards render (`:26,60-62`).
- **Status-bar chevron after reload (#577)** — `useElementOverflow` re-measures on resize, content mutation, and lazy-Markdown resolution, dropping the clamp inline for an honest read (`useElementOverflow.ts:34-63`); wired at `ChannelStatusBar.tsx:31-33`.
- **Update/reload banner (#576/#601)** — the boot handshake detects a re-served stale shell and self-heals (`pwaUpdate.ts:50-104`); `hardReload` covers WebKit/PWA containers and cache-busts only on the heal path (`hardReload.ts:12-24`); the banner keeps its button mounted while "Updating…" so focus is not dropped (`PwaUpdateBanner.tsx:17-19`).
- **Admin DM light-mode readability (#590)** — own bubbles are `bg-indigo-600 text-white` with `prose-invert`, non-own use `dark:prose-invert` (`ThreadDetail.tsx:125-129`); the deleted branch renders plain `[Message deleted]` text outside the prose scope, so there is no `prose-invert`-on-light leak.
- **Terms re-consent logic (#602)** — first-time acceptance is recorded at sign-in and the gate only shows when the documents changed (`ReConsentGate.tsx:6-14`, `ProtectedRoute.tsx:88-97`), with an inline `role="alert"` failure message and retry path (`ReConsentGate.tsx:49-53`).
- **Chat screen-reader semantics** — the scroll container is `role="log" aria-live="polite"` with a keyboard-reachable `tabIndex={0}` (`MessageList.tsx:436-440`), and empty/error states with Retry are explicit (`:411-430`).
- **Image viewer error state (#11)** — covered above; the zoom readout is `aria-live="polite"` and controls are `h-11 w-11` (`ImageViewerModal.tsx:135-150`).
- **Token ratchet** — the guard is now a rule with a frozen allowlist plus a control-byte scan (`tokenAdoption.test.ts:24-78`); do not shrink the allowlist by hand without actually migrating.

## Intentional exclusions

Carried from prior rounds and re-verified deliberate:

- Re-consent cannot be dismissed — no Escape, no backdrop, acceptance required to use the app (`ReConsentGate.tsx:13`). Only the missing focus trap is a finding (P2-4); the no-dismiss rule is not.
- `tabIndex={0}` on the `role="log"` chat container (`MessageList.tsx:438`) — deliberate, so keyboard users can reach the list for scrolling.
- Desktop ~32-36px hover-row convention for message actions; touch-first always-visible controls held to 44px.
- One-tap X-Card, no confirmation (safety tool, zero friction).
- Raw-token allowlist in `tokenAdoption.test.ts:47-75` is frozen debt, not endorsement — a ratchet to burn down, not a target to expand.
- The age-gate checkbox is a standard input with a large clickable label row.

## Suggested execution order

1. **P1-2** keyboard-inaccessible file inputs (~1h) — five controls, one uniform `sr-only` + focus ring change; add the `hidden`-input guard test.
2. **P1-1** implement the 20260923 heading scale (~2-3h) — config + four call sites + tests + changelog; the plan is complete, just execute it.
3. **P2-1** PWA Reload touch target (~15min).
4. **P2-2** dice favorite star hit area (~20min).
5. **P2-3** composer touch stragglers (~1h).
6. **P2-4** re-consent focus trap (~30min).

Items 1, 3, 4 are small and independent; 2 is the largest and unblocks the visual consistency score; 5 and 6 pair naturally with the next touch-target / a11y sweep.
