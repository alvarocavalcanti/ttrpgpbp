# Phase 3 Codebase Audit — 2026-08-28

Re-audit of `alvarocavalcanti/ttrpgpbp` (React / TypeScript / Vite / Tailwind / Shadcn UI / Supabase). Verifies remediation of the Phase 2 audit (`docs/audit/20260825/phase2_audit.md`, verdict NO-GO) and re-sweeps the five audit pillars. Read-only analysis: no code changed.

Verification run this pass:

- `tsc -p tsconfig.app.json` / `tsconfig.node.json`: **passed**
- `npm run lint` (oxlint): **passed** (1 pre-existing warning: `no-empty-pattern`, `tests/e2e/core-journey.spec.ts:5`)
- `vitest run`: **947 passed / 0 failed / 0 unhandled** (Phase 2 had unhandled mock errors)
- `vitest run --coverage`: lines **94.7%**, branches **81.58%**, functions **86.4%**, statements **94.7%** (thresholds: 80/79/80/80)
- `npm run build` (`tsc -b && vite build`): **passed** (chunk >500 kB warning, see P2)
- `supabase db reset` from scratch: **passed** (all 61 migrations apply cleanly)
- pgTAP (8 suites via psql against local db): **63 assertions, 0 failures**
- Playwright E2E (local): **failing** — harness staleness, not app code (see P2 / #315)
- GitHub CI on `main`: **green** (CI + Apply Migrations)
- `.env` / `.env.local`: untracked; only anon-key + public env vars referenced in client; `env.ts` Zod-validated

## 1. Remediation Verification Matrix

Every row re-verified against code and/or pgTAP, not against the changelog.

| Remediation | Status | Rationale |
|---|---|---|
| Server-authoritative dice, atomic roll persistence | [VERIFIED STABLE] | Unchanged from Phase 2; `roll_dice` RPC + idempotency keys; direct `dice_rolls` inserts revoked; pgTAP `20260818140000_mutation_integrity.sql` 10/10. |
| Drafts and reliable sending | [VERIFIED STABLE] | Retry now reconciles the RPC-returned message id and clears pending/error (`src/features/chat/useMessages.ts:349-360`); rejected/empty responses surface a Retry error instead of staying pending (`useMessages.ts:414,468`); `removePendingMessage` exported for the Remove action. |
| Realtime recovery and unread state | [VERIFIED STABLE] | Reconnect catch-up paginates forward from the newest held row in PAGE_SIZE batches (guard 100) — >50 missed inserts recoverable (`useMessages.ts:171-211`); channel-route change clears messages/reactions/error before refetch (`useMessages.ts:102-110`, same pattern in `useChannel.ts`). |
| Active-player GM control | [VERIFIED STABLE] | `prevent_non_gm_active_player_change` trigger blocks non-GM direct writes, orphan channels included (`20260826120000_fix_rls_authorization_bypasses.sql:37-55`); `set_active_players` GM-only RPC validates membership (`20260825120000_set_active_players.sql`); pgTAP 6/6. |
| Push delivery hardening | [VERIFIED STABLE] | Whispers never parse mentions; routing is exclusively `[whisper_to]` and body omits content (`filter.ts:112-117,130-133`, `index.ts:107-109`); `resolveMentionTargets` intersects mention ids with non-blocked members (`filter.ts:191-202`); `validate_message_mentions` trigger constrains `mention_user_ids` at the data layer (`20260826151307_harden_mention_user_ids_insert.sql`). |
| Admin/GM communication | [VERIFIED STABLE] | `retry_failed_push_invocations` routes `admin_message` retries to `admin_messages` (`20260826151243_fix_push_retry_admin_messages.sql:41-47`); composite-cursor pagination + `(last_message_at, id)` and `(thread_id, created_at)` indexes (`20260827161202_admin_messages_indexes.sql`); stale-thread fetch guards (4512dd0, fdd8712). |
| Private channels, password separation, blocking | [VERIFIED STABLE] | Unchanged from Phase 2; pgTAP `20260819140000_rls_matrix.sql` 3/3. |
| NPC messages and roster validation | [VERIFIED STABLE] | Unchanged from Phase 2; portrait uploads now inherit the private-bucket fix below. |
| Image uploads and channel avatars | [VERIFIED STABLE] | `images` bucket set private; member-only SELECT policy on `{channel_id}/...` paths (`20260826160000_secure_images_bucket.sql:17-27`); `enforce_image_upload_rules` SECURITY DEFINER trigger enforces enable toggle, size cap, and `image/*` mimetype server-side on every write (`:33-83`); legacy public URLs rewritten to bare object paths (`:96-128`); pgTAP `20260826114025_secure_images_bucket.sql` 7/7. Residual: mimetype is label-only (documented in-migration; client re-encodes to JPEG). |
| AFK, safety tools, X-Card | [VERIFIED STABLE] | Unchanged from Phase 2. |
| Character/input bounds | [VERIFIED STABLE] | Dice quantity clamped min 1 in UI (`DiceRoller.tsx:70`); all rolls are server-authoritative — `roll_dice` clamps quantity/modifier to game-system bounds regardless of client input, so missing UI max on modifier is UX polish, not a security gap. Invalid push/roll/avatar data covered by tests (737d783). |
| Dark mode and mobile modal fixes | [VERIFIED STABLE] | Unchanged; component tests cover. |
| Error surfacing | [VERIFIED STABLE] | Suppressed-error hooks surfaced (fa4286c); Retry/Remove actions on failed sends; global ErrorBoundary safe (no raw stack). |
| Anonymous analytics & telemetry disclosures | [VERIFIED STABLE] | Lobby search stripped from GA `page_path`; GA initial-load leak closed (7c815f1, 06e60ab); Sentry query strings and navigation breadcrumbs scrubbed (791089e, 7824b4f); Privacy Policy now explicitly discloses GA and Sentry tracing/screen recordings (`src/features/auth/PrivacyPage.tsx:60`); `analytics.ts` disables auto `page_view` and strips search. |
| Automated stability tests | [INCOMPLETE] | Unit layer: 947 pass, unhandled mock errors eliminated, coverage above thresholds (5818cef, 23b4a5f). E2E layer: Playwright fails locally — `signUp` via `page.evaluate` returns failure while the same call against the local API succeeds (curl-verified), cascading into timeouts in `failure-paths.spec.ts` and `core-journey.spec.ts:39`; CI does not gate E2E. Known issue #315 covers the core-journey staleness. |

## 2. Remaining Blocker Checklist (P0/P1)

**P0: none. P1: none.**

All 15 Phase 2 blockers are closed and verified:

- [x] Public images bucket → private + server-side enforcement (pgTAP 7/7)
- [x] `is_suspended` self-update → trigger + pgTAP (`abuse_controls` 2/2)
- [x] Active-player self-flip → trigger + GM-only RPC
- [x] Orphan channel settings takeover → `IS DISTINCT FROM` gm check
- [x] Legacy `get_unread_count` SECURITY DEFINER → dropped
- [x] Whisper mention push leak → whisper routing exclusive, body content-free
- [x] Outsider mention push targeting → membership intersection + insert trigger
- [x] Cross-channel stale UI → state cleared on route change
- [x] Reconnect data loss → forward cursor catch-up
- [x] Pending-send inconsistency → id reconciliation + Retry/Remove
- [x] GDPR export truncation + retention → paginated (pgTAP `export_completeness` 17/17)
- [x] Clickjacking → `frame-ancestors 'self'` + `X-Frame-Options: SAMEORIGIN` in `_headers`
- [x] Runtime payload validation → `typescript/no-explicit-any: error` enforced (tests exempt); Zod schemas for realtime payloads, reactions, RPC responses, forms, env
- [x] Privacy-policy mismatch → GA/Sentry disclosed, search terms and breadcrumbs scrubbed
- [x] Admin push retry routing → `admin_messages` branch

## 3. Architecture & DX Optimization (P2)

- **E2E harness repair** — `signUp` inside `page.evaluate` fails locally despite the local auth API accepting the identical request; all failure-path and core-journey tests time out as a result. Fix the helper (or seed users via the Admin API) and consider adding a Playwright job to CI so E2E stops being local-only. Overlaps #315.
- **Bundle splitting** — `npm run build` warns about a >500 kB minified chunk. Split admin view, help markdown rendering, and NPC portrait picker behind `import()`; drop the deprecated `inlineDynamicImports` option.
- **Repo hygiene** — `types.patch` (2.2 kB) is tracked at repo root; regenerate `src/types/database.ts` instead of carrying a patch file, then delete it.
- **Coverage threshold drift** — actual branch coverage is 81.58% but the threshold is still 79 (Phase 2 flagged the same doc/config mismatch in the other direction). Bump to 81 to lock in the gains.
- **Lint warning** — `tests/e2e/core-journey.spec.ts:5` empty destructuring pattern (`no-empty-pattern`).
- **Optional: byte-level image validation** — storage trigger accepts any `image/*`-labeled bytes; client re-encode to JPEG is the current mitigation. Upgrade path documented in-migration.

## 4. Final Deployment Verdict

**GO.**

All P0/P1 blockers from the Phase 2 NO-GO are fixed and verified with code-level and pgTAP evidence. TypeScript, lint, 947 unit tests, coverage thresholds, production build, and from-scratch migration reset all pass; CI is green. Remaining P2 items (E2E harness, bundle splitting, hygiene) are non-blocking; recommend the E2E repair lands before the next feature wave so failure-path regressions stay catchable.
