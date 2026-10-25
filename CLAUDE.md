# halloweenspecial: project guide for Claude

A roguelike **mini-Civ you win through combat**. Grow a city on a 3D hex "planet", raise a lineage of heroes from your own land, survive 5 auto-battles. Designed with the user and a friend; the user owns the design, Claude builds it. `summary.md` is the user's original pitch.

## Commands

```
npm run dev        # Vite dev server (we run it on :5199; ?seed=123 for a reproducible run)
npm test           # vitest: game core + glossary integrity (excludes the probe)
npm run typecheck  # tsc --noEmit (TypeScript 7)
npm run balance    # bot win rates; PROBE_RUNS=60 PROBE_SPECIES=all for the full sweep
```

Windows + Git Bash. `cd` in Bash trips an fnm hook: run commands from the repo root without `cd`. Commit/push only when asked; commits end with the Co-Authored-By line from the system prompt.

## Current design (as of the last session)

**Run:** pick a species → 5 rounds × (10 turns of city-building → 1 battle vs a ghost). **Sudden elimination:** losing (or drawing) a round battle ends the run. No vitality/HP pool, no score (Glory was removed as meaningless).

**Each turn:** build, claim border tiles, research (academies), trade, raid camps, recruit from the muster. No "deeds"/tasks (removed).

**Population** drives unit rarity. Thresholds: uncommon 100, rare 1k, epic 100k, legendary 1M. A rarity's odds ramp from its threshold toward the *next* one (`population.ts`). Growth comes from food (× morale).

**Morale (0–100):** currency for recruiting (by rarity) and rerolling the muster (cost rises per reroll per turn), and a multiplier on every field's output (×0.5 empty → ×1.5 full). Regen per turn + Light-type synergies + raid/battle wins.

**Muster:** a fresh set of citizens every turn (6; Orks ×2), shaped by population (rarity) and land/academies (affinities). Unrecruited citizens go home at turn end. Reroll with morale.

**Land:** hex map radius 5. Terrain → resource (forest timber, hills iron, mountains stone, steppe hide, tundra ice, volcanic ember, leyfield crystal, highlands skystone, plains/lake food). Tier-1 affinities are born from land: volcanic Fire, lake Water, mountains Earth, highlands Wind, leyfield Arcane. Territory cap grows with population; claiming costs gold. Camps (NPC troops) sit on the map; raiding one is real combat with permadeath, and winning claims the tile.

**Buildings** sit on tiles and have **adjacency rules** (data in `world/buildings.ts`; previewed on the board when placing). Kinds: civic (Farm, Market, Trading Post), extractors (one per terrain), military (Barracks/Walls/Armory, troop-wide stats, the tempo line), and academies (research). Housing was removed.

**Affinity research tree** (`affinities.ts`, all data):
- T1: Fire, Water, Earth, Wind, Arcane, Light (Church), Dark (Crypt). Mostly economy (resource yield %, morale), small combat.
- T2: Magma (Fire+Earth), Weaponry (Magma, on mountains/stone), Steel (Magma+Water), Ice, Verdance, Storm.
- T3: Archery (Wind+Weaponry), Electricity (Storm+Water), Knighthood, Spellblade, Sanctity, Necromancy.
- T4: Machinery (Electricity+Steel), Thunder (Electricity+Arcane; lightning mages, attacks chain), Eclipse (Sanctity+Necromancy).
- A higher affinity **unlocks when every parent's academy reaches Lv2** (`CONFIG.affinity.unlockLevel`); then its academy is buildable on its `site` terrain and its citizens are born. Locked affinities are never born, and locked academies are **hidden** in the Build list.
- Synergy tier from troop points (2/5/9/15) × academy-level multiplier. **Whole-troop vs carriers-only is a per-affinity design choice** (`team` flag). It is *not* a tier rule; the user decides which.
- **Combat effects are placeholders.** The user's priority is a coherent city-building loop; don't invest in combat balance unless asked.

