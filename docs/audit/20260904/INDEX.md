# Full Audit — 2026-09-04 · INDEX

Four parallel specialized audits (pillars 1–4) + orchestrator dedupe. Prompts embedded in each report. Read-only audits; no code changed. Supersedes the single mega-audit approach — see `docs/audit/20260812/` for why pillars beat one merged pass.

**Reports:**

| Pillar | Report | Findings (raw) |
|---|---|---|
| 1. Security & data integrity | [audit_security.md](audit_security.md) | 0 P0 · 2 P1 · 7 P2 |
| 2. Architecture, performance & code quality | [audit_architecture.md](audit_architecture.md) | 1 P0 · 3 P1 · 8 P2 |
| 3. PbP game & realtime UX | [audit_pbp_realtime.md](audit_pbp_realtime.md) | 0 P0 · 2 P1 · 4 P2 |
| 4. Product/mobile UX & a11y | [audit_ux_a11y.md](audit_ux_a11y.md) | 0 P0 · 1 P1 · 9 P2 |

**Deduped totals: 1 P0 · 7 P1 · 27 P2 = 35 findings** (2 cross-pillar merges, 1 severity resolution).

## Verification suite (orchestrator, post-audits)

- `tsc -p tsconfig.app.json --noEmit`: **passed**
- `npm run lint` (oxlint): **passed, clean**
- `vitest run`: **1146 passed / 0 failed**
- `npm run build`: **passed** (known >500 kB chunk warning, pre-existing)
- `supabase db reset`: not run (no migration changes in this PR; static-only audits)

## Prior-audit state (verified by all four pillars)

