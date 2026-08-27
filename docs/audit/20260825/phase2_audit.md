# Phase 2 Codebase Audit — 2026-08-25

Audit of `alvarocavalcanti/ttrpgpbp` (React / TypeScript / Vite / Tailwind / Shadcn UI / Supabase). Read-only pass: no code changed.

## 1. Remediation Verification Matrix

| Remediation | Status | Rationale |
|---|---|---|
| Server-authoritative dice, atomic roll persistence | [VERIFIED STABLE] | `roll_dice` validates notation, bounds, modifier, DC, and idempotency; direct `dice_rolls` inserts revoked. |
| Drafts and reliable sending | [INCOMPLETE] | Failed RPCs leave optimistic messages pending without durable reconciliation; retry ignores successful RPC response (`src/features/chat/useMessages.ts:315-332,423-459`). |
| Realtime recovery and unread state | [INCOMPLETE] | Reconnect fetches only newest 50 rows; missed middle pages are lost (`useMessages.ts:223-239`). |
| Active-player GM control | [INCOMPLETE] | RPC is GM-only, but self-update RLS still lets players modify `is_active_player` directly (`20240801000000_init_schema.sql:105-113`). |
| Push delivery hardening | [REGRESSION RISK] | Whisper mentions can push private content to unintended users; failed admin-message retries query `messages` instead of `admin_messages`. |
| Admin/GM communication | [REGRESSION RISK] | Parent thread RLS is sound, but push retry routing is broken (`20260816000000_push_delivery_logs.sql:80-93`). |
| Private channels, password separation, blocking | [VERIFIED STABLE] | Open membership insert policy removed; join preview exposes limited fields; blocked users are excluded from channel access. |
| NPC messages and roster validation | [VERIFIED STABLE] | GM-only RPC/RLS and server-side roster snapshot validation are present. NPC uploaded portraits inherit image-storage risks. |
| Image uploads and channel avatars | [REGRESSION RISK] | `images` bucket is public; enable/size settings are enforced only in client hook (`20260814194631_add_channel_avatar.sql:14-27`, `useImageUpload.ts:25-48`). |
| AFK, safety tools, X-Card | [VERIFIED STABLE] | RLS limits safety visibility to members/GM and X-Card rows omit identity. Cross-channel `message_id` validation remains absent. |
| Character/input bounds | [INCOMPLETE] | DB limits exist, but dice quantity only enforces minimum, modifier has no UI bounds, and check prompts use lossy `parseInt` (`DiceRoller.tsx:62-95`, `MessageItem.tsx:177-185`). |
| Dark mode and mobile modal fixes | [VERIFIED STABLE] | Implemented and covered by component tests. |
| Error surfacing | [INCOMPLETE] | Global boundary is safe, but NPC/admin hooks suppress errors and message failures offer no Retry action. |
| Anonymous analytics | [REGRESSION RISK] | Lobby search query is sent to GA as `page_path` (`App.tsx:43-52`, `analytics.ts:43-47`). This contradicts changelog privacy claims. |
| Automated stability tests | [INCOMPLETE] | 834 tests pass, but tests emit unhandled mocked Supabase failures; E2E covers one happy path only. |

## 2. Remaining Blocker Checklist (P0/P1)

P0: none observed.

- [ ] **P1: Private media exposure.** Public `images` bucket makes private channel images retrievable without authorization. Storage enablement and size limits are client-only.
- [ ] **P1: Suspension bypass.** Any user can update their own `profiles.is_suspended` through the existing self-update policy. The immutability trigger protects only `server_admin` (`init_schema.sql:20-21`, `20260812120000_secure_passwords_and_field_immutability.sql:41-53`).
- [ ] **P1: Active-player authorization bypass.** Players can directly set their own `channel_members.is_active_player`; only the new RPC is protected.
- [ ] **P1: Orphan channel takeover/settings mutation.** `update_channel_settings` checks `v_channel.gm_id <> v_uid`; for `NULL` orphan GM IDs, this evaluates false and permits any authenticated caller to modify settings (`20260817144039_backend_command_send_message.sql:322-350`).
- [ ] **P1: Whisper privacy leak.** Mention parsing runs for whispers and push bodies include full content for mention recipients (`send_message.sql:177-178`, `push-notifications/index.ts:104-125`).
- [ ] **P1: Outsider push targeting.** `resolveMentionTargets` does not intersect explicit mention IDs with channel members; direct regular-message inserts can fabricate mention links (`filter.ts:181-190`, `20260817144037_backend_command_schema.sql:44-67`).
- [ ] **P1: Cross-channel stale UI.** `useMessages` and `useChannel` retain prior channel state during route changes, potentially rendering another channel’s messages/members (`useMessages.ts:96-125`, `useChannel.ts:29-70`).
- [ ] **P1: Reconnect data loss.** Catch-up refetches only latest 50 messages; more than 50 missed inserts cannot be recovered.
- [ ] **P1: Pending-send inconsistency.** Rejected or empty RPC responses leave optimistic messages permanently pending; retry does not reconcile returned message IDs.
- [ ] **P1: Unrestricted unread RPC.** Legacy `get_unread_count` is `SECURITY DEFINER`, has no membership check, and has no `REVOKE`; callers can count messages in arbitrary private channels (`20260801195300_add_unread_count_rpc.sql:2-15`).
- [x] **P1: GDPR/export truncation.** Fixed: exports paginate past the 1,000-row cap via offset `range()` (`fetchAllRows`, `ChannelSettings.tsx`, `exportUserData.ts`).
- [x] **P1: Retention incompleteness.** Fixed: cleanup walks every channel directory / file via paginated storage listing (`listAllObjects`, `cleanup-images`).
- [ ] **P1: Clickjacking protection missing.** `_headers` lacks `frame-ancestors` and `X-Frame-Options`.
- [ ] **P1: Runtime payload validation absent.** Realtime/database payloads use raw casts and `any`; only environment variables use Zod (`useMessages.ts:28,168,195,216`, `MessageItem.tsx:22,137,220`, `push-notifications/index.ts:267,307,371`).
- [ ] **P1: Privacy-policy mismatch.** GA, Sentry tracing, and replay are active but policy claims data is shared only with Supabase (`main.tsx:11-20`, `PrivacyPage.tsx:43-47`).

