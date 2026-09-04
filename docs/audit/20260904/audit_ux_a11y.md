# UX & Accessibility Audit — 2026-09-04

Product/mobile UX & accessibility re-audit of `alvarocavalcanti/ttrpgpbp` (React 19, Vite, TypeScript, hand-rolled Tailwind, Supabase, PWA, Node 26). Direct successor to [docs/audit/20260831/ux_audit.md](../20260831/ux_audit.md) — every prior P0/P1 was re-verified against current code before any new finding was added. Read-only pass: no code changed.

**Date:** 2026-09-04

**Scope (components reviewed):** `App.tsx`, `ChannelView.tsx`, `MessageList.tsx`, `MessageItem.tsx`, `MessageComposer.tsx`, `DiceRoller.tsx`, `RollHistoryModal.tsx`, `ModifierInput.tsx`, `EmojiPicker.tsx`, `Menu.tsx`, `BottomSheet.tsx`, `ConfirmDialog.tsx`, `Lobby.tsx`, `JoinChannel.tsx`, `ChannelStatusBar.tsx`, `MemberList.tsx`, `EditCharacterModal.tsx`, `ChannelSettings.tsx` (hook usage), `ActivePlayerModal.tsx` (hook usage), `SafetyToolsModal.tsx` (hook usage), `NpcManagementModal.tsx` (hook usage), `CreateChannelModal.tsx` (hook usage), `ChannelNotificationSettingsModal.tsx` (hook usage), `ChannelHelpModal.tsx` (hook usage), `ChangelogModal.tsx` (hook usage), `IconPicker.tsx` (hook usage), `SearchModal.tsx`, `AdminView.tsx`, `ProfileSettings.tsx`, `LoginPage.tsx`, `MemberList.tsx`, `useFocusTrap.ts`, `useEscapeToClose.ts`, `useEdgeSwipe.ts`, `ToastContext.tsx`, `RealtimeBanner.tsx`, `PwaInstallBanner.tsx`, `composerChip.ts`, `index.css`, `tailwind.config.js`, `sw.ts`, `channelRead.ts`, `useChannel.ts` / `useMessages.ts` (read-state + retry paths).

**Verification run this pass:**

- `npx tsc -p tsconfig.app.json --noEmit`: **passed** (no errors)
- `npx oxlint`: **passed** (exit 0, clean)
- No builds, tests, git, or database commands were run (audit contract).

## Audit Prompt