Every P0/P1 from phase 2–4 audits and the 2026-08-31 UX audit is **closed in code and verified this pass** — including all three phase4 P1 launch blockers (`20260831140000_issue_335_authz_hardening.sql` + pgTAP), the three sync P1s (UPDATE/DELETE catch-up, `last_read_at` advance, SW offline fallback), the X-Card GM-only RLS fix, and all ten 2026-08-31 UX P0/P1 items (focus traps, dice BottomSheet, CheckSheet, first-run lobby, skeletons, auto-load). Disposition tables: `audit_ux_a11y.md` §Prior audit disposition; each report's `What's sound — do not touch`.

## Deduped findings

### P0 (1)

| # | Finding | Evidence | Source |
|---|---|---|---|
| P0-1 | **Whisper content leaks to all channel members via `channels.last_message_preview`** — lobby-preview trigger (shipped 2026-09-04) copies first 120 chars of *every* message incl. whispers onto the member-readable `channels` row (REST + realtime); messages-RLS whisper restriction bypassed; backfill exposed historical whispers. Live on remote. Fix: CASE-null the preview on `whisper_to`, backfill scrub, types regen, pgTAP. | `supabase/migrations/20260904111055_channel_last_message_preview.sql:26` · `20260801101940:65-74` · `Lobby.tsx:203` | arch#P0.1 + sec#P1.1 (merged; severity P0 per arch) |

### P1 (7)

| # | Finding | Evidence | Source |
|---|---|---|---|
| P1-1 | `push_notification_config_value` leaks `PUSH_INTERNAL_SECRET` to anon/authenticated (REVOKE FROM PUBLIC only; issue_335 pattern missed this one). One-line revoke + pgTAP. | `20260814120000:37-46` · `config.toml:13-18` | sec#P1.2 |
| P1-2 | X-Card flags invisible to an away GM — live-only subscription, no catch-up query, dismissal client-local. Async safety tool silently fails. | `useSafetyCardEvents.ts:13-36` | pbp#P1.1 [NEW] |
| P1-3 | Read-mark advances before history confirmed loaded — failed first fetch destroys the "New messages" boundary; messages error banner lacks Retry. | `useChannel.ts:117-124` · `MessageList.tsx:197-207` | pbp#P1.2 [OPEN chat-ux#1.6] |
| P1-4 | Chat hot-path memoization defeated — unstable `onRetry`/`onRollDice` (`messages` dep) + inline `onEditCharacter`; every message event re-renders the whole list and re-parses markdown. | `useMessages.ts:586,668,518` · `ChannelView.tsx:314` | arch#P1.1 [NEW] |
| P1-5 | Admin-messages mutations in components — swallowed delete errors (failed delete looks successful), non-atomic thread+message create, `alert()`, unvalidated `as Thread` cast. | `ThreadList.tsx:118-162` · `ThreadDetail.tsx:54-77` | arch#P1.2 [OPEN arch#4] |
| P1-6 | Reconnect/visibility reconcile query lacks `(channel_id, updated_at, id)` index — O(channel history) scan per app-switch, runs on every reconnect + visibilitychange. | `useMessages.ts:243-252,377-385` | arch#P1.3 [NEW] |
| P1-7 | Native `prompt`/`alert` remnants — AFK away message (`MemberList.tsx:96`), admin suspend reason (`AdminView.tsx:212`), failure alerts in `ProfileSettings.tsx:82` + `ThreadList.tsx:136,149`. Over-limit length checked after prompt, not at input. | `MemberList.tsx:96` · `AdminView.tsx:212` | ux#P1.1 + arch#P2.4 (merged) [OPEN ux#P0.2] |

### P2 (27)

**Security** (audit_security.md §P2):

1. Class fix: every `REVOKE…FROM PUBLIC` leaves anon/authenticated EXECUTE — grant sweep migration + `has_function_privilege` pgTAP sweep (folds in `retry_failed_push_invocations`, `get_join_channel_preview`, `get_channel_salt`).
2. Member-authored `character_sheet_url`/`character_avatar_url` skip scheme validation channels have (React 19 mitigates; defense-in-depth).
3. Sentry session replays capture chat DOM text incl. whispers — `maskAllText: true` (policy-disclosed).
4. GDPR export omits reporter's own `abuse_reports` + authored `admin_messages` (needs read-back policy).
5. `set_channel_last_message_at` definer without pinned `search_path` (one line).
6. Announcement pushes target suspended GMs (inconsistent with `is_active_gm`).
7. CSP lacks `base-uri`/`form-action`/`object-src`; `script-src` `unsafe-inline` (nonce-ify = optional later).

**Architecture** (audit_architecture.md §P2):
8. "Queries live in hooks" rule unenforced — 8 component-level query sites remain; add oxlint restriction after migration.
9. `IconPicker` fires Iconify request per keystroke — reuse existing `useDebounce`.
10. Dead code: `useChannelNpcs.addNpc` export + unused `src/test/mocks/supabase.ts`.
11. Profile save doesn't refresh AuthContext profile (export `refreshProfile`).
12. `usePushNotifications` misplaced in `features/auth/` — move to `features/notifications/`.
13. Lobby refetches fully on every realtime status flap (no debounce — route through `scheduleUnreadRefresh`).
14. E2E harness still broken (signUp via `page.evaluate`) and not CI-gated — Admin-API seeding + Playwright job.

**PbP realtime** (audit_pbp_realtime.md §P2):
15. Composer resubmit after errored send mints fresh `client_request_id` — late first attempt double-posts (reuse errored bubble's key).
16. No DB `CHECK (char_length(content) <= 4000)` on `messages` — direct PostgREST INSERT bypasses the RPC cap (paste-flood DoS vector).
17. Composer "Active Player" menu single-select silently overwrites ensemble turn — drop the chip (modal is authority) or make multi-select.
18. Draft-restore race clobbers destination channel's draft on quick switch (guard the save effect).

**UX & a11y** (audit_ux_a11y.md §P2):
19. Sub-44px targets persist on secondary controls (reaction chips ≈24px, emoji grid 32px, kebab 32px, steppers 32px, X-Card dismiss 24px, status-bar chevron 24px).
20. Dark-mode metadata `dark:text-gray-500` fails AA (~3:1) in 6 sites (lobby timestamp, "(edited)", menu hints, mention secondary).
21. Chat stream has no `role="log"`/`aria-live` — new realtime messages silent to screen readers.
22. Two nav drawers lack focus containment; channel drawer backdrop is a focusable `role="button"` (reuse `useFocusTrap` + aria-hidden backdrop).
23. Admin `SortHeader` `<th onClick>` not keyboard operable (needs in-th button).
24. Reduced-motion gates missing — channel drawer slide + 2 `scrollIntoView({behavior:'smooth'})` sites.
25. Error states without in-place Retry on Lobby + SearchModal (messages-error Retry covered by P1-3).
26. Tailwind tokens defined but unadopted; 400–640-char className blobs; two separately-maintained drawer copies (extract style constants / shared Drawer).
27. SearchModal input unlabeled; Escape dead in mention listbox + EmojiPicker popup.

## Cross-pillar dedupe map

| Deduped finding | Appeared in |
|---|---|
| P0-1 whisper preview leak | arch#P0.1 (P0) + sec#P1.1 (P1) → merged, P0 |
| P1-7 native prompt/alert | ux#P1.1 (P1) + arch#P2.4 (P2) → merged, P1 |
| P1-3 messages-error Retry | pbp#P1.2 (P1, owns fix) + ux#P2.7 (P2, partial → trimmed to Lobby/SearchModal) |
| Composer double-send | pbp#P2.1 only — ux report's `[FIXED]` refers to the bubble-Retry path (`useMessages.ts:627-665`); the composer-resubmit path (`useMessages.ts:467`) remains open (both correct, different paths) |

## Intentional exclusions (verified deliberate — do not fix)

Carried + newly documented in each report: free-form initiative, public-only dice, no hidden rolls, single timeline, no threads/OOC split, email notifications future, no presence indicators, soft-delete-only messages, command-only `system`/`dice_roll` types, offline = cached shell, `verify_jwt=false` push with shared secret, client-side PBKDF2, label-only mimetype (documented ceiling), 32–36px desktop hover-row convention (`MESSAGE_ACTION_SIZING`), sidebar-only tools (issue #382), created_at cursor catches, unpaged reaction map, Iconify external API, admin optimistic updates, gm_id transfer rules.

## Suggested execution order (merged across pillars)

1. **P0-1** whisper preview leak — one migration, ships immediately (live on remote).
2. **P1-1** push-secret revoke — one line + pgTAP; rides with #1.
3. **P1-6** `(channel_id, updated_at, id)` index — XS migration, same PR wave.
4. **P1-2** X-Card catch-up + persisted dismissal — the safety tool must survive the GM being away.
5. **P1-3** gate `markRead` on successful load + messages Retry.
6. **P1-4** stabilize chat hot-path callbacks + memo render-count test.
7. **P1-5** admin-messages mutations into hooks, errors surfaced.
8. **P1-7** prompt/alert → styled BottomSheet + toast.
9. **P2 quick batch** (each XS): #5, #16, #9, #10, #13, #20, #27, CSP #7 drop-ins, Sentry mask #3.
10. **P2 medium batch**: #15, #17, #18, #19, #21, #22, #23, #24, #25, #6, #4, #2, #1 grant sweep, #11, #12.
11. **P2 scheduled**: #26 token adoption (rides next feature touch), #8 query-site migration + oxlint lock, #14 E2E repair + CI job before next feature wave.

## GitHub issues

| Parent | Findings |
|---|---|
| [#402 Security & data integrity](https://github.com/alvarocavalcanti/ttrpgpbp/issues/402) | P0 #406 (whisper leak) · P1 #407 (push secret) · P2 checklist |
| [#403 Architecture, performance & code quality](https://github.com/alvarocavalcanti/ttrpgpbp/issues/403) | P1 #408 (memoization) · #409 (admin hooks) · #410 (index) · P2 checklist |
| [#404 PbP game & realtime UX](https://github.com/alvarocavalcanti/ttrpgpbp/issues/404) | P1 #411 (X-Card catch-up) · #412 (read-mark) · P2 checklist |
| [#405 Product/mobile UX & a11y](https://github.com/alvarocavalcanti/ttrpgpbp/issues/405) | P1 #413 (prompt/alert remnants) · P2 checklist |

P2s tracked as checklists in parent bodies (27 items). Cross-pillar dedupe applied before issue creation: whisper leak (arch P0 + sec P1) → one issue #406; prompt/alert (ux P1 + arch P2) → one issue #413.
