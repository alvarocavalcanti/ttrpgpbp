# Implementation Plan — Audit Remediation (2026-08-12)

Sources: `audit_architecture.md` · `audit_performance_security.md` · `audit_ux_features.md`
Decisions (from user): client PBKDF2+salt; profiles visibility deferred to P1; first wave = PR A only.

## Merged & deduplicated roadmap

### P0 — Security & critical bugs

| ID | Finding | Fix surface |
|----|---------|-------------|
| P0-1 | Unsalted SHA-256 channel passwords (C1, UX#7) | **DONE (PR #138)**: `crypto.ts`, `channel_secrets.password_salt`, `get_channel_salt` RPC, 3 callers |
| P0-2 | Field tampering: profile `server_admin`, member `channel_id`/`user_id`, message `channel_id`/`type`/`sender_id`/`whisper_to` (UX#1, #5) | **DONE (PR #138)**: immutability triggers |
| P0-3 | `profiles` readable by all → email enumeration (H1) | **Deferred to P1** (user) |
| P0-4 | Blocking hides but doesn't revoke access; no unblock (UX#2) | **DONE (PR B)**: `is_channel_member()` excludes blocked; self-unblock trigger; Unblock UI; blocked-user state |
| P0-5 | Push edge fn: `verify_jwt=false`, `CORS *`, `err.message` leak, client payload → service-role, body content leak (H2–H4, UX#3, M5) | **DONE (PR #140)**: `verify_jwt=true`, CORS allowlist, generic errors, server-derived events (message_id/member_id), sender/membership/GM checks, truncated/no-content bodies |
| P0-6 | AuthContext: async in `onAuthStateChange` (deadlock), unmemoized value, double fetch (C2, arch#1, UX#16) | **DONE (PR #141)**: deferred profile fetch, `lastFetchedUserId` guard, memoized value/callbacks, sign-in error surface, downstream deps `user?.id` |
| P0-7 | Join preview leaks `invite_code` + GM-only URL to non-members (UX#4) | **DONE (PR B)**: `get_join_channel_preview` RPC; join policy dropped; `gm_only_resources_url` moved to `channel_secrets` |
| P0-8 | Channel creation non-atomic → orphan channels (UX#6) | `create_channel` RPC, `CreateChannelModal.tsx` |

### P1 — High-value UX & architecture

- `channel_members` realtime gap: INSERT/DELETE invisible, kicked user stays (arch#2, UX#8) ✅ (PR #143)
- Message-list perf: `React.memo` + `useCallback` handlers + hoist renderers/urlTransform + drop `structuredClone` + date cache (arch#3, H5/H7/H8/H9/M8/M12)
- Virtualization / pagination (C3/C5/H6, UX P1#1)
- `useChannels` N+1 unread → aggregated RPC (C4, UX#5)
- `useSearch` AbortController (M7); `setSearchParams` debounce (M10); `useSafetyCardEvents` GM gate (H10); single realtime channel (M9)
- Error/empty/retry/archived/offline states + ErrorBoundary (UX#9–12, #16, M2); deleted-message privacy in search/export (UX#14); mutation failure surfacing (UX#15); profiles visibility + public-profiles view (P0-3/H1)
- Modal keyboard/touch a11y (UX#18–20); dice check failure path (UX#13)

### P2 — Code quality & refactor

- `strict: true` (M1), `any` at boundaries (M3), `gen:types` + CI drift check (arch#5), hook-only data access (arch#4), MessageItem/MessageComposer/MemberList refactors (arch#8, L4), typed mock factory (arch#7), native dialogs + magic strings + dead code (arch#11, L6)

## PR sequence

1. **PR A** — password hashing + RLS invariants (P0-1, P0-2) ✅ **MERGED (#138)**
2. **PR B** — access control (P0-4, P0-7) ✅ **MERGED (#139)** (P0-3 stays in P1 per user decision)
3. **PR C** — push edge hardening (P0-5) ✅ **MERGED (#140)**
4. **PR D** — AuthContext (P0-6) ✅ **MERGED (#141)**
5. **PR E** — channel creation atomicity (P0-8) ← IN PROGRESS
6. **P1 wave** — realtime members, message memoization, unread RPC, profiles visibility, then rest

## PR B — detailed spec

### B1. Migration `20260812130000_blocking_revokes_access_and_join_preview.sql`

- `is_channel_member()` redefined to require `is_blocked = false` → blocked members lose channel/messages/reactions/dice/safety-tools access via RLS.
- `prevent_member_self_block_toggle` trigger: players can't change their own `is_blocked` (GM-only via `is_channel_gm`).
- Drop "Channels are viewable for joining" policy; add `get_join_channel_preview` SECURITY DEFINER RPC returning only `id/name/game_system/has_password`.
- Move `gm_only_resources_url` from `channels` to `channel_secrets` (GM-only RLS).

### B2. Client

- `JoinChannel.tsx`: fetch via `get_join_channel_preview` RPC (no more `channels.select('*')`).
- `useChannel.ts`: expose `gmOnlyResourcesUrl` from `channel_secrets`.
- `ChannelView.tsx`: "Access Removed" state for blocked users; sidebar GM Resources via hook; pass `gmOnlyResourcesUrl` to settings.
- `ChannelSettings.tsx`: GM-only URL read/write via `channel_secrets`.
- `MemberList.tsx`: Unblock action with system message.

### B3. Tests

- JoinChannel, MemberList (unblock), ChannelView (blocked state + GM URL), useChannel (GM URL), ChannelSettings (GM URL via secrets).

## PR A — detailed spec (current)

### A1. Migration `supabase/migrations/<ts>_secure_password_hashing_and_immutability.sql`

- `ALTER TABLE channel_secrets ADD COLUMN password_salt TEXT;`
- `get_channel_salt(p_channel_id UUID) RETURNS TEXT` SECURITY DEFINER, `SET search_path=public`;
  `SELECT password_salt FROM channel_secrets WHERE channel_id = p_channel_id`; `GRANT EXECUTE TO authenticated`.
- Immutability triggers (each raises when `auth.uid() IS NOT NULL` so Supabase dashboard/service_role can still change rows):
  - `profiles`: block `server_admin` change.
  - `channel_members`: block `channel_id` / `user_id` change.
  - `messages`: block `channel_id` / `sender_id` / `type` / `whisper_to` change on UPDATE.

### A2. `src/lib/crypto.ts`

- `hashPassword(password): Promise<{ hash: string; salt: string }>` — PBKDF2-SHA256, 210000 iters, 16-byte random salt, 256-bit output; hex strings.
- `hashPasswordWithSalt(password, saltHex): Promise<string>` — same params, fixed salt (join re-derive).
- `hashPasswordLegacy(password): Promise<string>` — existing SHA-256 (backward compat for pre-existing salt-less channels).

### A3. Callers

- `CreateChannelModal.tsx`: store `{ password_hash: pw.hash, password_salt: pw.salt }`; pass `pw.hash` to `join_channel`.
- `ChannelSettings.tsx`: change-password path stores hash+salt (null both when clearing).
- `JoinChannel.tsx`: on password submit, `get_channel_salt` RPC → `hashPasswordWithSalt` if salt present else `hashPasswordLegacy`.

### A4. Tests (colocated, matching existing mock style)

- `crypto.test.ts`: hash/salt format, deterministic re-derive, salt uniqueness, legacy fallback.
- `CreateChannelModal.test.tsx`: update `hashPassword` mock to `{hash,salt}`, assert secret insert payload.
- `ChannelSettings.test.tsx`: assert salt written on change-password.
- `JoinChannel.test.tsx`: mock `get_channel_salt` + `hashPasswordWithSalt`, assert re-derive; legacy (salt null) path.

### Verification

- `npm run lint`, `npm run build` (type check), `npm run test:coverage`, `npm run spellcheck`, `npm run lint:md`.
- CI `migrate-check` runs `supabase db reset` — validates migration SQL.
- DB behavior (trigger/RPC) can't run locally (Docker Desktop bug) → rely on CI + targeted review.

## PR C — detailed spec

### C1. Edge function `supabase/functions/push-notifications/index.ts`

- `verify_jwt = true` in `config.toml`; resolve caller via user-scoped client `auth.getUser()`.
- CORS allowlist: `ALLOWED_ORIGINS` env (default localhost:5173, ttrpgpbp.pages.dev, `*.ttrpgpbp.pages.dev` previews).
- Server-derived events: client sends `message_id`/`member_id`; channel/sender/content/whisper come from the DB.
- Authorization: message caller must be the sender + `is_channel_member`; turn caller must be `is_channel_gm`.
- Generic 500 (no `err.message` leak); 400/401/403/404 for non-sensitive cases.

### C2. `filter.ts` (M5)

- Bodies truncated to 100 chars; whisper pushes carry no message content.

### C3. Client `useMessages.ts`

- Inserts return the new message id (`.select('id').single()`) and invoke push with `message_id`; turn events pass `member_id`.

### C4. Tests / docs

- `filter.test.ts` truncation + whisper-body cases; `useMessages.test.tsx` updated for id-based invoke; `DEPLOYMENT.md` documents `ALLOWED_ORIGINS` + JWT requirement.

## PR D — detailed spec

### D1. `AuthContext.tsx` (P0-6, arch#1, M14, UX#16)

- Profile fetch deferred out of `onAuthStateChange` via `setTimeout(0)` — supabase-js holds an internal auth lock while the callback runs; awaiting a query deadlocks.
- Refetch guard via `lastFetchedUserId` ref: profile fetched only when the user id actually changes (stops `TOKEN_REFRESHED` storms); reset on sign-out so re-login retries.
- `value` wrapped in `useMemo`; `signInWithGoogle`/`signOut` wrapped in `useCallback`.
- `signInWithGoogle` wrapped in try/catch (M14) — popup-blocked/network errors surface via `error` state.
- Profile fetch failure preserves any previously-loaded profile (UX#16) instead of nulling it.

### D2. Downstream deps `user` → `user?.id`

`useChannel.ts`, `useChannels.ts`, `usePushNotifications.ts`, `useChannelNotificationPrefs.ts` — token refresh no longer tears down realtime subscriptions / refires full fetches.

### D3. Tests

- `AuthContext.test.tsx`: TOKEN_REFRESHED no second fetch, re-login retry recovery, sign-in error surface (rejection + returned error), OAuth mock resolves shape.
- Existing hook tests updated where they asserted refetch-on-user-identity.

## PR E — detailed spec

### E1. Migration `20260812150000_atomic_create_channel.sql`

`create_channel(p_name, p_game_system, p_invite_code, p_character_name, p_character_avatar_url, p_character_sheet_url, p_password_hash, p_password_salt)` SECURITY DEFINER `RETURNS UUID`. One transaction: auth check → channel-cap guard (mirrors `join_channel`) → insert `channels` → insert `channel_secrets` (if password) → insert GM `channel_members` → return id. Any failure rolls back the whole channel. `REVOKE PUBLIC` + `GRANT authenticated`.

### E2. Client

- `CreateChannelModal.tsx`: drop the 3-step insert (channel → secrets → `join_channel`); single `create_channel` RPC call. Cap pre-check kept for the friendly error message; RPC is the atomic safety net.
- `types/database.ts`: add `create_channel` RPC signature.

### E3. Tests

- `CreateChannelModal.test.tsx`: payload with password (hash+salt), without password (nulls), RPC error → generic message + no close, RPC null id → generic message, cap pre-check blocks without calling RPC.

## Progress tracker

| PR | Status | Worktree/branch | PR link | CI |
|----|--------|-----------------|---------|----|
| A | merged | `fix/secure-passwords-rls-invariants` | #138 | ✅ |
| B | merged | `fix/blocking-access-control` | #139 | ✅ |
| C | merged | `fix/push-notifications-hardening` | #140 | ✅ |
| D | merged | `fix/auth-context-refactor` | #141 | ✅ |
| E | merged | `fix/create-channel-atomicity` | #142 | ✅ |
| F (P1) | in progress | `fix/member-realtime` | | |
| P1 wave | pending | | | |
