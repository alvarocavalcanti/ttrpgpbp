# UX & Product Design Audit — 2026-08-31

Comprehensive Product, UX, and Interaction Review of `alvarocavalcanti/ttrpgpbp` (mobile-first Play-by-Post TTRPG web application), conducted from a Principal UX Designer / Product Strategist perspective. Unlike the previous engineering-perspective audits (architecture, performance/security, codebase phases), this pass evaluates the product through a **mobile-first, asynchronous gaming experience** lens.

Scope reviewed: `docs/FEATURES.md`, `docs/CHANGELOG.md`, and the live component code — `App.tsx`, `ChannelView.tsx`, `MessageComposer.tsx`, `MessageList.tsx`, `MessageItem.tsx`, `DiceRoller.tsx`, `Menu.tsx`, `BottomSheet.tsx`, `Lobby.tsx`, `ChannelStatusBar.tsx`, `PermissionBanner.tsx`, `EmojiPicker.tsx`, `composerChip.ts`, `index.css`, `tailwind.config.js`.

Note on stack: the UI is hand-rolled Tailwind components + `@tailwindcss/typography`, **not** Shadcn. `tailwind.config.js` has no theme tokens (`extend: {}`) — visual consistency is enforced by convention only.

---

## 1. UX Executive Summary

| Vector | Score | Notes |
|---|---|---|
| Mobile usability | **6.5/10** | Core loop works; touch targets and nested popups drag it down |
| Aesthetic consistency | **7/10** | Strong message-type visual language; no token system, ad-hoc palette |
| Feature completeness | **9/10** | Genuinely deep: safety tools, whispers, NPC snapshots, idempotent sends, X-Card |

**Biggest strength — invisible reliability UX.** Draft persistence, client idempotency keys, Pending/Retry/Remove states, offline banner (`RealtimeBanner.tsx`), unread divider, scroll anchoring through prepends *and* lazy-image resize (`MessageList.tsx:127-139`). This is the hard, unglamorous part of async chat and it is done better than most chat apps.

**Biggest weakness — the "last tap" ergonomics.** Everything is reachable, but key actions land below 44px targets, the dice roller is a nested popup inside a nested popup on mobile, and ability checks fall through to `window.prompt`.

---

## 2. Top UX Friction Points (P0/P1)

### P0

1. **Dice Roller popup inside the Options BottomSheet clips on mobile** — `MessageComposer.tsx:471-473` renders `DiceRoller` inside `BottomSheet` (max-h-80vh, `overflow-y-auto`). `DiceRoller.tsx:52` opens an `absolute bottom-full w-64` popup *within* that scroll container. On a phone the popup is clipped/scroll-trapped near the viewport bottom, and its inputs are `w-16 py-1` — well under the 44px target. The single most-used async-game control (rolling a die) is the least ergonomic interaction in the app.

2. **Ability checks use `window.prompt`** — `MessageItem.tsx:182,188`. Native prompt on mobile is visually jarring, non-themeable, breaks the tabletop flow, and the "Missing in profile!" path (`MessageItem.tsx:182`) dead-ends instead of deep-linking to Edit Character. This is the game loop's failure moment — it deserves a styled mini-dialog ("Roll STR check: [−1] [Adv] [Roll]").

3. **Message action buttons are sub-24px targets** — reply/edit/delete/X-Card are `p-1` + `w-4 h-4` icons (`MessageItem.tsx:525-546`), and the reaction button is `p-1` + `w-4 h-4` (`EmojiPicker.tsx:30-31`). On mobile they are permanently visible (`max-sm:opacity-100`), creating a dense row of ~24px targets after every message. Mis-taps on Delete (behind a native `confirm()`, `MessageItem.tsx:121`) are likely.

4. **No focus trap anywhere** — every modal/BottomSheet sets `aria-modal="true"` but nothing contains focus or restores it on close (no focus-trap hook exists in `src/hooks/`). Keyboard users can tab behind the dialog; screen readers announce the dialog but the context is not contained. Escape + click-outside exist; the other half of the ARIA dialog contract does not.

5. **First-run dead end** — after Google sign-in, an empty lobby says *"You haven't joined any channels yet."* with no CTA. Channels are invite-only, the Create FAB is unexplained, and the invite-link mental model is never surfaced at the moment of confusion. The new-player journey (login → lobby → ??? ) has no guided path; character setup (name, avatar, modifiers) is buried in the member list per-channel.

