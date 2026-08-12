# Audit Report — Performance, Security & Code Quality

**Project:** RoleByPost · **Date:** 2026-08-12 · **Findings:** 42

> **Audit Prompt:**
> Act as a Lead Systems & Security Engineer. Audit this codebase strictly for performance bottlenecks, code quality, and security vulnerabilities.
>
> Focus on:
>
> 1. Performance Bottlenecks: Expensive operations, unoptimized loops, memory leaks, redundant network requests, or missing memoization/caching.
> 2. Security & Data Integrity: Improper input validation, weak error handling, exposed sensitive keys/data, or potential injection vulnerabilities.
> 3. Language & Framework Best Practices: Non-idiomatic patterns, type safety weaknesses, and missed framework capabilities.

---

## 🔴 CRITICAL (5)

### C1. Unsalted SHA-256 for channel access passwords

**File:** `src/lib/crypto.ts:1-6` · **Category:** Security / Code Quality

**Not user auth** — user login is Google OAuth only (no issue there). This affects optional channel access passwords (set during channel creation, used when joining via `join_channel` RPC). SHA-256 with zero salt and iterations. Trivially rainbow-tabled. GPU brute-force at billions/sec. RPC does exact `=` hash comparison against `channel_secrets.password_hash`.

```ts
// BEFORE
export async function hashPassword(password: string): Promise<string> {
  const encoder = new TextEncoder()
  const data = encoder.encode(password)
  const hash = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('')
}

// FIX: PBKDF2 with 210k+ iterations + per-password random salt
export async function hashPassword(password: string): Promise<{ hash: string; salt: string }> {
  const encoder = new TextEncoder()
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const key = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits'])
  const hash = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations: 210000, hash: 'SHA-256' }, key, 256)
  const hashHex = Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('')
  const saltHex = Array.from(salt).map(b => b.toString(16).padStart(2, '0')).join('')
  return { hash: hashHex, salt: saltHex }
}
```

Update `join_channel` RPC to use a `verify_channel_password` SECURITY DEFINER function instead of raw `=` comparison.

---

### C2. AuthContext value not memoized — triggers app-wide re-render cascade

**File:** `src/features/auth/AuthContext.tsx:111-120` · **Category:** Performance

New `value` object literal on every state update. Any change to any of 5 state values re-renders every `useAuth()` consumer (entire app).

```tsx
// FIX
const value = useMemo(() => ({
  session, user, profile, loading, error,
  signInWithGoogle, signOut,
}), [session, user, profile, loading, error, signInWithGoogle, signOut])
```

---

### C3. MessageList — no virtualization (mounts ALL messages into DOM)

**File:** `src/features/chat/MessageList.tsx:46-96` · **Category:** Performance

Every message mounts unconditionally via `.map()`. Each `MessageItem` renders `ReactMarkdown` (parses AST internally). 500 messages = 500 `ReactMarkdown` instances. Memory grows unbounded, scroll degrades linearly.

**Fix:** Install `react-virtuoso` and replace the `.map()` with `<Virtuoso data={messages} ... itemContent={...} />`. Renders only ~15-20 viewport messages.

---

### C4. useChannels — N+1 database queries for unread counts

**File:** `src/features/channels/useChannels.ts:47-78` · **Category:** Performance

After fetching channels, maps over each to make a separate `supabase.from('messages').select('*', { count: 'exact' })` for unread counts. 15 channels = 16 HTTP requests to PostgREST.

**Fix:** Create a single database function `get_user_channels_with_unread(user_id)` with a correlated subselect. Call via `supabase.rpc()`. One HTTP request.

```sql
CREATE OR REPLACE FUNCTION get_user_channels_with_unread(user_id uuid)
RETURNS TABLE(channel_id uuid, channel_name text, unread_count bigint) AS $$
  SELECT c.*, cm.*,
    COALESCE((SELECT count(*) FROM messages m
      WHERE m.channel_id = cm.channel_id AND m.created_at > cm.last_read_at
        AND m.sender_id != user_id AND m.is_deleted = false), 0) as unread_count
  FROM channel_members cm JOIN channels c ON c.id = cm.channel_id
  WHERE cm.user_id = user_id AND c.is_archived = false
  ORDER BY COALESCE(c.last_message_at, c.created_at) DESC
$$ LANGUAGE sql STABLE;
```

---

### C5. useMessages — fetches entire message table, no pagination

**File:** `src/features/chat/useMessages.ts:93-99` · **Category:** Performance

No `.limit()` or `.range()` on message fetch. 10,000+ messages in a channel = megabyte JSON payload, 10,000 `formatMessage` calls, infinite memory growth. Risks tab crash on low-memory devices.

**Fix:** Cursor-based pagination — fetch latest 50, load older pages on scroll-up via `IntersectionObserver` or `react-virtuoso`'s `startReached`.

