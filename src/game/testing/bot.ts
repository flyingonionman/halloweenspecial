/**
 * A simple scripted player, for tests and the balance probe. Plays one turn's
 * worth of actions (it does not end the turn).
 *
 *   tempo   — strongest units, military buildings, no research.
 *   synergy — builds an academy per focus affinity (its strongest essence, then
 *             that essence's tier-2 child) and keeps offering to raise them.
 */
import { AFFINITIES, AFFINITY_DEFS, type Affinity } from '../affinities'
import {
  buildBlock,
  canUpgradeBuilding,
  city,
  claimBlock,
  claimTile,
  claimCost,
  finishBattle,
  placeBuilding,
  raidBlock,
  recruit,
  releaseUnit,
  moveToBench,
  callMuster,
  offerBlock,
  offerToAcademy,
  troopSize,
  upgradeBuilding,
  upgradeUnit,
  raidCamp,
  type GameState,
} from '../game'
import { unitPower, type Unit } from '../units/unit'
import { type BuildingId } from '../world/buildings'
import { frontier, ownedTiles } from '../world/map'
import { TERRAIN_DEFS, type TerrainId } from '../world/terrain'

export type BotStyle = 'tempo' | 'synergy'
export interface BotMemory {
  focus?: Affinity[]
}

export function playTurn(s: GameState, style: BotStyle, mem: BotMemory): GameState {
  const bare = () => ownedTiles(s.map).filter((t) => !t.building)

  // 1. Focus: the essence its land yields most, then a tier-2 child of it.
  if (style === 'synergy' && !mem.focus) {
    const y = city(s).yields
    const elements = (['fire', 'water', 'earth', 'wind', 'arcane'] as const).filter((e) => y[e] > 0).sort((a, b) => y[b] - y[a])
    const home: Affinity = elements[0] ?? 'earth'
    const child = AFFINITIES.find((c) => AFFINITY_DEFS[c].tier === 2 && AFFINITY_DEFS[c].parents.includes(home))
    mem.focus = child ? [...AFFINITY_DEFS[child].parents, child] : [home]
  }
  const focus = mem.focus ?? []
  // Academies (synergy): one per focus affinity, each offered its own affinity until maxed.
  if (style === 'synergy') {
    const academies = () => ownedTiles(s.map).filter((t) => t.building?.id === 'academy')
    if (academies().length < focus.length) {
      const spot = bare().find((t) => !buildBlock(s, t, 'academy'))
      if (spot) s = placeBuilding(s, spot, 'academy')
    }
    for (const t of academies()) {
      const b = t.building!
      const target = b.affinity ?? focus.find((a) => !academies().some((x) => x.building!.affinity === a) && !offerBlock(s, t, a))
      if (target) s = offerToAcademy(s, t, target)
    }
  }
  const fit = (u: Unit) => focus.reduce((n, a) => n + (u.affinities[a] ?? 0), 0)
  const score = (u: Unit) => unitPower(u) * (style === 'synergy' ? 1 + 0.5 * fit(u) : 1)

  // 2. Mines, farms and fisheries on bare tiles — cheap, always good.
  for (const t of bare()) {
    const id: BuildingId = t.terrain === 'plains' ? 'farm' : t.terrain === 'lake' ? 'fishery' : 'mine'
    if (!buildBlock(s, t, id)) s = placeBuilding(s, t, id)
  }

  // 3. Grow the mines a little, then the strategy buildings.
  for (const t of ownedTiles(s.map)) if (t.building?.id === 'mine' && canUpgradeBuilding(s, t) && s.stock.gold > 20) s = upgradeBuilding(s, t)
  for (const id of ['barracks', 'walls', 'armory', 'market'] as BuildingId[]) {
    if (style === 'synergy' && id !== 'market') continue
    const spot = bare().find((t) => !buildBlock(s, t, id))
    if (spot) s = placeBuilding(s, spot, id)
  }

  // 4. Recruit (call a muster) when the troop has room or every few turns to look for upgrades,
  //    then enlist to fill the troop; swap out weak units for much stronger ones.
  if (!s.muster.length && (s.troop.length < troopSize(s) || s.turn % 3 === 0)) s = callMuster(s)
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

  // 5. Raid a weak camp on the border when the troop is ready.
  const power = s.troop.reduce((n, u) => n + unitPower(u), 0)
  const camp = frontier(s.map).find((t) => t.camp && !raidBlock(s, t) && power > 220 * t.camp.strength * (1 + s.round))
  if (camp) s = finishBattle(raidCamp(s, camp))

  // 6. Expand toward essence land (earth first, if any), keeping a gold reserve for units.
  const want = (t: TerrainId) => (TERRAIN_DEFS[t].affinity && focus.includes(TERRAIN_DEFS[t].affinity!) ? 3 : TERRAIN_DEFS[t].basic ? 1 : 2)
  for (const t of frontier(s.map).sort((a, b) => want(b.terrain) - want(a.terrain))) {
    if (!claimBlock(s, t, 'earth')) {
      s = claimTile(s, t, 'earth')
      continue
    }
    if (s.stock.gold - claimCost(s) < 6) break
    if (!claimBlock(s, t)) s = claimTile(s, t)
  }

  // 7. Spare gold into levels.
  for (const u of [...s.troop].sort((a, b) => score(b) - score(a))) s = upgradeUnit(s, u.uid)
  return s
}
