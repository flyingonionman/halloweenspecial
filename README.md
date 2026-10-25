# halloweenspecial

A roguelike mini-Civ where you win through combat. Grow a city on a 3D hex board, raise a lineage of heroes from your own land, and send them into auto-battles.

```
npm run dev       # play (append ?seed=123 for a reproducible run)
npm test          # game-core tests
npm run balance   # bot win rates per round (PROBE_RUNS=60 PROBE_SPECIES=all for the full sweep)
```

## Loop

Pick a species, then play 5 rounds. Each round is 10 turns of city-building followed by 1 battle against a ghost.

- **Each turn** you can build, claim tiles, trade and recruit as much as you can afford. You also get **one deed**: a safe task (forage, caravan, festival, census, prospect, drill) *or* a raid on an NPC camp on your border. A raid is real combat with permadeath. If you win, you get loot and the tile.
- **The round's opponent is known from turn 1** (Scout tab), so you can plan for them. Opponents are *ghost snapshots* (`GhostSnapshot` in `ai.ts`). For now they're AI-generated. Async PvP means implementing `GhostSource` against a backend.
- **Battles:** units that die are gone. A loss costs vitality, and 0 vitality ends the run.

## The land decides

| Terrain | Resource | Affinity |
|---|---|---|
| Forest | Timber | Bow |
| Hills | Iron | Sword |
| Mountains | Stone | Earth |
| Steppe | Hide | Shield |
| Tundra | Ice | Frost |
| Volcanic | Ember | Fire |
| Leyfield | Crystal | Arcane |
| Highlands | Skystone | Wind |
| Plains / Lake | Food | — |

- Your starting region leans toward one biome. You choose which border tiles to claim. Territory size is capped by population.
- **Citizens are born from your land.** Each affinity's odds = a small mutation floor + your tiles of its terrain + academy level + attunement. All odds are shown in the left rail.
- **Buildings cost gold plus resources and sit on tiles. Adjacency matters:**
  - Extractors get +1 per matching neighbour.
  - Barracks feed on Mines, and Walls on Quarries.
  - The Armory sits best between Barracks and Walls.
  - Farms get + from lakes, and Housing from farms.
  - The Trading Post rate improves next to a lake or market.
  - Academies attune to their terrain.
- **Academies** (one per affinity, Lv1–4, built with that affinity's resource) set the affinity level. The level makes those citizens more likely, makes carriers stronger, and multiplies their synergies.
- **Military buildings** (Barracks / Walls / Armory) give every unit a bonus. This is the tempo line.

## Units, affinities, synergies

- **Type** (fighter / tank / ranger / mage / healer) is how a unit fights.
- **Affinity points** add up across the troop into synergies. Pairs combine into compounds, such as Sword + Shield → Knight.
  - A synergy's *tier* comes from troop points. Its *strength* comes from the academy level.
  - Effects go straight to carriers, whatever their type.
- **Unit rarity** comes from population: uncommon at 100, rare at 1k, epic at 100k, legendary at 1M.
- **Species** change the meta rules (births, slots, rarity, vitality, permadeath, costs) and never combat.

## Architecture

```
src/game/            plain TypeScript, no React: the whole game
  config.ts          every tunable number
  world/             hex math, terrain, map generation, buildings + adjacency, city evaluation
  citizens.ts        land-shaped births
  deeds.ts           tasks and camp loot
  ai.ts              ghost snapshots (GhostSource) and camp troops
  affinities.ts      synergy table: pure data
  synergy.ts         tiers × levels → final combat stats
  combat/sim.ts      deterministic fixed-tick sim → timeline
  game.ts            GameState + pure actions (state, …args) => state
  testing/bot.ts     scripted player for tests and the balance probe
src/ui/              React menus, R3F city board, R3F battle playback (render only)
```

## Not yet built

Real async PvP backend, damage-scaling tuning (Felines are overtuned because damage per loss is capped), final synergy effects (placeholders in `affinities.ts`), sprites, pixel editor.
