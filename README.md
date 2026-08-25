# RoleByPost

<p align="center">
  <img src="public/RoleByPost.png" alt="RoleByPost logo" width="160" />
</p>

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

## Support

Support RoleByPost development:

<p align="center">
  <a href="https://www.buymeacoffee.com/alvarocavalcanti"><img src="https://cdn.buymeacoffee.com/buttons/v2/default-yellow.png" alt="Buy Me A Coffee" width="150"></a>
  <a href="https://ko-fi.com/O4O1WSP5B"><img src="https://storage.ko-fi.com/cdn/kofi6.png?v=6" alt="Buy Me a Coffee at ko-fi.com" width="150"></a>
</p>

For a comprehensive feature breakdown, see [FEATURES.md](docs/FEATURES.md).

Want to run your own instance? See [DEPLOYMENT.md](DEPLOYMENT.md). Interested in contributing? See [CONTRIBUTING.md](CONTRIBUTING.md).

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

## License

[MIT](LICENSE). You are free to self-host, modify, and build paid services from this project. If you do, keep the copyright notice and attribution to the original project.
