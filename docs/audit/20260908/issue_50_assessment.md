# Assessment — Issue #50: D&D Character Attributes Support

**Date:** 2026-09-08
**Issue:** [#50 — feature request - D&D character attributes support](https://github.com/alvarocavalcanti/ttrpgpbp/issues/50) (CLOSED, `deferred`)
**Related:** #49 — Shadowdark character attributes (shipped)
**Author:** Principal Engineer assessment (architecture + UX), requested 2026-09-08.
**Decisions confirmed by product owner at review:** players enter ability **modifiers directly** (consistent with #49, no score→modifier math); Proficiency Bonus is **manual numeric entry** (no class/level fields); system id **`dnd5e2024`**.

## 1. Verdict

The 2026-08-25 closure comment ("grows out of scope") rejected an unbounded feature: proficiency, double proficiency, class features. The issue now defines exactly those in a **bounded** way: Proficiency Bonus as a manual number, Expertise as a per-skill flag, Bard Jack of All Trades as a checkbox — no classes, no levels, no sheets.

**Recommendation: reopen #50.** Scope is bounded, effort is M (~2–3 days), risk is low and additive — no schema change, no RLS change, no realtime change. Keep the `deferred` label until scheduled; suggested slot is after the 20260904 audit P0 (whisper preview leak) and P1s ship, since those are live-correctness items.

The app is already ~70% of the way there: #49 shipped a data-driven game-system seam. #50 is mostly *data* (one JSON config + one DB config table), one generic parser extension, and one form extension.

## 2. What exists today (the seams that carry this)

| Seam | Location | Notes |
|---|---|---|
| System registry (frontend) | `src/game-systems/index.ts`, `src/game-systems/shadowdark.json` | JSON per system: attributes, modifier bounds, section copy. `GAME_SYSTEMS` record + helpers (`getSystemAttributes`, `clampModifier`, …). |
| Character data | `channel_members.attributes` JSONB — flat `Record<string, number>` | Numeric-only values, server-clamped on every write path. |
| Check linkification | `src/features/dice/parser.ts:27-31` | Regex built **from the system's attribute list** — `DEX Check`, `DC 12 DEX Check with advantage` → `check:` hrefs. Skill names are **not** recognized today (verified: `parser.test.ts:62` — "DC 18 Athletics Check" deliberately not linkified). |
| Roll UI | `CheckSheet` (`src/features/chat/MessageItem.tsx:109-163`) | Prefills modifier from the member's attributes, Adv/Dis toggle, **manual override before roll**. |
| Server-side clamps | `roll_dice` RPC (`20260817144038_backend_command_roll_dice.sql:118`), `enforce_member_field_bounds` trigger (`20260831150000_issue_337_privacy_db_hardening.sql:98`), `join_channel` (latest definition `20260831140000_issue_335_authz_hardening.sql:633`) | All hardcode `IF v_game_system = 'shadowdark'` for bounds. **This is the actual blocker for any new system, not just D&D.** |

No DB CHECK constraint on `channels.game_system` — it is free-form TEXT. Adding a new system id needs **zero schema change** to store.

## 3. Backend assessment

### What D&D needs from the backend

1. **Wider modifier bounds.** D&D ability modifiers run −5…+10; Proficiency Bonus is +2…+6; a computed skill total can reach +11…+12 (ability mod + 2× proficiency). Today's clamps (−4…5 default, −4…4 shadowdark) would silently corrupt both stored attributes and rolled notation.
2. **Richer attributes JSONB.** 24 proficiency flags (18 skills + 6 saving throws) + proficiencyBonus + the JoaT flag. The current trigger **drops every non-numeric entry** (`WHERE v ~ '^-?\d{1,4}$'`, `20260831150000:110`), so the stored shape must remain all-numeric.
3. **Parser terms are client-side only.** The server already validates dice notation generically (`20260817144038:90`) and clamps only the numeric modifier — nothing system-specific to add there.

### Recommended JSONB shape (stays flat, all-numeric — smallest diff)

```jsonc
{
  "STR": 3, "DEX": 2,             // ability modifiers
  "proficiencyBonus": 3,           // manual entry
  "prof:Athletics": 1,             // skills: 0 = none, 1 = proficient, 2 = expertise
  "prof:CON": 1,                   // saving throws: same encoding
  "joat": 1                        // Bard Jack of All Trades flag
}
```

Every existing SQL path keeps iterating numerics; only the **bounds logic** changes (per-key-prefix clamp).

### Modularity decision: config-driven, not case-by-case, not a plugin architecture

The one piece of generalization worth doing now — because it blocks *every* future system, not just D&D:

**Replace the three hardcoded `IF v_game_system = 'shadowdark'` branches with a `game_system_config` table** (`id, min_attr_modifier, max_attr_modifier, min_roll_modifier, max_roll_modifier`), seeded in the same migration with `none` and `shadowdark` rows that preserve today's exact bounds. The three functions read from it. A future system = one INSERT row, no function rewrites.

Then stop:

- **No plugin/class architecture.** One generic consumer path per concern; D&D is data.
- **No skills/proficiency in the DB.** Skills, saving-throw mappings, and proficiency semantics live in the frontend system config (`dnd.json`); the server's job stays "validate numerics, clamp bounds" — the same trust model as today.
- Case-by-case at the *feature* level, config-driven at the *bounds* level. Revisit when a third system demands something the JSON registry cannot express.

**Backend work items:**

- Migration: config table + rewrite the clamp logic in the three functions (latest `join_channel` definition, `enforce_member_field_bounds`, `roll_dice`) with per-key-prefix bounds for D&D (`prof:*` → 0…2, `proficiencyBonus` → 0…10, ability modifiers → −5…10). · **M**
- Types regen (CI drift gate) + pgTAP tests, including a regression test that pins existing shadowdark/`none` bounds *before* the rewrite. · **S**

## 4. Frontend assessment — no bloat

Principles: **no new screens, no new routes, nothing visible to other systems.** Everything renders conditionally from the system config.

1. **`src/game-systems/dnd5e2024.json`** — attributes (same 6), the 18 skills each mapped to its ability, 6 saving throws, bounds. Extends the `GameSystem` interface with optional `skills` / `savingThrows`; Shadowdark simply does not define them, so every consumer below renders nothing for it. · **S**
2. **Parser (`parser.ts`)** — three changes, all config-driven, no D&D branches:
   - Add skill names to the existing check alternation → `Athletics Check` and `<skill> check` work as `check:Athletics` hrefs with **no href format change** — the click site disambiguates skill vs ability by membership in `system.skills` (skill names never collide with attribute names).
   - New pattern: `Skill Check: <name>` (the literal-prefix form from the issue).
   - New pattern: `<attr> Save` for systems that define saving throws. · **S** (incl. tests)
3. **Click-site bonus computation** — one pure function in `game-systems/`: `computeCheckBonus(attributes, skillName | saveAttr)` handling proficient (+PB), expertise (+2×PB), and Jack of All Trades (half PB, round down, only on non-proficient checks). Unit-tested in isolation. · **S**
4. **`CheckSheet`** — for skill/save checks, prefill the computed total and show a one-line breakdown ("DEX +3 · Proficient +3 = **+6**"), keeping the manual override exactly as today. · **S**
5. **The forms (`EditCharacterModal` + `JoinChannel`)** — the real chunk. The 6 attribute inputs already exist. Add: one **Proficiency Bonus** input (reuses `ModifierInput`), a **Skills** section and a **Saving Throws** section rendered as a compact 3-column grid of **tap-cycle chips** (tap cycles none → prof → expertise; badge shows ○/●/●●). One reusable component (`ProficiencyChip`) serves both sections and both forms. Plus a single JoaT checkbox. No tabs, no accordion, no wizard — the modal is scrollable and this adds ~30 compact controls. · **M**

Chat rendering, dice roller, and roll history need **zero changes** — a roll is still a notation string; skills ride the existing `check:` hrefs.

### UI anti-bloat rules applied

- Conditional on system config → Shadowdark/generic channels see *nothing* new.
- One tap interaction instead of 24 dropdowns/checkboxes; expertise is the third tap state.
- Math happens at roll time in the sheet with a visible breakdown — no per-skill stored totals to keep in sync.
- Character data stays one JSONB blob — no new tables, no new endpoints.
- Help docs (`docs/help/`) get one section update on the character sheet for D&D channels; no other doc churn.

## 5. Effort & risk

| Area | Effort | Risk |
|---|---|---|
| `game_system_config` table + clamp rewrites + tests | M | Low — pgTAP pins existing bounds first |
| Parser extension + tests | S | Low — false-positive risk covered by tests |
| `computeCheckBonus` + tests | S | Low — pure function |
| Forms (chips, prof-bonus input, JoaT) | M | Low — additive UI, conditional render |
| `CheckSheet` breakdown | S | Low |
| **Total** | **~2–3 days** | **Low** |

Risks worth naming:

1. **Clamp regression on existing channels** — mitigated by writing the shadowdark/`none` bounds pgTAP test *before* the rewrite.
2. **Old clients in a D&D channel** roll without proficiency math — acceptable; same trust model as today (players can always hand-type a modifier into the CheckSheet or DiceRoller).
3. **Trigger drops non-numeric values** — the shape spec above keeps every value numeric, so the existing sanitize contract holds.

## 6. Recommendation on #50

**Reopen.** The closure reason no longer applies. Keep `deferred` until scheduled; suggested slot after the 20260904 audit P0/P1s. This document is the scope reference for the eventual implementation PRs (suggested split: one DB migration PR, one frontend feature PR).
