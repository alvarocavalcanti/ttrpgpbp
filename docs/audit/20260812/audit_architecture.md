# Architectural Audit — ttrpgpbp

**Date:** 2026-08-12 · **Scope:** `src/` (~7.4k LOC source, ~8.2k LOC tests) · **Stack:** React 19, Vite 8, TypeScript 6, Supabase (Auth + Postgres + Realtime + Edge Functions), PWA

## Executive Summary

Codebase is a clean feature-folder SPA with a **strictly acyclic** import graph (verified via full DFS — zero cycles), consistent hook-based data fetching, and strong test coverage discipline (38 test files; every non-trivial feature file has a colocated test). The architecture's weaknesses are not structural rot but **missing seams**: no data-access boundary (21 files import the Supabase client directly, 7 of them UI components), no pagination or memoization on the hot message-rendering path, and an AuthContext whose update semantics amplify every auth event into an app-wide refetch/render storm. The single highest-leverage fixes are small and cheap relative to the risk they retire.

Findings ordered by return-on-effort. Evidence cited as `file:line` throughout.

---

## P0 — High ROE, fix first

### 1. AuthContext: async work inside `onAuthStateChange` + unmemoized value + per-event refetch

**Evidence:** `src/features/auth/AuthContext.tsx:63-89` (async profile fetch inside callback), `:111-121` (inline `value={{...}}`, zero `useMemo`/`useCallback` in file), `:40-50` + `:69-82` (profile fetched twice on load), `_event` ignored at `:64`.

**Problems:**

- Supabase-js holds its internal auth lock while the callback runs; the awaited `profiles` query goes back through `getSession()` internally → **documented deadlock/hang risk**.
- Profile refetches on **every** auth event including `TOKEN_REFRESHED` (hourly + on tab refocus). Each refetch calls `setUser`/`setProfile` with new object identities.
- Downstream, `user` (object identity) sits in effect deps at `useChannel.ts:99`, `useChannels.ts:96`, `usePushNotifications.ts:92`, `useChannelNotificationPrefs.ts:60` → every token refresh tears down realtime subscriptions and refires full fetches, including the N+1 unread-count queries in `useChannels.ts:62-72`.
- Inline context value means any slice change (`error`, `profile`) re-renders **all** `useAuth` consumers — including `ProtectedRoute` → entire active route tree.

**Fix (small):** memoize `value` and the two auth functions; skip refetch unless `_event === 'SIGNED_IN'` or `user.id` changed; change downstream deps from `user` to `user?.id` (pattern already correct in `useMessages.ts:203`); move the profile fetch out of the callback (or defer with `setTimeout(0)` per Supabase guidance).

**Risk retired:** prod hang on auth refresh; hourly app-wide refetch storms; whole-tree re-renders.

### 2. `channel_members` realtime gap: INSERT/DELETE invisible

**Evidence:** `useChannel.ts:83-92` subscribes `UPDATE` only. Joins happen via RPC (`JoinChannel.tsx:63`), kicks/leaves via `MemberList.tsx:88-94, 111-115` — none propagate to other clients. Kicked user's own client keeps stale `myMemberInfo`, so the redirect guard at `ChannelView.tsx:88-90` never fires.

**Fix:** broaden the subscription to `event: '*'` on `channel_members` and handle INSERT/DELETE (or refetch members on any member event). One-line subscription change plus small handler.

**Risk retired:** kicked/left users see ghost state indefinitely; member lists desync across clients.

### 3. Unbounded, unmemoized message list — O(n·markdown) per event

**Evidence:** `useMessages.ts:95-99` fetches **all** messages, no `.limit()`/pagination. Any new message or reaction produces new `messages`/`reactionsByMessage` identities → `MessageList.tsx:47-96` re-maps everything → every `MessageItem` re-renders → full `ReactMarkdown` re-parse per item. Per render, each item also recreates its `renderers` object (`MessageItem.tsx:104-191`) and `urlTransform` (`:193-205`). Reaction events additionally `structuredClone` the entire reactions map per click (`useMessages.ts:49, 66`).

**Fix (staged, each step independent):**

1. Hoist `renderers`/`urlTransform` to module scope; wrap `MessageItem` in `React.memo`; pass stable callbacks from `ChannelView` (`handleToggleReaction` etc. currently recreated per render, `ChannelView.tsx:54-74`).
2. Replace `structuredClone` with a shallow copy of the single affected message's entry.
3. Add pagination (latest N + "load older") once channels age — defer if channels are young (mark with `ponytail:` comment).

**Risk retired:** channel view degrades linearly with age; long-running games become unusable.

---

## P1 — Structural seams worth adding

