## Implementation Plan — TTRPG Play-by-Post

> **Phase Gate Rule**: The agent must wait for explicit approval before starting the next phase. Each phase ends with a summary of what was done and a prompt for review.

> **Testing Rule**: Every phase that produces code must include tests. Coverage target: **100%**, with **80% as the hard minimum**. Coverage check runs on every push via GitHub Actions.

> **Branching Rule**: `main` is protected. All work happens on feature branches (e.g. `phase-X/name`). Open a PR, let CI pass, and wait for user review before merging.

---

### Phase 0: Project Setup (✅ DONE)

1. Initialize git repo in `/Users/alvaro.cavalcanti/Projects/Personal/ttrpgpbp`
2. Create remote on GitHub via `gh repo create`
3. Update documentation files:
   - `README.md` — add Tech Stack table, add Dice Roller to highlights
   - `FEATURES.md` — add Dice Roller section
   - `SCHEMA.md` — full database schema, RLS policies, search setup, design notes
4. Add `.gitignore` (Node/Vite template)
5. Set up GitHub branch protection for `main`
6. Commit and push documentation as the initial commit

---

### Phase 1: Frontend Scaffold (✅ DONE)

1. Scaffold React + Vite + TypeScript project
2. Install and configure Tailwind CSS
3. Configure PWA (`vite-plugin-pwa`)
4. Set up testing infrastructure:
   - **Vitest** as test runner (with `@vitest/coverage-v8` for coverage)
   - **React Testing Library** for component tests
   - **MSW** (Mock Service Worker) for mocking Supabase API calls
   - Coverage thresholds in Vitest config: `80%` minimum for branches, functions, lines, statements
5. Set up **GitHub Actions CI pipeline**:
   - Runs on every push and PR
   - Steps: install → lint → test with coverage → build
   - Fails if coverage drops below 80%
6. Set up project structure:

```
src/
  components/
  features/
    auth/
    channels/
    chat/
    dice/
    notifications/
    status/
    search/
  lib/
    supabase.ts
    dice-parser.ts
    markdown.ts
  types/
  test/
    mocks/          # MSW handlers, test fixtures
    setup.ts        # Test setup (RTL cleanup, MSW server)
  App.tsx
  main.tsx
```

7. Set up routing (React Router — lobby, channel view, settings)
8. Deploy empty shell to Cloudflare Pages to verify pipeline

> **MILESTONE — Deployable**: Empty app live on Cloudflare Pages. CI pipeline green. Verify deploy pipeline works end-to-end.

---

### Phase 2: Supabase Setup (✅ DONE)

> **Prerequisite**: User must create Supabase project and provide Project URL + Anon key. User must configure Google OAuth in Supabase dashboard (requires Google Cloud Console OAuth credentials). **Status: Done.** Project URL: `https://kvqkkqfixzgmrtrcdkmw.supabase.co`. Anon key to be provided when needed.

1. Configure Supabase client in the app
2. Create database tables:
   - `profiles` (with trigger on `auth.users` insert)
   - `channels`
   - `channel_members`
   - `messages` (with `search_vector` generated column + GIN index)
   - `dice_rolls`
   - `notification_preferences`
3. Write RLS policies for all tables
4. Enable Realtime on `messages`, `channels`, `channel_members`
5. Create database functions:
   - 15-minute edit window enforcement
   - Soft delete
6. Store SQL migrations in `supabase/migrations/`

---

### Phase 3: Auth & Profiles (✅ DONE)

1. Integrate Supabase Auth with Google OAuth
2. Auto-create profile on first sign-in (DB trigger)
3. Profile settings page (display name, avatar)
4. Protected routes (redirect to sign-in if not authenticated)
5. **Tests**:
   - Auth hook tests (sign-in, sign-out, session state) with MSW mocks
   - Profile component tests (render, edit, save)
   - Protected route tests (redirects when unauthenticated, renders when authenticated)

> **MILESTONE — Testable**: User can sign in with Google, see their profile, and edit display name. Auth flow works end-to-end. Tests green, coverage meets threshold.

---

### Phase 4: Channels (✅ DONE)

1. Channel creation form (name, public/private, password, map URL, resources URL)
2. Public channel lobby (list + join)
3. Invite link generation and join-via-link flow
4. Password-protected join flow
5. Channel settings (GM-only: edit name, URLs, revoke/block members)
6. Channel member list with character name, avatar, sheet URL editing
7. **Tests**:
   - Channel creation form validation and submission
   - Lobby rendering and join flow
   - Invite link generation and join-via-link
   - Password join flow (correct/incorrect password)
   - GM-only settings (render for GM, hidden for players)
   - Member list CRUD operations

> **MILESTONE — Testable**: Users can create channels, join via lobby or invite link, set character info. GM can manage members. Tests green, coverage meets threshold.

---

### Phase 5: Chat & Messages

1. Message list with real-time subscriptions (Supabase Realtime)
2. Message composer with send
3. Message types:
   - Regular messages (markdown + emoji rendering)
   - Scene messages (GM-only, parchment/scroll styling)
   - System messages (join/leave events)