---

## 🟠 HIGH (10)

### H1. profiles table readable by all authenticated users

**File:** `supabase/migrations/20240801000000_init_schema.sql:17-18` · **Category:** Security

```sql
CREATE POLICY "Profiles are viewable by everyone" ON profiles FOR SELECT USING (true);
```

Any authenticated user can enumerate all profiles including email, display_name, avatar_url. Never dropped.

**Fix:** Restrict to `USING (id = auth.uid())`. Create SECURITY DEFINER functions for cross-user name lookups needed by other RLS policies.

---

### H2. Edge function: `verify_jwt = false` + open CORS

**Files:** `supabase/config.toml:15`, `supabase/functions/push-notifications/index.ts:7` · **Category:** Security

Unauthenticated edge function with `Access-Control-Allow-Origin: *`. Anyone can invoke the push notification endpoint.

**Fix:** Set `verify_jwt = true` in config. Restrict CORS to deployed domain. Validate JWT belongs to a channel member in the function body.

---

### H3. Edge function leaks internal errors to callers

**File:** `supabase/functions/push-notifications/index.ts:223` · **Category:** Security

`JSON.stringify({ error: err.message })` exposes DB errors, runtime messages, stack traces.

**Fix:** Return generic `{ error: 'Internal server error' }`. Log `err.message` server-side only.

---

### H4. Edge function: untrusted payload drives service-role DB queries

**File:** `supabase/functions/push-notifications/index.ts:27-28` · **Category:** Security

Function accepts `payload.record`, `payload.table` from request body and queries DB with service role. Enables enumeration of channels, profiles, push subscriptions.

**Fix:** With `verify_jwt = true`, validate JWT belongs to a member of the target channel. Accept only webhook-triggered payloads (not direct invocation), or use shared HMAC secret.

---

### H5. MessageItem — missing React.memo (largest source of wasted renders)

**File:** `src/features/chat/MessageItem.tsx:37` · **Category:** Performance

Plain function component with 12+ props, no `React.memo`. Every `ChannelView` re-render (every realtime event) re-renders every mounted `MessageItem` — even when the specific message hasn't changed.

```tsx
// FIX
export const MessageItem = React.memo(function MessageItem({ message, ... }: MessageItemProps) {
  // ... existing body
})
```

Must pair with `useCallback` on handler props in `ChannelView` (see H9).

---

### H6. Scroll hijacking — auto-scroll fires on every update

**File:** `src/features/chat/MessageList.tsx:31-35` · **Category:** Performance

`scrollIntoView({ behavior: 'smooth' })` fires on every `messages` array change. If user is reading older messages, viewport gets yanked to bottom. Smooth animation triggers layout/reflow every frame.

**Fix:** Only auto-scroll when user was already near bottom (scroll container ref + `isNearBottom` check). Use `behavior: 'auto'` for realtime updates.

---

### H7. toLocaleDateString in render loop (400+ calls per render)

**File:** `src/features/chat/MessageList.tsx:47-56` · **Category:** Performance

Inside `.map()`, every message computes `toLocaleDateString()` (expensive ICU locale lookup). 200 messages = ~400 calls per render.

**Fix:** Precompute dates with `useMemo` into a `Map<string, string>`. Inside map: `const currentDate = dateCache.get(message.id)!`.

---

### H8. MessageItem renderers object recreated every render

**File:** `src/features/chat/MessageItem.tsx:104-191` · **Category:** Performance

`renderers` and `urlTransform` are fresh object/function references every render. `ReactMarkdown` sees new `components` prop and re-parses markdown AST even when content unchanged.

```tsx
// FIX: module-level or useMemo
const renderers = useMemo(() => ({
  a: ({ href, children, ...props }: any) => { /* ... */ },
  img: ({ src, alt, ...props }: any) => { /* ... */ },
}), [onRollDice, gameSystem, members, currentUserId])
```

---

### H9. ChannelView — handlers not wrapped in useCallback

**File:** `src/features/channels/ChannelView.tsx:54-74` · **Category:** Performance

`handleJumpToMessage`, `handleReply`, `handleToggleReaction` are plain function declarations. Each parent re-render creates new refs, defeating `React.memo` on `MessageItem`.

**Fix:** Wrap all three in `useCallback` with correct dependency arrays.

---

### H10. Non-GM clients subscribe to safety card events

**File:** `src/features/channels/useSafetyCardEvents.ts:16-29` · **Category:** Performance

`isGM` check is inside the callback, not on the subscription. Non-GM clients still open Realtime channels, receive broadcasts, run callbacks (which no-op). 5 non-GM players = 5 wasted Realtime channels.

**Fix:** Gate the entire subscription: `if (!channelId || !isGM) return` before `supabase.channel(...)`.

---

## 🟡 MEDIUM (16)

