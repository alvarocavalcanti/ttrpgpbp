# Implementation Plan — Audit Remediation (2026-08-12)

Sources: `audit_architecture.md` · `audit_performance_security.md` · `audit_ux_features.md`
Decisions (from user): client PBKDF2+salt; profiles visibility deferred to P1; first wave = PR A only.

## Merged & deduplicated roadmap

### P0 — Security & critical bugs

| ID | Finding | Fix surface |
|----|---------|-------------|
| P0-1 | Unsalted SHA-256 channel passwords (C1, UX#7) | `crypto.ts`, `channel_secrets.password_salt`, `get_channel_salt` RPC, 3 callers |
| P0-2 | Field tampering: profile `server_admin`, member `channel_id`/`user_id`, message `channel_id`/`type`/`sender_id`/`whisper_to` (UX#1, #5) | Immutability triggers (new migration) |
| P0-3 | `profiles` readable by all → email enumeration (H1) | **Deferred to P1** (user) |
| P0-4 | Blocking hides but doesn't revoke access; no unblock (UX#2) | `is_channel_member()` + MemberList |
| P0-5 | Push edge fn: `verify_jwt=false`, `CORS *`, `err.message` leak, client payload → service-role, body content leak (H2–H4, UX#3, M5) | `config.toml`, `push-notifications/index.ts`, `useMessages.ts` |
| P0-6 | AuthContext: async in `onAuthStateChange` (deadlock), unmemoized value, double fetch (C2, arch#1, UX#16) | `AuthContext.tsx` |
| P0-7 | Join preview leaks `invite_code` + GM-only URL to non-members (UX#4) | Join-preview RPC, `JoinChannel.tsx` |
| P0-8 | Channel creation non-atomic → orphan channels (UX#6) | `create_channel` RPC, `CreateChannelModal.tsx` |

### P1 — High-value UX & architecture

- `channel_members` realtime gap: INSERT/DELETE invisible, kicked user stays (arch#2, UX#8)
- Message-list perf: `React.memo` + `useCallback` handlers + hoist renderers/urlTransform + drop `structuredClone` + date cache (arch#3, H5/H7/H8/H9/M8/M12)
- Virtualization / pagination (C3/C5/H6, UX P1#1)
- `useChannels` N+1 unread → aggregated RPC (C4, UX#5)
- `useSearch` AbortController (M7); `setSearchParams` debounce (M10); `useSafetyCardEvents` GM gate (H10); single realtime channel (M9)
- Error/empty/retry/archived/offline states + ErrorBoundary (UX#9–12, #16, M2); deleted-message privacy in search/export (UX#14); mutation failure surfacing (UX#15); profiles visibility + public-profiles view (P0-3/H1)
- Modal keyboard/touch a11y (UX#18–20); dice check failure path (UX#13)

### P2 — Code quality & refactor

- `strict: true` (M1), `any` at boundaries (M3), `gen:types` + CI drift check (arch#5), hook-only data access (arch#4), MessageItem/MessageComposer/MemberList refactors (arch#8, L4), typed mock factory (arch#7), native dialogs + magic strings + dead code (arch#11, L6)

## PR sequence

1. **PR A** — password hashing + RLS invariants (P0-1, P0-2) ← IN PROGRESS
2. **PR B** — access control (P0-3/4/7)
3. **PR C** — push edge hardening (P0-5)
4. **PR D** — AuthContext (P0-6)
5. **PR E** — channel creation atomicity (P0-8)
6. **P1 wave** — realtime members, message memoization, unread RPC, then rest

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

## Progress tracker

| PR | Status | Worktree/branch | PR link | CI |
|----|--------|-----------------|---------|----|
| A | pending | | | |
| B | pending | | | |
| C | pending | | | |
| D | pending | | | |
| E | pending | | | |
| P1 wave | pending | | | |