### P1

1. **Channel tools buried 2+ taps deep** — Rolls, Search, Notifications, Safety Tools, NPCs, Active Player, Settings all live in the right-hand sidebar behind the hamburger (`ChannelView.tsx:327-430`). A text-only list with no icons and no grouping; GM items and player items mix. Dice has *two* entry points (composer sheet + none in sidebar), while Rolls history has *one* (sidebar).

2. **"Load older messages" is a manual button** (`MessageList.tsx:167-178`) — scroll-to-top infinite loading is the expected pattern on mobile; the button costs a precision tap at the exact top of a long thread.

3. **Full-screen spinner for every channel open** — `ChannelView.tsx:116-122` blanks the entire view (header included) while *either* channel or messages load. No skeleton, no progressive paint; every navigation feels slower than it is.

4. **Header search is `w-24` on mobile** (`App.tsx:108`) — 96px for fuzzy channel search, with no way to expand; lobby search and in-channel search are also two different UIs for two different search models.

5. **Lobby row badges wrap awkwardly** — channel name (`truncate`), unread chip, GM/Player badge, and "Joined as X" chip share one row that wraps under 400px (`Lobby.tsx:77-114`); "Joined as <20-char name>" can dominate the row.

---

## 3. UI & Layout Optimizations (P2 — quick wins)

- **Tokenize the palette.** `tailwind.config.js` theme is empty; every component hardcodes `indigo-600 / gray-800 / amber-50 / #fdf6e3`. Define `primary`, `surface`, `parchment` semantic colors so scene/NPC/whisper styling is not a 15-class inline string (`MessageItem.tsx:308` is one 400+ char className).
- **Raise micro-targets:** message action icons `p-1 w-4` → `p-1.5 w-5` (≈36px) minimum; reaction emoji buttons `p-1` → `p-1.5`. Cheap, mechanical diff.
- **DiceRoller inputs:** number inputs and select `py-1` → `py-2`; Roll button `py-1.5` → `py-2.5`. Also honor `inputmode="numeric"`.
- **Delete confirmation:** replace `confirm()` with the existing toast/dialog pattern — the app already has `ToastContext` and styled modals; native confirm is the one off-brand dialog left.
- **Send button:** `p-2` + `w-5 h-5` icon ≈ 36px — bump to `p-3`. It is the highest-frequency tap on the platform.
- **Timestamps `text-gray-400`** on `gray-900` dark bg is ~3.5:1 — below AA for `text-xs`. Use `gray-500` in dark mode.
- **Menu.tsx duplicates its entire options list** for popup/dropdown (two identical 20-line blocks, `Menu.tsx:53-79` vs `107-136`) — render one list in either container.
- **Keyboard shortcut tip** (`pr-12`, `MessageComposer.tsx:658`) floats oddly; fold into the send row as `title` on the send button.
- **`focus-visible` ring-offset fix in `index.css:24`** — good; extend the same pattern to `--tw-ring-color` for amber/red contexts where indigo ring lands on amber surfaces (ChannelStatusBar editing state).

---

## 4. Proposed Wireframe / Layout Changes

### Campaign Thread View (mobile)

- Merge the hamburger into a single **header row**: back / avatar+name / **search icon** / **dice icon** / menu. Search and Rolls are the two most-used tools and deserve header icons (1 tap) instead of sidebar text items (3 taps).
- Replace the full-screen loading spinner with **header-first paint + message skeletons** (3 shimmering bubble outlines) — the channel name and status bar render from cached/parallel data.
- Auto-load older messages on scroll-top (keep the manual button as fallback for the first page only).

### Dice Roller

- On mobile, render the roller **inline in the BottomSheet** (it already is) but make its popup a second BottomSheet layer (`Menu`-style `popup={isMobile}`), not an anchored `absolute` popup — eliminates the clipping P0 with the component already built.
- Quick-roll preset row above the form: last 3 notations used in this channel as tappable chips (`2d20kh+4`, `1d8+2`). Roll history data already exists to feed it.

### Message Actions

- Mobile: collapse reply/edit/delete/X-Card/reaction behind a **long-press context menu** (or a single `⋯` button opening a BottomSheet) instead of five always-on 24px icons per message. Desktop keeps hover icons. Removes the densest touch-error zone in the app.

### Ability Check Dialog

