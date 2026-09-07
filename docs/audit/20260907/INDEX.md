# Full Audit — 2026-09-07 · INDEX

Four parallel specialized audits (pillars 1–4), same structure as [2026-09-04](../20260904/INDEX.md). Prompts embedded in each report. Read-only audits; no code changed. **Primary goal this round: verify the 2026-09-05/06 fix wave against all 35 deduped 2026-09-04 findings, then a fresh-eyes pass.**

**Reports:**

| Pillar | Report | Findings (raw) |
|---|---|---|
| 1. Security & data integrity | [audit_security.md](audit_security.md) | 0 P0 · 0 P1 · 5 P2 |
| 2. Architecture, performance & code quality | [audit_architecture.md](audit_architecture.md) | 0 P0 · 0 P1 · 5 P2 |
| 3. PbP game & realtime UX | [audit_pbp_realtime.md](audit_pbp_realtime.md) | 0 P0 · 0 P1 · 3 P2 |
| 4. Product/mobile UX & a11y | [audit_ux_a11y.md](audit_ux_a11y.md) | 0 P0 · 2 P1 · 6 P2 |

**Deduped totals: 0 P0 · 2 P1 · 19 P2 = 21 findings.** No cross-pillar merges this round (pillars did not overlap); same-file pairings noted below. One cross-pillar conflict resolved by the orchestrator (see dedupe map).

## Verification suite (orchestrator, post-audits)

- `npx tsc -p tsconfig.app.json --noEmit`: **passed** (no errors)
- `npm run lint` (oxlint): **passed, clean**
- `vitest run`: **1305 passed / 0 failed** (121 files)
- `npm run test:coverage`: **1305 passed / 0 failed** — coverage 92.79% statements / 83.63% branches / 88.78% functions / 95.78% lines (thresholds 80/81/80/80)
- `npm run build` (`tsc -b && vite build`): **passed** — precache 41 entries / 1.58 MiB; known >500 kB chunk warning is pre-existing
- `npm run lint:md` (markdownlint-cli2): **0 issues** (first run found 4 MD032 in the two new reports with blockquote prompt skeletons — fixed inline)
- `npm run spellcheck` (cspell): **0 issues** (284 files) after adding 10 audit words to `.cspell.json`
- Playwright E2E (`npx playwright test`, local stack + Admin-API seeding): **6 passed / 0 failed** (3.25s)
- **Not run:** `npx supabase db reset` + pgTAP locally — no SQL changes in this PR (docs + cspell list only); CI's `migrate-check` job covers migrations and `supabase test db` runs the pgTAP suites on every PR

## Prior-audit state (verified by all four pillars)

The 2026-09-05/06 fix wave is verified fixed in code, not just in changelogs. Disposition of all 35 deduped 2026-09-04 findings:

- **Security (9/9 FIXED):** whisper-preview leak fixed across every write path (preview has exactly one INSERT-only writer; `whisper_to` is immutable on UPDATE, so a whisper can never be edited into a public message; deletes are soft-only; backfill scrub is correct-by-construction) — all with pgTAP. Push-secret revoke, grant sweep (with zero-anon pgTAP assertion), member URL scheme trigger + client guard, Sentry `maskAllText`, GDPR read-back + export, `search_path` pin, suspended-GM announcement filter, CSP drop-ins.
- **Architecture (12 findings: 11 FIXED, 1 PARTIAL):** chat hot path fully stable (refs-for-stability + `useCallback` + memoized `Markdown`, render-count test); admin-messages mutations in hooks with rollback + toasts; reconcile index shipped; IconPicker debounced; dead code deleted; prompt/alert gone; profile refresh; hook relocated; lobby flap throttle; **E2E harness repaired (Admin-API seeding) and CI-gated** — the phase3/20260904 standing recommendation is closed. PARTIAL: P2.1 "queries live in hooks" — 8 sites → 2, but the new oxlint guard is a blocklist of past offenders, not a rule (the two survivors escaped through exactly that hole).
- **PbP realtime (6/6 FIXED):** X-Card catch-up + persisted `resolved_at` (GM-only UPDATE RLS, SUBSCRIBED-gated snapshot, `Math.max` merge — no double count, no false all-clear, 13 tests); read-mark gated on confirmed history load + Retry wired everywhere; errored-bubble key reuse on resubmit; DB content cap (`NOT VALID` done right); composer Active Player chip dropped (modal is single authority, RPC NULL-guard protects turn state); draft-restore race closed.
- **UX & a11y (10 findings: 8 FIXED, 2 PARTIAL):** prompts/alerts → `TextPromptSheet` + toasts with at-input length caps; contrast sweep; `role="log"` chat stream; both drawers trapped with aria-hidden backdrops; sort headers keyboard operable; reduced-motion gated (incl. the new admin-messages surface); Retry on every failed async surface; SearchModal label + Escape nits. PARTIAL: P2.1 touch targets (the 7 named controls fixed; new stragglers appeared) and P2.8 tokens (chat/channel fully migrated to 0 raw tokens; Admin/Settings/Profile/MemberList/Lobby untouched; scene blob grew to ~1184 chars).

