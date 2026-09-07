# UX & Accessibility Audit — 2026-09-07

Product/mobile UX & accessibility re-audit of `alvarocavalcanti/ttrpgpbp` (React 19, Vite, TypeScript, hand-rolled Tailwind with semantic tokens, Supabase, PWA, Node 26). Direct successor to [docs/audit/20260904/audit_ux_a11y.md](../20260904/audit_ux_a11y.md) — every one of its findings (P1.1, P2.1–P2.9) was re-verified against current code before anything new was added, and its disposition tables were spot-checked. Read-only pass: no code changed.

## Audit Prompt

> You are a Principal Product Designer and UX specialist, mobile-first, auditing a Play-by-Post TTRPG web app (React 19, hand-rolled Tailwind — no Shadcn). This is a RESEARCH + REPORT task: you must NOT modify any code. Your ONLY file output is one audit report file (path below).
>
> Repo root: /Users/alvaro.cavalcanti/Projects/Personal/ttrpgpbp-chore-audit-20260907 (a git worktree — treat it as the repo root; set your workdir there).
>
> AUDIT CONTRACT (applies to every finding):
>
> - Read-only audit. Do NOT modify any file except your single report file: docs/audit/20260907/audit_ux_a11y.md (directory exists). Do NOT run `gh` or ANY git command. Do NOT run tests, builds, or database commands.
> - Allowed verification: `npx tsc -p tsconfig.app.json --noEmit`, `npx oxlint`, plus reading files (grep/read tools).
> - Every finding must cite evidence as `file:line` (relative to repo root). No evidence = no finding. Verify every claim against actual code, not docs or changelogs.
> - Severity: P0 = correctness/security defect or launch blocker · P1 = significant gap, no data loss · P2 = polish/DX.
> - Baselines — read these first, do NOT re-report remediated items:
>   - docs/audit/20260904/audit_ux_a11y.md (your DIRECT predecessor — FIRST verify each of its P1 + P2.1–P2.9 items AND spot-check its disposition tables: mark [FIXED] or [OPEN] with file:line evidence of CURRENT state)
>   - docs/audit/20260904/INDEX.md (deduped list + intentional exclusions — carry exclusions over)
>   - docs/audit/20260831/ux_audit.md, docs/audit/20260831/phase4_audit.md, docs/audit/20260828/phase3_audit.md (older baselines)
> - Tag every finding [NEW] (not covered before), [OPEN] (raised earlier, still unfixed — cite prior ID e.g. `ux-20260904#P1.1`, `ux#P0.2`), or [INTENTIONAL] (list separately under Intentional Exclusions, do not propose fixes).
> - Stack: React 19, Vite, TypeScript, hand-rolled Tailwind (tailwind.config.js has semantic tokens — token-less by convention), Supabase, PWA, Node 26.
>
> YOUR PILLAR — Product/mobile UX & accessibility:
>
> 0. FIRST — prior-finding verification. The 20260904 UX findings (fixes landed ~2026-09-05, commits "Fix audit #404" and "Audit #405"; verify in code):
>    P1.1 native prompt remnants — AFK away message (MemberList), admin suspend reason (AdminView), failure alerts (ProfileSettings, ThreadList) → fix should be styled sheet/toast with length caps at input
>    P2.1 sub-44px targets on secondary controls (reaction chips, emoji grid, kebab, steppers, X-Card dismiss, status-bar chevron)
>    P2.2 dark-mode metadata dark:text-gray-500 fails AA in ~6 sites
>    P2.3 chat stream no role="log"/aria-live
>    P2.4 two nav drawers lack focus containment; channel drawer backdrop focusable role="button"
>    P2.5 admin SortHeader th onClick not keyboard operable
>    P2.6 reduced-motion gates missing (channel drawer slide + 2 scrollIntoView smooth sites)
>    P2.7 error states without in-place Retry on Lobby + SearchModal
>    P2.8 token adoption / className blobs / duplicated drawers
>    P2.9 SearchModal input unlabeled; Escape dead in mention listbox + EmojiPicker popup
>    For each: [FIXED] with evidence, [OPEN], or [PARTIAL] with what remains.
> 1. Touch targets: 44px floor across interactive controls (verify the fix; find any NEW sub-44px controls introduced by the recent fixes, e.g. X-Card dismiss/catch-up UI, admin sheet inputs, new sheet components).
> 2. Modal & focus management: focus trap on any NEW overlay surfaces (AFK sheet, suspend-reason sheet, safety-card dismissals), initial focus, focus restoration, Escape, remaining window.confirm/prompt/alert (grep whole src).
> 3. Loading/empty/error states: every async surface incl. NEW safety-card catch-up UI (does a GM see loading/error state for catch-up? silent failure?), Retry coverage.
> 4. First-run journey, navigation IA, copy quality (player-friendly, no schema/RLS leakage) — spot-check the NEW UI copy (AFK sheet, suspend sheet, X-Card history/caught-up banners).
> 5. Accessibility: labels, aria-* correctness, keyboard operability, focus-visible, contrast incl. dark mode (verify the contrast sweep; find NEW dark:text-gray-500 introduced since), reduced motion (verify gates incl. any new animated surfaces).
> 6. Visual consistency: token adoption progress (raw indigo-*/gray-* counts vs 20260904's AdminView 56 / ProfileSettings 49 / ChannelView 44 / ChannelSettings 42 / MessageItem 38), className blobs, duplicated drawer/menu copies (were they extracted?).
> 7. Playability UX end-to-end: the X-Card now has catch-up + persisted dismissal — audit its UX shape (banner persistence, count display, dismissal feedback, player-facing signal when a flag is handled).
>
> REPORT STRUCTURE (markdown, this exact skeleton) in docs/audit/20260907/audit_ux_a11y.md:
>
> 1. `## Audit Prompt` — reproduce this prompt verbatim (from "You are a Principal Product Designer" through this bullet).
> 2. Header block: date 2026-09-07, scope (components reviewed), verification commands run + results.
> 3. `## Executive Summary` — short, blunt; scorecard table if useful (mobile usability / aesthetic consistency / feature completeness vs 20260904's 8.5 / 7.5 / 9).
> 4. `## Prior findings disposition` — table P1.1–P2.9 with status + evidence.
> 5. `## P0` / `## P1` / `## P2` sections. Each finding: bold title, tag, evidence file:line, problem, concrete fix, rough effort. Order by return-on-effort within severity.
> 6. `## What's sound — do not touch`.
> 7. `## Intentional Exclusions`.
> 8. `## Suggested execution order`.
>
> FINAL RESPONSE: return only (a) path of report written, (b) counts P0/P1/P2, (c) ≤10-line summary incl. prior-findings disposition one-liner.

## Scope & Verification

**Date:** 2026-09-07

**Scope (components reviewed):** `App.tsx`, `ChannelView.tsx`, `ChannelStatusBar.tsx`, `MemberList.tsx`, `MessageList.tsx`, `MessageItem.tsx` (CheckSheet, reactions, actions, scene block), `MessageComposer.tsx` (options chips, X-Card, mention listbox, NPC controls), `EmojiPicker.tsx`, `Menu.tsx`, `BottomSheet.tsx`, `ConfirmDialog.tsx`, `TextPromptSheet.tsx`, `PwaInstallBanner.tsx`, `PwaUpdateBanner.tsx`, `ModifierInput.tsx`, `DiceRoller.tsx`, `SearchModal.tsx`, `useSearch.ts`, `AdminView.tsx` (SortHeader, suspend sheet), `useAdminData.ts`, `ProfileSettings.tsx`, `ThreadList.tsx`, `ThreadDetail.tsx`, `useAdminThreads.ts`, `useAdminMessages.ts`, `Lobby.tsx`, `JoinChannel.tsx` (spot-check), `ArchivedChannels.tsx`, `useSafetyCardEvents.ts`, `SafetyToolsModal.tsx`, `NpcManagementModal.tsx`, `PermissionBanner.tsx`, `usePushNotifications.ts` (surface), `ToastContext.tsx`, `useFocusTrap.ts`, `useEscapeToClose.ts`, `index.css`, `tailwind.config.js`.

**Verification run this pass:**

- `npx tsc -p tsconfig.app.json --noEmit`: **passed** (no errors)
- `npx oxlint`: **passed** (exit 0, clean)
- No builds, tests, git, or database commands were run (audit contract).

**Token-count methodology note:** raw `indigo-*`/`gray-*` counts below are `rg -o '(?:indigo|gray)-[0-9]+' | wc -l` — every occurrence including `dark:`/`hover:` variants. The 20260904 numbers (AdminView 56 etc.) used a different (narrower) counting method, so absolute values are not directly comparable to the baseline; the migration signal is the *relative* pattern (which files hit 0 raw), not the absolute deltas.

## Executive Summary

| Vector | 2026-09-04 | 2026-09-07 | Notes |
|---|---|---|---|
| Mobile usability | **8.5/10** | **9.5/10** | Both drawers trapped with aria-hidden backdrops, both native prompts replaced by a proper `TextPromptSheet` with at-input length caps, secondary touch targets fixed (incl. pseudo-element hit-expansion where visuals couldn't grow), reduced motion gated everywhere, Retry on every failed async surface. Residuals are a handful of new small controls (banner buttons, NPC portrait icons) and one unnamed icon button. |
| Aesthetic consistency | **7.5/10** | **8/10** | Token migration is real but *uneven*: chat and channel surfaces are fully migrated (MessageItem 0 raw / 151 semantic, ChannelView 0 raw / 99 semantic) — while AdminView (146 raw), ChannelSettings (152), ProfileSettings (135), MemberList (56), Lobby (51) are untouched, and the scene-message className blob actually *grew* to ~1184 chars. New shared components (TextPromptSheet) ship with raw tokens. |
| Feature completeness | **9/10** | **9.5/10** | The X-Card — the app's safety-critical async gap — now has GM catch-up, persisted dismissal, a fail-safe restore on write failure, and count display. The one missing piece is the *closing* of the loop: a player who pressed the X-Card gets no signal when the GM handles it. |

**Biggest strength — the remediation discipline.** All 10 findings from 2026-09-04 are verifiably fixed or materially improved, and the fixes follow the audit's suggested shapes exactly (TextPromptSheet, in-th sort buttons, `role="log"`, drawer traps, `motion-reduce` gates, retry keys). The X-Card catch-up implementation is notably careful (SUBSCRIBED-then-query race handling, `Math.max` live/snapshot merge, dismissal latch, fail-safe restore).

**Biggest weakness — the loop didn't close everywhere.** Token adoption stalled at the chat/channel boundary, the newest controls again shipped below the 44px floor the fixes just established (banner buttons, NPC portrait icons, a 26px Retry), and the X-Card resolves silently from the player's side. Small things, but they are the same *classes* of thing the last two audits fixed — they regress by default unless adoption is finished.

## Prior findings disposition

Every 20260904 UX finding re-verified against current code (fixes from "Fix audit #404" / "Audit #405"):

| Prior ID | Item | Status | Current evidence |
|---|---|---|---|
| P1.1 | Native `window.prompt` remnants (AFK, admin suspend) + `alert` in ProfileSettings/ThreadList | **[FIXED]** | Zero `window.prompt`/`alert`/`confirm` calls remain in `src` (grep over non-test sources; only historical comments, e.g. `src/components/TextPromptSheet.tsx:15`). New `TextPromptSheet` enforces `maxLength` at input (`src/components/TextPromptSheet.tsx:44`) with char counter (`:49-51`); AFK wired at `src/features/channels/MemberList.tsx:352-364` with `MAX_AWAY_MESSAGE_LENGTH`, prefilled, Cancel = abort; suspend wired at `src/features/admin/AdminView.tsx:466-480` with `MAX_ADMIN_SUSPEND_REASON_LENGTH` and "Reason (optional)" placeholder; ProfileSettings failures are toasts (`src/features/auth/ProfileSettings.tsx:68-120`); ThreadList/useAdminThreads failures are toasts (`src/features/admin-messages/useAdminThreads.ts:48-115`). |
| P2.1 | Sub-44px targets on secondary controls | **[PARTIAL]** — the 7 named controls fixed; new stragglers appeared | Fixed: reaction chips `min-w-11` + hit-expansion (`src/features/chat/MessageItem.tsx:451`); emoji grid `h-11` (`src/features/chat/EmojiPicker.tsx:80`); member kebab `p-3` ≈44px (`src/features/channels/MemberList.tsx:213`); ModifierInput steppers `w-11 h-11` (`src/components/ModifierInput.tsx:20`); CheckSheet Roll/Cancel `py-3` ≈48px (`src/features/chat/MessageItem.tsx:148,155`); X-Card dismiss + chevron `after:-inset-2.5` hit-expansion (`src/features/channels/ChannelView.tsx:354`, `src/features/channels/ChannelStatusBar.tsx:148`). Remains: ChannelStatusBar **Edit** still `px-2 py-1` ≈26px with no hit expansion (`src/features/channels/ChannelStatusBar.tsx:138` — was listed in the original finding). New sub-44px controls → P2.1 below. |
| P2.2 | `dark:text-gray-500` metadata fails AA in ~6 sites | **[FIXED]** | Zero `dark:text-gray-500` in `src` (grep). Lobby timestamp `text-gray-400 dark:text-gray-400` (`src/features/channels/Lobby.tsx:198`); "(edited)" `text-surface-400 dark:text-surface-400` (`src/features/chat/MessageItem.tsx:647`); menu hints `text-gray-500 dark:text-gray-400` (`src/components/Menu.tsx:92`); mention secondary `text-gray-400 dark:text-gray-400` (`src/features/chat/MessageComposer.tsx:614,632`); MemberList metadata `dark:text-gray-400` (`src/features/channels/MemberList.tsx:183-191`). |
| P2.3 | Chat stream no `role="log"`/`aria-live` | **[FIXED]** | `role="log" aria-live="polite"` on the list container (`src/features/chat/MessageList.tsx:224-225`). |
| P2.4 | Drawers lack focus containment; channel backdrop focusable `role="button"` | **[FIXED]** | `useFocusTrap(sidebarRef, showMobileSidebar && !isDesktop)` (`src/features/channels/ChannelView.tsx:99`) and `useFocusTrap(menuRef, menuOpen)` (`src/App.tsx:96`); both backdrops now `aria-hidden="true"` divs (`src/features/channels/ChannelView.tsx:406`, `src/App.tsx:159`); Escape wired on both (`ChannelView.tsx:90`, `App.tsx:93`). |
| P2.5 | Admin `SortHeader` `<th onClick>` not keyboard operable | **[FIXED]** | Full-size `<button>` inside the `<th>`, `aria-sort` kept on the th, visible focus ring (`src/features/admin/AdminView.tsx:54-60`). |
| P2.6 | Reduced-motion gates missing | **[FIXED]** | Channel drawer `motion-reduce:transition-none` (`src/features/channels/ChannelView.tsx:415`); both `scrollIntoView` sites gated via `matchMedia('(prefers-reduced-motion: reduce)')` (`src/features/chat/MessageItem.tsx:182`, `src/features/chat/MessageList.tsx:81`) — and the pattern was applied to the *new* admin-messages surface too (`src/features/admin-messages/ThreadDetail.tsx:35`). |
| P2.7 | Error states without in-place Retry (Lobby, SearchModal; messages banner) | **[FIXED]** | Lobby `refetch` Retry button (`src/features/channels/Lobby.tsx:98`); SearchModal `retry` via retryKey (`src/features/search/SearchModal.tsx:85`, `src/features/search/useSearch.ts:19-21`); messages banner Retry (`src/features/channels/ChannelView.tsx:331-339`) plus empty-list error Retry (`src/features/chat/MessageList.tsx:204-212`). |
| P2.8 | Token adoption / className blobs / duplicated drawers | **[PARTIAL]** | Chat + channel surfaces migrated to 0 raw tokens (MessageItem 151 semantic, ChannelView 99); sidebar rows deduplicated into `SIDEBAR_MENU_ITEM` (`src/features/channels/ChannelView.tsx:33`, used 10×) and `NAV_MENU_ITEM` in `App.tsx`. Not done: AdminView/ChannelSettings/ProfileSettings/MemberList/Lobby still 100% raw (146/152/135/56/51 occurrences); the scene-message prose blob *grew* to ~1184 chars (`src/features/chat/MessageItem.tsx:499`) and the amber status blob is ~674 (`src/features/channels/ChannelStatusBar.tsx:120`); the two drawers remain separately-maintained copies. → P2.5 below. |
| P2.9 | SearchModal input unlabeled; Escape dead in mention listbox + EmojiPicker | **[FIXED]** | `aria-label="Search"` (`src/features/search/SearchModal.tsx:67`); Escape cancels the mention list with `stopPropagation` (`src/features/chat/MessageComposer.tsx:287-291`); EmojiPicker Escape via the shared stack, no-op while closed (`src/features/chat/EmojiPicker.tsx:40-42`). |

Spot-checks of the 20260904 disposition tables all still hold: dice-roller BottomSheet + `min-h-11` inputs (`src/features/dice/DiceRoller.tsx:87-169`), focus trap on all 15+ dialog surfaces (`useFocusTrap` call sites listed in §What's sound), header-first skeleton (`src/features/channels/ChannelView.tsx:210-213`), lobby empty state with both CTAs (`src/features/channels/Lobby.tsx:118-124`), single `optionButtons` array in `Menu.tsx` (`src/components/Menu.tsx:54`), `MESSAGE_ACTION_SIZING` desktop convention intact (`src/features/chat/MessageItem.tsx:21`).

## P0

None. No correctness, security, or launch-blocking defect found in this pillar. Both prior P0 generations (2026-08-31's five, 2026-09-04's zero) remain closed.

## P1

**1. Member kebab button has no accessible name — screen readers announce an unnamed button that is the GM's only path to kick/block on mobile** — [OPEN, residual of ux-20260904#P2.1 (size fixed, name never added)]

- Evidence: `src/features/channels/MemberList.tsx:209-218` — `<button type="button" data-testid=… onClick=… className="p-3 …">` wraps a bare SVG (`:215`); no `aria-label`, no `aria-expanded`, no visible text. The popup menu itself (`:220-270`) has no `role="menu"`/menuitem semantics and closes only via a document click handler (`:38-42`) — no Escape, unlike `Menu.tsx` (`src/components/Menu.tsx:28,84`).
- Problem: WCAG 4.1.2 (Name/Role/Value) failure on a control that is not decorative: it is the sole entry point for "Edit Character", "Mark Away (AFK)", "Kick Player", "Block Player", and "Leave Channel". A screen-reader user tabbing the member list hears "button" for every row with no way to distinguish them — and cannot discover that moderation exists. The 20260904 fix note explicitly asked for "`aria-expanded`/`aria-label` parity with `Menu.tsx:84`"; the size half landed, the name half didn't. The shared `Menu.tsx` already demonstrates the correct pattern (named trigger, `aria-expanded`, `role="menu"`, Escape).
- Fix: `aria-label={`Member options for ${member.character_name}`}` + `aria-expanded={openMenuId === member.id}` on the trigger; add `role="menu"`/`role="menuitem"` to the popup and register Escape via `useEscapeToClose` (no-op while closed, same pattern as `EmojiPicker.tsx:40-42`). ~20-line diff.
- Effort: ~1.5h including tests (accessible-name assertion + Escape-close).

**2. X-Card resolution is silent for players — the presser's loop never closes** — [NEW]

- Evidence: `src/features/channels/useSafetyCardEvents.ts:84` (player gets `addToast('X-Card sent to the GM', 'success')` on press) and `:88-112` (GM `dismissAlert` writes `resolved_at` — no broadcast, no system message, and non-GMs never subscribe: the hook returns early for non-GMs at `:23`).
- Problem: The trigger side is now exemplary — one tap, themed confirmation toast, GM banner with count, persisted dismissal. But from the pressing player's side the tool is a black hole: after "X-Card sent to the GM" there is *no* signal that anything happened. In an async game the presser may be away for hours, then return to find the banner gone with no trace the flag was handled (resolved events are 7-day-window GM-only data). For a safety tool, "handled, silently" reads as "ignored" — the player's next reasonable step is to press again or escalate outside the app, exactly the outcome the tool exists to avoid. The GM side got catch-up; the player side got nothing.
- Fix: On dismissal, surface a *channel-level, identity-free* signal to everyone — cheapest correct shape is a `system`-type message ("A flagged scene has been resolved. Carry on — the X-Card is always there if you need it again.") posted by the dismissal path; the existing message pipeline renders it to all members with zero new subscriptions (players already receive messages realtime). Alternative: a players-side `resolved_at IS NOT NULL`-aware toast on next visibility. Keep the presser anonymous — no per-user receipt. The copy stays player-friendly and non-accusatory.
- Effort: ~2–3h (RPC/migration for an anonymous system insert, or piggyback the system message on the GM's session), plus tests.

## P2

Ordered by return-on-effort (cheapest highest-impact first).

**1. Touch-target stragglers — the newest controls again shipped below the 44px floor** — [NEW + OPEN, residual of ux-20260904#P2.1]

- Evidence:
  - ChannelStatusBar **Edit** `px-2 py-1 text-xs` ≈26px, no hit-expansion (`src/features/channels/ChannelStatusBar.tsx:138`) — the one original item never fixed.
  - Messages-error **Retry** `px-2 py-1` ≈26px (`src/features/channels/ChannelView.tsx:336`) — the most important button in the error path.
  - NPC-portrait icon cluster `p-1.5` + `w-5` icons ≈32px, no hit-expansion — 9 controls across both rows (`src/features/channels/NpcManagementModal.tsx:182,189,198,207,213,227,260,269,275`).
  - PermissionBanner **Enable Notifications** / **Dismiss** `px-3 py-1.5` ≈34px (`src/features/notifications/PermissionBanner.tsx:65,75`).
  - PwaInstallBanner **No thanks** `px-2 py-1 text-xs` ≈26px, **Install** `px-3 py-1.5` ≈32px (`src/components/PwaInstallBanner.tsx:40,47`).
  - `TextPromptSheet` input `py-2` ≈36px, no `min-h-11` — its own buttons meet the floor but the input the sheet exists for doesn't (`src/components/TextPromptSheet.tsx:47`).
  - "Load older messages" `py-2 text-xs` ≈30px (`src/features/chat/MessageList.tsx:231-239`).
- Problem: The 20260904 fixes established the two sanctioned patterns — `min-h-11 min-w-11` and the `after:-inset-N` pseudo-element hit-expansion — but every control added or touched since (banner components, the NPC avatar row, the prompt sheet) missed both. The messages-error Retry is the worst offender: a mis-tap on a ~26px Retry inside a red banner is a plausible mobile failure, and it's the recovery path for the app's most user-visible failure state. The install banner is the *first* new surface some users meet.
- Fix: Mechanical application of the two existing patterns: full-width-row buttons → `min-h-11`; icon buttons → `relative … after:content-[''] after:absolute after:-inset-2.5` (as `ChannelView.tsx:354`); `TextPromptSheet` input → `min-h-11` (matching `DiceRoller.tsx:87`). ~1h including a literal sizing assertion for the Retry.
- Effort: ~1–2h.

**2. Disclosure controls lack `aria-expanded` — three toggles announce no state** — [NEW]

- Evidence: channel sidebar toggle (`src/features/channels/ChannelView.tsx:301-310` — `aria-label` present, no `aria-expanded`), ChannelStatusBar chevron (`src/features/channels/ChannelStatusBar.tsx:145-159` — `title` only), MemberList kebab trigger (`src/features/channels/MemberList.tsx:209-218`; covered with P1.1). Meanwhile `Menu.tsx` (`:84`) and `EmojiPicker` (`:61`) do it right.
- Problem: The sidebar toggle is the highest-frequency disclosure control in the app — SR users can't tell whether the drawer is open after activating it (the visual slide is meaningless to them, and focus moves into the trapped panel, which partially masks the gap but doesn't announce *state*). Three lines per site.
- Fix: `aria-expanded={showMobileSidebar}` / `{isExpanded}` / `{openMenuId === member.id}` on the three triggers; give the chevron a real `aria-label` while there ("Expand status"/"Collapse status" can subsume the `title`).
- Effort: ~30min.

**3. Mention listbox is an incomplete combobox pattern** — [NEW]

- Evidence: `src/features/chat/MessageComposer.tsx:604-634` — `role="listbox"` with `role="option"` + `aria-selected` is rendered, but the textarea (the combobox input, `:644`) carries no `aria-expanded`, `aria-controls`, or `role="combobox"`, and the listbox has no `aria-activedescendant`, so ArrowUp/Down highlight changes (`:269-282`) are invisible to assistive tech.
- Problem: Keyboard support is genuinely good (arrows, Enter/Tab, Escape-with-stopPropagation); the *announced* state is missing. A sighted keyboard user sees the highlight; an SR user hears nothing change and may submit an unintended mention.
- Fix: `aria-activedescendant` on the textarea pointing at the highlighted option's id (options need stable `id`s), `aria-expanded={mentionOpen}` + `aria-controls` on the textarea. ~15 lines, contained to the composer.
- Effort: ~1h.

**4. X-Card catch-up failure is toast-only — a safety feature fails silently-by-design** — [NEW]

- Evidence: `src/features/channels/useSafetyCardEvents.ts:55-58` — catch-up SELECT error → `console.error` + one transient error toast ("Failed to load X-Card alerts."). No retry, no banner, no state; the GM session proceeds looking exactly like a clean "no alerts" session.
- Problem: Every other failure path in the app now has an in-place Retry (P2.7 fixed). This one is the *safety* path: a GM who misses a 4-second toast believes the table is clean. Transient Supabase hiccups are precisely the case Retry exists for, and the data is one idempotent count query away.
- Fix: On catch-up error, keep the banner rail alive with a compact inline "Couldn't load X-Card alerts — Retry" chip (reuse the messages-banner pattern, `ChannelView.tsx:328-340`); retry re-runs the count query. The hook already owns all the state needed.
- Effort: ~1–2h.

**5. Token adoption stalled at the chat/channel boundary; blobs grew; drawers still duplicated** — [OPEN, ux-20260904#P2.8]

- Evidence: raw `indigo-*`/`gray-*` occurrences (methodology above): AdminView **146**, ChannelSettings **152**, ProfileSettings **135**, MemberList **56**, Lobby **51**, TextPromptSheet **20** (new file, raw from birth) vs MessageItem **0** (151 semantic) and ChannelView **0** (99 semantic). The scene-message prose blob is now ~1184 chars (`src/features/chat/MessageItem.tsx:499` — grew from ~640); the amber status blob ~674 (`src/features/channels/ChannelStatusBar.tsx:120`). The app-menu drawer (`src/App.tsx:163-278`) and channel drawer (`src/features/channels/ChannelView.tsx:413-518`) remain two separately-maintained copies (style consts extracted, component not).
- Problem: Same maintenance argument as 20260904, now with evidence of drift in both directions: the migrated files prove the pattern works; the unmigrated files (including a brand-new shared component) prove it won't spread on its own. A future contrast sweep like P2.2 will again mean touching five files by hand instead of one config entry.
- Fix: Unchanged from the prior audit, updated for what's now proven: (a) extract `proseParchment`/`proseAmber` constants next to `composerChip.ts` and rebuild `MessageItem.tsx:499` / `ChannelStatusBar.tsx:120` from them; (b) migrate AdminView, ChannelSettings, ProfileSettings, MemberList, Lobby — mechanical alias swap, guaranteed identical values (`tailwind.config.js:28-29`); (c) TextPromptSheet is 20 occurrences, 15 minutes, do it when touching P2.1's input fix; (d) shared `Drawer` for the two nav drawers remains optional (+2h, closes the drift vector permanently).
- Effort: (a)+(c) ~1h; (b) ~3h; (d) +2h, opportunistic.

**6. Member kebab popup lacks menu semantics and Escape** — [NEW]

- Evidence: `src/features/channels/MemberList.tsx:220-270` — plain `div` + `button`s, no `role="menu"`/`menuitem`, no arrow-key navigation, closes only on outside click (`:38-42`) or selection; no Escape (contrast: `Menu.tsx` — `role="menu"` at `:77`, Escape at `:28`).
- Problem: The naming half is P1.1; this is the behavior half. Keyboard users can reach the items by Tab but have no menu semantics, no arrow navigation, and — the app's own universal convention — no Escape to dismiss. Every other popup in the app closes on Escape; this one swallows it (nothing happens, focus stays inside a menu floating over the member list).
- Fix: `role="menu"` + `role="menuitem"` + Escape-via-`useEscapeToClose` (no-op while closed). Arrow-key nav is nice-to-have; the semantics + Escape are the floor.
- Effort: ~1h (overlaps P1.1's diff — do together).

## What's sound — do not touch

- **X-Card GM-side architecture** — the catch-up implementation is the most careful code in the fix wave: SUBSCRIBED-then-query to dodge the Postgres Changes replay race (`useSafetyCardEvents.ts:40-46`), `Math.max` merge of live-arrived and snapshot counts (`:60-63`), dismissal latch against in-flight SELECTs (`:15-17,54`), fail-safe restore with count on write failure (`:97-111`). Don't refactor while touching P1.2/P2.4 — extend, don't reshape.
- **TextPromptSheet** — exactly the shape the audit asked for: `maxLength` at input, live counter, trimmed confirm, Cancel/Escape/backdrop all abort, initial focus moved into the input for the mobile keyboard (`TextPromptSheet.tsx:23-27`), `min-h-11` buttons. Reuse it for any future one-field flow.
- **Focus/Escape infrastructure** — now 16 `useFocusTrap` call sites incl. both drawers, stacked `useEscapeToClose` in 20+ surfaces with correct nesting (e.g. `NpcManagementModal.tsx:27-29` deferring to the nested IconPicker). This stack is tested and better than most libraries; keep hand-rolling it.
- **Retry coverage** — Lobby, SearchModal (retryKey pattern), channel-level, messages banner, empty-list, ThreadList, ActiveGMs: every failed async surface now has an in-place Retry with `min-h-11` or clear labeling — with one known exception until P2.4 (deduped P2-17) lands: the X-Card catch-up failure is still toast-only (`useSafetyCardEvents.ts:55-58`). This is the app's best-temperament error story to date.
- **Reduced-motion coverage** — drawer slide, three `scrollIntoView` sites, banner animations: all gated (`ChannelView.tsx:415`, `MessageItem.tsx:182`, `MessageList.tsx:81`, `ThreadDetail.tsx:35`, `App.tsx:166`). Complete.
- **Copy quality** — every new string reviewed: "Away message (optional)" / `e.g. "Away until Monday"` (`MemberList.tsx:354-356`), "Reason (optional)" (`AdminView.tsx:470`), "X-Card triggered (2)." (`ChannelView.tsx:351`), "X-Card sent to the GM" (`useSafetyCardEvents.ts:84`), "Failed to load X-Card alerts." — all player-friendly, no schema/RLS/API leakage. Admin-messages toasts likewise ("Couldn't start the conversation. Please try again.").
- **Loading/empty states** — skeleton-first channel open, lobby spinner, "No messages yet. Say hello!", "No matching channels found.", archived/blocked states, ThreadList empty + pagination guard. No blank regions found.
- **First-run journey** — unchanged and still good: invite-model explainer with both CTAs at the empty lobby (`Lobby.tsx:118-124`), JoinChannel character collection with bounds validation. Nothing in the fix wave regressed it.

## Intentional Exclusions

Carried from [INDEX.md](../20260904/INDEX.md) and re-verified deliberate — listed, not fixed:

- **Sidebar-only tools, no header icons** (issue #382; `ChannelView.tsx:298`).
- **No header X in drawers** — backdrop, edge swipe, toggle, Escape.
- **No persistent reaction trigger on messages** — reactions via the actions sheet only.
- **~32–36px desktop hover-row convention** for message actions — `MESSAGE_ACTION_SIZING` with literal-assert test (`MessageItem.tsx:21`); touch-first always-visible controls remain held to 44px (see P2.1).
- **One-tap X-Card, no confirmation** — correct for a safety tool; zero friction. (Now softened *after* the fact by the success toast — the right compromise.)
- **Dice popup anchored on desktop, BottomSheet on mobile** — per-form-factor split.
- Older carried items (not re-audited, pillar-independent): free-form initiative, public-only dice, single timeline, no threads/OOC split, email notifications future, offline = cached shell, client-side PBKDF2, unpaged reaction map, Iconify external API, admin optimistic updates, created_at cursor catches.

## Suggested execution order

1. **P2.2** `aria-expanded` on the three disclosure toggles (~30min) — smallest diff, closes the parity debt from the 20260904 fix note.
2. **P1.1 + P2.6 together** kebab accessible name + menu semantics + Escape (~2h in one diff) — closes the WCAG 4.1.2 failure and the last Escape hole in one touch.
3. **P2.1** touch-target stragglers sweep (~1–2h) — includes the TextPromptSheet input, which rides with P2.5(c).
4. **P2.4** X-Card catch-up inline Retry (~1–2h) — safety-adjacent, cheap.
5. **P1.2** X-Card resolution system message (~2–3h, needs migration/RPC) — schedule as its own PR; it's the only finding here with a schema-adjacent change.
6. **P2.3** mention combobox `aria-activedescendant` (~1h).
7. **P2.5** token migration: blobs + TextPromptSheet first (~1h), then the five unmigrated files (~3h), shared Drawer opportunistically (+2h).

Items 1–4 are all small, independent, and each closes an audit trail item; 5–7 pair naturally with the next feature work in those files.
