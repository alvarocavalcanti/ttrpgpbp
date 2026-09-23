# Message heading scale — assessment + implementation plan

**Date:** 2026-09-23 · **Scope:** markdown heading (`#`–`######`) styling inside channel messages · **Status:** read-only audit, no code changed · **Author:** Principal Product Designer / UX review

**Trigger:** heading styling in channel messages reads too large next to body text. The ask: shrink H1 to today's H3 size, consider dropping heading levels 4–6, and decide whether this needs handling at all.

**Verdict: yes, handle it — but "H1 is too big" is the mildest symptom.** The scale is incoherent: the same `##` renders at four different sizes across message types, `#####`/`######` have no typography rule at all, and dice-roll messages style no headings whatsoever. All five requested decisions landed: shrink H1 to today's H3 size, keep all six levels rendering (no suppression logic), fix all four message surfaces, keep H1 at weight 800, and accept the dice-card prose side effects.

## How message headings are rendered today

One shared parser, four prose contexts:

| Piece | Location |
|---|---|
| Shared lazy wrapper | `src/components/Markdown.tsx:4-20` |
| Actual parser (`react-markdown` + `remark-gfm`, no rehype) | `src/components/MarkdownImpl.tsx:1-17` |
| Typography plugin (defaults only, no theme overrides) | `tailwind.config.js:45-47` |
| Message-body type scale (`text-[1.0625rem]` + `leading-relaxed`) | `src/features/chat/MessageItem.tsx:47-58` |
| Regular / NPC message body | `src/features/chat/MessageItem.tsx:818` |
| Scene message (`proseParchment`) | `src/features/chat/MessageItem.tsx:630`, `src/features/chat/composerChip.ts:11-12` |
| Dice-roll card body (**no `prose` class**) | `src/features/chat/MessageItem.tsx:736` |
| Channel status (`proseAmber`) | `src/features/channels/ChannelStatusBar.tsx:114`, `src/features/chat/composerChip.ts:13-14` |

No rich-text editor exists — the composer is a plain `<textarea>` (`MessageComposer.tsx:113`), so users type `#` manually (`docs/help/general/messages.md:16` documents that "headings … all work"). Help, changelog, admin-thread, and search surfaces also use the shared `Markdown` component but are app-authored documents; they are out of scope (a large H1 is correct there).

## Measured today (regular chat surface, base 18.06px)

Root is `html { font-size: 106.25% }` (`src/index.css:10`) = 17px; the container's `text-[1.0625rem]` sets 18.06px. The plugin's heading sizes are `em` ratios authored against a 14px `prose-sm` base, but they now compute off 18.06px:

| Tag | Size | Weight | × body | Source |
|---|---|---|---|---|
| body | 18.06px | 400 | 1.00 | — |
| h1 | **38.71px** | 800 | 2.14 | `prose-sm` size + `prose` weight |
| h2 | 25.80px | 700 | 1.43 | same |
| h3 | 23.22px | 600 | 1.29 | same |
| h4 | 18.06px | 600 | 1.00 | preflight size + `prose` weight |
| h5 | 18.06px | **400** | 1.00 | preflight only — no typography rule |
| h6 | 18.06px | **400** | 1.00 | preflight only |