> You are a Principal Product Designer and UX specialist, mobile-first, auditing a Play-by-Post TTRPG web app (React 19, hand-rolled Tailwind — no Shadcn, no design tokens). This is a RESEARCH + REPORT task: you must NOT modify any code. Your only file output is the audit report itself.
>
> Repo root: /Users/alvaro.cavalcanti/Projects/Personal/ttrpgpbp-chore-audit-20260904 (a git worktree — treat it as the repo root).
>
> AUDIT CONTRACT (applies to every finding):
>
> - Read-only audit. Do NOT modify any file except your single report file. Do NOT run `gh` or any git command. Do NOT run tests, builds, or database commands.
> - Allowed verification: `npx tsc -p tsconfig.app.json --noEmit`, `npx oxlint`, plus reading files (grep/read tools).
> - Every finding must cite evidence as `file:line` (relative to repo root). No evidence = no finding. Verify every claim against actual code, not docs or changelogs.
> - Severity: P0 = correctness/security defect or launch blocker · P1 = significant gap, no data loss · P2 = polish/DX.
> - Baselines — read these first, do NOT re-report remediated items:
>   - docs/audit/20260831/ux_audit.md (your DIRECT predecessor — first, verify each of its P0/P1/P2 items: mark [FIXED] or [OPEN] with current evidence before adding anything new)
>   - docs/audit/20260831/phase4_audit.md (remediation matrix + P2 residuals: no focus trap anywhere, per-route error boundaries, composer double-send)
>   - docs/audit/20260828/phase3_audit.md
> - Tag every finding [NEW] (not covered before), [OPEN] (raised earlier, still unfixed — cite prior ID e.g. `ux#P0.2`, `phase4#P2`), or [INTENTIONAL] (deliberate product choice — list separately under Intentional Exclusions, do not propose fixes).
> - Stack: React 19, Vite, TypeScript, hand-rolled Tailwind (tailwind.config.js has empty theme — token-less by convention), Supabase, PWA, Node 26.
>
> YOUR PILLAR — Product/mobile UX & accessibility:
>
> 1. FIRST: audit every P0/P1 from docs/audit/20260831/ux_audit.md against current code — dice roller popup clipping in BottomSheet, `window.prompt` ability checks, sub-24px message action targets, missing focus trap, first-run empty lobby dead end, buried channel tools, manual "load older" button, full-screen spinner, header search width, lobby row wrapping. Mark each [FIXED] or [OPEN] with file:line evidence of CURRENT state.
> 2. Touch targets: 44px floor across interactive controls (message actions, dice inputs, send button, emoji picker, menus).
> 3. Modal & focus management: focus trap, initial focus, focus restoration, Escape (shared `useEscapeToClose` hook exists — check which modals use it, which lack it), native `<dialog>` upgrade path, `window.confirm/prompt/alert` remaining sites.
> 4. Loading/empty/error states: every async surface (Lobby, ChannelView, MessageList, SearchModal, JoinChannel, admin) — skeleton vs spinner, error-with-retry vs silent blank, empty states with CTA.
> 5. First-run journey: sign-in → empty lobby → CTA → invite mental model → character setup discoverability.
> 6. Navigation IA: channel tools depth (sidebar hamburger), header actions, mobile patterns, back behavior.
> 7. Accessibility: labels on inputs, `aria-*` correctness (aria-modal without trap, aria-expanded on disclosure controls, role="log" chat semantics), keyboard operability (sortable headers, mention navigation, dice controls), visible `focus-visible` states, color contrast incl. dark mode (timestamps gray-400 on gray-900), reduced motion.
> 8. Visual consistency: token-less palette (hardcoded indigo/gray/amber/parchment class strings), duplicated className blobs (400+ char strings), Menu.tsx duplicated option lists.
> 9. Copy quality: user-facing text player-friendly (no schema/RLS/API internals).

## Executive Summary

| Vector | 2026-08-31 | 2026-09-04 | Notes |
|---|---|---|---|
| Mobile usability | **6.5/10** | **8.5/10** | All five P0s closed: dice roller renders as a BottomSheet on mobile, ability checks use a styled sheet with a character-sheet deep link, message actions collapsed behind a ⋯ sheet, focus traps everywhere, empty lobby has both CTAs. Residuals are secondary-control target sizes and two leftover native prompts. |
| Aesthetic consistency | **7/10** | **7.5/10** | Semantic tokens (`primary`/`surface`/`parchment`) now exist in `tailwind.config.js` and a shared `composerChip` module was extracted — but adoption is near-zero (hundreds of raw `indigo-*`/`gray-*` classes) and 400+ char className blobs remain. Infrastructure done, migration pending. |
| Feature completeness | **9/10** | **9/10** | Depth unchanged and still exceptional for an async play-by-post tool; this pass added quick-roll chips, a styled check sheet, edge-swipe drawers, and text-size settings on top of it. |

**Biggest strength — remediation quality.** Every one of the ten ux_audit P0/P1 items is verifiably fixed, and the fixes follow the audit's own suggested shapes (BottomSheet popup for the dice roller, ⋯ actions menu, header-first skeleton paint, scroll-top auto-load, expanding header search, invite-input empty state). The focus-trap work (`useFocusTrap` + `useEscapeToClose` with a proper escape stack and nested-dialog coordination) is better than what most design systems ship.

**Biggest weakness — the long tail of small targets and leftover native dialogs.** The core loop is ergonomic now, but secondary controls (reaction chips, emoji grid, member kebab menus, status-bar chevron, admin sort headers) still sit at 24–37px, two `window.prompt` calls remain (AFK status, admin suspend reason), and the token system exists on paper only.

## Prior audit disposition

Every ux_audit P0/P1 verified against current code:

