# halloweenspecial

A roguelike civ auto-battler. Grow a civilization through rarity tiers, shape your market with buildings, draft a six-unit troop, and survive five battles.

```
npm run dev       # play (append ?seed=123 for a reproducible run)
npm test          # game-core tests
npm run balance   # greedy-bot win rates per round across 200 seeds
```

## Loop

5 rounds × (3 eras of management → 1 auto-battle).

- **Era:** the market offers 100 distinct units. Their rarity mix comes from population, and their tags, quality and rarity bumps come from buildings. You can recruit, level, bench, release units and build. The market rerolls at the end of each era. The bench persists.
- **Battle:** your troop fights an AI civ at the round's par tier. Dead units are gone for good. Survivors get cheaper upgrades. A loss costs vitality (100% pool).
- **Tiers:** common is the default. Uncommon unlocks at 100 population, rare at 1k, epic at 100k and legendary at 1M. A newly unlocked rarity ramps in gradually.

## Architecture

```
src/game/          plain TypeScript, no React: the whole game
  config.ts        every tunable number
  rng.ts           seeded PRNG; all randomness goes through it
  units/
    archetypes.ts  layer 1: classes + elements (tags), base stats, abilities
    unit.ts        layer 2: Unit, a distinct owned/offered individual (serializable)
  combat/sim.ts    layer 3: CombatUnit + deterministic fixed-tick sim → timeline
  civ.ts           population, tiers, rarity odds, buildings
  shop.ts          market generation
  synergy.ts       tag-count synergies, incl. "cohesion" (stay near allies)
  ai.ts            opponent generation
  game.ts          GameState + pure actions (state, …args) => state
  store.ts         tiny observable store
src/ui/            React menus + R3F battlefield playback (renders only, no game logic)
```

The combat sim returns the whole fight as frames and events. Renderers only play that back, so the same result can be drawn in 2D, 3D, or headless.

## Not yet built

Species traits and tech direction (types stubbed in `civ.ts`), damage-scaling tuning, a pixel editor, and sprites.