### 4. No data-access boundary: 21 direct Supabase importers, 7 are JSX components

**Evidence:** `lib/supabase.ts` singleton imported directly by 21 non-test files — channels/ alone has 12, half of them UI components (`ChannelSettings`, `MemberList`, `JoinChannel`, `ArchivedChannels`, `CreateChannelModal`, `EditCharacterModal`, `ChannelStatusBar`) issuing queries from JSX files.

**Impact:** schema changes fan out across the tree; RLS/query-policy logic is un-auditable in one place; tests must mock the client shape everywhere (see #7).

**Recommendation:** do **not** build a repository layer wholesale (overkill at 7.4k LOC). Instead enforce one rule: *queries live in hooks, not components*. Migrate the 7 component-level query sites into their feature's existing hooks. This is a mechanical, file-at-a-time refactor that yields most of the boundary benefit at a fraction of the cost.

### 5. Hand-maintained `database.ts` — silent schema drift risk

**Evidence:** `src/types/database.ts` (590 LOC) matches `supabase gen types` output shape but has no generated header, no `gen:types` npm script, no CI drift check. `has_password` appears only in Insert/Update (`database.ts:77`) — computed-column drift already present. Every domain type in the app derives from this file; realtime payloads bypass it entirely via `as Message` casts (`useMessages.ts:145, 164, 189, 192`).

**Fix:** add `"gen:types": "supabase gen types typescript --local > src/types/database.ts"`, regenerate, and add a CI check that regeneration produces no diff (fits naturally into the existing `migrate-check` job).

**Risk retired:** migrations and app types silently diverge; class of runtime-only type errors eliminated.

### 6. ChannelView: cross-feature composition hub + prop drilling

**Evidence:** `ChannelView.tsx:7-17` imports internals of 5 foreign features (chat ×3, dice, search, notifications, help). 13 props forwarded through `MessageList` (a pure pass-through layer) into `MessageItem` (`ChannelView.tsx:153-168` → `MessageList.tsx:78-93`); 7 `show*` modal booleans (`:26-34`); sidebar menu-item markup repeated 9× (`:220-303`). `MessageList.tsx` could be folded into `ChannelView` or `MessageItem` given its pass-through nature — candidate for deletion, not abstraction.

**Recommendation:** acceptable coupling today (graph is a DAG, channels is the sink). Cheapest wins: (a) stable callbacks + `memo` per finding #3; (b) extract the 9×-repeated menu item into a local subcomponent inside `ChannelView` (not shared — no second consumer exists). Skip barrel files / public-API enforcement: no reverse imports exist to protect against, YAGNI.

---

## P2 — Debt to schedule, not emergencies

### 7. Test mocking: 200+ `as any` casts, no typed Supabase mock helper

**Evidence:** `App.test.tsx` alone has 27 `as any`; `ChannelSettings.test.tsx` 22. `src/test/mocks/handlers.ts:11` is stub scaffolding ("Add other handlers as needed") — msw barely used. Supabase client refactors break tests silently until suite run.

**Fix:** one typed chainable-mock factory in `src/test/mocks/supabase.ts`, migrate incrementally. Do not expand msw usage — the direct-client mock matches the architecture better.

### 8. God-components and duplicated sub-blocks

| File | LOC | Issue |
|---|---|---|
| `MessageItem.tsx` | 478 | 4 message-type renderers; action-button bar duplicated (`:290-322` vs `:443-475`); edit form duplicated (`:258-284` vs `:402-428`); 8 of 14 props optional, callback-presence doubles as feature flag |
| `ChannelSettings.tsx` | 456 | 5 concerns; secret upsert checks error *after* empty-data branch (`:109-125`) — fragile ordering |
| `MessageComposer.tsx` | 446 | 13 `useState`s; `const payload: any` at `:124` bypasses the send signature |
| `MemberList.tsx` | 347 | Kick/Leave/Block/Away handlers ~90% identical (`:50-147`) |

**Fix:** extract per-message-type subcomponents in `MessageItem` (pays off with #3's memo); collapse MemberList handlers into one parameterized mutation helper. No new shared `<Modal>` component yet — the 8 hand-rolled shells are similar but not identical; revisit if a 9th appears.

### 9. Type-safety leaks at boundaries

`formatMessage(m: any)` (`useMessages.ts:23`), `payload.new as Message` realtime casts, 6 files with `catch (err: any)`, non-null assertions immediately after guards (`MemberList.tsx:338`, `usePushNotifications.ts:56,68`). Oxlint can catch `err: any` cheaply; the realtime casts warrant a lightweight validator only if payload drift is ever observed — defer otherwise.

### 10. Misplaced & duplicated fetch ownership

- `usePushNotifications` lives in `features/auth/` but is a notifications concern — 4 cross-feature importers (`Lobby.tsx:5`, `PermissionBanner.tsx:3`, `ChannelNotificationSettingsModal.tsx:2`, `ProfileSettings.tsx:24`). Moving it to `features/notifications/` removes the notifications→auth edge. It's also instantiated 2–4× simultaneously (Lobby + PermissionBanner mount together), each fetching prefs and `serviceWorker.ready` independently — hoist to a context or accept the duplication (low traffic, defer).
- `useAppSetting('max_channels_per_user')` fetched in both `Lobby.tsx:19` and `CreateChannelModal.tsx:17`; `AdminView.tsx:87` hardcodes the same fallback (`10`) as `constants.ts:4` — two sources of truth.
- Redundant refetch-after-mutation atop working realtime: `ChannelStatusBar.tsx:39`, `MemberList.tsx:68,142`, `EditCharacterModal.tsx:39`, `ChannelSettings.tsx:129` — each also bumps `last_read_at` as a side effect. Only DELETE paths actually need manual refetch (see #2).
- No realtime or refetch-on-focus for the channel list: unread counts, ordering, and the Lobby app badge go stale until remount.

### 11. Minor hygiene

- `review.json` tracked in git (PR-tooling payload) — delete. `whatsapp_qr.log` (24 KB) untracked leftover — delete locally.
- `window.confirm/prompt/alert` at 8 sites (`MessageItem.tsx:87,143,149`, `MemberList.tsx:57,82,105,132`, `ChannelSettings.tsx:179`, `ProfileSettings.tsx:64`) — blocking native dialogs in a PWA; replace with a small inline confirm when one is next touched, not as a sweep.
- `sessionStorage` write-then-read during render in `ProtectedRoute.tsx:35-39` — move to effect or handler.
- Dead export: `useChannelNpcs.addNpc` (`useChannelNpcs.ts:37-41`) referenced only by tests — delete both.
- No state reset on `channelId` change (`useMessages.ts:86-91`, `useChannel.ts:21-26`, `useChannelNpcs.ts:11-16`) — masked today by Lobby-interposed navigation; one-line reset per hook if deep-linking between channels is ever added.
- `IconPicker` fires Iconify API per keystroke with no debounce (`IconPicker.tsx:28-46`) — reuse the existing `useDebounce`.
- Non-transactional multi-writes: `CreateChannelModal.tsx:55-87` (acknowledged in comment), `useMessages.ts:240-268` active-player reset-then-set — move to an RPC if partial-failure cleanup is ever observed in prod.
- Stale profile after edit: `ProfileSettings.tsx:39-42` updates the row but AuthContext has no refetch path — AppNav shows stale name/avatar until reload.
- `src/sw.ts` push/notificationclick handlers untested — only meaningful coverage gap.

---

## What's sound (do not touch)

- **Dependency graph:** verified acyclic; direction strictly `features → contexts/hooks/lib/types`. channels is a pure sink; dice and auth are clean leaves.
- **Feature-folder layout** with colocated tests is consistent and discoverable.
- **Realtime subscription cleanup** is correct in all 5 subscription sites (style inconsistent — `unsubscribe()` vs `removeChannel` — cosmetic only).
- **Realtime coverage choices** are mostly right: messages/reactions/channel live; lists fetch-only. Gaps are #2 and #10, not the pattern.
- **game-systems/ stub:** hardcoded single-system registry (`index.ts:11-13`) is the correct amount of architecture for one game system. Do not build a plugin loader.
- **Test ratio:** test LOC ≥ source LOC; every non-trivial file has a test.

## Risk Register (top 5)

| # | Risk | Likelihood | Impact | Retired by |
|---|---|---|---|---|
| R1 | Auth-lock deadlock / refetch storm on token refresh | Medium | High (app hang) | #1 |
| R2 | Message list perf collapse as channels age | High (over time) | High | #3 |
| R3 | Schema/types drift ships runtime errors | Medium | Medium | #5 |
| R4 | Member-state desync (kicks, joins) | High | Medium | #2 |
| R5 | Schema change requires 21-file sweep | Low | Medium | #4 |

## Suggested execution order

1. **#1 + #2** — one PR each, both small, both retire prod-facing risk.
2. **#3 step 1–2** (memo + stable callbacks) — half a day, biggest perf win.
3. **#5** — `gen:types` script + CI check, ~1 hour.
4. **#4** — hook-only query rule, enforced by oxlint `no-restricted-imports` for components, migrated opportunistically.
5. Backlog: #7–#11 as touched.
