/**
 * A simple scripted player, for tests and the balance probe. Plays one turn's
 * worth of actions (it does not end the turn).
 *
 *   tempo   — strongest units, military buildings, few academies.
 *   synergy — picks a tier-2 affinity its land can reach, raises both parents'
 *             academies to the unlock level, then builds and raises the child's.
 */
import { AFFINITIES, AFFINITY_DEFS, type Affinity } from '../affinities'
import {
  buildBlock,
  canUpgradeBuilding,
  claimBlock,
  claimTile,
  claimCost,
  finishBattle,
  placeBuilding,
  raidBlock,
  recruit,
  releaseUnit,
  moveToBench,
  troopSize,
  upgradeBuilding,
  upgradeUnit,
  raidCamp,
  type GameState,
} from '../game'
import { unitPower, type Unit } from '../units/unit'
import { academyId, BUILDING_DEFS, type BuildingId } from '../world/buildings'
import { frontier, ownedTiles, tileNeighbors } from '../world/map'
import type { Hex } from '../world/hex'
import { TERRAIN_DEFS, type TerrainId } from '../world/terrain'

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
    const home = TERRAIN_DEFS[s.map.homeBiome].affinity ?? 'fire'
    const child = AFFINITIES.find((c) => AFFINITY_DEFS[c].tier === 2 && AFFINITY_DEFS[c].parents.includes(home))
    // Research order: parents first (to the unlock level), then the child.
    mem.focus = child ? [...AFFINITY_DEFS[child].parents, child] : [home]
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
        const attune = AFFINITY_DEFS[a].attune
        const spot = bare()
          .filter((t) => !buildBlock(s, t, academyId(a)))
          .sort((x, y) => adjCount(s, y, attune) - adjCount(s, x, attune))[0]
        if (spot && !buildBlock(s, spot, academyId(a))) s = placeBuilding(s, spot, academyId(a))
      }
    }
  }
  for (const id of ['barracks', 'walls', 'armory', 'market'] as BuildingId[]) {
    if (style === 'synergy' && id !== 'market') continue
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
    if (score(c.unit) > score(weakest) * 1.35 && s.morale >= c.price) {
      s = releaseUnit(moveToBench(s, weakest.uid), weakest.uid)
      s = recruit(s, c.unit.uid)
    }
  }

  // 4. Raid a weak camp on the border when the troop is ready.
  const power = s.troop.reduce((n, u) => n + unitPower(u), 0)
  const camp = frontier(s.map).find((t) => t.camp && !raidBlock(s, t) && power > 220 * t.camp.strength * (1 + s.round))
  if (camp) s = finishBattle(raidCamp(s, camp))

  // 5. Expand toward focus terrain, then plains; keep a reserve for units.
  const materials: TerrainId[] =
    style === 'tempo'
      ? ['hills', 'mountains', 'steppe']
      : focus.flatMap((a) => [AFFINITY_DEFS[a].attune, ...(AFFINITY_DEFS[a].site === 'any' ? [] : AFFINITY_DEFS[a].site)])
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