| Prior ID | Item | Status | Current evidence |
|---|---|---|---|
| ux#P0.1 | Dice roller popup clips inside options BottomSheet on mobile | **[FIXED]** | `DiceRoller.tsx:210-215` renders the roller panel in a `BottomSheet` when `popup`; `MessageComposer.tsx:270` passes `popup={isMobile}`. Inputs are `min-h-11` (`DiceRoller.tsx:87,98,128,169`). |
| ux#P0.2 | Ability checks use `window.prompt` | **[FIXED]** | `MessageItem.tsx:106-160` `CheckSheet`: styled BottomSheet, modifier pre-filled from profile, Adv/Dis segmented control, Roll/Cancel; missing-attribute path deep-links to Edit Character (`MessageItem.tsx:123-136`, `ChannelView.tsx:311-314`). No `window.prompt` remains in `MessageItem.tsx`. |
| ux#P0.3 | Message action buttons sub-24px targets | **[FIXED]** | Mobile collapses actions behind a single ⋯ button opening a BottomSheet of full-width `py-2.5` rows (`MessageItem.tsx:386-415`); desktop hover row is `p-1.5` + `w-5 h-5` icons (`MessageItem.tsx:21-30`). EmojiPicker trigger is hidden in the controlled mode used from messages (`EmojiPicker.tsx:48`). |
| ux#P0.4 | No focus trap anywhere | **[FIXED]** | `useFocusTrap.ts:15-68` traps Tab, restores focus on unmount, defers to nested dialogs. Applied at all 15 `role="dialog"` surfaces (BottomSheet, ConfirmDialog, SearchModal, ChannelSettings, RollHistoryModal, EditCharacterModal, ActivePlayerModal, SafetyToolsModal, ChannelNotificationSettingsModal, NpcManagementModal, CreateChannelModal, IconPicker, ChangelogModal, ChannelHelpModal, ProfileSettings delete dialog). `useEscapeToClose.ts:7-17` stacks Escape so only the topmost modal closes. |
| ux#P0.5 | First-run empty lobby dead end | **[FIXED]** | `Lobby.tsx:117-164`: illustration, explanation of the invite-only model, inline "Create a channel" button, and a "Paste an invite link" input with validation (`Lobby.tsx:16,68-77`). |
| ux#P1.1 | Channel tools buried 2+ taps deep, ungrouped | **[FIXED]** | Sidebar grouped into "Table" and "GM Tools" sections (`ChannelView.tsx:373,445`); remaining tap depth is a documented product decision (issue #382, see Intentional Exclusions). |
| ux#P1.2 | Manual "load older" button | **[FIXED]** | Scroll-top auto-load within 80px on an overflowing list (`MessageList.tsx:128-138`); manual button kept as short-first-page fallback (`MessageList.tsx:212-224`). |
| ux#P1.3 | Full-screen spinner on channel open | **[FIXED]** | Header-first paint + skeleton name + 3 message bubble skeletons (`ChannelView.tsx:127-161`). |
| ux#P1.4 | Header search `w-24` on mobile | **[FIXED]** | Desktop search is an expanding icon field `w-10 focus:w-64 xl:w-48` (`App.tsx:112-125`); on mobile, search lives in the menu drawer (`App.tsx:167-183`). |
| ux#P1.5 | Lobby row badges wrap awkwardly | **[FIXED]** | Two-row row layout (name+unread+timestamp / preview+role badge), "Joined as" chip removed (`Lobby.tsx:185-215`). |

ux_audit P2 quick-wins:

