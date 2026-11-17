// Builds the 1200x630 Open Graph/Twitter cards for the public pages (#643).
//
// Composes the committed brand logo and a help screenshot over a branded
// background. The outputs are committed; re-run this only when the brand art,
// tagline, or a page's card changes.
//
// Run: node scripts/seo/og-image.mjs
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from '@playwright/test'

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const publicDir = join(root, 'public')

// `output` is relative to public/. The first card is the site default every
// route without its own card inherits, so keep its title and subtitle stable.
const CARDS = [
  {
    output: 'og-image.png',
    title: 'Play your tabletop RPG, one post at a time',
    subtitle: 'A chat-first app for asynchronous tabletop RPGs',
    shot: 'help-images/lobby-with-channels.png',
  },
  {
    output: 'og-image-rpol.png',
    title: 'RPOL alternative?',
    subtitle: 'Chat-first, installable, free — Role by Post',
    shot: 'help-images/status-bar.png',
  },
]

function dataUri(file) {
  return `data:image/png;base64,${readFileSync(join(publicDir, file)).toString('base64')}`
}

function cardHtml({ title, subtitle, shot }) {
  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <style>
      * { box-sizing: border-box; margin: 0; }
      body {
        width: 1200px;
        height: 630px;
        display: flex;
        align-items: center;
        gap: 48px;
        padding: 72px;
        font-family: system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
        background: linear-gradient(135deg, #312e81 0%, #6d28d9 55%, #4f46e5 100%);
        color: #f9fafb;
        overflow: hidden;
      }
      h1 { font-size: 76px; line-height: 1.05; letter-spacing: -0.02em; }
      p { margin-top: 20px; font-size: 34px; color: #ddd6fe; }
      .brand { display: flex; align-items: center; gap: 20px; margin-bottom: 36px; }
      .brand img { width: 72px; height: 72px; border-radius: 16px; }
      .brand span { font-size: 34px; font-weight: 700; }
      .shot {
        width: 340px;
        border-radius: 32px;
        border: 10px solid #111827;
        box-shadow: 0 30px 60px rgba(0, 0, 0, 0.4);
        flex-shrink: 0;
      }
    </style>
  </head>
  <body>
    <div style="flex: 1">
      <div class="brand">
        <img src="${dataUri('RoleByPost.png')}" alt="" />
        <span>Role by Post</span>
      </div>
      <h1>${title}</h1>
      <p>${subtitle}</p>
    </div>
    <img class="shot" src="${dataUri(shot)}" alt="" />
  </body>
</html>`
}

const browser = await chromium.launch()
try {
  const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 })
  for (const card of CARDS) {
    await page.setContent(cardHtml(card), { waitUntil: 'load' })
    await page.waitForTimeout(200)
    const output = join(publicDir, card.output)
    writeFileSync(output, await page.screenshot({ type: 'png' }))
    console.log(`Wrote ${output} (1200x630)`)
  }
} finally {
  await browser.close()
}
