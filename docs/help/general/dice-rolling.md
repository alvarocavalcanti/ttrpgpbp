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

Roll results show the full breakdown, for example `2d20kh1: **18**: [18, 7]`.

## Ability checks

From a message you can trigger an **ability check** (`STR Check`, `DEX Check`, etc.). It prompts for a modifier and rolls a d20. Rolls made from a message quote the original, so it's clear which request each roll answers.

## DC checks

A GM can attach a difficulty class to a check, e.g. `Make a DC 12 DEX Check`. The roll then states **Success** or **Failure** — green if the total (die + modifier) meets or beats the DC, red if it falls short.

## Dice Roller Panel

Both GMs and players can use the **Dice Roller Panel**:

- Pick a dice type (d4, d6, d8, d10, d12, d20, d100)
- Set the quantity
- Add a modifier (+N / -N)
- Toggle advantage / disadvantage (d20 only)
- Roll — the result is posted as a dice roll message

## Roll history

Every channel keeps a **roll history**, accessible from the Rolls item in the channel sidebar.
