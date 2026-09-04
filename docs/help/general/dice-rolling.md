---
title: Dice Rolling
screenshot: /help/dice-panel.png
---

## Inline dice notation

Write dice notation directly in a message and it becomes **clickable** — anyone can click it to roll. The result is posted to the channel history.

## Supported notation

- `NdX`, `NdX+M`, `NdX-M` — basic rolls with modifiers
- `2d20kh` / `2d20kl` — advantage / disadvantage (keep or drop highest/lowest)
- `4d6dl` — drop lowest
- `kh`, `kl`, `dh`, `dl` work with or without an explicit count, e.g. `2d20kh+4`

Roll messages break the total down into its parts, for example `Rolled 1d20+3: 10 + 3 = **13**` or `Rolled 2d6: 3 + 5 = **8**`. Advantage / disadvantage rolls show both dice, for example `Rolled 2d20 with DIS [2, 15]: **2**`.

## Critical rolls

A d20 that lands on a **20** shows **Critical Success**, and a d20 that lands on a **1** shows **Critical Failure**. This is based on the die itself — a modifier doesn't change it — and it works with advantage and disadvantage too (the kept die decides). The same moments are marked in the roll history.

Ability checks and DC checks have their own topic — see [Ability & DC Checks](/help/ability-checks).

## Dice Roller Panel

Both GMs and players can use the **Dice Roller Panel**:

- Pick a dice type (d4, d6, d8, d10, d12, d20, d100)
- Set the quantity
- Add a modifier (+N / -N) — on phones, use the − / + steppers
- Tap a quick-roll chip to repeat one of the last three distinct roll notations used in the channel
- Toggle advantage / disadvantage (d20 only)
- Roll — the result is posted as a dice roll message, and the roller closes so you can see it right away

On phones the roller opens as a bottom sheet over the composer, so it's easy to reach and never gets cut off at the bottom of the screen. It also closes once you roll.

## Roll history

Every channel keeps a **roll history**, accessible from the Rolls item in the channel sidebar.

## Fair, verifiable rolls

Every roll is generated and recorded **on the server** — the result, the individual dice, dropped dice, and any modifier are stored together with the roll message in a single step. That means everyone at the table sees the same trusted outcome, nothing can be edited after the fact, and when a message is deleted its roll is removed from the history.