### M1. Missing strict TypeScript

**File:** `tsconfig.app.json:2-23` · **Category:** Code Quality

No `strict: true`, no `strictNullChecks`, no `noImplicitAny`. Most fundamental TS safety net absent despite code written as if strict mode were on.

**Fix:** Add `"strict": true` to `compilerOptions`. Fix resulting type errors (~40-80).

---

### M2. No ErrorBoundary anywhere

**File:** Missing from `src/` · **Category:** Code Quality

Zero `ErrorBoundary` components. Single render crash in any child takes down entire React tree — white screen.

**Fix:** Add `src/components/ErrorBoundary.tsx`, wrap at router level and optionally per-feature.

---

### M3. `any` types for core domain objects

**File:** `src/types/database.ts:154,172,190` · **Category:** Code Quality

`channel_members.attributes` typed as `any` in Row, Insert, Update. Propagates to all consumers.

**Fix:** Define as `Record<string, number>` or game-system-specific attributes type.

---

### M4. Missing Content-Security-Policy

**File:** `index.html` · **Category:** Security

No CSP meta tag or server header. Defense-in-depth against XSS is React's JSX escaping only.

**Fix:** Add CSP `<meta>` tag to `<head>`: `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self' https://*.supabase.co; frame-src 'none';`

---

### M5. Message content in push notification body

**File:** `supabase/functions/push-notifications/filter.ts:89-91` · **Category:** Security

Push body shows full message content on lock screen. Privacy leak for whispers and private channels.

**Fix:** Truncate to ~100 chars or use `'New message from X in channel Y'` without content.

---

### M6. Weak invite code entropy (32 bits)

**File:** `src/features/channels/CreateChannelModal.tsx:52` · **Category:** Security

`crypto.randomUUID().split('-')[0]` = 8 hex chars = ~4.3B combinations. Enumeration feasible for passwordless channels.

**Fix:** Use full UUID or at least 2 segments: `.split('-').slice(0,2).join('')`.

---

### M7. useSearch — race condition, no AbortController

**File:** `src/features/search/useSearch.ts:33-39` · **Category:** Performance