4. Edit (15-min window, "edited" badge) and delete (soft, "deleted" marker)
5. Whisper messages (select a player, styled differently, RLS-enforced visibility)
6. URLs rendered as plain text with external link
7. **Tests**:
   - Message rendering by type (regular, scene, system, whisper)
   - Composer send, edit mode, delete confirmation
   - 15-min edit window logic (within window, expired)
   - Whisper visibility logic (visible to sender + target + GM, hidden from others)
   - Scene message restricted to GM
   - Markdown and emoji rendering
   - Real-time subscription mock (new message arrives, list updates)

> **MILESTONE — Deployable & Testable**: A functional chat app. Users can send messages, see them in real-time, edit/delete, whisper. Core PbP experience without dice. Tests green, coverage meets threshold. Good point for a real playtest with your group.

---

### Phase 6: Channel Status & Turn Tracking

1. Persistent, collapsible status bar at top of channel
2. Free-form text editing (GM-only, markdown + emoji)
3. Active player selector (GM picks one or more players while composing)
4. Active player indicator in status bar
5. Setting active player triggers notification (in-app badge at this stage)
6. **Tests**:
   - Status bar render (expanded, collapsed, empty state)
   - GM edit flow (edit, save, cancel)
   - Active player selection and indicator display
   - Collapse/expand toggle
   - Non-GM cannot edit

> **MILESTONE — Testable**: GM can manage status, set active players, players see the status bar. Turn tracking works. Tests green, coverage meets threshold.

---

### Phase 7: Dice System

1. **Notation parser**: parse `NdX`, `NdX+M`, `2d20kh1`, `2d20kl1`, `4d6dl1`
2. **Inline clickable notation**: detect dice notation in messages, render as clickable chips
3. **Click-to-roll flow**: player clicks notation, roll result appears as `dice_roll` message
4. **Ability checks**: detect `STR Check`, `DEX Check`, etc., prompt for modifier, roll d20
5. **Dice Roller panel**:
   - Pick dice type (d4, d6, d8, d10, d12, d20, d100)
   - Set quantity
   - Add modifier (+N / -N)
   - Advantage/disadvantage toggle (d20 only)
   - Roll button sends result as dice roll message
6. **Roll history view** per channel (query `dice_rolls` table)
7. **Tests**:
   - Notation parser: exhaustive tests for all supported patterns, edge cases, invalid input (target 100% — pure functions)
   - Dice roller UI: quantity/modifier/advantage controls, roll submission
   - Inline notation detection and chip rendering
   - Click-to-roll flow (mock random, assert breakdown format)
   - Ability check prompt and roll
   - Roll history rendering

> **MILESTONE — Deployable & Testable**: Full TTRPG feature set. Dice rolling works both inline and via the roller panel. Feature-complete PbP app. Tests green, coverage meets threshold. Good point for extended playtesting.

---

### Phase 8: Notifications

1. **Push notifications** via Web Push API (service worker, VAPID keys)
2. **In-app badge** refinement (unread count per channel)
3. **Email notifications** via Resend (free tier)
4. **Notification preferences** page (push on/off, badge on/off, email on/off)
5. Distinct "It's your turn" notification type
6. **Tests**:
   - Notification preferences form (toggle states, save)
   - Badge count logic (unread messages, reset on channel open)
   - Push notification registration/permission flow (mocked)
   - "It's your turn" notification trigger logic

> **MILESTONE — Testable**: Notifications work across all three channels (push, badge, email). Players get notified when it's their turn. Tests green, coverage meets threshold.

---

### Phase 9: Search

1. Search input in channel header
2. Query PostgreSQL full-text search (`search_vector`)
3. Results with message preview, sender, timestamp
4. Click result to scroll to message in history
5. **Tests**:
   - Search input rendering and query submission
   - Results list rendering (with highlights, empty state)
   - Click-to-scroll behavior

---

### Phase 10: Polish & Deploy

1. Responsive design (mobile-first — players will use phones)
2. PWA manifest, icons, install prompt
3. Error handling, loading states
4. Final Cloudflare Pages deploy with custom domain (if desired)
5. Final coverage audit — ensure all modules meet 80%+ threshold

> **MILESTONE — Deployable**: Production-ready. All tests green. Coverage at or above threshold. Ship it to your group.

---

### Testing Stack

| Tool | Purpose |
|---|---|
| Vitest | Test runner (Vite-native, Jest-compatible API) |
| @vitest/coverage-v8 | Code coverage reporting |
| React Testing Library | Component rendering and assertions |
| MSW | Network-level mocking for Supabase API calls |

### CI Pipeline (GitHub Actions)

- **Trigger**: every push and PR
- **Steps**: install → lint → test with coverage → build
- **Fails if**: coverage below 80% on any metric (branches, functions, lines, statements)

### Tech Stack Summary

| Layer | Choice |
|---|---|
| Frontend | React 19 + Vite + TypeScript |
| Styling | Tailwind CSS |
| Backend | Supabase (free tier) |
| Database | Supabase PostgreSQL |
| Auth | Supabase Auth (Google OAuth) |
| Real-time | Supabase Realtime (WebSocket) |
| Search | PostgreSQL `tsvector` + GIN index |
| Hosting | Cloudflare Pages |
| Push notifications | Web Push API (PWA) |
| Email | Resend (free tier) |
| Storage | Supabase Storage (avatars) |
| Testing | Vitest + React Testing Library + MSW |
| CI | GitHub Actions |
