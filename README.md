# RoleByPost

A modern, mobile-friendly Play-by-Post application built for asynchronous tabletop roleplaying games. Combines chat-like responsiveness with structured RPG tools like dice rolling, scene prompts, character tracking, and active-player status.

## Tech Stack

- **Frontend:** React 19, TypeScript, Vite, Tailwind CSS
- **Backend:** Supabase (PostgreSQL, Auth, Realtime)
- **State/Routing:** React Router v7
- **PWA:** Vite PWA Plugin for mobile installation and push notifications
- **Testing:** Vitest, React Testing Library

## Key Features

- **Real-time Chat:** Markdown support, distinct Scene breaks (GM-only), whispers, and daily date dividers.
- **Dice System:** Integrated dice roller and clickable notation parsing (e.g., `2d20kh1`, `STR Check`).
- **Campaign Management:** Public lobby, private invite links, persistent status bars for initiative/tracking.
- **Push Notifications:** Web Push integration with in-app badging for new messages and active turns.
- **Mobile First:** Designed to feel like a native chat application (WhatsApp/Telegram style) on mobile viewports.

For a comprehensive feature breakdown, see [FEATURES.md](./FEATURES.md).

## Development Setup

1. **Install Dependencies**
   ```bash
   npm install
   ```

2. **Supabase Configuration**
   You need a Supabase project. Set up your `.env.local` file in the project root:
   ```env
   VITE_SUPABASE_URL=your_supabase_url
   VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
   ```
   Apply the database migrations in `supabase/migrations/` via the Supabase CLI or Dashboard.

3. **Run Locally**
   ```bash
   npm run dev
   ```

4. **Testing & Linting**
   - Run tests: `npm run test`
   - Test coverage: `npm run test:coverage`
   - Lint code: `npm run lint`
