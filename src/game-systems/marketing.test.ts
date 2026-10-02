import { describe, it, expect } from 'vitest'
import { GAME_SYSTEM_COPY } from './marketing'
import { GAME_SYSTEMS } from './index'
import { PUBLIC_ROUTES } from '../lib/publicRoutes'

describe('game-system marketing copy', () => {
  it('has a public route and a registry entry for every system with a page', () => {
    const publicPaths = new Set(PUBLIC_ROUTES.map((route) => route.path))
    for (const copy of Object.values(GAME_SYSTEM_COPY)) {
      expect(publicPaths.has(`/game-systems/${copy.slug}`)).toBe(true)
      expect(GAME_SYSTEMS[copy.slug]).toBeDefined()
    }
  })
})
