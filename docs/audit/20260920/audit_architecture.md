# Architecture, Performance & Code Quality Audit — 2026-09-20

## Audit Prompt

> You are a senior software architect writing one audit report against a React 19 + Vite + TypeScript + Supabase + PWA multiplayer play-by-post TTRPG app. This is a READ-ONLY task: do not modify any code, do not run `gh`, do not run tests/builds/DB. Allowed verification: `npx tsc -p tsconfig.app.json --noEmit`, `npx oxlint`, and reading files (grep/read/glob). Job: (1) re-verify the 2026-09-07 architecture findings #1–#5 against current code and mark each [FIXED]/[OPEN]/[PARTIAL] with file:line evidence; (2) audit the NEW surface merged since 2026-09-07; (3) write the report to docs/audit/20260920/audit_architecture.md. Every finding cites file:line; severity P0/P1/P2; tagged [NEW]/[OPEN]/[INTENTIONAL].

**Date:** 2026-09-20
**Scope:** `src/` ≈ 18.0k LOC source (non-test) + ≈ 29.7k LOC tests (≈ 47.7k total); 113 migrations; new public marketing route, channel media browser + scan-upload edge function, server-admin console expansion (users/channels/reports/read-only channel view/abuse-reports), dice-roll reactions, service-worker update reload, image-metadata clamp.
**Verification commands run + results:**

- `npx tsc -p tsconfig.app.json --noEmit` → **passed, no errors** (exit 0)
- `npx oxlint` → **passed** (exit 0; 45 react-compiler warnings + 1 jsx-a11y warning, 0 errors)
- Tests / coverage / build ran by the orchestrator, not re-run here (read-only contract): **1770 passed / 0 failed**, coverage **92.82 statements / 84.83 branches / 90.4 functions / 95.65 lines**; build passed.
- All claims verified by file reads / grep against `src/`, `supabase/migrations/`, `supabase/functions/`, `.oxlintrc.json`; no tests, builds, DB, or git commands run (per contract).

---

## Executive Summary

The 2026-09-07 fix wave landed clean and has held through ~30 PRs: **all five prior architecture findings are [FIXED] in code** — the `ToastContext` value is `useMemo`-memoized, both surviving component-level RPC sites moved into hooks and the oxlint guard was widened from a 7-file blocklist to a blanket `src/**/*.tsx` rule (grep now finds **zero** `lib/supabase` imports in any non-test component), `useSignedImageUrl` gained a TTL'd session cache, the dice recent-rolls rows are Zod-validated, and `useAdminData` now validates every admin RPC row with full Zod schemas.

No P0, no P1. The new surface is disciplined: every new admin RPC (`admin_list_channel_messages`, `admin_list_user_messages`, `admin_read_message`, `admin_list_channel_members`, `admin_list_abuse_reports`) is a `SECURITY DEFINER` function guarded by `is_server_admin()` with audit logging and a stable `(created_at, id)` cursor backed by a shipped index; the new hooks (`useAdminChannelMessages`, `useChannelMedia`, `useMessageRecipients`) follow the established hook-data-layer pattern with generation guards, Zod parsing, and cursor pagination; the scan-upload edge function fails closed and re-enforces the GM-only rule against a service-role client; the image-metadata clamp migration strips untrusted width/height at the write boundary.

What remains is a short P2 tail, all cosmetic/hygiene: a duplicated clipboard fallback (copy-pasted between `ChannelSettings` and `AdminView`, the comment admits it), an impure `Date.now()` computed during render in `AdminView`, an over-fetch of the full admin channel list to resolve one channel header, and a 45-warning react-compiler backlog that signals the codebase is still on manual memoization.

---

## Prior findings disposition

