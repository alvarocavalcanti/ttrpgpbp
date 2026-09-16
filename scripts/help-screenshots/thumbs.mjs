// Thumbnail variants for the /features page cards (follow-up to #526, #534).
//
// The track cards in FeaturesPage render at 80–96px CSS (≤288 device px at 3x),
// but the help captures they reused are 1080px wide — ~10x more pixels than the
// cards can display (GM track alone ≈ 756 KB). This module downscales a 320px
// WebP copy of every capture into public/help/thumbs/; the full-size files stay
// untouched for the help docs (which render them up to max-w-xl).
//
// Standalone (no Supabase, no dev server — needs only the committed PNGs):
//   node scripts/help-screenshots/thumbs.mjs
// capture.mjs also calls writeThumbs() at the end of a full run, so a re-capture
// can never leave a stale thumb behind.
import { chromium } from '@playwright/test'
import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

// 320px covers the largest card (96px @ 3x = 288px) with headroom.
const THUMB_WIDTH = Number(process.env.SHOT_THUMB_WIDTH || 320)
const THUMB_EXT = '.webp'
const THUMB_QUALITY = 0.85

export async function writeThumbs({
  out = process.env.SHOT_OUT || 'public/help',
  width = THUMB_WIDTH,
  context,
} = {}) {
  const thumbDir = join(out, 'thumbs')
  mkdirSync(thumbDir, { recursive: true })

  const names = readdirSync(out).filter((f) => f.endsWith('.png'))
  if (names.length === 0) throw new Error(`no PNG captures found in ${out}`)

  let ownedBrowser
  let ctx = context
  if (!ctx) {
    // Keep the Browser handle: closing only the context leaves the browser
    // process alive and the script hangs instead of exiting.
    ownedBrowser = await chromium.launch()
    ctx = await ownedBrowser.newContext()
  }
  try {
    const page = await ctx.newPage()
    await page.setContent('<canvas id="thumb"></canvas>')
    for (const name of names) {
      const src = join(out, name)
      const dest = join(thumbDir, name.replace(/\.png$/, THUMB_EXT))
      const b64 = readFileSync(src).toString('base64')
      // No upscaling: tiny sources stay as-is instead of gaining blur.
      const dataUrl = await page.evaluate(
        async ({ b64, width, quality }) => {
          const img = new Image()
          img.src = `data:image/png;base64,${b64}`
          await img.decode().catch(() => {
            throw new Error('decode failed')
          })
          const w = Math.min(width, img.naturalWidth)
          const c = document.getElementById('thumb')
          c.width = w
          c.height = Math.round((img.naturalHeight * w) / img.naturalWidth)
          const g = c.getContext('2d')
          g.imageSmoothingQuality = 'high'
          g.drawImage(img, 0, 0, c.width, c.height)
          return c.toDataURL('image/webp', quality)
        },
        { b64, width, quality: THUMB_QUALITY },
      )
      writeFileSync(dest, Buffer.from(dataUrl.split(',')[1], 'base64'))
      console.log(
        `${name} → thumbs/${name.replace(/\.png$/, THUMB_EXT)} ` +
          `${Math.round(statSync(src).size / 1024)}K → ${Math.round(statSync(dest).size / 1024)}K`,
      )
    }
    await page.close()
  } finally {
    // A caller-supplied context stays the caller's to close (capture.mjs
    // keeps using it); a self-launched browser is closed with the process.
    if (ownedBrowser) await ownedBrowser.close()
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  await writeThumbs()
  console.log('thumbs done')
}
