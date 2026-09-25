# Architecture, Performance & Code Quality Audit — 2026-09-25

## Audit Prompt

> You are a Staff Software Engineer writing ONE audit report for a pre-public-release FINAL audit. READ-ONLY: do NOT modify code, do NOT run `gh`, do NOT run tests/builds/DB/`supabase`. Re-verify each 2026-09-20 architecture finding in current source (clipboard helper extraction, `Date.now()` in `AdminView` render, the admin channel-header over-fetch, and the react-compiler warning backlog) and mark it [FIXED]/[OPEN]/[PARTIAL] with `file:line` evidence; audit the NEW surface from the ~20 PRs since (PWA update/reload lifecycle, dice-roll favorites, image upload error handling, admin DM bubble, analytics gtag queueing, migration-order guard, terms acceptance); judge release-readiness impact. Every finding cites `file:line`; severity P0/P1/P2; tagged [NEW]/[OPEN]/[INTENTIONAL]. Write to `docs/audit/20260925/audit_architecture.md`.

**Date:** 2026-09-25
**Scope:** `src/` ≈ 20.7k LOC source (non-test) + ≈ 32.6k LOC tests (≈ 53.3k total); 120 migrations; new surface: terms acceptance + re-consent gate, dice-roll favorites, admin read-only channel view, un-scanned image upload (`upload-image`), PWA build-id handshake/self-heal, analytics gtag queue, migration-order guard, roster ordering, overflow-measure hook.
**Verification commands run + results:**

