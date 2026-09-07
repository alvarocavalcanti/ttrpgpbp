# Architecture, Performance & Code-Quality Audit — 2026-09-07

## Audit Prompt

> You are a Principal Software Engineer auditing architecture, performance, and code quality of a React 19 + Supabase SPA (Play-by-Post TTRPG app). This is a RESEARCH + REPORT task: you must NOT modify any code. Your ONLY file output is one audit report file (path below).
>
> Repo root: /Users/alvaro.cavalcanti/Projects/Personal/ttrpgpbp-chore-audit-20260907 (a git worktree — treat it as the repo root; set your workdir there).
>
> AUDIT CONTRACT (applies to every finding):
>
> - Read-only audit. Do NOT modify any file except your single report file: docs/audit/20260907/audit_architecture.md (directory exists). Do NOT run `gh` or ANY git command. Do NOT run tests, builds, or database commands.
> - Allowed verification: `npx tsc -p tsconfig.app.json --noEmit`, `npx oxlint`, plus reading files (grep/read tools).
> - Every finding must cite evidence as `file:line` (relative to repo root). No evidence = no finding. Verify every claim against actual code, not docs or changelogs.
> - Severity: P0 = correctness/security defect or launch blocker · P1 = significant gap, no data loss · P2 = polish/DX.
> - Baselines — read these first, do NOT re-report remediated items:
>   - docs/audit/20260904/audit_architecture.md (your DIRECT predecessor — FIRST verify each of its findings #1–#8 + its P0: mark [FIXED] or [OPEN] with file:line evidence of CURRENT state)
>   - docs/audit/20260904/INDEX.md (deduped list + intentional exclusions — carry exclusions over)
>   - docs/audit/20260831/phase4_audit.md, docs/audit/20260831/ux_audit.md, docs/audit/20260828/phase3_audit.md (older baselines)
> - Tag every finding [NEW] (not covered before), [OPEN] (raised earlier, still unfixed — cite prior ID e.g. `arch-20260904#P1.1`, `phase4#P2`), or [INTENTIONAL] (list separately under Intentional Exclusions, do not propose fixes).
> - Stack: React 19, Vite, TypeScript, hand-rolled Tailwind (no Shadcn), Supabase (Postgres/RLS/Realtime/Edge Functions), PWA, Node 26.
>
> YOUR PILLAR — Architecture, performance & code quality:
>
> 0. FIRST — prior-finding verification. The 20260904 architecture findings (fixes landed ~2026-09-05; verify in code):
>    P0.1 whisper preview leak (SQL — security pillar owns detail; just note disposition)
>    P1.1 chat hot-path memoization defeated — unstable onRetry/onRollDice + inline onEditCharacter (fix: refs-for-stability in useMessages + useCallback in ChannelView + memo render-count test)
>    P1.2 admin-messages mutations in components, swallowed errors, non-atomic create, alert(), as Thread cast (fix: mutation wrappers in useAdminThreads/useAdminMessages + toasts)
>    P1.3 missing (channel_id, updated_at, id) index for reconcile query
>    P2.1 "queries live in hooks" unenforced, 8 component-level query sites
>    P2.2 IconPicker fires Iconify request per keystroke (fix: useDebounce)
>    P2.3 dead code: useChannelNpcs.addNpc + src/test/mocks/supabase.ts
>    P2.4 native prompt/alert remnants (MemberList, AdminView, ProfileSettings, ThreadList)
>    P2.5 profile save doesn't refresh AuthContext profile
>    P2.6 usePushNotifications misplaced in features/auth/
>    P2.7 lobby refetches fully on every realtime status flap (fix: route through scheduleUnreadRefresh)
>    P2.8 E2E harness broken + not CI-gated
>    For each: [FIXED] with evidence, [OPEN], or [PARTIAL] with what remains.
> 1. Module boundaries & data-access discipline: "queries live in hooks, not components" — grep `supabase.from(`/`.rpc(` inside .tsx component files outside hooks/; note regressions and remaining sites.
> 2. Rendering performance on the chat hot path: memoization status (MessageItem memo, hoisted renderers, stable callbacks — verify the fix holds and no NEW unstable props were introduced by recent fixes); list pagination/virtualization; context value churn.
> 3. DB query patterns from the client: N+1s, missing indexes for shipped query shapes (cross-check src queries vs supabase/migrations indexes — including any NEW query shapes added by the 2026-09-05 fixes, e.g. safety-card catch-up queries), pagination cursors, redundant refetch-after-mutation on top of realtime.
> 4. Type safety: remaining `any`/unsafe casts at trust boundaries (tests exempt); generated-type drift (src/types/database.ts vs migrations — gen:types CI gate); Zod validation coverage gaps, incl. any new surfaces added by recent fixes (safety-card dismissal, admin mutations).
> 5. State management: cross-hook coupling, stale-state risks on route change, state reset on channel change.
> 6. Test/DX quality: mock hygiene, unhandled promise paths, coverage gaps for newly fixed features (did fixes ship with tests per project rule?), dead code.
> 7. Build/bundle: precache size, chunk warnings (compare to 20260904's 42 entries / 1.5 MiB state).
> 8. Realtime connection internals: subscribeWithRetry quality, any bare `.subscribe()`.

---

**Date:** 2026-09-07
**Scope:** `src/` ≈ 15.8k LOC source (non-test) + ≈ 22.1k LOC tests (≈ 37.9k total); 81 migrations, 2 Playwright specs (CI-gated).
**Verification commands run + results:**

- `npx tsc -p tsconfig.app.json --noEmit` → **passed, no errors** (exit 0)
- `npx oxlint` → **passed, clean** (exit 0)
- All claims verified by file reads / grep against `src/`, `supabase/migrations/`, `.github/workflows/`, `.oxlintrc.json`; no tests, builds, DB, or git commands run (per contract). Build/bundle therefore not re-measured this pass — precache config is unchanged (`vite.config.ts:27-29`), so the historical 20260904 baseline (42 entries / 1.5 MiB) remains the reference; the orchestrator's post-audit build (see [INDEX.md](INDEX.md)) measured 41 entries / 1.58 MiB, consistent with that baseline.

---

## Executive Summary

The 2026-09-05 fix wave landed clean: **all twelve 20260904 architecture findings — including the whisper-preview P0 — are remediated in code and verified here**, each shipped with tests (memo render-count test, flap-throttle test, admin action-hook suites, safety-card catch-up suite). The chat hot path is now fully stable (refs-for-stability in `useMessages`, `useCallback` handlers in `ChannelView`, `Markdown` memoized, zero inline closures on the `MessageList → MessageItem` edge), the reconcile query has its index, admin-messages mutations live in hooks with rollback + toasts, and E2E is seeded via the Admin API and CI-gated.

No P0, no P1 this pass. What remains is a five-item P2 tail: two straggler component-level RPC sites (the new lint guard is file-scoped, so new components can still regress — and did), a one-line ToastContext memoization, an un-cached signed-URL resolver, and two small Zod gaps on admin/roll-history RPC rows. Foundation stays healthy; the only structural note is that the "queries live in hooks" rule is enforced by enumerating past offenders instead of by a general pattern, which is how the two survivors escaped.

---

## Prior findings disposition

| Prior ID | Status | Evidence (current state) |
|---|---|---|
| P0.1 whisper preview leak | **[FIXED]** | `supabase/migrations/20260905123437_whisper_preview_scrub.sql:28,40` — trigger CASE-nulls preview on `whisper_to IS NOT NULL` and backfill recomputes previews from latest non-whisper message; `sec5_search_path_pin.sql:17` re-applies the same CASE. Types regenerated (CI drift gate green). Detail owned by security pillar. |
| P1.1 chat hot-path memoization | **[FIXED]** | `useMessages.ts:104-105` messagesRef; `sendMessage` deps `[channelId, user]` (`:560`), `sendDiceRoll` `[channelId, user]` (`:627`), `retryMessage` `[channelId, applyRpcResult]` (`:715`) with `applyRpcResult` `[]` (`:469`); `ChannelView.tsx:177` `handleEditCharacter = useCallback(..., [myMemberInfo?.id])`; render-count test `MessageItem.memo.test.tsx`; bonus `Markdown` memoized (`Markdown.tsx:15`). |
| P1.2 admin-messages mutations | **[FIXED]** | `useAdminThreads.ts:46-121` `createThread`/`deleteThread` via `useAdminThreadActions` — insert→rollback on failed message (`:66-79`), toasts, no `as Thread` (Zod-validated `formatThread`, `:118`, plus a `'committed'` state for unfetchable rows); `useAdminMessages.ts:154,170` `sendReply`/`deleteMessage` return success booleans. `ThreadList.tsx`/`ThreadDetail.tsx` contain zero direct client calls (verified by grep). Tests: `useAdminThreads.test.tsx:269-315`, `useAdminMessages.test.tsx:284-346`. |
| P1.3 `(channel_id, updated_at, id)` index | **[FIXED]** | `supabase/migrations/20260905175441_add_messages_channel_updated_at_index.sql:6` — `CREATE INDEX CONCURRENTLY ... (channel_id, updated_at DESC, id DESC)` matches the composite cursor. |
| P2.1 queries-live-in-hooks unenforced | **[PARTIAL]** | 8 sites → 2: `ChannelSettings.tsx:175-192` (`update_channel_settings` RPC) and `DiceRoller.tsx:43` (`get_channel_roll_history`). The new oxlint guard (`.oxlintrc.json:25-37`) bans `lib/supabase` imports **only in the 7 already-migrated files** — new/other components remain unrestricted, which is exactly how the two survivors persisted. See P2 #3. |
| P2.2 IconPicker per-keystroke requests | **[FIXED]** | `IconPicker.tsx:21` `useDebounce(query, 300)` keys the effect; debounce covered by `IconPicker.test.tsx`. |
| P2.3 dead code (addNpc, mocks/supabase.ts) | **[FIXED]** | No `addNpc` references outside `useChannelNpcs.ts`; `src/test/mocks/` now contains only `handlers.ts`/`handlers.test.ts`/`server.ts` — `supabase.ts` deleted. |
| P2.4 native prompt/alert remnants | **[FIXED]** | Grep across non-test `src/` finds no `window.prompt`/`alert`/`confirm` calls; only remaining `prompt(` references are the PWA install API (`usePwaInstall.ts:9,41` — a different API). |
| P2.5 profile save doesn't refresh AuthContext | **[FIXED]** | `AuthContext.tsx:20,134,157` exports memoized `refreshProfile`; `ProfileSettings.tsx:66` awaits it after a successful save; tests mock/exercise it (`ProfileSettings.test.tsx:77+`). |
| P2.6 usePushNotifications misplaced | **[FIXED]** | Lives at `src/features/notifications/usePushNotifications.ts` (+ colocated test); `src/features/auth/` no longer contains it. |
| P2.7 lobby status-flap refetch storm | **[FIXED]** | `useChannels.ts:114-127` — leading-edge 2s throttle `scheduleUnreadRefresh`, status listener routed through it (`:127`, ARCH-6 comment); regression test `useChannels.test.tsx:386` ("throttles realtime status flaps into a single refetch"). |
| P2.8 E2E harness broken + not CI-gated | **[FIXED]** | `tests/e2e/helpers.ts:47-67` seeds confirmed users via the Admin API (service-role), sign-in via the dev-exposed client (`supabase.ts:16-18`, dev/test-guarded); CI gained a full `e2e` job (`.github/workflows/ci.yml:78-132`, `needs: test`, full local stack, runs on every PR). |

---

## P0

None. No correctness or security defect found in this pillar's scope.

## P1

None. Every significant gap from the 20260904 pass is remediated (see disposition table); nothing new at this severity.

## P2

### 1. `ToastContext` value is a fresh object on every provider render — all consumers re-render on every toast lifecycle [NEW]

**Evidence:** `src/contexts/ToastContext.tsx:67` — `<ToastContext.Provider value={{ addToast, removeToast }}>`; both functions are already stable `useCallback`s (`:24, :37`). `ToastProvider` mounts at the tree root (`App.tsx:288`), above every route. Any toast add/auto-dismiss/eviction re-renders the provider → new context identity → every `useToast()` consumer (Lobby, ChannelView, composer-side hooks, safety-card hook host, admin views) re-renders with unchanged inputs. `AuthContext` got this exact treatment in the 20260812 wave; ToastContext was missed.

**Fix:** One line — `const value = useMemo(() => ({ addToast, removeToast }), [addToast, removeToast])` and pass `value`. Toast rendering itself is unaffected (it reads provider state directly).

**Effort:** XS (one line; existing context tests cover behavior).

### 2. Component-level RPC sites remain, and the lint guard is a blocklist of past offenders, not a rule [OPEN `arch-20260904#P2.1`]

**Evidence:**

- `src/features/channels/ChannelSettings.tsx:175-192` — `update_channel_settings` RPC called in the component (error-handled and toasted, but command-style query in the view layer).
- `src/features/dice/DiceRoller.tsx:43-58` — `get_channel_roll_history` RPC in the component (recent-notations feature; rows used raw, see P2 #4).
- `.oxlintrc.json:25-37` — `no-restricted-imports` bans `**/lib/supabase` **only** for the seven files migrated in 2026-09-05 (`JoinChannel`, `CreateChannelModal`, `MemberList`, `ActivePlayerModal`, `ArchivedChannels`, `RollHistoryModal`, `AdminView`). Any other component — e.g. the two above — imports the client freely.

**Problem:** arch#4's rule regressed through exactly the hole the fix left open. The guard documents intent but doesn't enforce the invariant, so the site count can only grow back.

**Fix:** (a) Move `update_channel_settings` into a `useChannelSettings.save()` (or extend the existing channel hook) and the roll-history read into a small `useRecentRolls` hook; (b) widen the oxlint pattern to all `src/features/**/*.tsx` + `src/components/**/*.tsx` (hooks keep their allowlist via per-file overrides). Each move is mechanical — the hooks already exist for the sibling flows.

**Effort:** S (two small extractions + config edit + test moves).

### 3. `useSignedImageUrl` re-signs every image on every mount — no session cache [NEW]

**Evidence:** `src/hooks/useSignedImageUrl.ts:45-61` — each `SignedImg` mount with a bucket path fires `createSignedUrl(value, 3600)` (`:53`); no module-level cache exists. A channel thread with N images costs N storage calls per open (and again per re-mount after pagination remounts). Predecessor audits never flagged it because signed URLs postdate the private-bucket fix.

**Problem:** Redundant round-trips on the message-list path; each also burns a storage-API rate-limit unit for a URL that is deterministic for an hour. Human-scale today, but it's the cheapest cache in the codebase to add.

**Fix:** Module-scoped `Map<path, { url, expiresAt }>` consulted before the request (TTL from `SIGN_TTL_SECONDS`, e.g. refresh at 90% elapsed). ~10 lines in the existing hook, no call-site changes.

**Effort:** S (hook-local cache + one test for the cache-hit path).

### 4. `DiceRoller` recent-notations trusts RPC rows unvalidated [NEW]

**Evidence:** `src/features/dice/DiceRoller.tsx:43-58` — `get_channel_roll_history` result is used raw (`r.created_at`, `r.notation`) with no `parseRow`/Zod, unlike every other read path (`rowSchemas.ts` pattern). A malformed row would throw inside `.sort`/`.localeCompare` during the effect.

**Problem:** Zod-at-trust-boundaries is the established house rule (phase3 closed the original gaps); this new surface skipped it. Blast radius is a crashed recent-chips effect, not data integrity.

**Fix:** A tiny schema `{ notation: string, created_at: string }` array parse; drop malformed rows. Rides along with P2 #2's hook extraction.

**Effort:** XS.

### 5. `useAdminData` rows are shape-guarded but field-unvalidated [OPEN `arch-20260904#P2.1` (admin casts unvalidated)]

**Evidence:** `src/features/admin/useAdminData.ts:60-66` — `admin_list_users`/`admin_list_channels` results get `Array.isArray` guards (improvement over the raw casts the prior audit flagged) but are then cast `as AdminUser[]`/`as AdminChannel[]` with no per-field validation; a row with a missing/ill-typed field still reaches `AdminView`'s sorting/rendering.

**Problem:** Admin-only surface, server-shaped, so this is hygiene — but the codebase's own comment (`:59-60`) admits malformed data would crash `useSort`, and the guard stops one step short of preventing that.

**Fix:** Two small Zod schemas (`AdminUserRowSchema`, `AdminChannelRowSchema`), `.filter` on parse failures — same pattern as `AdminThreadRowSchema` already used one feature over.

**Effort:** S.

---

## What's sound — do not touch

- **Chat hot path, end to end.** `MessageItem` memo (`MessageItem.tsx:164`), renderers `useMemo` keyed on stable deps (`MessageItem.tsx:335`), every callback on the `ChannelView → MessageList → MessageItem` edge is a stable `useCallback` (`ChannelView.tsx:134,138,148,177`; `useMessages.ts:426-715`), `chatMembers` memoized (`ChannelView.tsx:167`), no inline closures at the `MessageList.tsx:277-293` render site, `Markdown` memoized. The 20260812 invariant now holds with no new unstable props introduced by the fix wave.
- **`src/lib/realtime.ts` (113 lines, unchanged).** Exp backoff 1s→30s capped, retry counter reset on SUBSCRIBED, idempotent teardown, global status via `useSyncExternalStore`. No bare `.subscribe()` outside it (only `pushManager.subscribe`, a different API). All six feature subscription sites use it with `removeChannel` cleanup.
- **State reset & guards.** `useMessages` clears messages/reactions/cursors on `channelId` change (`useMessages.ts:121-131`); admin hooks keep generation guards (`useAdminThreads.ts:132-168`); `useChannel` parse-then-set on every realtime payload (`useChannel.ts:106-111,160-165,196-199`).
- **Query shapes vs indexes.** Reconcile cursor ↔ new `idx_messages_channel_updated_at`; history/admin composite cursors ↔ shipped indexes; search textSearch ↔ GIN `messages_search_idx` (`init_schema.sql:142`); roll history ↔ `(channel_id, created_at DESC)` (`scale_hot_paths.sql:7`); lobby unread is one RPC. New safety-card catch-up/dismissal queries (`useSafetyCardEvents.ts:47-52,100-104`) filter on `channel_id`, covered by `safety_card_events_channel_idx` (`20260811120000:49`) — X-Card volume is human-scale, so a composite `(channel_id, resolved_at)` index is not warranted yet.
- **Mutation discipline.** Optimistic sends with duplicate guards + realtime echo dedup; admin `createThread` rolls back its empty thread on failed first message (`useAdminThreads.ts:66-79`) and distinguishes `committed-but-unfetchable` from failure — no stranded-thread window.
- **Type drift protection.** `gen types` + `git diff --exit-code` gate in CI (`.github/workflows/ci.yml:30-34`); zero `any` in non-test src (verified by grep); `resolved_at` present in `src/types/database.ts:943-957`.
- **E2E layer.** Deterministic Admin-API seeding with fail-fast env errors (`helpers.ts:50-55`), CI job runs the full local stack on every PR (`ci.yml:78-132`) — the phase3/20260904 standing recommendation is fully closed.
- **Test layer.** Every 2026-09-05 fix shipped with tests per project rule: memo render-count (`MessageItem.memo.test.tsx`), flap throttle (`useChannels.test.tsx:386`), admin action hooks (`useAdminThreads.test.tsx`, `useAdminMessages.test.tsx`), safety-card catch-up/dismissal (`useSafetyCardEvents.test.tsx`), IconPicker debounce, `refreshProfile` (`ProfileSettings.test.tsx`). Coverage thresholds bumped (branches 81, `vite.config.ts:60-64`); dead code from the prior pass deleted; phase3's `types.patch` gone from the repo root.
- **Build/PWA config unchanged.** Precache glob still scoped (`vite.config.ts:27-29`); SW output compat shim documented; 13 lazy routes behind per-route error boundaries.

## Intentional exclusions

Carried over from `docs/audit/20260904/INDEX.md` (verified deliberate — do not fix): free-form initiative, public-only dice, no hidden rolls, single timeline, no threads/OOC split, email notifications future, no presence indicators, soft-delete-only messages, command-only `system`/`dice_roll` types, offline = cached shell, `verify_jwt=false` push with shared secret, client-side PBKDF2, label-only mimetype, 32–36px desktop hover-row convention, sidebar-only tools, `created_at`-only INSERT catch-up cursor, unpaged reaction map, Iconify external API, admin optimistic updates without server refetch, `gm_id` transfer rules.

## Suggested execution order

1. **P2 #1** ToastContext `useMemo` — one line, immediate render-churn win.
2. **P2 #2 + #4** Move the two surviving RPC sites into hooks, validate the roll-history rows, and widen the oxlint guard to all components in the same PR — closes arch-20260904#P2.1 permanently.
3. **P2 #3** Signed-URL session cache — ~10 lines, rides any image-related touch.
4. **P2 #5** Admin row schemas — opportunistic, next time the admin console is touched.