Every P0/P1 from every prior audit generation (2026-08-12 through 2026-09-04) is now closed. This is the first audit round with **zero P0 and zero architecture/security P1**.

## Deduped findings

### P1 (2)

| # | Finding | Evidence | Source |
|---|---|---|---|
| P1-1 | **Member kebab button has no accessible name** — bare SVG in `<button>`, no `aria-label`/`aria-expanded`; the sole GM moderation entry point on mobile (Edit Character, AFK, Kick, Block, Leave) announces as an unnamed "button" per row (WCAG 4.1.2). 20260904 fix note asked for size **and** name; only size landed. Pair with P2-19 (menu semantics + Escape) in one diff. [#433](https://github.com/alvarocavalcanti/ttrpgpbp/issues/433) | `src/features/channels/MemberList.tsx:209-218` (trigger), `:220-270` (popup), contrast `src/components/Menu.tsx:28,77,84` | ux#P1.1 [OPEN, residual of ux-20260904#P2.1] |
| P1-2 | **X-Card resolution is silent for players** — GM side got catch-up + persisted dismissal; the pressing player gets "X-Card sent to the GM" and then a black hole: no signal the flag was handled. For a safety tool, "handled, silently" reads as "ignored" → re-press or off-app escalation, the exact outcome the tool exists to avoid. Fix: identity-free channel-level system message on dismissal (rides the existing message pipeline, zero new subscriptions); keep the presser anonymous. [#434](https://github.com/alvarocavalcanti/ttrpgpbp/issues/434) | `src/features/channels/useSafetyCardEvents.ts:23,84,88-112` | ux#P1.2 [NEW] |

### P2 (19)

**Security** (audit_security.md §P2):

1. `get_user_channels_unread` accepts an arbitrary `p_user_id` — cross-user unread *metadata* between channel-mates (RLS-bounded, no content); one-line self-guard + pgTAP.
2. NPC avatar URLs bypass the URL-scheme contract (`channel_npcs.avatar_url`, `messages.npc_avatar_url`) — same inconsistency sec-20260904#4 fixed for member URLs; defense-in-depth (`<img src>`), extend `url_scheme_allowed` + length caps.
3. `mark_admin_thread_read` writes read-state for arbitrary thread ids — no participation check; integrity noise; mirror the `get_admin_unread_count` self-or-admin contract.
4. SW notification click opens an unvalidated URL (`openWindow(event.notification.data?.url)`) — payload signer is our edge function, so pure hardening; site-relative `refine` + test.
5. Grant sweep left EXECUTE for `authenticated` on trigger/definer helper functions (blanket re-grant + only six server-only revokes) — unexploitable today (they all dereference `NEW`), but it is the class the sweep meant to close; extend the revoke list + pgTAP.
**Architecture** (audit_architecture.md §P2):
6. `ToastContext` value is a fresh object on every provider render — all toast consumers re-render on every toast lifecycle; one-line `useMemo` (AuthContext got this treatment in 20260812; ToastContext was missed).
7. Component-level RPC sites remain (`ChannelSettings.tsx:175-192`, `DiceRoller.tsx:43-58`) and the oxlint guard is a blocklist of the 7 migrated files, not a rule — move both into hooks, validate the roll rows (see #9), widen the guard to all components. [OPEN arch-20260904#P2.1]
8. `useSignedImageUrl` re-signs every image on every mount — no session cache; N storage calls per thread open; module-scoped TTL map, ~10 lines.
9. `DiceRoller` recent-notations trusts RPC rows unvalidated — no Zod, unlike every other read path; malformed row crashes the effect. Rides #7's hook extraction.
10. `useAdminData` rows shape-guarded but field-unvalidated (`as AdminUser[]`) — two small Zod schemas, `.filter` on parse failures. [OPEN arch-20260904#P2.1]
**PbP realtime** (audit_pbp_realtime.md §P2):
11. Errored dice-roll resubmit mints a fresh `client_request_id` — the roll path never got the message path's errored-key reuse (#404 fix); `dice:` links and the DiceRoller bypass bubble Retry. Last double-post window; on the trust surface (a duplicated roll is worse than a duplicated post).
12. 7-day catch-up horizon permanently swallows an X-Card flag for a GM away longer than a week — "unresolved" is precisely "unhandled" after `resolved_at`, so age is meaningless for surfacing. Fix: one backfill of legacy rows + drop the `.gt('created_at')` filter (smaller than the code it removes).
13. X-Card dismissal doesn't propagate across the GM's own tabs/devices — stale banner only, safe direction (can show an alert that no longer exists, never hide a live one); UPDATE handler or document reload-heals.

**UX & a11y** (audit_ux_a11y.md §P2):
14. Touch-target stragglers — newest controls again shipped below the 44px floor: status-bar Edit ≈26px (the one original item never fixed), messages-error Retry ≈26px, NPC-portrait icon cluster ≈32px ×9, PermissionBanner/PwaInstallBanner buttons, `TextPromptSheet` input `py-2`, "Load older" ≈30px. Apply the two sanctioned patterns (`min-h-11`, `after:-inset` hit-expansion).
15. `aria-expanded` missing on three disclosure toggles (sidebar toggle, status-bar chevron, kebab) — `Menu.tsx`/`EmojiPicker` do it right; ~30min.
16. Mention listbox is an incomplete combobox — `role="listbox"` + options exist, but no `aria-activedescendant`/`aria-expanded`/`aria-controls` on the textarea, so arrow-key highlight is invisible to SRs.
17. X-Card catch-up failure is toast-only — a transient SELECT error leaves the GM session looking exactly like a clean table; every other failure path now has in-place Retry. Inline "Couldn't load X-Card alerts — Retry" chip.
18. Token adoption stalled at the chat/channel boundary (AdminView 146 / ChannelSettings 152 / ProfileSettings 135 / MemberList 56 / Lobby 51 raw occurrences vs MessageItem & ChannelView 0); scene blob grew to ~1184 chars; drawers still two copies; new `TextPromptSheet` shipped raw. [OPEN ux-20260904#P2.8]
19. Member kebab popup lacks menu semantics and Escape (behavior half of P1-1; same diff).

## Cross-pillar dedupe map

| Item | Resolution |
|---|---|
| X-Card catch-up failure UX | **Conflict resolved:** pbp#2 listed "catch-up failure surfaces a toast, not a retry" as a deliberate choice; ux#P2.4 flagged the same behavior as a gap (safety path must Retry). UX pillar owns the UX surface → kept as P2-17. |
| X-Card lifecycle items | P1-2 (player closure), P2-12 (7-day horizon), P2-13 (GM device sync), P2-17 (catch-up Retry) are four distinct mechanisms with four distinct fixes — kept separate. |
| Same-file pairings (no merge) | ux P1-1 + P2-19 (kebab name + semantics, one diff); arch #7 + #9 (DiceRoller hook + row validation, one PR). |
| Dice double-send | pbp#P2.1's 20260904 fix covered the message path only; the roll path (pbp-20260904 explicitly noted as untouched) is now its own finding P2-11. |

## Intentional exclusions (verified deliberate — do not fix)

Carried + re-verified from [20260904](../20260904/INDEX.md): free-form initiative, public-only dice, no hidden rolls, single timeline, no threads/OOC split, email notifications future, no presence indicators, soft-delete-only messages, command-only `system`/`dice_roll` types, offline = cached shell, `verify_jwt=false` push with shared secret, client-side PBKDF2, label-only mimetype, 32–36px desktop hover-row convention (`MESSAGE_ACTION_SIZING`), sidebar-only tools (issue #382), `created_at` cursor catches, unpaged reaction map, Iconify external API, admin optimistic updates, `gm_id` transfer rules, CSP `script-src 'unsafe-inline'` nonce-ification (optional follow-up), stale-but-safe previews after edits/whisper-nulling, image retention default 0.

New this round (do not fix): resolution is per-event, not a per-GM dismissal ledger (`gm_id` is single-column; a ledger table would be architecture for a constraint that doesn't exist); explicit table DML grants migration matches hosted Supabase behavior under CLI v2.111.0 (RLS remains the authority); no in-flight guard on messages `refresh()`.

## Suggested execution order (merged across pillars)

1. **P2-12** drop the 7-day X-Card horizon — one backfill + delete one filter; the only remaining way the safety tool can silently fail.
2. **P1-1 + P2-19** kebab accessible name + menu semantics + Escape — one ~2h diff, closes the WCAG 4.1.2 failure.
3. **P2-11** errored-key reuse in `sendDiceRoll` — one branch mirroring the message-path fix.
4. **P1-2** X-Card resolution system message — only finding with a schema-adjacent change; own PR.
5. **Security P2 batch** (#1, #3, #5 SQL one-liners + pgTAP; #2 small migration; #4 one-line refine) — one chore PR.
6. **P2-6, #14, #15, #16, #17** — XS/quick batch (ToastContext memo, touch-target sweep, aria-expanded, combobox, catch-up Retry).
7. **P2-7 + #9** move the two RPC sites into hooks + validate rows + widen the oxlint guard — closes arch-20260904#P2.1 permanently.
8. **P2-8, #10, #13, #18** — opportunistic: signed-URL cache, admin row schemas, X-Card UPDATE propagation (or document reload-heals), token migration riding the next feature touch.

## GitHub issues

| Parent | Findings |
|---|---|
| [#429 Security & data integrity (2026-09-07)](https://github.com/alvarocavalcanti/ttrpgpbp/issues/429) | P2 checklist (#1–#5) |
| [#430 Architecture, performance & code quality (2026-09-07)](https://github.com/alvarocavalcanti/ttrpgpbp/issues/430) | P2 checklist (#6–#10) |
| [#431 PbP game & realtime UX (2026-09-07)](https://github.com/alvarocavalcanti/ttrpgpbp/issues/431) | P2 checklist (#11–#13) |
| [#432 Product/mobile UX & a11y (2026-09-07)](https://github.com/alvarocavalcanti/ttrpgpbp/issues/432) | P1 #433 (kebab name) · P1 #434 (X-Card player closure) · P2 checklist (#14–#19) |

P2s tracked as checklists in parent bodies (19 items). No cross-pillar merges this round.
