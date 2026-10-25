# halloweenspecial: project guide for Claude

A roguelike **mini-Civ you win through combat**. Grow a city on a 3D hex "planet", raise a lineage of heroes from your own land, survive 5 auto-battles. Designed with the user and a friend; the user owns the design, Claude builds it. `summary.md` is the user's original pitch.

## Commands

```
npm run dev        # Vite dev server (we run it on :5199; ?seed=123 for a reproducible run)
npm test           # vitest: game core + glossary integrity (excludes the probe)
npm run typecheck  # tsc --noEmit (TypeScript 7)
npm run balance    # bot win rates; PROBE_RUNS=60 PROBE_SPECIES=all for the full sweep
npm run sim        # one fight as text: SIM_A="tank,fighter:rare:3@fire2" SIM_B=… SIM_SEED=7 SIM_LOG=1 (or SIM_RUNS=200 for win rates)
npm run models     # regenerate the low-poly unit GLBs (scripts/unit-models.mjs → public/models/units/)
```

Dev URLs: `/` title menu · `/?debug` combat debugger · `/?seed=123` or `/?play` straight into a run.

Windows + Git Bash. `cd` in Bash trips an fnm hook: run commands from the repo root without `cd`. Commit/push only when asked; commits end with the Co-Authored-By line from the system prompt.

## Current design (as of the last session)

**Run:** pick a species → 5 rounds × (10 turns of city-building → 1 battle vs a ghost). **Sudden elimination:** losing (or drawing) a round battle ends the run. No vitality/HP pool, no score (Glory was removed as meaningless).

**Each turn:** build, claim border tiles, grow academies (upfront + throughput), trade, raid camps, recruit from the muster. No "deeds"/tasks (removed).

**Two independent rolls make a citizen** (the user was explicit; keep them separate):
- **Rarity:** from population only. Sets the unit's strength.
- **Affinity:** from academies only, never from land or rarity. Citizens are born **plain** (no affinity) unless an academy gives them one, and only ever **one** affinity. Weights: none = 6, each dedicated academy = 4 × level. The chosen academy's level caps points (1..L), and each extra point is ×0.25 as likely (`rollAffinity`, `affinityOdds` in `citizens.ts`). Example: 2× Lv1 + 1× Lv2 Water ≈ 66% Water-1, 7% Water-2.
- **"Affinity ≠ resource"** must stay obvious in the UI: land gives essences; only academies give affinities (glossary key `affinity-vs-resource`).

**Population** drives unit rarity. Thresholds: uncommon 100, rare 1k, epic 100k, legendary 1M. A rarity's odds ramp from its threshold toward the *next* one (`population.ts`). Growth comes from food (× morale).

**Morale (0–100):** currency for recruiting (calling a muster: 10, +10 per further call that turn) and enlisting citizens (by rarity), and a multiplier on every field's output (×0.5 empty → ×1.5 full). Regen per turn + Light-type synergies + raid/battle wins.

