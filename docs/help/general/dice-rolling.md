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

Advantage / disadvantage rolls show the roll details, for example `Rolled 2d20 with DIS [2, 15]: **2**`.

## Ability checks

From a message you can trigger an **ability check** (`STR Check`, `DEX Check`, etc.). It prompts for a modifier and rolls a d20. Appending **`with advantage`** or **`with disadvantage`** rolls a second d20 and keeps the best / worst. Rolls made from a message quote the original, so it's clear which request each roll answers.

## DC checks

A GM can attach a difficulty class to a check, e.g. `Make a DC 12 DEX Check`. The roll then states **Success** or **Failure** — green if the total (die + modifier) meets or beats the DC, red if it falls short.

## Dice Roller Panel

Both GMs and players can use the **Dice Roller Panel**:

- Pick a dice type (d4, d6, d8, d10, d12, d20, d100)
- Set the quantity
- Add a modifier (+N / -N) — on phones, use the − / + steppers
- Tap a quick-roll chip to repeat one of your last three rolls in the channel
- Toggle advantage / disadvantage (d20 only)
- Roll — the result is posted as a dice roll message

On phones the roller opens as a bottom sheet over the composer, so it's easy to reach and never gets cut off at the bottom of the screen.

## Roll history

Every channel keeps a **roll history**, accessible from the Rolls item in the channel sidebar.

## Fair, verifiable rolls

Every roll is generated and recorded **on the server** — the result, the individual dice, dropped dice, and any modifier are stored together with the roll message in a single step. That means everyone at the table sees the same trusted outcome, nothing can be edited after the fact, and when a message is deleted its roll is removed from the history.