(Tailwind preflight resets `h1..h6 { font-size: inherit; font-weight: inherit }`, so browser UA defaults never apply. The plugin's `DEFAULT` modifier styles only h1–h4; h5/h6 have no rule anywhere — verified by grep of the whole repo for `prose-h5|prose-h6`.)

Same markdown across the four surfaces:

| Surface | Base | h1 | h5/h6 |
|---|---|---|---|
| Regular / NPC (`MessageItem.tsx:818`) | 18.06px | 38.71px | 18.06px / 400 |
| Scene (`proseParchment`) | 17.00px | 38.25px | 17.00px / 400 |
| Channel status (`proseAmber`) | 14.88px | 31.88px | 14.88px / 400 |
| Dice roll (`MessageItem.tsx:736`, no prose) | 18.06px | 18.06px / 400 — no distinction at all | same |

## Findings

| # | Severity | Finding |
|---|---|---|
| F1 | P2 | h1 renders at 2.14× body (38.7px) inside a chat bubble — disproportionate next to 18px prose, wraps badly at 360px mobile width |
| F2 | P2 | h5/h6 carry **no typography rule** — same size and weight as body text, distinguishable only where a `prose-headings:` color variant paints them. A heading indistinguishable from its paragraph |
| F3 | P2 | Dice-roll bodies have **no `prose` wrapper** — all six levels render as plain body text (`margin: 0`, inherit size/weight) |
| F4 | P3 | Same `##` renders at 25.8 / 25.5 / 21.3 / 18.1px depending on message type |
| F5 | P3 | h4 sits at body size with 600 weight and a larger top margin (25.8px) than h3's bottom rhythm — weak, inconsistent |

Root cause of F1/F4: the `text-[1.0625rem]` utility (`MessageItem.tsx:54`) overrides `prose-sm`'s 14px base, but the plugin's heading `em` ratios were authored against that 14px base.

On "maybe we don't need all five headings": **do not suppress levels.** Suppressing requires a remark plugin or `display:none` CSS — more code than fixing the scale, and it silently drops user content. Flatten the tail instead: all levels keep rendering, none goes below body size.

## Options considered

| Option | Mechanism | Verdict |
|---|---|---|
| **A. Custom `prose-chat` typography modifier** | `theme.extend.typography.chat` in `tailwind.config.js`, added to the four containers | **Recommended.** Plugin-native, single source of truth, smallest net diff |
| B. `prose-h1:`–`prose-h6:` utilities per container | `prose-h1:text-[1.29em] …` on each of the four class strings | Works (utilities layer always wins), but duplicates ~12 long tokens across four sites and bloats the literal-pinned test strings |
| C. Raw CSS in `src/index.css` | `.prose h1 { … }` overrides | Least idiomatic, fights the plugin instead of using it |

## Implementation plan

### 1. `tailwind.config.js` — one `prose-chat` modifier

Inside `theme.extend`, alongside the existing `colors`/`fontFamily`:

```js
typography: {
  chat: {
    css: {
      // Chat is not a document. Sizes are em, so each prose surface keeps
      // its own base (chat 18.06px, scene 17px, channel status 14.88px)
      // while the ratio stays constant. h1 lands on the old h3 size
      // (1.2857em) — exact on prose-sm surfaces (chat, dice, status); on the
      // prose scene surface (h3 = 1.25em) it lands 0.61px above today's h3,
      // visually identical. h3-h6 collapse to body size and share one style.
      h1: { fontSize: '1.2857em' },
      h2: { fontSize: '1.1429em' },
      'h3, h4, h5, h6': {
        fontSize: '1em',
        fontWeight: '600',
        marginTop: '1.5555556em',
        marginBottom: '0.4444444em',
      },
    },
  },
},
```

Why this shape:

- **No container `fontSize`** — deliberately. `em` resolves against each surface's own base, so scene/status body sizes are untouched. Only headings change.
- **h1/h2 weights come from the existing `prose` DEFAULT** (800/700) — not restated. h3–h6 get explicit `600` because h5/h6 have no DEFAULT rule. (Decision: h1 keeps 800; size was the complaint, not weight.)
- **Margins reuse h3's current values** (`em(28,18)`/`em(8,18)`), so h3 is visually unchanged; h4 adopts them (was `em(20,14)`/`em(8,14)`); h5/h6 gain margins they never had.
- Comma-separated selector keys are plugin-idiomatic (`'ul ul, ul ol, ol ul, ol ol'` at `styles.js:153`).
- **Cascade verified at two levels**: `resolveConfig` emits theme keys `DEFAULT, sm, base, …, invert` with `extend` appending `chat` last; and a scratch Tailwind compile of this exact modifier (kept out of the repo) confirms the emitted `.prose-chat :where(h1)` rule (font-size `1.2857em`) lands after `.prose-sm :where(h1)`. Both compile to `:where(…)` (specificity 0), so source order decides — `prose-chat` wins over `prose-sm`.

### 2. Call sites — four edits

- `src/features/chat/MessageItem.tsx:818` (regular/NPC): insert `prose-chat` after `prose-sm`.
- `src/features/chat/composerChip.ts:11-12` (`proseParchment`, scene): insert `prose-chat` after `prose`.
- `src/features/chat/composerChip.ts:13-14` (`proseAmber`, channel status): insert `prose-chat` after `prose-sm`.
- `src/features/chat/MessageItem.tsx:736` (dice card body): append `prose prose-sm prose-chat dark:prose-invert max-w-none`. Rationale per token: `prose` for heading weights, `prose-sm` to match the regular surface, `dark:prose-invert` is **required** — without it `strong`/`a` fall back to light-theme color variables and go near-invisible on the dark card — `max-w-none` because `prose` sets `max-width: 65ch`.

Not touched: `MessageItem.tsx:47-58` (`MESSAGE_TEXT_SCALE` still feeds inline dice/check/mention chips), and all document prose surfaces.

### 3. Resulting sizes

| Surface | Base | h1 | h2 | h3–h6 |
|---|---|---|---|---|
| chat / NPC / dice | 18.06px | 38.7 → **23.2** | 25.8 → **20.6** | 18.1px |
| scene | 17.00px | 38.3 → **21.9** | 25.5 → **19.4** | 17.0px |
| channel status | 14.88px | 31.9 → **19.1** | 21.3 → **17.0** | 14.9px |

Weights: 800 / 700 / 600. h1 equals today's h3 exactly on prose-sm surfaces (chat, dice, status); on scene it is 21.86px vs today's 21.25px (+0.61px, visually identical). h4/h5/h6 identical to h3. Nothing below body size.

### 4. Test plan

- `src/tailwind.config.test.ts`: extend the existing `extend` cast with `typography`, add a `describe('message heading scale')` block asserting the three rules by literal (DAMP): `h1.fontSize === '1.2857em'`, `h2.fontSize === '1.1429em'`, `css['h3, h4, h5, h6']` matches `{ fontSize: '1em', fontWeight: '600' }`.
- `src/features/chat/MessageItem.test.tsx:1214`: `toContain('prose dark:prose-invert prose-p:text-parchment-ink')` → `toContain('prose prose-chat dark:prose-invert')`; add `toContain('prose-chat')`.
- `src/features/chat/MessageItem.test.tsx:1222` and `src/features/channels/ChannelStatusBar.test.tsx:47`: update the `proseAmber` `startsWith` literal to `'prose prose-sm prose-chat max-w-none dark:prose-invert text-amber-900'`.
- New: regular message body contains `prose-chat`; dice card body contains `prose-chat` and `dark:prose-invert`.
- Unaffected (verified): `:1188-1195` and dice `:780/799/813` (`.prose` / `.max-w-none` selectors — the dice outer card already carries `max-w-none` and is first in DOM order).

### 5. Docs and changelog

- `docs/CHANGELOG.md`: new `## 2026-09-23` heading, player-facing — headings in posts are now sized in proportion to message text; the largest matches what used to be the third level, and the smaller levels no longer look like plain text. Also note dice-roll notes gained normal paragraph spacing. No class names, no plugin internals.
- `docs/help/general/messages.md:16`: **no change** — all six levels still work.
- `docs/FEATURES.md`: no change.
- `public/help/*.png`: check `message-actions.png` for a visible heading; regenerate only if one appears.

### 6. Verification

```bash
npm run lint
npx tsc -p tsconfig.app.json --noEmit
npx vitest run src/features/chat/MessageItem.test.tsx src/features/channels/ChannelStatusBar.test.tsx src/tailwind.config.test.ts
npm run build
```

Manual (`npm run dev`): post `#` through `######` in a channel message, a scene message, a channel status, and a dice roll with a markdown note; check light + dark at 360px width. Confirm h1 ≈ old h3 and h4/h5/h6 match h3.

## Risks

1. **Cascade order** — `prose-chat` must emit after `prose-sm`. Verified via `resolveConfig`; guarded by the config test. If Tailwind ever reorders, migrate to `prose-h1:`/`prose-h2:` utilities on the four containers.
2. **Dice card gains full prose** — paragraph gaps (0 → ~20.6px), list/code/link styling. Deliberate consistency fix; accepted.
3. **No visual-regression tests exist** — the manual check plus help screenshots are the only pixel guard.

## Appendix — evidence index

| Fact | Evidence |
|---|---|
| Parser pipeline | `src/components/MarkdownImpl.tsx:1-17`, `src/components/Markdown.tsx:4-20` |
| Plugin registered, no theme overrides | `tailwind.config.js:45-47` |
| Plugin defines only h1–h4 (`prose-sm` `em(30,14)`/`em(20,14)`/`em(18,14)`) | `@tailwindcss/typography@0.5.20 src/styles.js:30-72` |
| `DEFAULT` styles h1–h4 weights only (800/700/600/600), no h5/h6 | `src/styles.js:1500-1527` |
| Preflight resets heading size/weight to inherit | `tailwindcss` `lib/css/preflight.css:82-83` |
| No `prose-h5`/`prose-h6` overrides anywhere | repo-wide grep, zero hits outside the plugin's own tests |
| Container scale 17px × 1.0625 ≈ 18.06px | `src/index.css:10`, `src/features/chat/MessageItem.tsx:47-55,818` |
| Dice body has no prose | `src/features/chat/MessageItem.tsx:736` |
| No heading toolbar in composer | `src/features/chat/MessageComposer.tsx:386-490` |
| Literal-pinned class strings | `src/features/chat/MessageItem.test.tsx:1205,1214,1222`, `src/features/channels/ChannelStatusBar.test.tsx:47` |
| Config test harness to extend | `src/tailwind.config.test.ts:1-38` |