| Prior ID | Status | Evidence (current state) |
|---|---|---|
| #1 `ToastContext` fresh object every render | **[FIXED]** | `src/contexts/ToastContext.tsx:68` — `const contextValue = useMemo(() => ({ addToast, removeToast }), [addToast, removeToast])`, passed as `value={contextValue}` at `:71`. Both functions already stable `useCallback`s (`:24, :37`). |
| #2 Component-level RPC sites + blocklist guard | **[FIXED]** | `DiceRoller.tsx:4,33` imports and uses `useRecentRolls` (no client import); `ChannelSettings.tsx:8-12` uses `useUpdateChannelSettings`/`useChannelMaintenance`/`useChannelAvatar`/`useImageUpload`. `.oxlintrc.json:25-37` widened `no-restricted-imports` to `"files": ["src/**/*.tsx"]` banning `**/lib/supabase`. Grep: zero non-test `.tsx` imports of `lib/supabase` and zero `supabase.from(`/`.rpc(` in non-hook components. |
| #3 `useSignedImageUrl` re-signs every mount | **[FIXED]** | `src/hooks/useSignedImageUrl.ts:51-83` — module-scoped `urlCache` Map with `expiresAt` TTL (`SIGN_TTL_SECONDS=3600`) plus a separate non-expiring `dimsCache`; `getCachedUrl` (`:55-64`) consults before `createSignedUrl` (`:209-214`), `cacheSignedUrl` (`:66-83`) evicts expired then oldest at `CACHE_MAX_ENTRIES=100`. |
| #4 `DiceRoller` recent-notations unvalidated | **[FIXED]** | `src/features/dice/useRecentRolls.ts:8-13` — `recentRollRowSchema = z.object({ notation: z.string(), created_at: z.string() })`; per-row `safeParse` with malformed rows dropped (`:28-34`) before `.sort`/`.localeCompare`. |
| #5 `useAdminData` shape-guarded, field-unvalidated | **[FIXED]** | `src/features/admin/useAdminData.ts:14-91` — full Zod schemas (`AdminUserRowSchema`, `AdminChannelRowSchema`, `AdminAbuseReportRowSchema`, `AdminMessageRowSchema`, `AdminMessageDetailSchema`, `AdminAuditEntrySchema`); every list is `safeParse(...).filter(r => r.success).map(r => r.data)` (`:120-140`, `:214-216`, `:229-232`, `:246-249`). |

---

## P0

None. No correctness or security defect found in this pillar's scope. (The scan-upload trust boundary, admin RPC authorization, and storage/image-metadata hardening were reviewed for architecture soundness; detail ownership sits with the security pillar.)

## P1

None. Every significant gap from the 2026-09-07 pass is remediated (see disposition table); the new surface introduces nothing at this severity.

## P2

### 1. Clipboard copy fallback is copy-pasted between two components [NEW]

**Evidence:**

- `src/features/channels/ChannelSettings.tsx:121-137` — `handleCopy` implements `navigator.clipboard` in secure contexts with a `document.execCommand('copy')` fallback (hidden textarea, `document.body.appendChild`, cleanup).
- `src/features/admin/AdminView.tsx:264-284` — `handleCopyOptedInEmails` repeats the identical ~15-line pattern, and its own comment (`:264-265`) says it is a copy of "ChannelSettings' invite-link copy".

**Problem:** Two copies of a non-trivial fallback (secure-context branch, legacy `execCommand` path, textarea creation/removal, success/throw contract) will drift; a fix in one leaves the other with the old behavior. `lib/` already hosts shared pure helpers (`analytics`, `imageResize`, `marketing`, `pwaUpdate`), so a `copyToClipboard(text)` belongs there.

**Fix:** Extract `lib/clipboard.ts` with `export async function copyToClipboard(text: string): Promise<void>`; both call sites become `try { await copyToClipboard(...) } catch`. Keep the throw-on-`execCommand`-false contract.

**Effort:** XS (one ~20-line extraction + two call-site swaps + a small unit test).

### 2. `AdminView` computes `Date.now()` during render [NEW]

**Evidence:** `src/features/admin/AdminView.tsx:305-307` — `const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000` then `users.filter(...)`/`channels.filter(...)` derive the "new in 7 days" counts inline during render. Flagged by oxlint `react(purity)` at `:305:24`.

