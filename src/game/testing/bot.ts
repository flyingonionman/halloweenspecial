/**
 * A simple scripted player, for tests and the balance probe. Plays one turn's
 * worth of actions (it does not end the turn).
 *
 *   tempo   — strongest units, military buildings, few academies.
 *   synergy — commits to an affinity pair from its land, builds and upgrades their academies.
 */
import { COMPOUND_SYNERGIES, type Affinity } from '../affinities'
import {
  buildBlock,
  canUpgradeBuilding,
  claimBlock,
  claimTile,
  claimCost,
  doTask,
  finishBattle,
  placeBuilding,
  raidBlock,
  recruit,
  releaseUnit,
  moveToBench,
  troopSize,
  upgradeBuilding,
  upgradeUnit,
  canDoTask,
  raidCamp,
  type GameState,
} from '../game'
import { unitPower, type Unit } from '../units/unit'
import { academyId, BUILDING_DEFS, type BuildingId } from '../world/buildings'
import { frontier, ownedTiles, tileNeighbors } from '../world/map'
import type { Hex } from '../world/hex'
import { AFFINITY_TERRAIN, TERRAIN_DEFS, type TerrainId } from '../world/terrain'

export type BotStyle = 'tempo' | 'synergy'
export interface BotMemory {
  focus?: Affinity[]
}

const EXTRACTOR_FOR: Partial<Record<TerrainId, BuildingId>> = Object.fromEntries(
  Object.values(BUILDING_DEFS)
    .filter((b) => b.kind === 'extractor' && b.allowed !== 'any')
    .map((b) => [(b.allowed as TerrainId[])[0], b.id]),
)

export function playTurn(s: GameState, style: BotStyle, mem: BotMemory): GameState {
  if (!mem.focus) {
    const home = TERRAIN_DEFS[s.map.homeBiome].affinity!
    const pair = COMPOUND_SYNERGIES.find((c) => c.components.includes(home))
    mem.focus = pair ? [...pair.components] : [home]
  }
  const focus = mem.focus
  const fit = (u: Unit) => focus.reduce((n, a) => n + (u.affinities[a] ?? 0), 0)
  const score = (u: Unit) => unitPower(u) * (style === 'synergy' ? 1 + 0.5 * fit(u) : 1)

  // 1. Extractors and farms on bare tiles — cheap, always good.
  for (const t of ownedTiles(s.map)) {
    if (t.building) continue
    const id = t.terrain === 'plains' ? 'farm' : EXTRACTOR_FOR[t.terrain]
    if (id && !buildBlock(s, t, id)) s = placeBuilding(s, t, id)
  }

  // 2. Strategy buildings.
  const bare = () => ownedTiles(s.map).filter((t) => !t.building && TERRAIN_DEFS[t.terrain].buildable)
  if (style === 'synergy') {
    for (const a of focus) {
      const existing = s.map.tiles.find((t) => t.building?.id === academyId(a))
      if (existing) {
        if (canUpgradeBuilding(s, existing)) s = upgradeBuilding(s, existing)
      } else {
        const spot = bare().sort((x, y) => adjCount(s, y, AFFINITY_TERRAIN[a]) - adjCount(s, x, AFFINITY_TERRAIN[a]))[0]
        if (spot && !buildBlock(s, spot, academyId(a))) s = placeBuilding(s, spot, academyId(a))
      }
    }
  }
  for (const id of ['barracks', 'walls', 'armory', 'housing'] as BuildingId[]) {
    if (style === 'synergy' && id !== 'housing') continue
    const spot = bare()[0]
    if (spot && !buildBlock(s, spot, id)) s = placeBuilding(s, spot, id)
  }

  // 3. Recruit to fill the troop; swap out weak units for much stronger ones.
  for (const c of [...s.muster].sort((a, b) => score(b.unit) - score(a.unit))) {
    if (s.troop.length < troopSize(s)) {
      s = recruit(s, c.unit.uid)
      continue
    }
    const weakest = [...s.troop].sort((a, b) => score(a) - score(b))[0]!
    if (score(c.unit) > score(weakest) * 1.35 && s.stock.gold >= c.price) {
      s = releaseUnit(moveToBench(s, weakest.uid), weakest.uid)
      s = recruit(s, c.unit.uid)
    }
  }

  // 4. Deed: raid a weak camp when the troop is ready, else take the best task.
  const power = s.troop.reduce((n, u) => n + unitPower(u), 0)
  const camp = frontier(s.map).find((t) => t.camp && !raidBlock(s, t) && power > 220 * t.camp.strength * (1 + s.round))
  if (camp) {
    s = finishBattle(raidCamp(s, camp))
  } else {
    const pref = ['caravan', 'forage', 'census', 'drill', 'festival', 'prospect']
    const task = [...s.tasks].sort((a, b) => pref.indexOf(a.kind) - pref.indexOf(b.kind)).find((t) => canDoTask(s, t.id))
    if (task) s = doTask(s, task.id)
  }

  // 5. Expand toward focus terrain, then plains; keep a reserve for units.
  const materials: TerrainId[] = style === 'tempo' ? ['hills', 'mountains', 'steppe'] : focus.map((a) => AFFINITY_TERRAIN[a])
  const want = (t: TerrainId) => (materials.includes(t) ? 3 : t === 'plains' || t === 'lake' ? 2 : 1)
  for (const t of frontier(s.map).sort((a, b) => want(b.terrain) - want(a.terrain))) {
    if (s.stock.gold - claimCost(s) < 6) break
    if (!claimBlock(s, t)) s = claimTile(s, t)
  }

  // 6. Spare gold into levels.
  for (const u of [...s.troop].sort((a, b) => score(b) - score(a))) s = upgradeUnit(s, u.uid)
  return s
}

const adjCount = (s: GameState, t: Hex, terrain: TerrainId) => tileNeighbors(s.map, t).filter((n) => n.terrain === terrain).length
