# Full Audit — 2026-09-20 · INDEX

Five parallel specialized audits (pillars 1–5). Pillars 1–4 follow the same structure as [2026-09-07](../20260907/INDEX.md); **pillar 5 is new this round** — a legal-terms & trust-safety compliance audit covering the trust-and-safety work merged since (PRs #547, #548, #553, #557). Read-only audits; no code changed. **Primary goals: verify the ~30-PR wave against all 21 deduped 2026-09-07 findings, then a fresh-eyes pass over the new surface, plus a first-ever legal/compliance pass.**

**Reports:**

| Pillar | Report | Findings (raw) |
|---|---|---|
| 1. Security & data integrity | [audit_security.md](audit_security.md) | 0 P0 · 0 P1 · 3 P2 |
| 2. Architecture, performance & code quality | [audit_architecture.md](audit_architecture.md) | 0 P0 · 0 P1 · 4 P2 |
| 3. PbP game & realtime UX | [audit_pbp_realtime.md](audit_pbp_realtime.md) | 0 P0 · 0 P1 · 2 P2 |
| 4. Product/mobile UX & a11y | [audit_ux_a11y.md](audit_ux_a11y.md) | 0 P0 · 1 P1 · 3 P2 |
| 5. Legal terms & trust-safety compliance *(new)* | [audit_legal_terms.md](audit_legal_terms.md) | 0 P0 · 1 P1 · 4 P2 |

**Deduped totals: 0 P0 · 2 P1 · 16 P2 = 18 findings.** No cross-pillar merges this round (pillars did not overlap). One same-surface pairing noted below (security P2-2 and legal P1-1 both touch `scan-upload`, but are distinct mechanisms — ops cost vs compliance duty).

## Verification suite (orchestrator, post-audits)

- `npx tsc -p tsconfig.app.json --noEmit`: **passed** (no errors)
- `npm run lint` (oxlint): **passed (exit 0)** — **46 warnings, 0 errors**. 45 are react-compiler rules (`react/set-state-in-effect`, `react/refs`, `react/purity`, `react/preserve-manual-memoization`) and 1 is jsx-a11y (`no-noninteractive-tabindex`, `src/features/chat/MessageList.tsx:438`). The warning backlog is **new vs 20260907's "clean"** — the react-compiler ruleset arrived via the deps bump (#546/#545) and is now tracked as arch P2-4.
- `npx vitest run`: **1770 passed / 0 failed** (138 files) — up from 1305/121 at 20260907.
- `npm run test:coverage`: **1770 passed / 0 failed** — coverage 92.82% statements / 84.83% branches / 90.4% functions / 95.65% lines (thresholds 80/81/80/80; functions climbed from 88.78%).
- `npm run build` (`tsc -b && vite build`): **passed** — precache 43 entries / 1733.84 KiB; known >500 kB chunk warning pre-existing.
- `npm run lint:md` (markdownlint-cli2): **0 issues** (44 files).
- `npm run spellcheck` (cspell): **0 issues** (315 files).
- **Not run locally:** `npx supabase db reset` + pgTAP, Playwright E2E — no SQL changes in this PR (docs + issues only); CI's `migrate-check` job covers migrations and `supabase test db` runs pgTAP on every PR.

## Prior-audit state (verified by all four pre-existing pillars)

**All 21 deduped 2026-09-07 findings are verified FIXED in code, not just changelogs — the first audit round with a 100%-fixed prior wave.** The fix wave (#444 "UX & a11y", the PbP realtime P2 batch, #452 raw-token guard, and the trust-safety PRs) landed and held:

- **Security (5/5 FIXED):** `get_user_channels_unread` self-guard (`issue_517_badge_unread_total.sql:38-43`), NPC avatar URL scheme trigger, `mark_admin_thread_read` participation check, SW push-URL same-origin refine, and the durable default-privilege pin (`20260907200109_sec1_pin_default_function_privs.sql`).
- **Architecture (5/5 FIXED):** `ToastContext` `useMemo` (`ToastContext.tsx:68`), the two component RPC sites moved into hooks with a widened `src/**/*.tsx` guard (`.oxlintrc.json:25-37`), signed-URL session cache (`useSignedImageUrl.ts:51-83`), Dice recent-rolls Zod-validated (`useRecentRolls.ts:8-13`), `useAdminData` full Zod schemas.
- **PbP realtime (3/3 FIXED, plus the 20260907 P1-2 player-closure gap):** dice-roll errored-key reuse (`useMessages.ts:670-678`), 7-day X-Card horizon dropped + scoped backfill, GM cross-device dismissal via UPDATE recount handler (`useSafetyCardEvents.ts:56-88`); **P1-2 landed** — X-Card dismissal posts an identity-free system message (`resolve_safety_card_events`, `useSafetyCardEvents.ts:204`).
- **UX & a11y (8/8 FIXED):** P1-1 kebab accessible name + menu semantics + Escape (`MemberList.tsx:248-260`), P2-1 touch targets, P2-2 `aria-expanded`, P2-3 mention combobox, P2-4 X-Card catch-up Retry, P2-6 kebab menu semantics.

**Caveat on the 100% headline:** the fix that *achieved* the token-adoption sweep (#452) introduced the round's worst new bug — see UX P1-1.

## Deduped findings

### P1 (2)

| # | Finding | Evidence | Source |
|---|---|---|---|
| P1-1 | **`TextPromptSheet` class names corrupted by embedded backspace bytes — the primary confirm button renders invisible.** Five Tailwind tokens carry a literal U+0008 between prefix and color (`bg-\x08primary-600`, `text-\x08surface-700`, `focus:ring-\x08primary-500`), so Tailwind generates no utility: white text on a transparent background = an invisible CTA, plus a dead focus ring. It is the confirm button on the AFK "Mark Away" sheet and the admin suspend sheet. Shipped in PR #452's token migration, which the blocklist guard (`tokenAdoption.test.ts`) — matching only `indigo\|gray` — could not see. [#561](https://github.com/alvarocavalcanti/ttrpgpbp/issues/561) | `src/components/TextPromptSheet.tsx:36,47,49,57,63` (byte-verified with `xxd`); introduced by `41d5b8f` (PR #452) | ux#P1.1 [NEW] |
| P1-2 | **CSAM detection has no report or operator-alert path — Terms §7's "we will report to NCMEC/INHOPE" is unbacked.** On a Safer `match`, `scan-upload` suspends the uploader and writes a `csam_match_blocked` audit row, but nothing notifies an operator, queues the event, or files a report; the one admin-facing list RPC (`admin_list_content_matches`) was dropped as "unused". The only visibility is a label in a per-user moderation history. Latent today (the scanner itself is fail-closed until `SAFER_API_KEY` is set, so nothing is yet detected), but a detection-without-report path once enabled. [#562](https://github.com/alvarocavalcanti/ttrpgpbp/issues/562) | `supabase/functions/scan-upload/index.ts:177-206`; `20260918092818_drop_unused_admin_content_rpcs.sql:13-14`; `TermsPage.tsx:112-116` | legal#P1.1 [NEW] |

### P2 (16)

**Security** (audit_security.md §P2):

1. Grant-sweep durability: three post-sweep trigger functions (`enforce_abuse_report_integrity`, `enforce_abuse_report_immutable_report_target`, `handle_email_opt_in_change`) shipped without `REVOKE` from authenticated/service_role; the durable pin only strips `anon`/`PUBLIC`, and the sweep pgTAP asserts an explicit list that misses them.
2. `scan-upload` quota cap defeatable by object-path reuse (the UNIQUE `content_hashes` insert fails non-fatally, so the count never increments while the bytes still reach Safer) + no size bound before the scan — one GM can burn paid provider quota unbounded.
3. `get_unread_totals(p_user_ids UUID[])` retains authenticated EXECUTE and takes arbitrary ids — the batch variant of the cross-user unread leak 20260907#1 fixed per-user; one-line revoke.
**Architecture** (audit_architecture.md §P2):
4. Clipboard-copy fallback copy-pasted between `ChannelSettings.tsx:121-137` and `AdminView.tsx:264-284`.
5. `AdminView.tsx:305` computes `Date.now()` during render (impure, unstable).
6. `useAdminChannelMessages.ts:147-158` over-fetches the full `admin_list_channels` to resolve one channel's header.
7. 45-warning react-compiler backlog — `set-state-in-effect` / `refs` / `purity` / `preserve-manual-memoization`; manual memoization still the norm across the migrated surface.
**PbP realtime** (audit_pbp_realtime.md §P2):
8. Reaction initial fetch does a full `setReactions(...)` replace and can drop a live-arrived reaction (the exact race the message path merges around) — `useMessages.ts:208-221`.
9. Reaction toggle is non-optimistic and un-guarded against rapid re-click → spurious "Failed to update reaction." toast (`ChannelView.tsx:213-225`, `useMessages.ts:769-784`).
**UX & a11y** (audit_ux_a11y.md §P2):
10. New surface below the 44px floor: composer NPC portrait ≈32px, media-select checkbox ≈24px + Insert ≈36px, admin report actions ≈26px.
11. `ImageViewerModal` has no error state — a failed signed URL leaves a black screen (`ImageViewerModal.tsx:151-179`).
12. Token guard is a blocklist; three new files shipped raw tokens (ChannelMediaPanel 17 / AdminChannelView 57 / LoginPage 71) — replace with a glob rule.
**Legal terms** (audit_legal_terms.md §P2):
13. ToS acceptance never recorded — the sign-in checkbox conflates age attestation + ToS + Privacy, but only `age_verified_at` is stored; no `terms_accepted_at`/version, no re-consent on terms change.
14. Age gate is attestation-only — no parental-consent mechanism (the Brazil <18 carve-out in Terms §13 is dead letter) and no under-16 detection path despite §13 promising deletion.
15. No controller identity or contact channel (GDPR Art 13) — "contact the server administrator" names no entity or address.
16. Retention periods undisclosed — content hashes 90 days (match forever), images default forever; the Privacy Policy states neither.

## Cross-pillar dedupe map

| Item | Resolution |
|---|---|
| `scan-upload` (security P2-2 vs legal P1-2) | **No merge.** Security P2-2 is an ops-cost/quota issue (provider billing burnable); legal P1-2 is the detection→report compliance duty. Distinct fixes, same file — fix together in one PR for convenience. |
| Reaction items (pbp P2-8/P2-9) | Two distinct mechanisms (fetch-replace race vs toggle feedback); kept separate, one PR. |
| Prior-finding disposition | No cross-pillar conflicts — all four pillars independently confirmed the 20260907 wave fixed, with only the same-token-adoption regression (UX P1-1) surfacing as the round's net-new defect. |

## Intentional exclusions (verified deliberate — do not fix)

Carried + re-verified from [20260907](../20260907/INDEX.md): free-form initiative, public-only dice, no hidden rolls, single timeline, no threads/OOC split, email notifications future, no presence indicators, soft-delete-only messages, command-only `system`/`dice_roll` types, offline = cached shell, `verify_jwt=false` push/shared-secret, client-side PBKDF2, label-only mimetype, 32–36px desktop hover-row convention (`MESSAGE_ACTION_SIZING`), sidebar-only tools (issue #382), `created_at` cursor catches, unpaged reaction map, Iconify external API, admin optimistic updates, `gm_id` transfer rules, CSP `script-src 'unsafe-inline'` nonce-ification (optional), stale-but-safe previews after edits/whisper-nulling, image retention default 0.

New this round (do not fix):

- **No DOB / age verification** — self-attestation age gates are the accepted posture for a non-financial hobby service; the legal finding is about *copy alignment*, not adding verification (legal P2-14).
- **No automated NCMEC filing** — filing stays a human act; the legal P1-2 fix is to *surface* the duty, not to automate a legal filing from an edge function.
- **`scan-upload` fail-closed-by-default** — uploads disabled until `SAFER_API_KEY` is configured is the correct safety posture and stays.
- **Pseudonymized message retention on account deletion** (`sender_id SET NULL`) — disclosed in the Privacy Policy, deliberate GDPR legitimate-interest posture.

## Suggested execution order (merged across pillars)

1. **UX P1-1** — strip the backspace bytes from `TextPromptSheet.tsx` + add a non-printable-char test. ~1h; the only user-visible defect, on a safety/admin surface. Do first, own PR.
2. **Legal P1-2 + Security P2-2** — wire the CSAM report/alert path (re-add a consumed `admin_list_content_matches`-style queue + operator notification) and add the pre-scan size/enable guards + quota-reuse fix. One PR; touches `scan-upload` once.
3. **Security P2 batch** (#1 revoke sweep + pgTAP, #3 one-line revoke) — one chore PR.
4. **Legal P2 batch** (#13 `confirm_terms` + versioning, #14 copy alignment, #15 controller line, #16 retention paragraph) — one copy+consent PR.
5. **PbP P2 batch** (#8 reaction merge, #9 optimistic toggle) — one small PR.
6. **Arch P2 batch** (#4 clipboard helper, #5 `Date.now`, #6 header fetch, #7 warning backlog) — one chore PR.
7. **UX P2 batch** (#10 touch targets, #11 image-viewer error state, #12 token glob rule) — one PR.

## GitHub issues

| Parent | Findings |
|---|---|
| [#558 Security & data integrity (2026-09-20)](https://github.com/alvarocavalcanti/ttrpgpbp/issues/558) | P2 checklist (#1–#3) |
| [#559 Architecture, performance & code quality (2026-09-20)](https://github.com/alvarocavalcanti/ttrpgpbp/issues/559) | P2 checklist (#4–#7) |
| [#560 PbP game & realtime UX (2026-09-20)](https://github.com/alvarocavalcanti/ttrpgpbp/issues/560) | P2 checklist (#8–#9) |
| [#561 Product/mobile UX & a11y (2026-09-20)](https://github.com/alvarocavalcanti/ttrpgpbp/issues/561) | P1 (TextPromptSheet corruption) · P2 checklist (#10–#12) |
| [#562 Legal terms & trust-safety compliance (2026-09-20)](https://github.com/alvarocavalcanti/ttrpgpbp/issues/562) | P1 (CSAM report path) · P2 checklist (#13–#16) |

P2s tracked as checklists in parent bodies (16 items). No cross-pillar merges this round.