**Units:** type = fighting style (fighter/tank/ranger/mage/healer); affinities only feed synergies. Level-ups are deliberately expensive: gold × rarity × 2.2^level, plus iron (from Lv3) and crystal (from Lv4). Double-click to level. Units can be renamed. Permadeath (except Elves).

**Species** (meta rules only, never combat): Humans (interest), Orks (bigger muster), Goblins (+2 slots, halved rare odds), Dwarves (few ranged), Elves (no permadeath), Golems (cheaper upgrades), Dragons (−2 slots, +1 rarity). Felines were removed.

**Opponents:** ghosts behind a `GhostSource` interface (`ai.ts`), AI-generated for now. They climb the tree by round (target tier 1,2,2,3,4). The Scout tab shows only public info (name, homeland, leaning), never their troop. Async PvP backend not built.

## Architecture

```
src/game/            pure TypeScript, no React. Actions are (state, …args) => newState via produce()
  config.ts          every tunable number
  affinities.ts      the research tree + synergy effect tables (data)
  species.ts, population.ts, citizens.ts, deeds.ts (camp loot only), ai.ts, synergy.ts
  world/             hex.ts, terrain.ts, map.ts (generation), buildings.ts (defs + adjacency), city.ts (evaluation, unlocks, birth weights)
  combat/sim.ts      deterministic fixed-tick sim → frames + events (renderers only replay)
  game.ts            GameState + all actions; city(s) is memoized per map object
  testing/bot.ts     scripted player for tests and the balance probe
src/ui/              React UI; R3F board (board/Board3D.tsx) and battle playback
  screens/TurnScreen.tsx   left tabs (Population/Resources, must fit with no scrolling) · board · right tabs (Tile/Muster/Troop/Build/Scout)
  board/BuildPanel.tsx     flat build list → detail view with turning 3D model
  help/                    click-to-learn: any non-button element with data-help="key" opens a glossary popover
  lexicon/                 ⚙ → Lexicon: tree diagram, buildings, units, species, terrain (generated from data)
public/cursors/      gauntlet cursor SVGs
public/textures/     Poly Haven CC0 surfaces shrunk to 512px WebP (diff + normal): grass (plains/forest), rock (mountains),
                     snow (tundra), mud (leyfield), volcanic, rocky (steppe), forestground (hills), trail (highlands).
                     Mapped by SURFACE in Board3D; only lake is still procedural.
```

## UI conventions the user asked for

- Help is **left-click** on underlined text (buttons keep their own click). Every `data-help` key must resolve; `glossary.test.ts` enforces this.
- No modal popovers for recruiting or unit details: they open **inline in the right panel** with a back arrow.
- Lists of affinities/academies are **grouped by tier**.
- Everything should fit on one screen; density/UX polish comes later.
- Dark "war ledger" look: IM Fell English SC display, Alegreya Sans body, Martian Mono numbers; gauntlet cursor.
- Board: curved "planet" island, night sky, **endless fog** past the edge (no visible ocean disc).
- Owned territory must read **strongly**: wild land is pulled toward cold night (`WILD`), owned tops glow warm with a gold rim, and the border is a bright line over a soft halo.
- Prefer cheap assets (≈100 KB textures, not 1K+ PBR sets); procedural where possible.

## Gotchas learned the hard way

- **ShaderMaterial colours:** `THREE.Color` values are linear; raw shaders write them unconverted. Pass `.convertLinearToSRGB()` for colours that must match fog/sky (this caused a dark ocean band).
- CylinderGeometry hex corners point along +z; a 6-segment RingGeometry needs `thetaStart = π/6` to line up.
- `produce()` deletes the city cache for the new map object. Never return a state whose map was mutated after `city(s)` was read without that.
- Inline `node -e` scripts through Bash mangle template literals (backticks, `${}`). Write edit scripts to files or use the Edit tool.
- Draws count as losses (sudden elimination).

## Open / next

- Combat effects for the tree (placeholders); balance with `npm run balance` after big changes.
- Real async PvP backend implementing `GhostSource`.
- Lake still uses a procedural swatch; a Kenney hex kit was suggested for models.
- Damage/elimination tuning, density pass on the UI.
