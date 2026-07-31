# Tabletop RPG - Play-by-Post

## Goal

This is a self-hosted web application for playing any Tabletop RPG (TTRPG) in a play-by-post style. It provides a real-time chat interface combined with features specifically designed to support long-term asynchronous tabletop gaming.

## Key Highlights

- **Google account sign-in:** Quick access with no password management overhead.
- **Channels with GM management:** Create private or public games, manage players, and provide links to maps and resources.
- **Clickable dice notation & Roller UI:** GMs type notations, players click to roll inline. Both can use a UI dice roller. Roll history is maintained.
- **Turn tracking & Notifications:** GMs can set active players to drive turn notifications (push, badge).
- **Whisper messages:** Private messaging between GM and individual players in the same timeline.
- **Scene messages:** Distinctly styled messages by the GM to set the scene or mark narrative breaks.

For a full breakdown of the application features, please read [FEATURES.md](FEATURES.md).

## Tech Stack

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
| Testing | Vitest + React Testing Library + MSW |
| CI | GitHub Actions |
