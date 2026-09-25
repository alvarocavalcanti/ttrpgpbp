# Final Release Audit — 2026-09-25 · INDEX

Six parallel specialized audits (pillars 1–6). Pillars 1–5 follow the same structure as [2026-09-20](../20260920/INDEX.md); **pillar 6 is new this round** — a release-readiness pass (versioning, PWA update lifecycle, deployment/config accuracy, CI/CD, backups, observability, docs). Read-only audits; the audit reports changed no code. **Primary goal: a final gate before public release, with a Go/No-go.**

The fixes for every P0/P1 and the cheap security/legal/release P2s landed in this same branch (see "Fix wave" below); the remaining P2 tail is tracked in [#604](https://github.com/alvarocavalcanti/ttrpgpbp/issues/604).

**Reports:**

| Pillar | Report | Findings (raw) |
|---|---|---|
| 1. Security & data integrity | [audit_security.md](audit_security.md) | 0 P0 · 1 P1 · 5 P2 |
| 2. Architecture, performance & code quality | [audit_architecture.md](audit_architecture.md) | 0 P0 · 0 P1 · 6 P2 |
| 3. PbP game & realtime UX | [audit_pbp_realtime.md](audit_pbp_realtime.md) | 0 P0 · 0 P1 · 4 P2 |
| 4. Product/mobile UX & a11y | [audit_ux_a11y.md](audit_ux_a11y.md) | 0 P0 · 2 P1 · 4 P2 |
| 5. Legal terms & trust-safety compliance | [audit_legal_terms.md](audit_legal_terms.md) | 0 P0 · 2 P1 · 4 P2 |
| 6. Release readiness *(new)* | [audit_release_readiness.md](audit_release_readiness.md) | 0 P0 · 4 P1 · 5 P2 |

**Deduped totals: 0 P0 · 9 P1 · 27 P2 = 36 findings.** One cross-pillar merge: the GDPR export omission appears as security P2-3 and legal P2-4 and is one finding. One same-surface pairing noted (security P2-1 upload volume and release P2-4 rate limiting are the same free-tier abuse surface seen from two angles — folded into one backlog item).

## Verification suite (orchestrator)

Baseline (pre-fix) and final (post-fix) were both run on this branch:

| Check | Baseline | Final |
|---|---|---|
| `npx tsc -p tsconfig.app.json --noEmit` | passed (0 errors) | passed (0 errors) |
| `npm run lint` (oxlint) | 0 errors · 54 warnings | 0 errors · 55 warnings |
| `npx vitest run` | 1955 passed / 146 files | 1971 passed / 146 files |
| `npm run test:coverage` | 93.3 / 85.46 / 90.84 / 96.07 | 93.3 / 85.48 / 90.84 / 96.08 |
| `npm run build` | passed · precache 45 / 1759.55 KiB | passed · precache 45 / 1762.64 KiB |
| `npm run lint:md` | 0 issues | 0 issues |
| `npm run spellcheck` | 0 issues | 0 issues |
| pgTAP (`supabase db reset` + `supabase test db`) | 37 files / 411 tests PASS | 39 files / 421 tests PASS |
| Playwright E2E | 7 passed | 7 passed |

- **The 55th lint warning is a known false positive** (`vitest(valid-expect)` in `scripts/git/check-types-staged.test.ts`, which uses Vitest's supported `expect(actual, message)` form); the pre-existing react-compiler backlog is unchanged at 48 non-test warnings (issue #567).
- **pgTAP must run against a freshly reset database.** Running `supabase test db` against a database that already holds E2E-seeded users makes `20260909150000_issue_466_messages_audiences.sql` fail on recipient counts (leftover profiles). This is environmental, not a code defect — confirmed by a clean `db reset` pass.
- `src/types/database.ts` is unchanged: the three new migrations are schema-neutral (policy, revoke, index), so typegen output is byte-identical.

## Prior-audit state

**All 2026-09-20 findings are verified fixed in code**, and the merged-but-unimplemented [20260923 message-heading plan](../20260923/audit_message_headings.md) was the one regression the 2026-09-20 round left behind — it is now implemented (UX P1-1 fix wave).

- Security: 20260920 P2 #1 (grant durability) and #3 (`get_unread_totals` revoke) fixed; #2 (scan quota) **superseded** by the scanner removal (#600) with an equivalent gap tracked as security P2-1.
- Architecture: 20260920 P2 #4 (clipboard), #5 (`Date.now` render), #6 (admin header over-fetch) fixed; #7 (react-compiler backlog) **still open** (issue #567).
- PbP: 20260920 P2 #8/#9 (reaction merge + optimistic toggle) fixed.
- UX/a11y: 20260920 P1 (TextPromptSheet control bytes) + P2 #10/#11/#12 fixed; the 20260923 heading plan was **not** implemented (P1-1 this round).
- Legal: 20260920 P1 (CSAM report path) closed by scope change (#600); P2 #13/#15/#16 fixed, #14 copy fixed with a residual evidence gap (P2-1 this round).

## Deduped findings

### P1 (9) — all fixed in this branch

| # | Finding | Fix |
|---|---|---|
| sec-1 | Any non-suspended user could post into an `all_users` announcement thread; the push trigger fanned it to every user as an "Announcement" (mass-message/impersonation). | Migration `20260925163921_announcement_insert_admin_only.sql` gates announcement/system inserts on `is_server_admin()`; `ThreadDetail` hides the reply box for non-admin announcements; pgTAP `20260925163921`. |
| ux-1 | The approved 20260923 heading-scale plan was never implemented — h1 at 2.14× body, h5/h6 identical to paragraphs, dice bodies unstyled. | `typography.chat` modifier in `tailwind.config.js` + four call sites (`MessageItem`, `composerChip`) + value and compile-order tests. |
| ux-2 | Five file inputs used `display:none` inside non-focusable labels — keyboard users could not reach the composer/NPC/channel uploads. | `hidden` → `sr-only` + `focus-within` rings; `tokenAdoption.test.ts` guard fails any `display:none` file input. |
| legal-1 | Privacy promised "images under review are kept", but `cleanup-images` pruned every image past the retention window with no hold. | `collectExpiredImages` holds every image in a channel with an open abuse report; `getProtectedChannelIds` wired in the function; tests. |
| legal-2 | GA4 loaded with no consent gate and was described as "anonymous". | Added a prior-consent banner: GA does not load until the visitor allows it, and `RouteTracker`/`initAnalytics` are gated on the stored choice. Privacy copy corrected; tests. |
| rel-1 | `DEPLOYMENT.md` never deployed `delete-account` — a self-hosted GDPR delete 404s. | Deploy step added; `[functions.delete-account]` declared in `config.toml`. |
| rel-2 | `ALLOWED_ORIGINS` documented as optional/push-only, but it now CORS-gates image upload and account deletion. | Doc corrected (required for non-default origins; scopes upload + delete + push); secrets example updated. |
| rel-3 | No version (`0.0.0`), no tag, no release notes, version not surfaced. | `package.json` → `1.0.0`; `__APP_VERSION__` injected and shown in About; `## 1.0.0 — 2026-09-25` release section; AGENTS.md release rule made concrete. Tag at merge. |
| rel-4 | Documented backup RPO assumed Supabase Pro ($25/org/month) + PITR; the free tier has no backups, and the dump set was schema-only. | `BACKUP_RESTORE.md` rewritten around the free-tier manual cadence, a complete four-part dump (schema/data/auth/roles) + Storage objects, and the restore drill, with the Pro cost named. Scheduled workflow deferred (#604). |

### P2 (27 deduped) — fixed here (11)

| # | Finding | Fix |
|---|---|---|
| sec-2 | Abuse reports had no de-duplication — a member could flood the admin System thread/pushes. | Partial unique index `(reporter_id, message_id)` (`20260925163924`, with duplicate reconciliation); client maps `23505` to "You've already reported this message."; pgTAP. |
| sec-3 (= legal-4) | GDPR export omitted `dice_roll_favorites` and the terms/age fields. | Added to `exportUserData` + tests. |
| sec-4 | `delete-account` treated an `is_server_admin` RPC error as "not admin" (fail-open). | `resolveAdminLookup` fails closed on error; unit tests. |
| sec-5 | `profiles` readable by `anon`, now including terms-acceptance columns. | `REVOKE SELECT … FROM anon` (`20260925163923`); pgTAP. |
| legal-1 | Pre-age-gate accounts accepting via the re-consent gate never stamped `age_verified_at`. | `ReConsentGate` collects the 16+ attestation when needed; `ProtectedRoute` calls `confirmAge()`; tests. |
| legal-2 | Uploads ship disabled while the launch decision is enabled (undocumented toggle). | Documented as an explicit release step in `DEPLOYMENT.md`. |
| legal-3 | Historical changelog still claimed uploads are scanned. | Two entries annotated as removed 2026-09-24. |
| rel-1 | `DEPLOYMENT.md` omitted `VITE_SENTRY_DSN`. | Sentry row added to the env table. |
| rel-2 | `BACKUP_RESTORE.md` referenced a non-existent `npm run test:e2e` and mixed dump APIs. | Rewritten: complete four-part dump + Storage objects, `npx playwright test`, no reset after import. |
| rel-3 | Observability doc oversold alerting on the free tier. | Free-tier reality section added (1-day logs, manual review, Pro cost named). |
| rel-4 | `.env.example` shipped the maintainer's real controller identity. | Replaced with obvious placeholders. |

Also fixed (tooling, not an audit finding): the pre-commit typegen guard demanded `src/types/database.ts` for schema-neutral migrations; it now requires types only for DDL additions, modifications, deletions, and moves, with tests.

### P2 (27 deduped) — deferred to [#604](https://github.com/alvarocavalcanti/ttrpgpbp/issues/604) (16) + 1 residual P1

Security P2-1 (unbounded upload volume) · Architecture P2-1–P2-6 (react-compiler direction [#567], PWA release-smoke/WebKit, shared CORS module, `safeStorage` adoption, dice-schema dedupe, render-time `Date.now`) · PbP P2-1–P2-4 (reconnect `client_request_id` collapse, server-stamped catch-up cursor, X-Card retry zero-clear, `retryMessage` no-id guard) · UX P2-1–P2-4 (PWA reload target, dice star, composer touch stragglers, re-consent focus trap) · Release P2-4 (rate limiting, with [#236](https://github.com/alvarocavalcanti/ttrpgpbp/issues/236)).

Residual P1: the scheduled free-tier backup workflow (the doc now covers the manual path).

## Cross-pillar map

| Item | Resolution |
|---|---|
| `upload-image` volume (sec P2-1) vs rate limiting (rel P2-4) | **Merged into one backlog item** — same free-tier abuse surface. |
| GA consent (legal P1-2) vs release config (rel P1-3) | Resolved together: the consent gate landed, so the env var can be set without loading GA before consent. |
| pgTAP dirty-DB false failure | Documented above; not a finding. |

## Intentional exclusions (verified deliberate — do not fix)

Carried and re-verified: unscanned uploads (paid scanner removed; report-only moderation is the operator's decision), `verify_jwt=false` + shared secret on the trigger/scheduler functions, whisper privacy model, client-side PBKDF2, label-only mimetype + JPEG signature, CSP `script-src 'unsafe-inline'`, X-Card anonymity, open signup with per-account join throttle, soft-delete-only messages, image retention default 0, age gate as self-attestation, admin content reads include whispers + soft-deleted and are audited, `admin_list_channels` header over-fetch accepted at admin scale, Chromium-only E2E baseline, manual observability alerting on the free tier.

## Go/No-go

**GO — with two operator actions at deploy.** No P0; every P1 is fixed and verified; the full suite (typecheck, lint, unit tests, coverage, build, markdownlint, cspell, pgTAP, E2E) is green. Analytics is now behind a prior-consent gate, so `VITE_GA_MEASUREMENT_ID` no longer needs to stay unset.

Operator actions (not code, cannot be done from this branch):

1. **Image uploads:** uploads ship **off**; flip `app_settings.image_uploading_enabled` in the admin console if the report-only launch posture is intended (documented in `DEPLOYMENT.md`). With uploads on, the unbounded-volume cap is still open (#604) — accepted risk on the free tier.
2. **Tag the release:** merge, then `git tag v1.0.0 && git push --tags` at the release commit.

Accepted residual risks: unscanned uploads with report-only moderation (disclosed in Terms/Privacy); no automated backups on the free tier (manual four-part cadence documented); no rate limiting while the instance is invite-gated.

## GitHub issues

| Issue | Contents |
|---|---|
| [#604](https://github.com/alvarocavalcanti/ttrpgpbp/issues/604) | Post-1.0 hardening backlog — the 16 deferred P2s + 1 residual P1 (scheduled backup workflow). |
| [#567](https://github.com/alvarocavalcanti/ttrpgpbp/issues/567) | React Compiler direction (Architecture P2-1). |
| [#236](https://github.com/alvarocavalcanti/ttrpgpbp/issues/236) | Rate/throttle limits (Release P2-4). |
| [#552](https://github.com/alvarocavalcanti/ttrpgpbp/issues/552) | Deferred trust-and-safety work (AUP scan, link reputation) — accepted substitute at launch. |

## Suggested execution order (post-release)

1. Security P2-1 upload cap — first if uploads are enabled (or before enabling them), since the cap is the free-tier storage bound.
2. PbP P2-1 reconnect twin — the only remaining user-visible correctness bug on flaky connections.
3. React Compiler direction (#567) — clears the growing lint signal.
4. Release backup workflow — close the last residual P1.
5. UX touch-target/a11y batch and Architecture cleanup batch.