- Replace `window.prompt` with a small BottomSheet: modifier (pre-filled from profile, `clampModifier`-bounded), Adv/Dis toggle (reuse DiceRoller's segmented control), Roll / Cancel. Missing-modifier state shows a **"Set it in your character sheet"** link instead of a warning string.

### Character Sheet Drawer

- Promote character identity to a **first-class header element**: tapping your own avatar in the composer opens the Edit Character sheet (name, avatar, modifiers, notes, sheet URL) as a BottomSheet — today it is inside MemberList → your own row, undiscoverable.
- Empty lobby state: illustration + two explicit paths — *"Create a channel"* (inline button, not just FAB) and *"Paste an invite link to join a game"* input. Explains the invite-only model at the exact moment it is confusing.

### GM/Player Role Separation

- Keep conditional rendering (it is already clean), but add **section headers in the sidebar** ("GM Tools" / "Table") so the text list reads as grouped instead of an undifferentiated 10-item stack.

---

## Deferred / not covered

- PWA install-prompt UX (iOS guidance exists in FEATURES; banner copy only) — separate audit if installs matter.
- Help content / screenshot freshness — follow-up pass.

---

## Appendix — Original Review Brief

The initial prompt given to the reviewer, preserved verbatim:

```markdown
# Role & Persona
You are a Principal UX Designer and Product Strategist specializing in mobile-first web applications, modern component design systems (Tailwind CSS, Shadcn UI), and asynchronous collaborative platforms.

You are conducting a comprehensive **Product, UX, and Interaction Review** of the repository `alvarocavalcanti/ttrpgpbp` (a mobile-first Play-by-Post TTRPG web application).

---

# Context & Inputs
* **Functional Scope:** Read `docs/FEATURES.md` to understand the target product capabilities and player/Game Master workflows.
* **Evolution:** Read `docs/CHANGELOG.md` to see recent UI fixes, layout adjustments, and new feature additions.
* **Codebase Structure:** Inspect `/src/components`, UI layouts, responsive styling, and interaction patterns.

---

# Evaluation Vectors

Perform your review through the lens of a **mobile-first, asynchronous gaming experience**:

### 1. Feature Architecture & User Journeys
* **Onboarding & Campaign Setup:** How smooth is the transition from initial login to joining/creating a campaign and building a character sheet?
* **Async Game Loop:** Is the primary interaction loop (reading updates -> rolling dice -> drafting markdown response) fluid? Are primary actions accessible within 1-2 taps on a mobile screen?
* **Role Distinction:** How effectively does the UI separate player-facing actions from Game Master tools without cluttering the screen?

### 2. Mobile-First Layout & Spatial Hierarchy
* **Touch Targets & Thumb Zones:** Are key interactive elements (dice roller, rich text formatters, post submit, character sheet toggles) sized for mobile ergonomics (min 44x44px target sizes)?
* **Information Density:** Does the mobile view manage long play-by-post campaign threads gracefully without triggering scroll fatigue or layout shifts?
* **PWA & Offline UX:** How clearly does the UI communicate offline state, pending optimistic posts, or connection drops during real-time web socket sync?

### 3. Visual Design System & Accessibility (a11y)
* **Shadcn / Tailwind Alignment:** Are layout tokens, colors, typography, and spacing used consistently across components?
* **Contrast & Legibility:** Is the dark/light atmospheric styling readable across varying ambient mobile lighting conditions?
* **Screen Reader & Keyboard Nav:** Are modal dialogs, drawer menus, and popovers properly trapped and labeled for ARIA accessibility?

### 4. Micro-Interactions & Feedback Loops
* **Optimistic UI & Latency:** Does the UI feel instantaneous when posting or rolling dice, providing clear feedback if a Supabase network request fails?
* **Empty & Loading States:** How are empty campaign feeds, character loading skeletons, and connection reconnection banners handled visually?

---

# Review Output Format

Provide a detailed **UX & Product Design Assessment**:

1. **UX Executive Summary:** Overall score (1-10) on mobile usability, aesthetic consistency, and feature completeness.
2. **Top UX Friction Points (P0/P1):** Specific flows where a user is likely to experience frustration, confusion, or visual clutter on mobile.
3. **UI & Layout Optimizations (P2):** Quick wins for typography, micro-spacing, mobile navigation, or responsive drawer/modal improvements.
4. **Proposed Wireframe / Layout Changes:** Bulleted descriptions of alternative layout strategies for high-traffic views (e.g., Campaign Thread View, Dice Roller Bar, Character Sheet Drawer).

```
