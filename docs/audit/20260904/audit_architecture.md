# Architecture, Performance & Code-Quality Audit — 2026-09-04

## Audit Prompt

> You are a Principal Software Engineer auditing architecture, performance, and code quality of a React 19 + Supabase SPA (Play-by-Post TTRPG app). This is a RESEARCH + REPORT task: you must NOT modify any code. Your only file output is the audit report itself.
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
>   - docs/audit/20260831/phase4_audit.md (remediation matrix; treat [VERIFIED STABLE] rows as closed unless you find a regression; its P2 section lists known residuals)
>   - docs/audit/20260831/ux_audit.md
>   - docs/audit/20260828/phase3_audit.md
> - Tag every finding [NEW] (not covered before), [OPEN] (raised earlier, still unfixed — cite prior ID e.g. `phase4#P2`, `arch#4`), or [INTENTIONAL] (deliberate product choice — list separately under Intentional Exclusions, do not propose fixes).
> - Stack: React 19, Vite, TypeScript, hand-rolled Tailwind (no Shadcn), Supabase (Postgres/RLS/Realtime/Edge Functions), PWA, Node 26.
>
> YOUR PILLAR — Architecture, performance & code quality:
>
> 1. Module boundaries & data-access discipline: the 20260812 audit established the rule "queries live in hooks, not components" — check for regressions (grep for `supabase.from(` inside .tsx component files outside hooks/).
> 2. Rendering performance on the chat hot path: memoization (`React.memo`, `useMemo`, `useCallback`) status vs the 20260812 fixes (MessageItem memo, hoisted renderers, stable callbacks); list pagination/virtualization; unnecessary re-renders; context value churn.
> 3. DB query patterns from the client: N+1s, missing indexes for shipped query shapes (cross-check src queries vs supabase/migrations indexes), pagination cursors, redundant refetch-after-mutation on top of realtime.
> 4. Type safety: remaining `any`/unsafe casts at trust boundaries (tests exempt — project enforces `typescript/no-explicit-any` for src); generated-type drift (`src/types/database.ts` vs migrations — check for `gen:types` script and CI drift check from 20260812 arch#5); Zod validation coverage gaps (phase4 P2: form submissions, channel/search/admin responses still unvalidated — verify and enumerate).
> 5. State management: cross-hook coupling, stale-state risks on route change, state reset on channel change.
> 6. Test/DX quality: mock hygiene (msw vs direct-client mocks), unhandled promise paths in tests, coverage gaps for new features, dead code.
> 7. Build/bundle: phase4 P2 precache bloat (vite.config.ts glob pulling all PNGs, 3.42 MiB / 58 entries — verify if fixed), chunk size warnings.
> 8. Realtime connection internals: subscribeWithRetry (src/lib/realtime.ts) quality, admin channels bare `.subscribe()` (phase4 flagged — verify).
>
> REPORT STRUCTURE (markdown, this exact skeleton):
>
> 1. `## Audit Prompt` — reproduce this prompt verbatim (from "You are a Principal Software Engineer" through this bullet).
> 2. Header block: date 2026-09-04, scope (src/ LOC approx), verification commands run + results.
> 3. `## Executive Summary` — short, blunt, structural verdict: what's rot vs what's missing seams.
> 4. `## P0` / `## P1` / `## P2` sections. Each finding: bold title, tag, evidence `file:line`, problem, suggested fix (concrete), rough effort. Order by return-on-effort within each severity.
> 5. `## What's sound — do not touch` — verified-correct structure so future audits don't re-flag (dependency graph direction, feature-folder layout, realtime cleanup, etc.).
> 6. `## Intentional exclusions` — deliberate simplifications you found, do not fix.
> 7. `## Suggested execution order`.

---

**Date:** 2026-09-04
**Scope:** `src/` ≈ 14.8k LOC source (non-test) + ≈ 18.9k LOC tests (≈ 33.9k total); 26 migrations, 2 Playwright specs.
**Verification commands run + results:**

- `npx tsc -p tsconfig.app.json --noEmit` → **passed, no errors** (exit 0)
- `npx oxlint` → **passed, clean** (exit 0)
- All claims verified by file reads / grep against `src/` and `supabase/migrations/`; no tests, builds, DB, or git commands run (per contract).

---

## Executive Summary

No rot. The 20260812 structural debts are paid: AuthContext is memoized and deferred, channel_members realtime is `*`-scoped, pagination cursors are composite everywhere, generated types are CI-drift-checked, per-route error boundaries exist, and every phase4 P1 (suspension bypass, join throttle, PUBLIC definer helpers, UPDATE/DELETE catch-up, `last_read_at`, SW offline fallback) is remediated in code. The seams are mostly closed.

What's left are three things, all fresh or freshly-visible:

1. **A privacy defect shipped yesterday.** The lobby-preview trigger (`20260904111055`) copies the first 120 chars of every new message — whispers included — into `channels.last_message_preview`, which members can SELECT wholesale. Messages RLS carefully hides whisper content; the preview column bypasses it. This is the one P0.
2. **The chat memoization invariant is half-defeated by later additions.** `MessageItem` is memoized and renderers are hoisted, but `onRetry`/`onRollDice` are recreated on every message event (they depend on the `messages` array) and `onEditCharacter` is an inline closure — so every incoming message and every modal/highlight toggle re-renders the entire message list.
3. **The admin-messages feature skips the data-access seam.** `ThreadList`/`ThreadDetail` do raw `supabase.from()` writes in components with swallowed errors, a non-atomic two-step create, `alert()` on failure, and an unvalidated cast — the exact pattern arch#4 retired elsewhere.

Plus one missing index for the new offline-reconcile query, and a short P2 hygiene tail (dead exports, per-keystroke icon search, native `prompt`/`alert` leftovers, a misfiled hook). The foundation is healthy; finish these before the next feature wave.

---

## P0

### 1. Whisper content leaks to all channel members via `channels.last_message_preview` [NEW]

**Evidence:**

- `supabase/migrations/20260904111055_channel_last_message_preview.sql:24-27` — the `on_message_inserted_last_message_at` trigger (SECURITY DEFINER) writes `last_message_preview = left(new.content, 120)` for **every** inserted message row, with no `whisper_to` carve-out.
- `supabase/migrations/20260801101940_fix_rls_recursion.sql:65-74` — messages SELECT RLS hides whisper rows from non-participants (`whisper_to IS NULL OR whisper_to = auth.uid() OR sender_id = auth.uid() OR is_channel_gm`).
- `supabase/migrations/20260801101940_fix_rls_recursion.sql:42-45` — channels SELECT policy grants **members** the full channels row (all columns, no column-level grant revocation exists for `last_message_preview`).
- `src/features/channels/Lobby.tsx:203` — the lobby renders `channelPreview(channel.last_message_preview)` directly to the member.

**Problem:** A whisper's first 120 characters are copied out of the RLS-protected `messages` table into an unrestricted column of a member-readable row. A player who sends a whisper to the GM (or receives one) exposes its content to every member of the channel in the lobby list. The push pipeline was hardened to strip whisper content (`filter.ts`); the preview trigger reintroduces the same class of leak through a path the audits already closed. Backfilled channels (migration `:6-13`) carry the leak for historical whispers too.

**Fix (one migration):**

1. In `set_channel_last_message_at()`: skip the preview write when `new.whisper_to IS NOT NULL` (keep the existing `last_message_at` update; leave `last_message_preview` as-is or write `NULL` — NULL is safest: "someone posted" without content).
2. Backfill cleanup: `UPDATE channels c SET last_message_preview = NULL WHERE EXISTS (SELECT 1 FROM messages m WHERE m.channel_id = c.id AND m.whisper_to IS NOT NULL AND left(m.content,120) = c.last_message_preview)`.
3. Regenerate `src/types/database.ts` (CI drift check will require it) and add a pgTAP case: whisper insert → `last_message_preview IS NULL`.

**Effort:** S (one migration + types regen + one test).

---

## P1

### 1. Chat hot-path memoization defeated by unstable `onRetry`/`onRollDice` and inline `onEditCharacter` [NEW]

**Evidence:**

- `src/features/chat/MessageItem.tsx:162` — `memo(function MessageItem(...))` with default shallow compare; props include `onRollDice` (dice-link renderer, `MessageItem.tsx:339`), `onRetry` (`MessageItem.tsx:475`), `onEditCharacter`.
- `src/features/chat/useMessages.ts:586` — `sendDiceRoll` deps `[channelId, user, messages]`; `:668` — `retryMessage` deps `[messages, channelId, applyRpcResult]`; `:518` — `sendMessage` deps `[channelId, user, messages]`. The `messages` dependency changes on **every** message event (new message, edit, reaction-triggered state churn is separate but messages itself churns per INSERT/UPDATE/catch-up batch), so these callback identities change per event.
- `src/features/channels/ChannelView.tsx:314` — `onEditCharacter={myMemberInfo?.id ? () => { setShowMobileSidebar(true); setEditingMemberId(myMemberInfo.id) } : undefined}` — inline arrow, new identity on **every** ChannelView render (every modal toggle, the 3s highlight-clear timer, reply state changes).
- `src/features/chat/MessageItem.tsx:339` — renderers `useMemo` correctly depends on `onRollDice`, so an unstable `onRollDice` also rebuilds renderers and forces `ReactMarkdown` re-parses.

**Problem:** Any new message re-renders **all** memoized `MessageItem`s (each re-parses its markdown via the unstable-callback renderers chain), and any ChannelView state change (opening Search, highlight set/clear = 2 renders) does the same. This erases the point of the 20260812 arch#3 memo fix on the app's hottest path. At 50+ messages per page, every incoming message costs a full list re-render.

**Fix:** Use the existing refs-for-stability pattern the codebase already applies to reactions (`ChannelView.tsx:99-100`):

1. In `useMessages`: add a `messagesRef` (already exists at `useMessages.ts:99-100` — reuse it inside `sendMessage`/`sendDiceRoll`/`retryMessage` for the duplicate-guard and retry lookup) and drop `messages` from the deps arrays, making all three stable `useCallback`s.
2. In `ChannelView`: wrap the `onEditCharacter` closure in `useCallback` keyed on `myMemberInfo?.id`.
3. Bonus hardening (S): wrap `Markdown` (`src/components/Markdown.tsx:12`) in `React.memo` so any future unstable prop degrades to a shallow skip instead of a markdown re-parse.
Tests: extend `MessageItem.test.tsx` with a render-count assertion (parent re-render with stable props must not re-render items) — the memo property is currently untested.

**Effort:** S (≈ half a day incl. tests).

### 2. Admin-messages mutations live in components with swallowed errors and a non-atomic create [OPEN `arch#4`]

**Evidence:**

- `src/features/admin-messages/ThreadList.tsx:128-133` — `admin_threads.insert()` inside `NewThreadModal`; `:142-146` — follow-up `admin_messages.insert()`; `:153-154` — `mark_admin_thread_read`; `:157-162` — refetch full thread, spread + `as Thread` cast with **no row validation** (the rest of the feature carefully Zod-parses via `AdminThreadRowSchema`, `useAdminThreads.ts:11`).
- `src/features/admin-messages/ThreadList.tsx:127,145` — two separate `supabase.auth.getUser()` calls when `useAuth()` already provides the user (`ThreadList` renders inside `AdminMessagesView` under `ProtectedRoute`).
- `src/features/admin-messages/ThreadList.tsx:136,149` — `alert('Failed to create thread')` / `alert('Failed to send message')` — native blocking dialogs, the exact off-brand pattern the UX audit flagged for removal.
- `src/features/admin-messages/ThreadDetail.tsx:54-58` — reply `admin_messages.insert()` in the component (uses `user!.id` non-null assertion); `:67-71` — `handleDeleteThread` awaits the delete then **navigates back unconditionally** — a failed delete silently presents the thread as deleted while it still exists; `:73-77` — `handleDeleteMsg` swallows the update error and refetches anyway (user sees the message "delete" fail with no feedback).
- `src/features/admin-messages/ThreadList.tsx:118` — `admin_list_active_gms` result set into state with no validation and no error handling (rejected promise → unhandled).

**Problem:** arch#4's rule is "queries live in hooks, not components." The sibling hooks (`useAdminThreads.ts`, `useAdminMessages.ts`) already exist and already own the reads — the mutations were never given a home. Beyond the rule itself, the error-swallowing paths are correctness bugs: a failed thread-delete looks successful; a failed message-delete silently persists; a failed GM-list load leaves an empty picker with no retry; the two-step thread+message create can strand an empty thread if the second insert fails (non-transactional, same class as arch#11's multi-write note).

**Fix:** Add mutation wrappers to the existing hooks — `useAdminThreads.createThread()`, `useAdminThreads.deleteThread()`, `useAdminMessages.sendReply()`, `useAdminMessages.deleteMessage()` — each surfacing errors to the caller (toast pattern already in `ToastContext`), reusing `user.id` from `useAuth`, parsing the returned thread with `AdminThreadRowSchema` (thread is GM-side only; a single-thread create can be one `admin_threads.insert().select()` + message insert with the same generation-guard style as the reads; or fold into one `create_admin_thread` RPC if atomicity is wanted — optional, current volume doesn't demand it). Replace `alert()` with `addToast`. ThreadList/ThreadDetail keep zero direct client calls.

**Effort:** M (hook wrappers + error paths + test updates in the two existing test files).

### 3. Reconnect/visibility reconcile query has no supporting index [NEW]

**Evidence:**

- `src/features/chat/useMessages.ts:243-252` — `reconcileUpdates` queries `messages` with `.eq('channel_id')` + `.or('updated_at.gt.X, and(updated_at.eq.X, id.gt.Y))` ordered by `updated_at, id`, paginated.
- `src/features/chat/useMessages.ts:377,385` — it runs on **every** realtime re-subscribe (each reconnect) **and** every `visibilitychange → visible` (i.e., every mobile app-switch).
- `supabase/migrations/20260819143646_scale_hot_paths.sql:3-10` — shipped indexes are `(channel_id, created_at DESC)`, `(whisper_to)`, etc. **No index on `updated_at` exists anywhere** (verified across all `CREATE INDEX` statements in `supabase/migrations/`).

**Problem:** The planner must scan every message row of the channel (and sort) to answer "rows edited since cursor." Cost is O(channel history) per app-switch and grows unbounded as channels age — the exact decay class phase-1 risk R2 described, now shipped in the hot recovery path.

**Fix:** One migration: `CREATE INDEX CONCURRENTLY idx_messages_channel_updated_at ON public.messages (channel_id, updated_at DESC, id DESC);` (matches the composite cursor ordering). Also update the migration that documents hot-path indexes if it lists them.

**Effort:** XS–S (one migration + note in test/CI reset).

---

## P2

### 1. "Queries live in hooks" rule unenforced; component-level query sites remain across channels/admin [OPEN `arch#4`]

**Evidence:** component files issuing queries directly (non-test):

- `src/features/channels/JoinChannel.tsx:39,56,84` (preview RPC — result set raw at `:42` with no `parseRow`, unlike every hook; salt RPC; join RPC)
- `src/features/channels/CreateChannelModal.tsx:63` (create RPC)
- `src/features/channels/MemberList.tsx:43` (`moderate_member`)
- `src/features/channels/ActivePlayerModal.tsx:43` (`set_active_players`)
- `src/features/channels/RollHistoryModal.tsx:77` (`get_channel_roll_history` — this one does Zod-parse, `:79`)
- `src/features/channels/ArchivedChannels.tsx:20,43` (raw reads + restore)
- `src/features/admin/AdminView.tsx:131-133,168,193-198,221,240` (admin list RPCs cast `as AdminUser[]` unvalidated, `app_settings` upserts, suspend/claim RPCs)

**Problem:** The 20260812 fix migrated the channel read-paths into hooks, but the rule was never enforced (no oxlint `no-restricted-imports` guard was added — the arch#4 recommendation's step 2), so command-style RPCs kept accreting in components and admin-messages (see P1#2) reopened it with table writes. Server-side validation holds, so this is hygiene, not safety.

**Fix:** Mechanical, opportunistic: move each site into its feature's hook (`useChannels.joinChannel`/`createChannel`, a small `useModeration`, `useRollHistory`, `useAdminData`). Then add the one-line oxlint restriction so it can't regrow. Do **not** build a repository layer (arch#4 already rejected it — correct).

**Effort:** M spread over touches; each site XS individually.

### 2. `IconPicker` fires an Iconify request per keystroke [OPEN `arch#11`]

**Evidence:** `src/features/chat/IconPicker.tsx:26-44` — effect on `[query]` with `AbortController` but no debounce; every keystroke launches `fetch('https://api.iconify.design/...')`. The project's own `useDebounce` hook (`src/hooks/useDebounce.ts`) is used two files away (`useSearch.ts:14`) for the identical pattern.

**Fix:** `const debouncedQuery = useDebounce(query, 300)` and key the effect on it (keep the abort). XS.

### 3. Dead code: `addNpc` export and unused mock helper [OPEN `arch#11` (+ NEW for the mock file)]

**Evidence:**

- `src/features/channels/useChannelNpcs.ts:44-48,108` — `addNpc` is referenced only by `useChannelNpcs.test.tsx:88-90` and mocked in `NpcManagementModal.test.tsx:39`; no production caller (NPC creation routes through `createNpc`, `NpcManagementModal.tsx:49`).
- `src/test/mocks/supabase.ts:1-17` — the arch#7 "typed chainable-mock factory" was created but **zero files import it** (verified: no `test/mocks/supabase` imports outside itself).

**Fix:** Delete `addNpc` + its test cases; delete `src/test/mocks/supabase.ts` or actually migrate a mock-heavy test to it (arch#7's original intent — migrating `App.test.tsx` alone would retire ~27 `as any` casts). XS.

### 4. Native `window.prompt`/`alert` remain at four sites [OPEN `arch#11` / UX P2]

**Evidence:** `src/features/admin/AdminView.tsx:212` (suspend reason via `prompt`); `src/features/auth/ProfileSettings.tsx:82` (`alert` on push-toggle failure); `src/features/admin-messages/ThreadList.tsx:136,149` (`alert` on create/send failure). The chat path was fixed (`ConfirmDialog` at `MessageItem.tsx:417-424`, `CheckSheet` replacing `prompt`); these four are the residue.

**Fix:** Suspend reason → a small modal with textarea (pattern exists: `ConfirmDialog`); alerts → `addToast` (used everywhere else). XS.

### 5. Profile save doesn't refresh the AuthContext profile [OPEN `arch#11`]

**Evidence:** `src/features/auth/ProfileSettings.tsx:57-64` writes `profiles.display_name` and toasts success; nothing refetches `AuthContext.profile` (which only loads on user-id change, `AuthContext.tsx:61-64,86-93`). Downstream impact is now small (optimistic message bubbles use `user_metadata.display_name`, `useMessages.ts:489`, and the realtime echo refetches with fresh joins), but the form itself can go stale after an error-retry and any future profile display would inherit the trap.

**Fix:** Export a `refreshProfile` from `AuthProvider` (hoist `fetchProfile`, reuse the deferred-call pattern) and call it after a successful save. XS.

### 6. `usePushNotifications` still lives in `features/auth/` [OPEN `arch#10`]

**Evidence:** `src/features/auth/usePushNotifications.ts:32`; four cross-feature importers: `src/features/channels/Lobby.tsx:51`, `src/features/channels/ChannelView.tsx:33`, `src/features/notifications/PermissionBanner.tsx:28`, `src/features/notifications/ChannelNotificationSettingsModal.tsx:21` (+ `ProfileSettings.tsx:42` same-feature). The notifications→auth edge arch#10 wanted removed still exists.

**Fix:** Move the file to `src/features/notifications/usePushNotifications.ts` and update imports (its `src/lib/pushSubscription.ts` extraction already happened — the remaining move is pure file relocation). XS–S.

### 7. Lobby refetches fully on every realtime status flap [NEW]

**Evidence:** `src/features/channels/useChannels.ts:106` — `subscribeRealtimeStatus(fetchChannels)`; `src/lib/realtime.ts:47-50` — any channel entering `reconnecting` or `connected` flips the global snapshot, which calls this listener. A single channel connection flap produces two full lobby refetches (channels embed + unread RPC) with no debounce (the messages-driven refresh at `:112-119` has one; the status-driven path doesn't).

**Fix:** Route the status listener through the existing `scheduleUnreadRefresh()` debounce instead of calling `fetchChannels` directly. XS.

### 8. E2E harness still broken and local-only [OPEN `phase3#P2`]

**Evidence:** `tests/e2e/` still contains only `core-journey.spec.ts` + `failure-paths.spec.ts` + `helpers.ts`; phase3 recorded the `signUp` inside `page.evaluate` failure and CI still does not gate E2E (no Playwright job added). No regression in the unit layer (tsc/lint clean), but the failure-path safety net phase3 asked for before the "next feature wave" still isn't there, and that wave has since shipped (admin-messages, previews, roll breakdowns).

**Fix:** Per phase3: seed users via the Admin API in `helpers.ts` instead of `page.evaluate` sign-up; add the Playwright job to CI. Effort M; scheduling call, not mine to force — but note every new feature since has been untested end-to-end.

---

## What's sound — do not touch

- **Dependency graph & layout.** Strictly acyclic, `features → hooks/lib/types` direction holds; feature folders with colocated tests remain consistent (verified by import sweep across all pillars above). channels is still the sink; dice/auth/notifications are clean leaves.
- **`src/lib/realtime.ts` (113 lines).** `subscribeWithRetry` is correct: exp backoff 1s→30s (`:92`), retry counter reset on SUBSCRIBED (`:87`), idempotent teardown (`:103-112`), global status via `useSyncExternalStore` (`:57-59`). All six feature subscription sites (chat, channel, safety-card, lobby-unread, admin×3) use it with `removeChannel` cleanup — the phase4 "admin channels bare `.subscribe()`" finding is closed (verified: no bare `.subscribe(` outside realtime.ts and the push-manager, which is a different API).
- **`useMessages` recovery architecture.** Cursor catch-up forward-paginates past the page cap (`:186-224`), `reconcileUpdates` applies only held ids with a composite `(updated_at, id)` cursor and a pre-catch-up cursor snapshot (`:234-288, :373-377`) — the phase4 P1 "misses UPDATE/DELETE" is properly fixed, and soft-delete coverage is explicitly reasoned (`:232-233`). Phase4's `last_read_at` freeze is also fixed (`useChannel.ts:156-163`, visible-gated, serialized writes `:36-50`).
- **State reset on channel change.** All three channel hooks clear state and cursors on `channelId` change (`useMessages.ts:111-116`, `useChannel.ts:59-66`); admin hooks add generation/request guards against overlapping fetches (`useAdminThreads.ts:38,70-74`, `useAdminMessages.ts:29,71-72`) — textbook.
- **Pagination cursors.** Composite `(created_at, id)` / `(last_message_at, id)` cursors everywhere messages/admin pages load; search capped at 20 with debounce + abort (`useSearch.ts:14,21,44`); unread counts are one RPC, not an N+1 (`useChannels.ts:63-67`).
- **Zod at every trust boundary that matters.** `rowSchemas.ts` covers channels, members, prefs, search, admin threads/messages, profiles, RPC scalars; `chat/validation.ts` covers fetched + realtime messages and reactions; roll history and push payloads have their own schemas. The phase4 P2 "channel/search/admin responses unvalidated" is **closed** — remaining unvalidated sites are enumerated in P2#1 only.
- **`sw.ts`.** Offline NavigationRoute (`:23`), exact-pathname notification matching (`:29-36`), push relay + subscription rotation validated through `subscriptionJsonToRow` (`pushSubscription.ts:27`), skip-waiting handoff (`:122-125`), all covered by `sw.test.ts`.
- **Server-authoritative commands.** Idempotent sends with duplicate guards (`useMessages.ts:449-465,527-540`), server-side clamps in `join_channel` (`20260817144037:159-172`), GM-transfer trigger (`20260901120000:18-54`), member-consent + attribute clamps (`20260831150000:50-69`), X-Card realtime now GM-only RLS (`20260831150000:36-44`) — phase4's REGRESSION RISK row is closed.
- **Build/PWA config.** Precache glob scoped to `js,css,html,ico,svg` with the rationale in-comment (`vite.config.ts:27-29`) — phase4's 3.42 MiB bloat is fixed; SW output compat shim is deliberate and documented (`vite.config.ts:9-16`); all 13 routes lazy + per-navigation `RouteErrorBoundary` (`App.tsx:22-37,67-70`); markdown lazy-loaded (`Markdown.tsx:4`).
- **Type drift protection.** `gen types` + diff gate in CI (`.github/workflows/ci.yml:32-33`); zero `any` in non-test src (enforced `typescript/no-explicit-any`); `database.ts` regenerated and in sync (`last_message_preview` present at `src/types/database.ts:467`).
- **Test layer.** ~18.9k test LOC ≥ source; the tricky concurrency paths (generation guards, catch-up cursors, prepends, visibility restore) all have explicit tests (`useMessages.test.tsx`, `useChannel.test.tsx`, `useAdminThreads.test.tsx`, `MessageList.test.tsx`); msw is a documented safety net with `onUnhandledRequest: 'error'` (`src/test/mocks/handlers.ts:6-10`) — the direct-client mock strategy stands.

## Intentional exclusions (deliberate — do not fix)

- **`created_at`-only INSERT catch-up cursor** (`useMessages.ts:193-195` `ponytail:` comment): microsecond timestamps make boundary ties a non-issue; id-cursor documented as the upgrade path.
- **Reaction map fetched whole per channel, unpaged** (`useMessages.ts:162-180`): human-scale row counts; pagination would be architecture for no observed need.
- **One `last_read_at` write per arriving message** (`useChannel.ts:154-155` `ponytail:`): debounce deferred until write volume shows up.
- **Lobby channel ordering computed client-side** (`useChannels.ts:13-23,83`) instead of server ORDER BY: deterministic, small N, keeps the embed simple.
- **Client-side silent clamp as backstop only** (`JoinChannel.tsx:80-81` `ponytail:`): UI blocks out-of-range input; server clamps regardless.
- **Hard-delete reconciliation gap** (`useMessages.ts:232-233` `ponytail:`): deletes are soft in this app; refetch-based reconcile can't see hard deletes and that's accepted.
- **Iconify external API for NPC icons** (`IconPicker.tsx:34`): external service dependency accepted, with curated offline fallback.
- **Admin suspend/claim apply optimistic local updates without server refetch** (`AdminView.tsx:228-231,242-244`): admin-only, self-healing on next visit.
- **gm_id transfer rules** (allowing clear + orphan-claim without membership): documented audit decision in-migration (`20260901120000:5-10`).
- **Touch targets at 32–36px** for message actions (`MessageItem.tsx:18-30`): documented in-code as a deliberate UX-audit outcome, with a test pinning the strings.

## Suggested execution order

1. **P0 #1** — preview whisper leak: one migration (skip + backfill NULL), types regen, pgTAP case. Ship immediately; it's live on remote after merge-to-main migrations.
2. **P1 #3** — `updated_at` index migration. XS, rides along with #1 in the same PR wave.
3. **P1 #1** — stabilize the three `useMessages` callbacks + `onEditCharacter`, add the memo render-count test. Half a day.
4. **P1 #2** — admin-messages mutations into hooks with surfaced errors; drop the `alert()`s and the `as Thread` cast. A day.
5. **P2 sweep** (each XS, one batch PR): IconPicker debounce, dead code (addNpc, mocks/supabase.ts), prompt/alert replacements, profile refresh, usePushNotifications move, lobby status-flap debounce.
6. **P2 #1** — migrate the remaining component-level query sites opportunistically; add the oxlint import restriction last so it locks in the wins.
7. **P2 #8** — E2E harness repair + CI job before the next feature wave (phase3's standing recommendation, now more overdue).