## 3. Architecture & DX Optimization (P2)

- Add `(last_message_at DESC)` and `(thread_id, created_at)` indexes for admin messaging; paginate admin threads/messages.
- Replace timestamp-only message pagination with `(created_at, id)` cursor.
- Paginate exports and cleanup storage listings.
- Add pgTAP coverage for suspension self-update, active-player direct writes, orphan settings, media access, mention routing, admin RLS, and export completeness.
- Replace `any` with generated Supabase row types and narrow payload schemas; enable `no-explicit-any`.
- Add Zod schemas for Realtime, push-service-worker, RPC responses, and form payloads.
- Fix service-worker substring URL matching; compare exact `/channel/:id` segments.
- Repair MSW handlers causing unhandled `app_settings`, NPC, roll-history, and push requests.
- Align docs: README still says public lobby; dice help says deleted rolls remain; deployment docs say Node 20 while CI pins Node 26.
- Coverage config excludes `src/main.tsx` and all Supabase code; branch threshold is 79 despite documentation claiming 80%.

Verification:

- TypeScript app/node checks: passed.
- `npm run lint`: passed with one empty-destructuring warning.
- Vitest: 87 files, 834 tests passed, with unhandled mock errors.
- Production Vite build and coverage: not run because they write artifacts.
- Supabase migration/pgTAP execution: unavailable locally; Supabase/Docker service not running.
- Playwright E2E: skipped locally because Supabase was unavailable.

## 4. Final Deployment Verdict

**NO-GO.**

P1 confidentiality, authorization, synchronization, export, and production-header issues remain. Fix blockers, run `npm run build`, coverage, Supabase reset/pgTAP, and failure-path E2E before launch.

---

## Appendix — Audit prompt

### Context & Objective

You are acting as a Principal Software Engineer and Security Auditor conducting a Phase 2 Codebase Audit for `alvarocavalcanti/ttrpgpbp` (a mobile-first Play-by-Post TTRPG web application built on React, TypeScript, Vite, Tailwind CSS, Shadcn UI, and Supabase).

Prior remediation work has been completed based on an initial security and architecture review.

---

### Audit Instructions & Context Verification

1. **Context Baseline:**
   - Review `docs/CHANGELOG.md` to establish what fixes, refactors, and updates have been applied recently.
   - Review `docs/FEATURES.md` to confirm the current active feature scope, functional requirements, and expected system behaviors.

2. **Verification & Regression Focus:**
   - Verify whether the implemented mitigations in `docs/CHANGELOG.md` fully resolve the underlying vulnerabilities/bottlenecks without introducing partial implementations, code smells, or regressions.
   - Cross-reference active code in `/src` and `/supabase` against the specification in `docs/FEATURES.md`.

---

### Targeted Audit Pillars

Evaluate the codebase strictly across the following five critical vectors:

#### 1. Data Security & RLS Policy Enforcement

- Inspect Supabase RLS policies across all tables. Ensure recently added features/tables strictly adhere to access boundaries (e.g., player vs. Game Master capabilities, character sheet visibility, edit rights on posts).
- Audit for indirect leaks via Supabase Realtime broadcasts or public functions. Ensure payload data in WebSocket feeds does not bypass table RLS rules.

#### 2. Realtime State Synchronization & Offline Edge Cases

- Test state handling for asynchronous play-by-post interactions: out-of-order post insertion, dice roll verification, and reconnection recovery.
- Verify PWA/Service Worker behavior against recent feature updates: Does cached local state conflict with newly reconciled server state upon coming back online?

#### 3. TypeScript Invariants & Runtime Resilience

- Ensure zero usage of loose typing (`any`, uncontrolled type assertions) in newly added feature code.
- Verify that runtime payload schema validation (e.g., Zod or equivalent) protects all incoming network payloads (Supabase responses, dice engine inputs, form submissions).
- Ensure Error Boundaries cleanly wrap newly introduced UI routes or complex dynamic components without leaking raw stack traces.

#### 4. Database Performance & Mutation Patterns

- Audit database queries for N+1 query patterns, unindexed foreign key filters, or unbounded record fetches on campaign threads and message logs.
- Verify optimistic UI updates: Ensure failed mutations cleanly rollback without leaving UI state out-of-sync with PostgreSQL.

#### 5. Production Readiness & Build Integrity

- Confirm production build checks (`tsc --noEmit`, linters, bundling scripts) pass cleanly.
- Verify zero exposure of confidential keys or unvalidated runtime environment variables.

---

### Required Output Structure

Provide a concise, highly technical audit output in the following format:

1. **Remediation Verification Matrix:** A table listing recent fixes from `docs/CHANGELOG.md`, marking each as `[VERIFIED STABLE]`, `[INCOMPLETE]`, or `[REGRESSION RISK]` with brief rationale.
2. **Remaining Blocker Checklist (P0/P1):** Any lingering or newly introduced security holes, state sync breaks, or missing RLS rules.
3. **Architecture & DX Optimization (P2):** Micro-optimizations for bundle size, query performance, or test coverage.
4. **Final Deployment Verdict:** Clear Go/No-Go recommendation for production launch.