- Orchestrator-run suite (not re-run, read-only contract): `tsc` 0 errors; `oxlint` 0 errors / **54 warnings**; vitest **1955 passed / 146 files**; coverage **93.3 statements / 85.46 branches / 90.84 functions / 96.07 lines**; build passed (precache **45 entries / 1759.55 KiB**, >500 kB chunk warning); `lint:md` 0; cspell 0; pgTAP 411 PASS; Playwright E2E 7 passed.
- Re-run here for evidence: `npx oxlint` (0 errors, 54 warnings — full rule composition captured, see P2 #1). All other claims verified by reading files / grep against `src/`, `supabase/functions/`, `scripts/git/`, `.github/workflows/`, `playwright.config.ts`, `.oxlintrc.json`. No tests, builds, DB, or git commands run.

---

## Executive Summary

All four 2026-09-20 architecture P2s are resolved in code: the clipboard fallback is extracted into `src/lib/clipboard.ts` and used by both former call sites, the render-time `Date.now()` count in `AdminView` is gone (the counts now come from `useAdminData`'s effect), and the admin channel-header over-fetch is now explicitly documented as an accepted tradeoff with a named ceiling. The one prior finding that stays open is the react-compiler warning backlog (issue #567): it grew from 45 to **48 non-test react warnings** (+3 on the app surface), with `set-state-in-effect` now 65% of the total.

The new surface is disciplined. The terms-acceptance path is layered and fail-closed (`ProtectedRoute` holds, never renders the `Outlet`, while a stamp is pending, and offers retry-not-reaccept on failure); dice favorites carry owner-scope and in-flight-delta guards; the `upload-image` rewrite retained the `#593` CORS fix (`x-client-info`); the new migration-order guard is wired into CI and `npm run check:migration-order`; and the analytics gtag queue mirrors Google's snippet correctly. Hook-only data access still holds absolutely — **zero** non-test `.tsx` files import the Supabase client, and **zero** `supabase.from(`/`.rpc(` calls exist outside hooks. Chat hot-path memoization is unchanged (no new unstable props on the `MessageList → MessageItem` edge).

No P0, no P1. What remains is a six-item P2 tail: the open compiler-warning backlog, a PWA-update verification gap (the cluster's WebKit/Android branches cannot be exercised by the Chromium-only E2E suite), duplicated CORS/origin helpers across the edge functions, new auth/terms code bypassing the existing `safeStorage` wrapper, a duplicated dice-row schema, and two residual impure `Date.now()` render reads. None blocks a gated public release; all are cheap.

---

## Prior findings disposition

| Prior ID | Status | Evidence (current state) |
|---|---|---|
| #4 clipboard copy duplicated between `ChannelSettings` / `AdminView` | **[FIXED]** | `src/lib/clipboard.ts:5-27` exports `copyToClipboard` (secure-context branch + `execCommand` fallback + `isConnected` cleanup); `src/features/channels/ChannelSettings.tsx:5,124` and `src/features/admin/AdminView.tsx:9,298` both call it. Unit test `src/lib/clipboard.test.ts`. |
| #5 `Date.now()` during render in `AdminView` | **[FIXED]** | The inline `sevenDaysAgo`/`newUsers`/`newChannels` computation is gone; the cutoff now runs inside the data effect (`src/features/admin/useAdminData.ts:120`) and the values are state (`:104-105`). AdminView reads `newUsers`/`newChannels` from the hook (`AdminView.tsx:128,357,368`). Residual impurity in the `userStatus` helper is tracked as a new finding below. |
| #6 `useAdminChannelMessages` over-fetches full `admin_list_channels` for one header | **[FIXED]** (accepted tradeoff) | Still calls `admin_list_channels` (`src/features/admin/useAdminChannelMessages.ts:150`) but the choice is now documented with the exact ceiling and the upgrade path: "Intentional at current admin scale … swap to a scoped `admin_get_channel(p_channel_id)` RPC if channel counts grow" (`:52-56`). Option (b) of the prior fix. |
| #7 react-compiler warning backlog | **[OPEN]** | `npx oxlint` → 48 non-test react warnings + 1 jsx-a11y (was 45 react). Tracked as issue #567. Composition and trend analyzed in P2 #1. |

---

## P0

None. No correctness or security defect found in this pillar's scope. (The un-scanned upload decision, its CORS, and its DB write boundary were reviewed for architecture soundness; detail ownership sits with the security/legal pillars.)

## P1

None. Every significant gap from the 2026-09-07 and 2026-09-20 passes is remediated (see disposition table); the new surface introduces nothing at this severity. The PWA-update regression cluster is a real signal but its code is defensively layered and unit-tested — the remaining gap is verification, filed as P2 #2 rather than a launch blocker.

## P2

### 1. React-compiler warning backlog is still open and still growing [OPEN `arch-20260920#P2.4`, issue #567]

**Evidence:** `npx oxlint` exit 0 with 54 warnings (0 errors). Composition:

- `react(set-state-in-effect)` — **35** (65%), e.g. `src/features/chat/MessageComposer.tsx:73,156`, `src/features/admin/useAdminChannelMessages.ts:123,175,215`, `src/hooks/useSignedImageUrl.ts:189`, `src/features/admin/UserDetailModal.tsx:59,83`.
- `react(refs)` — **7**, e.g. `src/features/chat/useMessages.ts:101,106,137`, `src/features/chat/MessageList.tsx:91`.
- `react(preserve-manual-memoization)` — **5**, e.g. `src/features/channels/ChannelView.tsx:59,240`, `src/features/auth/AuthContext.tsx:144`.
- `react(purity)` — **1** (`src/hooks/usePwaInstall.ts:61`, see P2 #6).
- Non-app-surface: `react(immutability)` ×1 and `react(globals)` ×1 in test files, `vitest(valid-expect)` ×3 in `scripts/git/check-types-staged.test.ts:87,149,165` (false positives — those calls use Vitest's supported `expect(actual, message)` form), `jsx-a11y(no-noninteractive-tabindex)` ×1 (`src/features/chat/MessageList.tsx:438`).

**Problem:** Non-test react warnings rose 45 → **48**; the app-surface growth is modest and comes from the new hooks (`useAdminChannelMessages`, `useDiceFavorites`, overflow hook), while the rest of the increase (5) is test/script files newly surfaced by the `vitest` plugin. The rule set is still not declared in `.oxlintrc.json:2-17`, so these remain default warnings. Because 65% of the backlog is one rule (`set-state-in-effect`) that the house style uses deliberately (derive-from-fetch effects), a genuinely new warning (like the purity one that moved off `AdminView`) is indistinguishable from the noise. This is exactly the "decide the direction" call the prior round asked for, now overdue at 1.0.

**Fix:** Make the call: (a) adopt React Compiler, delete the manual `useMemo`/`useCallback`/ref-stability scaffolding, and resolve the warnings at source; or (b) declare the accepted rules in `.oxlintrc.json` (warn → off for `set-state-in-effect`/`refs`/`preserve-manual-memoization` with a comment naming the house style) so the remaining warnings (purity, globals, immutability) read as regressions. Either way the count reaches zero-as-signal.

**Effort:** M for (a); XS for (b).

### 2. PWA update lifecycle is a regression hot spot whose WebKit/Android branches have no automated verification [NEW]

**Evidence:** The lifecycle is implemented across `src/lib/pwaUpdate.ts:59-119` (build-id handshake + one-per-session self-heal), `:168-219` (single-flight reload waiting for the worker's `activated` state), `src/lib/hardReload.ts:12-32` (Safari-safe same-URL navigation), and `src/sw.ts:28-41` (worker-driven reload on `activate`). Unit coverage is genuinely strong (`src/lib/pwaUpdate.test.ts` exercises the handshake, every `reloadToUpdate` branch, and every self-heal path). **But** the E2E suite is `playwright.config.ts:34-38` — a single `chromium` project — running three specs (`tests/e2e/core-journey.spec.ts`, `failure-paths.spec.ts`, `unread-whisper.spec.ts`) with no PWA-update spec; CI invokes it as `npx playwright test` (`.github/workflows/ci.yml:151-154`). The code paths that caused the four 6-day regressions (`#554` macOS Safari `reload()` no-op, `#601` Android WebAPK stale shell) only run on WebKit/Android, and no release-smoke document exists under `docs/`.

**Problem:** The very branches engineered for Safari and Android cannot be exercised by any automated or documented check, so the only detection channel is production — which is how four bugs shipped in six days. The unit tests prove the pure logic; they cannot prove `hardReload`/`controllerchange`/worker-`navigate` behavior on real engines.

**Fix:** Cheap first: add `docs/RELEASE_SMOKE.md` with the three manual checks that map to the historical bugs (macOS Safari PWA: banner → Reload lands on new build; Android install: update survives backgrounding; offline boot serves the shell), gated into the release routine. Better: add a `webkit` Playwright project and one spec that serves a bumped `__APP_BUILD__` build and asserts banner → reload. If the harness cost is too high for 1.0, the documented checklist is enough.

**Effort:** S (checklist) / M (WebKit E2E).

### 3. CORS/origin helpers are triplicated across the edge functions [NEW]

**Evidence:** `DEFAULT_ALLOWED_ORIGINS` + `isAllowedOrigin` exist independently in `supabase/functions/upload-image/logic.ts:6-16`, `supabase/functions/delete-account/logic.ts:23-37`, and `supabase/functions/push-notifications/filter.ts:265-276`; `CORS_ALLOWED_HEADERS` + `buildCorsHeaders` are duplicated between `upload-image/logic.ts:22-40` and `delete-account/logic.ts:43-59`. The comment admits the coupling: "Mirrors delete-account/logic.ts" (`upload-image/logic.ts:5`).

**Problem:** Issue #593 was exactly a drift bug — the Supabase browser client added `x-client-info`, and every function had to be patched to echo it or its preflight broke. With three copies of the origin list and two copies of the header list, the next client header (or a new preview-origin rule) has the same failure mode: fixed in one function, forgotten in the others. The `push-notifications` copy already lacks the `CORS_ALLOWED_HEADERS` constant shared by the other two, which is the drift starting.

**Fix:** Move the origin/header/`buildCorsHeaders` helpers into `supabase/functions/_shared/cors.ts` and import from each function's `logic.ts` (Supabase bundles `_shared` into each function). Keep the per-function `ALLOWED_ORIGINS` env override at the call site.

**Effort:** S (one shared module + three import swaps; existing logic tests move with the helper).

### 4. New auth/terms code bypasses the existing `safeStorage` wrapper [NEW]

**Evidence:** `src/lib/safeStorage.ts:1-26` provides no-throw `safeGetItem`/`safeSetItem`/`safeRemoveItem` precisely because "localStorage throws … in Safari private mode", and its only non-test importer is `src/features/chat/MessageComposer.tsx`. The new terms/auth surface reads and writes storage directly: `src/features/auth/LoginPage.tsx:71,89,97-101`, `src/features/auth/AuthContext.tsx:96-97,152,170,213-214`, `src/components/ProtectedRoute.tsx:65`.

**Problem:** On a blocked-storage browser the checkbox write at `LoginPage.tsx:97-98` can throw inside the `onChange` handler, leaving `TERMS_AGREED_KEY` unset — the user checks the box but is then routed to the re-consent gate. On the redirect path, `sessionStorage.setItem('auth_redirect', from)` at `LoginPage.tsx:89` sits before `signInWithGoogle()`, so a throw there aborts sign-in. The project already decided the invariant ("every call site routes through these no-throw wrappers"); the new code silently opts out. (Note: pre-existing `useTheme.ts:12,32` and `PermissionBanner.tsx:12,20` do the same, so this is a consolidation gap, not a regression introduced this wave.)

**Fix:** Route the new call sites through `safeStorage` (`safeGetItem`/`safeSetItem`/`safeRemoveItem`), then migrate `useTheme`/`PermissionBanner` opportunistically. One import swap each; no behavior change in normal browsers.

**Effort:** XS.

### 5. Dice-roll row schema and its rationale comment are duplicated [NEW]

**Evidence:** `src/features/dice/useRecentRolls.ts:8-11` and `src/features/dice/useDiceFavorites.ts:9-12` each declare an identical `z.object({ notation: z.string(), created_at: z.string() })`, and both carry a near-verbatim comment ("the roller renders tappable chips from these rows, so only the fields it uses are trusted…"). A richer, different schema lives one file over at `src/features/dice/useRollHistory.ts:13-21`.

**Problem:** Two copies of the same trust-boundary schema in sibling files will drift independently; a field added to one (or a stricter type) leaves the other permissive. The prior clipboard finding was the same class and was closed by extraction; this is the same opportunity in the dice feature.

**Fix:** Export the shared schema from a single dice module (e.g. `useRecentRolls.ts` or a small `rollSchemas.ts`) and import it in both hooks. `useRollHistory`'s schema stays separate (it is genuinely richer).

**Effort:** XS.

### 6. Impure `Date.now()` still read during render in two places [NEW]

**Evidence:** `npx oxlint` `react(purity)` → `src/hooks/usePwaInstall.ts:61` (`canShow = !!deferredPrompt && Date.now() - dismissedAt > DISMISS_COOLDOWN_MS`). The same pattern survives indirectly in `src/features/admin/AdminView.tsx:93` (`userStatus` computes `Date.now() - lastLogin`), called from the render-time filter at `:329`; oxlint does not flag it because the call is one function deep.

**Problem:** The prior round removed the flagged `AdminView` instance, but the class is not gone. Both are display-only (install-banner cooldown, "Inactive" filter), so the blast radius is nil; still, an impure render means the derived value can shift between renders for unchanged inputs, and it keeps the codebase one warning away from a clean purity signal (see P2 #1).

**Fix:** Snapshot the clock once per data load: compute the cutoff in the effect that populates the data (as `useAdminData.ts:120` already does for `newUsers`) and pass it into the helper, or memoize a single `now` for the render. For `usePwaInstall`, capture `Date.now()` when the state changes rather than during render.

**Effort:** XS.

---

## What's sound — do not touch

- **Prior-fix invariants all hold.** Clipboard extracted and adopted; `AdminView` render-time `Date.now()` removed; admin header over-fetch documented with a named ceiling; `ToastContext` memo, hook-only data access, signed-URL session cache, Zod at every admin/RPC trust boundary, and the widened oxlint guard all verified in code (see disposition).
- **Hook-only data access still absolute.** `.oxlintrc.json:25-37` bans `**/lib/supabase` in every `src/**/*.tsx`; grep finds **zero** non-test `.tsx` imports of the client and **zero** `supabase.from(`/`.rpc(` in component files. Every query is inside a hook or `lib/`. No `any` in non-test `src` (grep clean).
- **Chat hot path unchanged.** `MessageItem` memo (`MessageItem.tsx:198`); the `MessageList.tsx:485-503` render site passes only stable references and no inline closures; `ChannelView` handlers stay `useCallback` (`ChannelView.tsx:50,236`); the one memoization warning at `ChannelView.tsx:59` is the compiler's inferred-dependency mismatch (`user` vs `user?.id`) against already-correct manual deps, not a stale closure.
- **Terms acceptance / re-consent is fail-closed and tested.** `ProtectedRoute.tsx:49-99` withholds the `Outlet` while a stamp is pending, shows retry-not-reaccept on failure (`:66-88`), and falls to `ReConsentGate` only when the current version lacks device checkbox evidence; `AuthContext.tsx:168-187` stamps only on matching checkbox evidence and guards re-entry with a per-user+version key; `ReConsentGate.test.tsx` covers the gate.
- **Dice favorites and recent rolls are race-hardened.** `useDiceFavorites.ts:21-77` scope-guards state, reconciles in-flight toggles via a delta ref, rolls back only the failed notation, and defers to the DB trigger cap; `useRecentRolls.ts:31-53` drops malformed rows and preserves newer local entries over a stale server snapshot.
- **Admin read-only channel view is generation- and sequence-guarded.** `useAdminChannelMessages.ts:72-77,104-105` discard stale generations and superseded requests; rows are Zod-parsed (`:9-34`); older pages prepend without clobbering (`:237-241`) and scroll anchoring is preserved in the view.
- **Image upload boundary kept its fixes.** `upload-image/logic.ts:22-23` still echoes `x-client-info` (#593 not regressed); `isJpegSignature` (`:89-91`) and `evaluateUploadGuards` (`:66-83`) parse defensively and fail closed; storage writes stay service-role-only (`upload-image/index.ts:121-133`).
- **Analytics gtag fix is correct.** `src/lib/analytics.ts:41-43` mirrors Google's snippet (`arguments`, not an array), `send_page_view` is disabled (`:48`) so the manual `RouteTracker` page_view is the only one, and the CSP now allows the GA4 collection hosts (`public/_headers:2`: the analytics domain in `connect-src` and the Tag Manager host in `script-src`).
- **Migration-order and typegen guards are wired.** `scripts/git/check-migration-order.sh:14-68` compares new migrations against the base ref's max timestamp; `package.json:14` exposes it; CI runs it (`ci.yml:23`) and the local pre-commit/pre-push hooks exist. Types-staged guard has its own test suite.
- **Test-suite health.** 1955 tests / 146 files; coverage up across every metric (93.3 / 85.46 / 90.84 / 96.07); the PWA handshake/reload module has exhaustive unit coverage; `scripts/git/*` guards are unit-tested; E2E seeds deterministically via the Admin API and is CI-gated.
- **Build/PWA config unchanged in shape.** Precache glob still image-free and scoped (`vite.config.ts:52-59`); the 45-entry / 1759 KiB precache (+26 KiB, +2 entries) is the documented help/feature growth, not a regression; the >500 kB chunk warning is pre-existing and unaddressed by design.

## Intentional exclusions

Carried over from `docs/audit/20260920/INDEX.md` (verified deliberate — do not fix): free-form initiative, public-only dice, no hidden rolls, single timeline, no threads/OOC split, email notifications future, no presence indicators, soft-delete-only messages, command-only `system`/`dice_roll` types, offline = cached shell, `verify_jwt=false` push with shared secret, client-side PBKDF2, label-only mimetype, 32–36px desktop hover-row convention, sidebar-only tools, `created_at`-only INSERT catch-up cursor, unpaged reaction map, Iconify external API, admin optimistic updates without server refetch, `gm_id` transfer rules, `admin_list_channel_members` skipping per-read audit, image-JPEG re-encode tradeoff, `useChannelMedia` `MAX_PAGES=50` offset cap.

New this round (verified deliberate — do not "fix"):

- **No React Compiler yet.** Manual `useMemo`/`useCallback`/ref-stability is the current house style; the warning backlog is P2 #1 (a direction decision), not a defect to silence piecemeal.
- **Un-scanned image uploads.** `upload-image` stores without content scanning and relies on admin-reviewed player reports, because the only scanner provider is paid and the app takes no revenue (#600). Re-adding a paid scanner is out of scope; the legal pillar owns the disclosure.
- **`admin_list_channels` header over-fetch** (prior #6) is accepted at current admin scale with a documented ceiling.
- **`useAdminChannelMessages` has no realtime** — the admin refetches manually; deliberate at admin scale.
- **`useElementOverflow` drops the `-webkit-line-clamp` inline to measure** (`useElementOverflow.ts:34-36`) — restore-in-same-task trick, commented with the clone-based upgrade path.
- **Chromium-only E2E** as the current baseline; P2 #2 proposes the WebKit/manual addition rather than demanding it.
- **`safeStorage` is barely used** (P2 #4) — a consolidation gap; `useTheme`/`PermissionBanner` predate the helper and are not regressions.

## Suggested execution order

1. **P2 #1** make the React Compiler direction call (adopt vs declare-and-silence) — clears the only growing signal and the largest source of lint noise.
2. **P2 #2** add the PWA release-smoke checklist (cheap) or the WebKit update spec (thorough) — closes the verification gap on the 4-bug cluster.
3. **P2 #3** extract `supabase/functions/_shared/cors.ts` — prevents a repeat of the #593 drift across three functions.
4. **P2 #4 + #6** route auth/terms storage through `safeStorage`; snapshot the two `Date.now()` render reads — mechanical, removes the last purity warning.
5. **P2 #5** deduplicate the dice row schema — opportunistic, next dice touch.