**Muster:** every turn starts **empty** (the user's call). The player presses **Recruit** (`callMuster`, formerly "reroll") to spend morale and call citizens (6; Orks ×2), shaped by population (rarity) and academies (affinities), then **Enlists** individuals (`recruit` in code; UI says "Enlist"). Recruiting again replaces whoever is waiting; everyone unenlisted goes home at turn end.
- Tiles have **no gaps** (`HEX_R = 1`, the grid spacing), so the land reads as one surface.

**Resources** (`world/terrain.ts`): gold, food (a flow, not stored), stone, and seven **essences**, one per tier-1 element (fire, water, earth, wind, light, dark, arcane). Every essence trains units and feeds academies (upfront + per-turn throughput); each also has a deliberately **asymmetric secondary role** (the user's design: spend on training vs the side role):
- stone: every building costs it
- earth: claims land instead of gold (1 earth per 3 gold of the claim)
- light: offered at a Church for morale
- water: builds Fisheries (lake → food)
- arcane: every academy after your first costs 3 arcane per academy owned (its main use)
- fire, wind, dark: training and academies only

**Land = one biome per run** (`world/map.ts`): hex radius 4 (9 across). The biome is a basic terrain (plains, steppe or highlands), ~50% of tiles as one contiguous field. Each biome has two speciality terrains in clusters, ~40%: plains → lake, forest; steppe → volcanic, hills; highlands → mountains, tundra. Then ~10% strays of anything (leyfields only appear here). The ratio is the user's 5:4:1. **No lone odd tiles:** specialities come in clusters of 3–5 and strays in pairs, and a cluster that can't grow is dropped. The capital ring is basic with exactly one speciality tile, the tip of a cluster. Terrain → resource: plains food, hills/mountains stone, steppe/forest earth ("Mud"), highlands wind ("Gale Spirits"), lake/tundra water ("Hydrocorals"), volcanic fire ("Ember"), leyfield arcane. Resource *ids* keep the element names (fire, water, earth, wind); only the labels are physical (`RESOURCE_LABEL`). Affinities keep the element names. Territory cap grows with population. Camps: raiding is real combat with permadeath; winning claims the tile.

**Buildings** (`world/buildings.ts`) all cost stone + gold (some an essence). Each has **adjacency rules**, previewed on the board:
- **Gathering:** one line only: Mine → Quarry → Excavator (levels; `buildingName(id, level)`). It digs whatever its tile holds: raw yield + level, +1 per same-terrain neighbour.
- **Civic:** Farm, Fishery (the only building on lakes; costs water), Market, Trading Post.
- **Faith:** Church (light) and Crypt (dark), the only sources of those essences.
- **Research:** Academies, **as many as you like**, built empty (`level 0`) anywhere. The first costs gold + stone; each later one also costs arcane (`buildCost`). **Growing one costs an upfront payment *and* committed throughput** (user's design, 2026-10-25): dedicate an empty academy to a **tier-1** affinity, raise it (to Lv4), or from Lv2 **evolve** it into a child affinity once that child is unlocked (Fire → Magma when Fire and Earth are both Lv2). Each move pays `researchCost` upfront and commits `academyFlow` = `flowPerLevel` × level × tier of each root essence **per turn**, taken from income every turn (`academyUpkeep`, `netYields`; the top bar shows net income). A move must fit in your free (uncommitted) income. Changes are `pending` and take effect next turn, one per academy per turn. Unpaid upkeep **starves** the academy (teaches nothing). No more lump offerings. Code: `academyMoves`/`academyMoveCost`/`academyBlock`/`commitAcademy`/`runAcademies` in `game.ts`.
- **Military:** Barracks, Walls, Armory (troop-wide stats, the tempo line).
- Some buildings are **interactive after being built** (Tile tab): an academy opens dedicate/raise/evolve, the Trading Post opens trade, the Church opens offerings.
- **Requirements UI** (user's rules): costs are shown plainly (no strikethrough). Clicking Place, or an offering, without the resources shakes the button red and shows an auto-dismissing toast, bottom right ("You are missing N requirements: …", `toast.tsx` `useRequirementCheck`). No "best spot" hints: players can think.

**Affinity tree** (`affinities.ts`, data). An affinity's **level = your best academy of it** (`city.affinityLevels`):
- T1: Fire, Water, Earth, Wind, Arcane, Light, Dark. Mostly economy (yield %, morale), small combat.
- T2: Magma (Fire+Earth), Weaponry (Magma), Steel (Magma+Water), Ice, Verdance, Storm.
- T3: Archery, Electricity, Knighthood, Spellblade, Sanctity, Necromancy.
- T4: Machinery, Thunder (attacks chain), Eclipse.
- Upfront: each tier-1 root's essence × level × tier, plus gold (`researchCost`, `rootsOf`); throughput: `academyFlow` per turn (see Research above).
- A tier-2+ affinity is reached by **evolving** an academy of one parent once every parent has an academy at Lv2 (`unlockLevel`); empty academies take tier-1 only.
- Synergy tier from troop points (2/5/9/15) × academy-level multiplier. **Whole-troop vs carriers-only is a per-affinity design choice** (`team` flag), not a tier rule.
- **Combat effects are placeholders.** The user's priority is a coherent city-building loop.

**Units:** type = fighting style (fighter/tank/ranger/mage/healer); affinities only feed synergies. Level-ups are deliberately expensive: gold × rarity × 2.2^level, plus (from Lv2) the essences of the unit's affinity's roots (plain units train on gold alone; `primaryAffinity` returns null for them and the UI uses `PLAIN_COLOR`). Double-click to level. Units can be renamed. Permadeath (except Elves).

**Combat** (`combat/sim.ts`, user's brief: deterministic, readable "mini League of Legends", tick based, movement matters):
- Hex arena of radius 7 (15 cells across), one unit per cell, `CONFIG.combat.ticksPerSecond` = 10. Each tick: wound-up effects land, then every idle unit picks an action; **every action takes whole ticks** (a step = `moveTicks`, an attack = `attackTicks` landing after a windup, a skill = `castTicks`). A step claims its destination cell at once. Stats: `range` is in cells, `moveSpeed` in cells/s.
- **Tanks grab aggro**: fighters, rangers and mages target any reachable enemy tank first, then the nearest (BFS reach cost); targets are sticky. Tanks fight the nearest; Taunt locks attackers within 3 cells (not healers). **Healers** heal the most hurt ally in reach (Mend at full energy), walk to hurt allies, and otherwise **hex** the strongest enemy in reach (weak magic hit + 25% damage-dealt debuff).
- Fairness: teams interleave unit by unit, a seeded coin picks the leading team each tick, team 1 explores BFS in mirrored direction order, and blows already wound up still land if the attacker dies on that same tick. Mirror matches are ~50/50 (a test checks this).
- Overtime from tick 300: damage ×(1 + 0.1/s), healing divided by the same, so double-healer stalls end.
- Output: `frames[tick]` (cell, hp, shield, energy, target, flags per unit) + events (`move`, `attack`, `cast`, `skill`, `hit`, `heal`, `shield`, `status`, `target` with a reason, `death` with the killer). `combat/report.ts` reads it (tallies, `activity`, `describe`, `formatCombat`); `combat/lineup.ts` builds troops from spec strings (`type[:rarity][:level][@affinityN]`).
- UI (`ui/battle/`): `Arena3D` replays the timeline at fractional ticks (step hops, weapon swings, projectiles, skill bursts, hit flashes, deaths, shield bubbles, aggro lines) with a DOM overlay for LoL-style nameplates and floating numbers; `BattleView` adds scoreboards (dmg/taken/heal/kills), kill feed, play/pause/step/scrub/speed (space, ←/→), an inspector (what the unit is doing this tick, target + why) and a clickable combat log. Real battles and the debugger share it.
- **Unit models** are generated from code: `scripts/unit-models.mjs` (three.js primitives, flat shaded, merged per material, written with gltf-transform). Contract: faces +z, feet at y=0, nodes `body`, `armL`/`armR` (pivot at the shoulders, hanging at rest) and `weapon` (child of the arm holding it, at the hand). Materials `team`, `accent` and `skin` are recoloured at runtime (team colour, glowing affinity colour, skin tone from the uid). **Animation moves the arms, never the weapon by itself** (user's call): `poseArms` in `battle/models.ts` has rest/windup/strike key poses per type as [main shoulder, wrist, off shoulder]. Negative shoulder rotation = arm forward; staffs and swords end pointing *toward* the target. Bump `?v=` in `MODEL_URL` after regenerating. A hand-made or downloaded GLB can replace one if it keeps the contract.

**Portraits are the battle models** (user loves the blocky look): `Portrait` shows a full-body render of the unit's GLB, dressed like in the arena (`battle/models.ts` `dressModel`: team gold, affinity accent, skin tone from the uid). One shared offscreen WebGL renderer (`components/portraitRenderer.ts`) snapshots each look to a cached PNG; never a live canvas per portrait (browsers cap WebGL contexts at ~16). Live portraits (hovered card, detail view) are posed by one shared rAF loop on that same renderer and copied into a 2D canvas. Units show as tall 3:4 **figure cards** (`FigureCard`, the user's sketch): render fills the card, rarity + type chips top-left, name bottom-left, affinity + price/level bottom-right, no inner border; 3 per row. The **unit detail** (user's sketch): animated figure left (46%), right column = rarity/type/level, name, affinities, reach/attack/step/skill, and the main action (Enlist, Bench/Deploy) at its foot; full combat-style text collapsed below, then stats.

**Title menu** (`screens/TitleScreen.tsx`): Start game / Continue · Settings (Lexicon, Credits) · Debugger tool, over a looping demo fight. In game, ⚙ also has Combat debugger and Main menu (the run is kept). **Combat debugger** (`debugger/CombatDebugger.tsx`): edit both troops (type, rarity, level, affinity ×points, academy level per side, presets, spec string), pick a seed, Fight → `BattleView` in debug mode (cells + log on); "Run seeds" gives win rates and per-unit averages. Lineups persist in localStorage.

**Species** (meta rules only, never combat): Humans (interest), Orks (bigger muster), Goblins (+2 slots, halved rare odds), Dwarves (few ranged), Elves (no permadeath), Golems (cheaper upgrades), Dragons (−2 slots, +1 rarity). Felines were removed.

**Opponents:** ghosts behind a `GhostSource` interface (`ai.ts`), AI-generated for now. They climb the tree by round (target tier 1,2,2,3,4). The Scout tab shows only public info (name, homeland, leaning), never their troop. Async PvP backend not built.

## Architecture

```
src/game/            pure TypeScript, no React. Actions are (state, …args) => newState via produce()
  config.ts          every tunable number
  affinities.ts      the research tree + synergy effect tables (data)
  species.ts, population.ts, citizens.ts, deeds.ts (camp loot only), ai.ts, synergy.ts
  world/             hex.ts, terrain.ts, map.ts (generation), buildings.ts (defs + adjacency), city.ts (evaluation, academies, unlocks)
  combat/            sim.ts (deterministic tick sim → frames + events; renderers only replay), arena.ts (hex cells,
                     deployment columns), report.ts (tallies, log text), lineup.ts (spec strings), sim.probe.test.ts (CLI)
  game.ts            GameState + all actions; city(s) is memoized per map object
  testing/bot.ts     scripted player for tests and the balance probe
src/ui/              React UI; R3F board (board/Board3D.tsx) and battle playback
  App.tsx                  StarCraft-style corners: top-left population badge (dropdown = PopulationTab); top-right a *flat*
                           row of cells for every resource held or produced + food, morale, land, and a "⋯" dropdown
                           (ResourcesTab); CornerMenu docked flush at the bottom of the right side panel (⚙ menu opening upward,
                           game name + R·T, timeline, End turn on the right; `.side-body` has bottom padding for it). No left rail.
  screens/TurnScreen.tsx   board · right tabs (Tile/Muster/Troop/Build/Scout); exports PopulationTab/ResourcesTab for the dropdowns
  board/BuildPanel.tsx     flat build list → detail view with turning 3D model
  help/                    click-to-learn: any non-button element with data-help="key" opens a glossary popover
  lexicon/                 ⚙ → Lexicon: tree diagram, buildings, units, species, terrain (generated from data)
public/cursors/      gauntlet cursor SVGs
public/textures/     Poly Haven CC0 surfaces shrunk to 512px WebP (diff + normal): grass (plains/forest), rock (mountains),
                     snow (tundra), mud (leyfield), volcanic, forestground (steppe), rocky (hills), rocky2 (highlands).
public/models/       volcano.glb: "Volcano V1" by JayT3D (CC BY 4.0), cut from 8 MB to ~60 KB (floor kept,
                     ~4.8k tris, photo baked into vertex colours, COLOR_0 alpha = lava glow via onBeforeCompile).
                     Script: scratchpad gltf-tools/shrink-volcano.mjs pattern (gltf-transform + browser canvas;
                     the gltf-transform CLI's sharp/webp step is broken on this Windows box).
                     mine.glb: "Low-poly Mine" by Sponk (CC BY 4.0), 54 meshes merged, 83k → 3.3k tris, colours in
                     COLOR_0 (scratchpad gltf-tools/shrink-flat.mjs). obelisk.glb: "Fancy Obelisk" by Oneironauticus
                     (CC BY 4.0), academies; textures cut to 256px WebP (shrink-tex.mjs). Placed via `useFittedModel`.
src/ui/Credits.tsx   ⚙ → Credits. Every third-party asset + licence. CC-BY assets MUST be listed here.
                     Mapped by SURFACE in Board3D; only lake is still procedural.
```

## UI conventions the user asked for

- Help is **left-click** on underlined text (buttons keep their own click). Every `data-help` key must resolve; `glossary.test.ts` enforces this.
- No modal popovers for recruiting or unit details: they open **inline in the right panel** with a back arrow.
- Lists of affinities are **grouped by tier**.
- Everything should fit on one screen; density/UX polish comes later.
- Dark "war ledger" look: IM Fell English SC display, Alegreya Sans body, Martian Mono numbers; gauntlet cursor.
- Board: curved "planet" island, night sky, **endless fog** past the edge (no visible ocean disc).
- **Eye toggle** (top left of the board) cycles map lenses: Normal → Resources (tint by main resource, owned tiles labelled with output) → Buildings (building/academy/camp labels). `lensOverlays` in TurnScreen → `overlays` prop on Board3D.
- Bare volcanic tiles use the volcano model **as the tile top** (`VolcanoTop`): its own floor is clamped to the hexagon (`fitToHex`), eased down at the rim, tinted with the tile's `topColor`, and the flat cap is hidden (`capHidden`). The volcanic photo texture only shows under buildings/camps. No other terrain props.
- **Buildings stand centred** on their tile, drawn a bit larger than tile size so they read from the board camera (`PAD` at the centre, `PAD_SCALE` 0.95, capital `CAPITAL_SCALE` 1.15; the user asked for centred and bigger after trying corner pads). Relief eases flat under the pad. A volcanic tile with a building drops the volcano model and shows the volcanic rock texture.
- Dev hook: `window.__hs = { store, game }` (dev builds only) to drive the game from the console or Playwright.
- Tile **selection is turquoise** (`SELECT_COLOR`), never yellow/orange: warm colours blend into the gold territory border.
- Board `<Html>` labels need `zIndexRange={[20, 0]}` or they draw over modal sheets.
- The board is **flat**: every tile is the same height (`TILE_H`). Terrain relief comes from textures, not elevation. There are **no terrain props** (no trees, cones, crystals; the user wants it to feel "real"); only buildings and camps sit on tiles. Shading depth comes from the normal map (`bump` in `SURFACE`). Mountains also get `relief`: a subdivided hex top displaced by the rock photo's brightness, fading flat at the rim (`reliefGeometry`). Use it for any terrain that should feel bumpy.
- Owned territory must read **strongly**: wild land is pulled toward cold night (`WILD`) and the territory border is a bright line over a soft halo. The user removed the warm glow on owned tops and the per-tile inner gold rim ("weird graphics", "unnecessary"); don't add tints/rims on owned tiles back.
- Prefer cheap assets (≈100 KB textures, not 1K+ PBR sets); procedural where possible.

## Gotchas learned the hard way

- **ShaderMaterial colours:** `THREE.Color` values are linear; raw shaders write them unconverted. Pass `.convertLinearToSRGB()` for colours that must match fog/sky (this caused a dark ocean band).
- CylinderGeometry hex corners point along +z; a 6-segment RingGeometry needs `thetaStart = π/6` to line up.
- `produce()` deletes the city cache for the new map object. Never return a state whose map was mutated after `city(s)` was read without that.
- Inline `node -e` scripts through Bash mangle template literals (backticks, `${}`). Write edit scripts to files or use the Edit tool.
- Draws count as losses (sudden elimination).
- CSS imported from a component loads **before** `styles.css` (main.tsx imports App first), so equal-specificity rules there lose to styles.css (`.app.app-full`, not `.app-full`).
- When Bash's cwd isn't the repo, `cd` into it trips the fnm hook. Use `npx --prefix <repo> vitest run … --root <repo>` or `node <abs path>` instead.

## Open / next

- Combat effects for the tree (placeholders); balance with `npm run balance` after big changes. After the biome/essence/academy-births rework and the tick-based combat rewrite (2026-10-25) the bot clears 0% (R1 50–100%, R2 ~20%); numbers are untuned.
- Arena doodads/environments (the user plans to add them later; the ring currently has walls + six braziers).
- Water texture: no free photo site has good water; plan is a procedural water shader (or three.js's MIT `waternormals.jpg`).
- Real async PvP backend implementing `GhostSource`.
- Lake still uses a procedural swatch; a Kenney hex kit was suggested for models.
- Damage/elimination tuning, density pass on the UI.
