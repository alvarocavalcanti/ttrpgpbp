# Assessment — Issue #50: D&D Character Attributes Support

**Date:** 2026-09-08
**Issue:** [#50 — feature request - D&D character attributes support](https://github.com/alvarocavalcanti/ttrpgpbp/issues/50) (REOPENED, `deferred`)
**Related:** #49 — Shadowdark character attributes (shipped)
**Author:** Principal Engineer assessment (architecture + UX), requested 2026-09-08.
**Revised:** 2026-09-08 — incorporates CodeRabbit review feedback (consistent numeric contract, keyed attribute-bounds split, save/skill rule separation, shared form serialization).
**Decisions confirmed by product owner at review:** players enter ability **modifiers directly** (consistent with #49, no score→modifier math); Proficiency Bonus is **manual numeric entry** (no class/level fields); system id **`dnd5e2024`**.

## 1. Verdict

The 2026-08-25 closure comment ("grows out of scope") rejected an unbounded feature: proficiency, double proficiency, class features. The issue now defines exactly those in a **bounded** way: Proficiency Bonus as a manual number, Expertise as a per-skill flag, Bard Jack of All Trades as a checkbox — no classes, no levels, no sheets.

**Recommendation: reopen #50.** Scope is bounded, effort is M (~3–4 days), risk is low and additive — no change to the **existing** channel/character tables, no RLS change, no realtime change. What it *does* add: two server config tables via one migration (with types regen and rollback in scope) — see §3. Keep the `deferred` label until scheduled; suggested slot is after the 20260904 audit P0 (whisper preview leak) and P1s ship, since those are live-correctness items.

The app is already ~70% of the way there: #49 shipped a data-driven game-system seam. #50 is mostly *data* (one JSON config + DB config tables), one generic parser extension, and one form extension.

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

1. **Wider modifier bounds.** Today's clamps (−4…5 default, −4…4 shadowdark) would silently corrupt both stored attributes and rolled notation — D&D needs the wider contract below.
2. **Richer attributes JSONB.** 24 proficiency flags (18 skills + 6 saving throws) + proficiencyBonus + the JoaT flag. The current trigger **drops every non-numeric entry** (`WHERE v ~ '^-?\d{1,4}$'`, `20260831150000:110`), so the stored shape must remain all-numeric.
3. **Parser terms are client-side only.** The server already validates dice notation generically (`20260817144038:90`) and clamps only the numeric modifier — nothing system-specific to add there.

### Numeric contract (single source of truth)

One contract governs manual-entry validation, persisted-attribute clamping, and derived roll totals. Every bound below is a config value (§3), not code.

| Quantity | Entered by player | Persisted as | Notes |
|---|---|---|---|
| Ability modifiers (`STR`…`CHA`) | −5…+10 | −5…+10 | Players enter modifiers directly (scores 1–30 map to −5…+10). |
| Proficiency Bonus (`proficiencyBonus`) | 0…6 | 0…6 | PHB range is 2…6; 0 permitted (sidekicks/NPCs). Raising the cap is a config row, not code. |
| Skill proficiency flags (`prof:<Skill>`) | 0…2 | 0…2 | 0 = none, 1 = proficient, 2 = expertise. **Skills only** — see §4. |
| Saving-throw proficiency (`prof:<STR>`…) | 0…1 | 0…1 | 0 = none, 1 = proficient. No expertise/JoaT for saves (2024 rules). |
| Jack of All Trades (`joat`) | 0…1 | 0…1 | Applies to skill checks and raw ability checks when the character lacks proficiency — never saves. |
| Derived skill/save total | — | — | mod + PB×(1 or 2), or mod + ⌊PB/2⌋ (JoaT) → range **−5…+22**. |
| `roll_dice` scalar bound (`dnd5e2024`) | — | — | **−10…+25**: covers the derived max plus headroom for hand-typed multi-bonus notations. |

Tests must pin both extrema of every row (valid min/max accepted, e.g. `proficiencyBonus: 7` rejected at input *and* at the DB clamp).

### Recommended JSONB shape (stays flat, all-numeric — smallest diff)

```jsonc
{
  "STR": 3, "DEX": 2,             // ability modifiers
  "proficiencyBonus": 3,           // manual entry
  "prof:Athletics": 1,             // skills: 0 = none, 1 = proficient, 2 = expertise
  "prof:CON": 1,                   // saving throws: 0 = none, 1 = proficient (no expertise/JoaT — 2024 rules)
  "joat": 1                        // Bard Jack of All Trades flag (skill/ability checks only)
}
```

Every existing SQL path keeps iterating numerics; only the **bounds logic** changes (per-key-prefix clamp).

### Modularity decision: config-driven, not case-by-case, not a plugin architecture

The one piece of generalization worth doing now — because it blocks *every* future system, not just D&D:

**Replace the three hardcoded `IF v_game_system = 'shadowdark'` branches with two config tables**, seeded in the same migration with rows that preserve today's exact bounds:

- `game_system_key_bounds (system_id, key_prefix, min_value, max_value)` — **keyed**, applies to persisted `channel_members.attributes`. The clamp trigger matches the longest `key_prefix` (prefix `''` = default). Seeds: `none` → default −4…5 · `shadowdark` → default −4…4 · `dnd5e2024` → default −5…10, `prof:` 0…2, `proficiencyBonus` 0…6, `joat` 0…1.
- `game_system_roll_bounds (system_id, min_modifier, max_modifier)` — **scalar**, applies to the notation modifier inside `roll_dice`. The roll path receives a notation string, not an attribute key, so derived-total bounds must live here, keyed only by system. Seeds: `none` → −4…5 · `shadowdark` → −4…4 · `dnd5e2024` → −10…25 (per the numeric contract).

The three functions read their bounds from these tables. A future system = INSERT rows, no function rewrites.

Then stop:

- **No plugin/class architecture.** One generic consumer path per concern; D&D is data.
- **No skills/proficiency in the DB.** Skills, saving-throw mappings, and proficiency semantics live in the frontend system config (`dnd.json`); the server's job stays "validate numerics, clamp bounds" — the same trust model as today.
- Case-by-case at the *feature* level, config-driven at the *bounds* level. Revisit when a third system demands something the JSON registry cannot express.

**Backend work items:**

- Migration: the two config tables + rewrite the clamp logic in the three functions (latest `join_channel` definition, `enforce_member_field_bounds`, `roll_dice`): the two attribute paths clamp per key via `game_system_key_bounds` longest-prefix match; `roll_dice` reads `game_system_roll_bounds`. · **M**
- Types regen (CI drift gate) + pgTAP tests: pin existing shadowdark/`none` bounds *before* the rewrite (regression guard), then cover the numeric-contract extrema — valid min/max at every key-prefix bound, out-of-range values rejected (e.g. `proficiencyBonus: 7`, `prof:X: 3`). · **S**

## 4. Frontend assessment — no bloat

Principles: **no new screens, no new routes, nothing visible to other systems.** Everything renders conditionally from the system config.

1. **`src/game-systems/dnd5e2024.json`** — attributes (same 6), the 18 skills each mapped to its ability, 6 saving throws, bounds. Extends the `GameSystem` interface with optional `skills` / `savingThrows`; Shadowdark simply does not define them, so every consumer below renders nothing for it. · **S**
2. **Parser (`parser.ts`)** — three changes, all config-driven, no D&D branches:
   - Add skill names to the existing check alternation → `Athletics Check` and `<skill> check` work as `check:Athletics` hrefs with **no href format change** — the click site disambiguates skill vs ability by membership in `system.skills` (skill names never collide with attribute names).
   - New pattern: `Skill Check: <name>` (the literal-prefix form from the issue).
   - New pattern: `<attr> Save` for systems that define saving throws. · **S** (incl. tests)
3. **Click-site bonus computation** — two pure functions in `game-systems/`, because the 2024 rules differ:
   - `computeSkillBonus(attributes, skillName)` — proficient: +PB · expertise: +2×PB · without proficiency, with JoaT: +⌊PB/2⌋. Jack of All Trades also covers raw ability checks (e.g. `STR Check`) when the character lacks proficiency.
   - `computeSaveBonus(attributes, saveAttr)` — proficient: +PB · otherwise just the ability modifier. **Expertise and Jack of All Trades never apply to saving throws** (2024 rules: Expertise doubles skill proficiencies; JoaT covers ability checks lacking skill proficiency).
   - Unit-tested in isolation, including numeric-contract extrema (mod −5/+10, PB 0/6) for both paths. · **S**
4. **`CheckSheet`** — for skill/save checks, prefill the computed total (`computeSkillBonus` / `computeSaveBonus`) and show a one-line breakdown ("DEX +3 · Proficient +3 = **+6**"; saves show "CON +1 · Proficient +3 = **+4**"), keeping the manual override exactly as today. · **S**
5. **The forms (`EditCharacterModal` + `JoinChannel`)** — the real chunk. The 6 attribute inputs already exist. Add: one **Proficiency Bonus** input (reuses `ModifierInput`), a **Skills** section rendered as a compact 3-column grid of **3-state tap-cycle chips** (none → prof → expertise; badge ○/●/●●), and a **Saving Throws** section as 2-state toggle chips (none → prof; expertise/JoaT do not exist for saves). One reusable component (`ProficiencyChip`) with a cycle-count prop serves both sections and both forms. Plus a single JoaT checkbox (skills/ability checks only). No tabs, no accordion, no wizard — the modal is scrollable and this adds ~30 compact controls. · **M**
6. **Shared serialization** — `encodeCharacterAttributes(system, formState)` / `decodeCharacterAttributes(system, row)` helpers in `game-systems/` are the **only** place that maps form state ⇄ the JSONB shape (numeric contract enforced at encode: out-of-range `proficiencyBonus`/flags rejected, non-numerics never emitted). Both `JoinChannel` (rides the join payload as `p_character_attributes`) and `EditCharacterModal` (`updateCharacter`) call them — form code never hand-builds attribute objects, so the new fields cannot be silently dropped on join or edit. Roundtrip tests: join → reload → edit → reload preserves prof flags/PB/JoaT for D&D channels and still passes for shadowdark. · **S**

Chat rendering, dice roller, and roll history need **zero changes** — a roll is still a notation string; skills ride the existing `check:` hrefs.

### UI anti-bloat rules applied

- Conditional on system config → Shadowdark/generic channels see *nothing* new.
- One tap interaction instead of 24 dropdowns/checkboxes; expertise is the third tap state (skills) — saves just toggle.
- Math happens at roll time in the sheet with a visible breakdown — no per-skill stored totals to keep in sync.
- Character data stays one JSONB blob — the two new server config tables are system configuration, invisible to players; no new per-character tables or endpoints.
- Help docs (`docs/help/`) get one section update on the character sheet for D&D channels; no other doc churn.

## 5. Effort & risk

| Area | Effort | Risk |
|---|---|---|
| `game_system_key_bounds` + `game_system_roll_bounds` tables, clamp rewrites, extrema pgTAP tests | M | Low — pgTAP pins existing bounds first |
| Parser extension + tests | S | Low — false-positive risk covered by tests |
| `computeSkillBonus` / `computeSaveBonus` + tests | S | Low — pure functions |
| Forms (chips, prof-bonus input, JoaT) | M | Low — additive UI, conditional render |
| Shared encode/decode + roundtrip tests | S | Low — closes the dropped-fields-on-join gap |
| `CheckSheet` breakdown | S | Low |
| **Total** | **~3–4 days** | **Low** |

Risks worth naming:

1. **Clamp regression on existing channels** — mitigated by writing the shadowdark/`none` bounds pgTAP test *before* the rewrite.
2. **Old clients in a D&D channel** roll without proficiency math — acceptable; same trust model as today (players can always hand-type a modifier into the CheckSheet or DiceRoller).
3. **Trigger drops non-numeric values** — the shape spec above keeps every value numeric, so the existing sanitize contract holds.

## 6. Recommendation on #50

**Reopen.** The closure reason no longer applies. Keep `deferred` until scheduled; suggested slot after the 20260904 audit P0/P1s. This document is the scope reference for the eventual implementation PRs (suggested split: one DB migration PR, one frontend feature PR).