| Prior P2 | Status | Evidence |
|---|---|---|
| Tokenize palette | **[OPEN — partial]** | Tokens defined (`tailwind.config.js:27-42`) but adoption ≈ 0: raw counts still AdminView 56, ProfileSettings 49, ChannelView 44, ChannelSettings 42, MessageItem 38, etc. |
| 44px micro-targets | **[OPEN — partial]** | Dice controls and send button fixed; reaction chips, emoji grid, member kebab, steppers, status-bar chevron still below floor (see P2.2). |
| DiceRoller inputs | **[FIXED]** | `min-h-11` inputs, ±999 modifier steppers (`DiceRoller.tsx:110-138`), quantity clamped 1–100 on change (`DiceRoller.tsx:86`), `inputmode` kept off the modifier path in favor of steppers. |
| `confirm()` delete | **[FIXED]** | `ConfirmDialog` used for message delete (`MessageItem.tsx:417-424`), kick/block/leave (`MemberList.tsx:335-355`), account delete (`ProfileSettings.tsx:381-425`). |
| Send button size | **[FIXED]** | `p-3` + `w-5 h-5` ≈ 44px (`MessageComposer.tsx:652-662`); shortcut tip folded into `title` (`MessageComposer.tsx:261-262,657`). |
| Timestamps contrast | **[FIXED — regressed elsewhere]** | `MessageItem.tsx:636` now `text-gray-500 dark:text-gray-400` (≈4.9:1 on gray-900) — but the same metadata pattern uses `dark:text-gray-500` in Lobby/MemberList (see P2.3). |
| Menu.tsx duplicated option lists | **[FIXED]** | Single shared `optionButtons` array rendered in either container (`Menu.tsx:52-77,101-112`). |
| Keyboard shortcut tip | **[FIXED]** | Floating tip removed; `title` on send (`MessageComposer.tsx:657`). |
| focus-visible ring-offset | **[FIXED]** | `index.css:29-31` recolors ring offset on dark surfaces. |

phase4_audit residuals relevant to this pillar:

| phase4 residual | Status | Evidence |
|---|---|---|
| No focus trap anywhere | **[FIXED]** | See ux#P0.4 above. |
| Per-route error boundaries | **[FIXED]** | `RouteErrorBoundary` keyed by pathname wraps all routes (`App.tsx:63-70,295-316`). |
| Composer double-send | **[FIXED]** | `retryMessage` reuses the pending bubble's `client_request_id` (`useMessages.ts:627-665`; regression test `useMessages.test.tsx:352`). |
| Scroll yank on visibilitychange | **[FIXED]** | Restore logic preserves captured position (`MessageList.tsx:161-195`). |
| DiceRoller quantity 9999 / modifier unclamped | **[FIXED]** | Clamp on change (`DiceRoller.tsx:86,127`); CheckSheet clamps to system bounds (`MessageItem.tsx:242`). |
| `dice:` raw input validation | **[FIXED]** | `isValidDiceNotation` gate at the click site (`MessageItem.tsx:269-272`). |
| SW offline navigation fallback | **[FIXED]** | `NavigationRoute(createHandlerBoundToURL('index.html'))` (`sw.ts:23`). |
| `last_read_at` frozen while channel open | **[FIXED]** | Advances on new messages while visible, monotonic writes (`useChannel.ts:38-46,123,151-162`; tests `useChannel.test.tsx:235,284,348`). |

## P0

None. No correctness defect or launch blocker found in this pillar. The five P0s from 2026-08-31 are all closed.

## P1