**Problem:** An impure render means the derived counts only refresh when the component re-renders for some other reason, and their value silently shifts between renders. Harmless at admin scale (display-only metric, manual refresh), but it's the exact pattern the react-compiler plugin exists to catch, and `:92` already does a similar `Date.now()` computation inside a pure `userStatus` helper — inconsistent.

**Fix:** Compute the cutoff once when the data loads (or `useMemo` on `users`/`channels`), or derive `newUsers`/`newChannels` inside the same effect that populates the lists.

**Effort:** XS.

### 3. Admin channel header over-fetches the full channel list [NEW]

**Evidence:** `src/features/admin/useAdminChannelMessages.ts:147-158` — `fetchChannel` calls `admin_list_channels` (an unpaged RPC returning **every** channel) and then `.find(c => c.id === channelId)` to resolve a single channel's header for the read-only view. The comment (`:52`) documents the choice: "comes from admin_list_channels so a deep link loads without router state."

**Problem:** Opening `/admin/channel/:id` costs an O(total channels) fetch to display one row's worth of header data (name, system, GM). Reusing the existing RPC avoids a new one, which is the lazy-correct call at admin scale (few channels, few admins), but it does not scale to a busy instance and is an over-fetch the next reader will trip over.

**Fix:** Either add a scoped `admin_get_channel(p_channel_id)` RPC (mirrors `admin_read_message`'s single-row shape) or accept the tradeoff and mark it intentional with a comment naming the ceiling.

**Effort:** XS (scoped RPC + one client call swap) or none (mark intentional).

### 4. React-compiler warning backlog (45 warnings) — manual memoization still the norm [NEW]

**Evidence:** `npx oxlint` exit 0 with 45 `react(...)` warnings (0 errors): `set-state-in-effect` across the new surface (`useAdminChannelMessages.ts:120,172,212`, `ChannelMediaPanel.tsx:29`, `UserDetailModal.tsx:57,81`, `AdminView.tsx:130`), `preserve-manual-memoization` (`ChannelView.tsx:59,246`, `useAdminMessages.ts:166`, `AuthContext.tsx:160`), `refs`-during-render (`MessageList.tsx:91`, `useMessages.ts:111,137`), and one `purity` (`AdminView.tsx:305`).

**Problem:** These are warnings, not errors, and they reflect a deliberate house style (manual `useMemo`/`useCallback`/refs-for-stability, which the 20260812/20260905 fixes built on). But the count is growing with each new hook, and warnings-only means real regressions (e.g. the purity case in #2) are indistinguishable from the intentional patterns. The codebase has not committed to React Compiler adoption, so the plugin is currently signal-free noise.

**Fix:** Decide the direction: (a) adopt React Compiler and delete the manual memoization, resolving the warnings at the source; or (b) downscope/silence the plugin rules that contradict the manual style until adoption. Either way, get the count to zero so a fresh warning reads as a regression, not background noise.

**Effort:** M (decision + one-time pass; no data-loss risk).

---

## What's sound — do not touch

- **Prior-fix invariants all hold.** Toast memo, hook-only data access, signed-URL cache, Zod at every admin/RPC trust boundary, and the widened oxlint guard are verified in code (see disposition). Zero non-test components import the Supabase client; zero `any` in non-test `src` (grep confirmed the prior "zero any" invariant still holds — the only remaining narrow casts are post-Zod-parse: `useAdminThreads.ts:24` `as Thread` after `parseRow`).
- **New admin data layer.** `useAdminChannelMessages` is generation- and request-sequence-guarded against channel-switch races (`useAdminChannelMessages.ts:66-78,90-96`), parses rows with `AdminChannelMessageRowSchema`/`AdminChannelMemberRowSchema` (`:14-38`), and pages with a stable `(created_at, id)` cursor that `loadOlder` prepends without clobbering newer pages (`:187-225`). `useAdminData` validates every list and keeps the "RPC rejection flows through the same error contract" pattern (`:143-238`).
- **Admin RPCs and indexes.** Every new `SECURITY DEFINER` RPC gates on `is_server_admin()`, sets `search_path = public`, and audits content reads to `audit_logs` (`20260918155445_admin_channel_messages.sql:40-47`, `20260917163229_admin_message_inspection.sql:44-56`). Cursor shapes are backed by indexes: `admin_list_user_messages` → `messages_sender_created_idx` (`20260918095418_messages_sender_created_index.sql:12`, `CONCURRENTLY`), `admin_list_channel_messages` → existing `idx_messages_channel_id_created_at_desc` (`20260819143646_scale_hot_paths.sql:5`). The cursor fix (`20260918095420`) drops the ambiguous overload and switches to `(created_at, id)` so boundary-timestamp rows are never skipped.
- **Image pipeline defense-in-depth.** Untrusted width/height are stripped at the DB write boundary (`20260914160000_clamp_image_dimension_metadata.sql:58-73`, whole pixels 1..20000) and re-clamped on read (`useSignedImageUrl.ts:96-101` `positiveDimension`). Client resize never upscales (`imageResize.ts:8-18`), and the scan-upload function re-enforces GM-only uploads against its service-role client (`scan-upload/index.ts:110-117`) and fails closed on an unconfigured scanner (`:92-97`).
- **Service-worker update reload** is genuinely robust: page-side `reloadToUpdate` posts `SKIP_WAITING`, listens for `controllerchange`/`statechange`, and has a 3s safety-net reload (`pwaUpdate.ts:60-99`), while the worker self-reloads on `activate` after a requested skip (`sw.ts:36-48`) — covering Android's dropped-`controllerchange` and Safari's missing `navigate` edge cases.
- **Marketing page gating.** `isMarketingPath` (`lib/marketing.ts`) keeps the install banner and changelog auto-open off `/features` (`App.tsx:328`, `InstallBannerGate`); screenshots are derived as WebP thumbs via `thumbSrc` (`FeaturesPage.tsx:25`), never a hand-typed thumb field.
- **Hot path untouched by #529.** The dice-roll reactions change refactors action-list construction into a `MessageAction` type and adds a `group` CSS class only (`MessageItem.tsx` diff) — no new unstable props on the `ChannelView → MessageList → MessageItem` edge, so the memoization invariant survives.
- **Pagination/prepend scroll anchoring.** `AdminChannelView.tsx:48-51` records container height before a load-older prepend and restores the viewport, matching the "never yank the user's scroll" convention.

## Intentional exclusions

Carried over from `docs/audit/20260907/INDEX.md` (verified deliberate — do not fix): free-form initiative, public-only dice, no hidden rolls, single timeline, no threads/OOC split, email notifications future, no presence indicators, soft-delete-only messages, command-only `system`/`dice_roll` types, offline = cached shell, `verify_jwt=false` push with shared secret, client-side PBKDF2, label-only mimetype, 32–36px desktop hover-row convention, sidebar-only tools, `created_at`-only INSERT catch-up cursor, unpaged reaction map, Iconify external API, admin optimistic updates without server refetch, `gm_id` transfer rules.

New this round (verified deliberate): `admin_list_channel_members` skips per-read audit logging because the roster is already exposed in bulk by `admin_list_users` (`20260919140454_admin_channel_members.sql:11-13`); per-read image audit for `admin_read_image` is deferred to a future service-role edge function (`20260917163229:31-34`); image resize uniformly re-encodes to JPEG (transparency/animation lost) as the accepted storage-cost tradeoff (`imageResize.ts:33-36`); `useChannelMedia` pages with `offset` up to a `MAX_PAGES=50` safety cap rather than a cursor (`useChannelMedia.ts:17-19`, comment names the ceiling).

## Suggested execution order

1. **P2 #1** extract `lib/clipboard.ts` — the only duplicated non-trivial logic found; immediate, low risk.
2. **P2 #2** move `Date.now()` out of `AdminView` render — one line, clears a react-compiler purity warning.
3. **P2 #3** either add a scoped `admin_get_channel` RPC or mark the over-fetch intentional with a named ceiling.
4. **P2 #4** make the react-compiler direction call (adopt vs silence) so the warning backlog becomes a regression signal instead of noise.