No `AbortController` on search fetches. Rapid typing can produce stale-result overwrite (fetch #2 completes before fetch #1).

```tsx
// FIX
useEffect(() => {
  const controller = new AbortController()
  // ...
  await supabase.from('messages').select(...).abortSignal(controller.signal)
  return () => controller.abort()
}, [debouncedTerm, channelId])
```

---

### M8. useMessages — structuredClone for shallow state

**File:** `src/features/chat/useMessages.ts:49,66` · **Category:** Performance

`structuredClone(map)` deep-clones entire reactions map for every reaction toggle. For frequent clicks, wasteful.

**Fix:** Shallow spreads — only clone the modified message's reaction array.

---

### M9. useMessages — two Realtime channels instead of one

**File:** `src/features/chat/useMessages.ts:133-196` · **Category:** Performance

Separate `.channel()` registrations for `messages` and `message_reactions`. Double join/leave/heartbeat overhead.

**Fix:** Merge into single channel with multiple `.on()` filters.

---

### M10. setSearchParams on every keystroke

**File:** `src/App.tsx:50-56` · **Category:** Performance

Search input calls `setSearchParams` on every keystroke — 5 URL updates and re-render cascades per "dragon" typed.

**Fix:** Local state + `useDebounce` before syncing to URL search params.

---

### M11. MemberList — global click listener, no containment check

**File:** `src/features/channels/MemberList.tsx:29-33` · **Category:** Performance

`document.addEventListener('click', ...)` fires on every click app-wide with no early containment check.

**Fix:** Use `mousedown` + ref-based `contains()` check (matches `AppNav` pattern).

---

### M12. Missing React.memo on MemberList

**File:** `src/features/channels/ChannelView.tsx:210-218` · **Category:** Performance

`MemberList` re-renders on every realtime event even when members haven't changed.

**Fix:** Wrap `MemberList` in `React.memo` and stabilize `onUpdate` with `useCallback`.

---

### M13. Badge API called on every channel update

**File:** `src/features/channels/Lobby.tsx:31-43` · **Category:** Performance

`navigator.setAppBadge(totalUnread)` runs on every `myChannels` change — fires dozens of times/min during active play.

**Fix:** Debounce badge updates with 500ms `setTimeout`.

---

### M14. Sign-in error swallowed silently

**File:** `src/features/auth/AuthContext.tsx:97-104` · **Category:** Code Quality

No try/catch on `signInWithOAuth`. If popup blocked or network fails, error vanishes. Callers can't react.

**Fix:** Wrap in try/catch, set `error` state, propagate to callers.

---

### M15. Autocomplete — empty array allocation when no mention active

**File:** `src/features/chat/MessageComposer.tsx:69-71` · **Category:** Performance

`mentionState ? members.filter(...) : []` creates new empty array every render when no @mention active.

**Fix:** Return `null` instead of `[]`, handle null in JSX.

---

### M16. isMac/isTouchDevice recomputed every render

**File:** `src/features/chat/MessageComposer.tsx:168-169` · **Category:** Performance

Runtime constants recomputed on every keystroke render.

**Fix:** Hoist to module-level `const`.

---

## 🔵 LOW (11)

### L1. Math.random() for dice rolls

**File:** `src/features/dice/parser.ts:63` · **Category:** Security

Not cryptographically secure. Acceptable for use case but worth documenting as non-provable fairness.

**Fix:** Document limitation. Switch to `crypto.getRandomValues()` if provable fairness required.

---

### L2. Deprecated document.execCommand('copy')

**File:** `src/features/channels/ChannelSettings.tsx:63` · **Category:** Security

Legacy clipboard fallback via deprecated API.

**Fix:** Remove fallback. `navigator.clipboard` works in all modern browsers.

---

### L3. DiceRoller — no-op onClick (dead logic)

**File:** `src/features/dice/DiceRoller.tsx:102` · **Category:** Code Quality

`setAdvDis(advDis === 'none' ? 'none' : 'none')` — both branches return `'none'`. Clicking Adv/Dis won't reset.

**Fix:** `onClick={() => setAdvDis('none')}`

---

### L4. MessageComposer — 446 lines, 19 state variables

**File:** `src/features/chat/MessageComposer.tsx:1-446` · **Category:** Code Quality

Component too large. Hard to test, hard to maintain.

**Fix:** Extract `MentionAutocomplete`, `NpcNameInput`, `ComposerControls`, `ReplyBar` sub-components.

---

### L5. Profile fetch lacks separate error handling

**File:** `src/features/auth/AuthContext.tsx:41-49` · **Category:** Code Quality

Profile fetch shares try/catch with session fetch. Profile failure = user sees error screen, no retry.

**Fix:** Separate try/catch so profile failure doesn't block loading.

---

### L6. Magic strings for routes and storage keys

**Files:** `ProtectedRoute.tsx:32`, `HelpPage.tsx:21`, `ArchivedChannels.tsx:67` · **Category:** Code Quality

`'/login'`, `'auth_redirect'`, `'/help'` repeated across files. Typo = silent runtime bug.

**Fix:** Create `src/constants/routes.ts` and `src/constants/storageKeys.ts`.

---

### L7. `any` cast on send payload

**File:** `src/features/chat/MessageComposer.tsx:124` · **Category:** Code Quality

`payload: any` bypasses type definition on `onSendMessage`.

**Fix:** Extract payload type from `onSendMessage` parameter into named type alias.

---

### L8. IconPicker — missing mounted guard on async fetch

**File:** `src/features/chat/IconPicker.tsx:28-46` · **Category:** Code Quality

`fetch().then(setIcons)` with no mounted flag. Set-state-on-unmounted warning if modal closes early.

**Fix:** Add `let cancelled = false` flag, check before state updates.

---

### L9. unsafe `as T` cast in useAppSetting

**File:** `src/hooks/useAppSetting.ts:21` · **Category:** Code Quality

`(data?.value as T) ?? fallback` — JSON from DB could be any shape. Runtime mismatch causes downstream crashes.

**Fix:** Document pairing requirement or add zod runtime validation.

---

### L10. AppNav evaluates all hooks on channel pages where it returns null

**File:** `src/App.tsx:33` · **Category:** Performance

Component mounts, runs all hooks, registers event listeners, then returns `null`. Wasted work on channel pages.

**Fix:** Move conditional to parent: `{!location.pathname.startsWith('/channel/') && <AppNav />}`.

---

### L11. IIFE with Date.now() in MessageItem JSX

**File:** `src/features/chat/MessageItem.tsx:379-385` · **Category:** Performance

Timestamp formatting IIFE calls `Date.now()` per render per message.

**Fix:** Extract to `formatTimestamp(createdAt)` function. With `React.memo`, only runs when message changes.

---

## Summary

| Severity | Security | Performance | Code Quality |
|----------|----------|-------------|--------------|
| CRITICAL | 1 | 4 | 0 |
| HIGH | 4 | 6 | 0 |
| MEDIUM | 2 | 7 | 7 |
| LOW | 2 | 3 | 6 |
| **Total** | **9** | **20** | **13** |

**Top 3 fixes by impact-to-effort ratio:**

1. **C2** — `useMemo` on AuthContext value (5 min, eliminates app-wide re-render cascade)
2. **H5 + H9** — `React.memo` on MessageItem + `useCallback` on handlers (15 min, eliminates largest source of wasted renders)
3. **C1** — PBKDF2 for channel passwords (2 hours, critical security fix)