**1. Two `window.prompt` call sites remain (AFK away message, admin suspend reason)** — [OPEN, residual of ux#P0.2]

- Evidence: `src/features/channels/MemberList.tsx:96`, `src/features/admin/AdminView.tsx:212`
- Problem: The 2026-08-31 audit's most-cited P0 was `window.prompt` in the game loop; the ability-check flow was migrated to the styled `CheckSheet`, but two flows still drop the player into a native browser dialog. The AFK flow is player-facing: tapping "Mark Away (AFK)" in the member list mid-session throws a jarring, non-themeable, un-dismissable-by-Escape native prompt ("Away until Monday…") that breaks the tabletop feel the rest of the app works hard to maintain — and on some mobile browsers it can be mis-tapped into an unintended away status. The admin suspend prompt is lower-traffic but identical in kind, and it is the only remaining place the app asks for destructive-action input outside its own design language. The 201-char over-limit case is handled after the prompt (`MemberList.tsx:98-101`) instead of being prevented at input.
- Fix: Build a one-field text BottomSheet (reuse `BottomSheet` + `ModifierInput`-style validation, or extend `ConfirmDialog` with an optional text input). AFK: prefill existing `away_message`, enforce `MAX_AWAY_MESSAGE_LENGTH` at input, Cancel = abort (matching current `null` semantics at `MemberList.tsx:97`). Admin: same component with `MAX_ADMIN_SUSPEND_REASON_LENGTH` cap, placeholder "Reason (optional)". Both call sites already have the surrounding state machine; only the input swap changes.
- Effort: ~2–3h including tests.

## P2

Ordered by return-on-effort (cheapest highest-impact first).

**1. Sub-44px targets persist on secondary controls** — [OPEN, residual of ux#P2 "44px floor"]

- Evidence: reaction chips `px-1.5 py-0.5 text-xs` ≈24px tall (`src/features/chat/MessageItem.tsx:449`); EmojiPicker grid buttons `p-1.5` ≈32px (`src/features/chat/EmojiPicker.tsx:71`); member kebab menu `p-1` + `w-5` ≈32px (`src/features/channels/MemberList.tsx:222`); `ModifierInput` steppers `w-8 h-8` = 32px (`src/components/ModifierInput.tsx:20`); CheckSheet Roll/Cancel `py-1.5` ≈37px (`src/features/chat/MessageItem.tsx:146,153`); X-Card alert dismiss `p-1` + `w-4` ≈24px (`src/features/channels/ChannelView.tsx:289`); ChannelStatusBar chevron `p-1` + `w-4` ≈24px and Edit `px-2 py-1` ≈26px (`src/features/channels/ChannelStatusBar.tsx:136,146`).
- Problem: The high-frequency controls are fixed; these are the remaining mis-tap zones in play terms. The reaction chip row sits directly under every message on mobile — toggling a reaction on the wrong chip is the most likely residual touch error. The X-Card dismiss being the smallest control on screen is ironic for a safety control. Note `MESSAGE_ACTION_SIZING` documents a deliberate ~32–36px convention for the desktop hover row (`MessageItem.tsx:18-21`) — that's an intentional exclusion; the items above are *touch-first* controls (always visible on mobile, no hover affordance), which is why they're reported.
- Fix: Bump each to `min-h-11 min-w-11` (or `min-h-11` for full-width rows) with the glyph centered — same mechanical pattern already applied in `DiceRoller.tsx`. The X-Card dismiss and ChannelStatusBar chevron additionally need `aria-expanded`/`aria-label` parity with `Menu.tsx:84`.
- Effort: ~3h including the touch-target test updates (the sizing constants are asserted literally per `MessageItem.tsx:19-20`).

**2. Dark-mode metadata text fails AA contrast** — [NEW, regression class of ux#P2 "timestamps"]

- Evidence: `src/features/channels/Lobby.tsx:197` (row timestamp `text-xs text-gray-400 dark:text-gray-500` on gray-800 card ≈3.0:1); `src/features/channels/MemberList.tsx:193,196` (display name, notes); `src/features/chat/MessageItem.tsx:645` ("(edited)"); `src/components/Menu.tsx:68` (option hints); `src/features/chat/MessageComposer.tsx:617,635` (mention list secondary text).
- Problem: The prior audit fixed the message timestamp (`MessageItem.tsx:636` is now `dark:text-gray-400`, ≈4.9:1 — passes), but the same "metadata gets one gray darker in dark mode" pattern still exists in six other places, where gray-500 on gray-800 computes to roughly 3:1 — below the 4.5:1 AA floor for small text. In play terms: unread timestamps in the lobby and "(edited)" markers are hard to read for low-vision players in dark mode, and the lobby timestamp is the primary "how fresh is this thread" signal for an async game.
- Fix: Mechanical sweep: replace `dark:text-gray-500` with `dark:text-gray-400` on `text-xs` metadata (the same class already validated at `MessageItem.tsx:636`). Icons/decoration (chevrons at `Menu.tsx:96`, `MessageComposer.tsx:465`) can stay.
- Effort: ~1h.

**3. Chat stream has no live-region semantics** — [NEW]

- Evidence: `src/features/chat/MessageList.tsx:210` — the scroll container is a plain `div`; no `role="log"`, no `aria-live`. (Only toasts and the PWA banner use live regions — `ToastContext.tsx:81`, `PwaUpdateBanner.tsx:10`.)
- Problem: This is an async chat app: messages arrive via realtime while the reader is scrolled up or the tab is backgrounded. Sighted players get scroll anchoring and the "New messages" divider (`MessageList.tsx:246-254`); screen-reader players get nothing — new messages are silent until they happen to tab through the list. The app otherwise leads on a11y (focus traps, stacked Escape, aria-sort), so this is the conspicuous gap.
- Fix: Add `role="log" aria-live="polite"` to the outer list container and `aria-live="assertive"` is *not* wanted (X-Card already has its own `role="alert"` banner at `ChannelView.tsx:279`). Verify prepends don't re-announce old entries (role="log" handles append announcements; the manual "Load older" button prepend path may need `aria-live="off"` scoping if tests show chatter).
- Effort: ~1–2h with a jsdom live-region test.

**4. Drawers lack focus containment (last un-trapped overlays)** — [OPEN, residual of phase4#P2 / ux#P0.4]

- Evidence: channel sidebar drawer — backdrop is a focusable `role="button"` div and neither it nor the panel traps focus (`src/features/channels/ChannelView.tsx:337-359`); app menu drawer — same shape (`src/App.tsx:142-270`). Escape + backdrop tap exist (`ChannelView.tsx:63`, `App.tsx:87`).
- Problem: Every modal got a trap; the two nav drawers did not. A keyboard user opening the drawer on mobile can Tab *backwards* into the obscured message list behind the backdrop — focus lands on invisible controls. Also, the channel drawer backdrop being a `role="button"` in the tab order (vs the `aria-hidden` backdrops used by `BottomSheet.tsx:21-24`) is an SR smell.
- Fix: Reuse `useFocusTrap` on a wrapper around the drawer panel (the hook already defers to nested dialogs, and Escape is separately handled — pair them exactly as `BottomSheet.tsx:15-16` does). Change the backdrop to `aria-hidden` with an onClick, matching `BottomSheet`.
- Effort: ~1–2h.

**5. Admin sort headers are not keyboard operable** — [NEW]

- Evidence: `src/features/admin/AdminView.tsx:70-77` — `SortHeader` renders a `<th onClick>` with `aria-sort` but no `tabIndex`, no button, no keydown handler.
- Problem: `aria-sort` announces a state that keyboard users cannot change — the admin can sort Users/Channels tables only with a mouse. Violates the project's own "interactive elements keyboard operable" bar; admin is a power surface but also the one place tables are the primary UI.
- Fix: Put a full-size `<button>` inside the `<th>` (keeps `aria-sort` on the th per WAI-ARIA table pattern); inherit the existing focus-ring utility. ~20-line diff plus test.
- Effort: ~1h.

**6. Reduced-motion only half-applied** — [NEW]

- Evidence: only one `motion-safe` usage in the app (`src/App.tsx:156`); the channel sidebar drawer slide runs ungated (`src/features/channels/ChannelView.tsx:356-358` `transition-transform duration-300`); `scrollIntoView({ behavior: 'smooth' })` for highlight/unread anchoring is ungated (`src/features/chat/MessageItem.tsx:180`, `src/features/chat/MessageList.tsx:80`).
- Problem: Users with vestibular sensitivity get an animated 80vw panel slide and programmatic smooth scrolling in the main reading surface. The menu drawer got the treatment; the channel drawer — same gesture, same component shape — didn't, which is both an a11y gap and an inconsistency.
- Fix: `motion-safe:transition-transform` on the channel drawer (or hoist the drawer into a shared component — see P2.8); gate `behavior` behind a `matchMedia('(prefers-reduced-motion: reduce)')` check in the two `scrollIntoView` sites (a 3-line helper next to `useMediaQuery`).
- Effort: ~1h.

**7. Error states without in-place retry on three async surfaces** — [NEW]

- Evidence: Lobby channel-load error says "Refresh the page to try again" with no button (`src/features/channels/Lobby.tsx:93-101`); message-load banner same copy, no retry (`src/features/channels/ChannelView.tsx:272-276`) while the channel-level error right above it *does* have a Retry button (`ChannelView.tsx:174-197`); SearchModal error text with no retry (`src/features/search/SearchModal.tsx:80-83`).
- Problem: Inconsistent with the app's own (good) pattern one screen up: transient Supabase hiccups force a full page reload in the lobby — which re-runs auth and loses scroll state — when a refetch is one prop away (`useChannels` exposes re-fetchable data; `refetch` already exists in `useChannel`).
- Fix: Wire `refetch`-style retries into the three states; keep the copy. Lowest-effort is Lobby + messagesError (hooks already re-fetch on other events); SearchModal can just re-trigger its debounced query on retry.
- Effort: ~2h.

**8. Duplicated className blobs and drawer/menu duplication (token adoption enabler)** — [OPEN, ux#P2 tokenize]

- Evidence: `src/features/chat/MessageItem.tsx:497` — scene-message prose block is a single ~640-char className; `src/features/channels/ChannelStatusBar.tsx:120` — amber prose block ~500 chars; sidebar menu rows duplicated 11× as identical `block w-full text-left px-4 py-2.5 text-sm font-medium …` strings (`src/features/channels/ChannelView.tsx:376-477`); the same drawer row pattern re-implemented in `App.tsx:158-267`; raw `indigo-*/gray-*` counts remain: AdminView 56, ProfileSettings 49, ChannelView 44, ChannelSettings 42, MessageItem 38 (`tailwind.config.js:27-42` tokens unused).
- Problem: Maintenance, not aesthetics: a palette change or a contrast fix (like P2.2 above) requires touching dozens of files because the tokens exist but nothing consumes them. The two drawers are separately maintained copies of the same drawer pattern (the App drawer even got `motion-safe` and the channel one didn't — drift already happening).
- Fix: Incremental, no new deps: (a) extract a `drawerRow`/`proseParchment`/`proseAmber` constant into a `styles.ts` next to `composerChip.ts` (precedent exists at `src/features/chat/composerChip.ts:1-6`); (b) migrate the highest-churn files (MessageItem, ChannelStatusBar, Lobby) to `primary-*`/`surface-*` aliases — the config comment already guarantees identical values (`tailwind.config.js:5-6`); (c) optionally promote the two drawers to a shared `Drawer` component reusing `useFocusTrap` (closes P2.4 too).
- Effort: (a)+(b) ~3h; (c) +2h, do opportunistically.

**9. Small input/label and popup-dismiss a11y nits** — [NEW]

- Evidence: SearchModal search input has placeholder but no label or `aria-label` (`src/features/search/SearchModal.tsx:64-71` — the project rule "inputs have visible `<label>`s or `aria-label`" is met elsewhere, e.g. `App.tsx:119`, `DiceRoller.tsx:78,90,121`); the mention listbox cannot be dismissed with Escape (ArrowUp/Down/Enter/Tab handled, Escape falls through to submit-adjacent behavior — `src/features/chat/MessageComposer.tsx:236-259`); EmojiPicker popup closes on click-outside only, no Escape (`src/features/chat/EmojiPicker.tsx:35-44`).
- Problem: Screen-reader users get an unlabeled search field in a modal titled only via `aria-labelledby` on the dialog (workable but below the app's own bar); Escape — the app's universal dismiss key, wired through `useEscapeToClose` in 20+ surfaces — does nothing in the two smallest popups.
- Fix: `aria-label="Search messages"` on the SearchModal input; add Escape cases in the composer keydown and EmojiPicker (both already have the close callback in scope).
- Effort: ~1h.

## What's sound — do not touch

- **Reliability UX core** — idempotent sends with retry reusing the request id (`useMessages.ts:627-665`), pending/error overlays with Retry/Remove (`MessageItem.tsx:465-479`), offline banner, app badge. Don't refactor while touching adjacent code.
- **Scroll anchoring** — prepend position preservation, bottom-pinning ResizeObserver, visibility-restore that never yanks (`MessageList.tsx:94-195`). This is the hardest code in the app and it is correct; leave it alone.
- **Focus/Escape infrastructure** — `useFocusTrap` (initial focus, restoration, nested-dialog deference, `useFocusTrap.ts:39-62`) and the stacked `useEscapeToClose` dispatcher (`useEscapeToClose.ts:7-17`). Reuse these; don't introduce a library.
- **CheckSheet** — exactly the right shape: pre-filled clamped modifier, Adv/Dis toggle, deep link to character sheet, warning only when truly missing (`MessageItem.tsx:106-160,238-254`).
- **Empty/error state coverage** — RollHistoryModal, JoinChannel, SearchModal, ChannelView all have loading/error/empty states with CTA where relevant; the archived-channel and blocked-member states are clear (`ChannelView.tsx:258-262,164-172`).
- **First-run journey** — lobby empty state explains the invite model at the moment of confusion and offers both paths; JoinChannel collects character name + attributes with bounds validation at the point of join (`JoinChannel.tsx:120-126`).
- **Copy quality** — user-facing strings reviewed across Lobby, JoinChannel, ConfirmDialog, composer, toasts, error banners: all player-friendly, no schema/RLS/API leakage found. ("Failed to load roll history." `RollHistoryModal.tsx:81`, "You've been removed from this channel." `ChannelView.tsx:168` — all fine.)
- **Toast system** — capped stack, timers cleaned up, correct `role`/`aria-live` split (`ToastContext.tsx:71-95`).
- **Native `<dialog>` upgrade path** — deliberately *not* recommended now: the custom trap/Escape/focus-restore stack is tested and coordinated (nested-dialog deference); a migration would discard tested behavior for no user-visible gain.

## Intentional Exclusions

Documented product decisions (issue references found in code comments) — listed, not fixed:

- **Channel tools live only in the sidebar; no header search/dice icons** — "Tools live in the sidebar menu (issue #382)" (`ChannelView.tsx:242`); header search was folded into the drawer on mobile (`App.tsx:165-166`). The prior audit's 1-tap header-icon suggestion is rejected.
- **No header X in drawers** — close via backdrop, edge swipe, toggle, or Escape (`ChannelView.tsx:61-63`, `App.tsx:85-87`).
- **No persistent smiley/reaction trigger on messages** — reactions open only via the message actions sheet (`MessageItem.tsx:459-460`).
- **~32–36px desktop hover-row convention for message actions** — documented constant with a literal-assert test (`MessageItem.tsx:18-30`); mobile users get the sheet instead. (Touch-first controls that are *always visible* on mobile are still held to the 44px floor — see P2.1.)
- **One-tap X-Card with no confirmation** (`MessageComposer.tsx:279-292`) — correct for a safety tool; friction must be zero.
- **Dice popup stays an anchored popup on desktop** (`DiceRoller.tsx:216-227`) — only mobile uses the sheet (`MessageComposer.tsx:263,270`); reasonable per-form-factor split.

## Suggested execution order

1. **P2.2** dark-mode metadata contrast sweep (~1h) — smallest diff, immediate readability win.
2. **P1.1** AFK + admin prompt → styled BottomSheet (~2–3h) — closes the last native-dialog gap.
3. **P2.1** secondary touch targets to 44px (~3h) — mechanical, test constants updated deliberately.
4. **P2.3** `role="log"` on the message list (~1–2h).
5. **P2.4** drawer focus traps + aria-hidden backdrops (~1–2h) — or fold into P2.8's shared Drawer.
6. **P2.5** keyboard-operable sort headers (~1h).
7. **P2.6** reduced-motion gates (~1h).
8. **P2.7** retry buttons on Lobby/messages/SearchModal errors (~2h).
9. **P2.8** extract style constants + token adoption in high-churn files (~3h; shared Drawer +2h).
10. **P2.9** label/Escape nits (~1h).

Items 1–7 are all small, independent, and each closes an audit trail item; 8–9 can ride along with the next feature work that touches those files.
