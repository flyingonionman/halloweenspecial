/**
 * Civilization state: population (which drives tier), money, and buildings
 * (which bend the shop toward the tags you're investing in).
 *
 * Species traits and tech direction are stubbed — see TraitId / TechId.
 */
import { CONFIG, RARITIES, type Rarity } from './config'
import { TAGS, type Tag } from './units/archetypes'

export type BuildingId =
  | `${Tag}-hall`
  | 'granary'
  | 'market'

export interface BuildingDef {
  id: BuildingId
  name: string
  text: string
  /** Tag buildings bias the shop toward this tag. */
  tag?: Tag
  effect: 'tag' | 'growth' | 'income'
  baseCost: number
  costGrowth: number
}

const TAG_BUILDING_NAMES: Record<Tag, string> = {
  knight: 'Barracks',
  rider: 'Stables',
  mage: 'Arcane College',
  archer: 'Archery Butts',
  cleric: 'Chapel',
  rogue: 'Thieves’ Den',
  fire: 'Ember Forge',
  frost: 'Frost Spire',
  storm: 'Storm Tower',
  earth: 'Barrow Shrine',
}

export const BUILDINGS: BuildingDef[] = [
  ...TAGS.map(
    (tag): BuildingDef => ({
      id: `${tag}-hall`,
      name: TAG_BUILDING_NAMES[tag],
      text: `More ${tag} units in the shop, with better quality and a chance to roll a rarity higher.`,
      tag,
      effect: 'tag',
      baseCost: 4,
      costGrowth: 1.6,
    }),
  ),
  {
    id: 'granary',
    name: 'Granary',
    text: `+${CONFIG.buildings.growthPerLevel * 100}% population growth per era.`,
    effect: 'growth',
    baseCost: 5,
    costGrowth: 1.8,
  },
  {
    id: 'market',
    name: 'Market',
    text: `+${CONFIG.buildings.incomePerLevel} money per era.`,
    effect: 'income',
    baseCost: 5,
    costGrowth: 1.7,
  },
]

export const BUILDING_BY_ID = Object.fromEntries(BUILDINGS.map((b) => [b.id, b])) as Record<BuildingId, BuildingDef>

/** Placeholders for the next pass. */
export type TraitId = string
export type TechId = string

export interface Civ {
  population: number
  money: number
  buildings: Partial<Record<BuildingId, number>>
  traits: TraitId[]
  tech: TechId[]
}

export function newCiv(): Civ {
  return {
    population: CONFIG.start.population,
    money: CONFIG.start.money,
    buildings: {},
    traits: [],
    tech: [],
  }
}

export const buildingLevel = (civ: Civ, id: BuildingId) => civ.buildings[id] ?? 0

export function buildingCost(civ: Civ, id: BuildingId): number | null {
  const level = buildingLevel(civ, id)
  if (level >= CONFIG.buildings.maxLevel) return null
  const def = BUILDING_BY_ID[id]
  return Math.round(def.baseCost * Math.pow(def.costGrowth, level))
}

export const tagBuildingLevel = (civ: Civ, tag: Tag) => buildingLevel(civ, `${tag}-hall`)

/** Highest rarity unlocked by population. */
export function civTier(population: number): Rarity {
  let tier: Rarity = 'common'
  for (const r of RARITIES) if (population >= CONFIG.rarityThresholds[r]) tier = r
  return tier
}

/** Normalized probability of each rarity appearing in the shop at this population. */
export function rarityOdds(population: number): Record<Rarity, number> {
  const tierIdx = RARITIES.indexOf(civTier(population))
  const weights = RARITIES.map((r, i) => {
    const threshold = CONFIG.rarityThresholds[r]
    if (population < threshold) return 0
    let w = CONFIG.rarityBaseWeight[r]
    if (threshold > 0) {
      const progress = Math.log10(population / threshold) / CONFIG.rarityRamp.span
      w *= Math.min(1, CONFIG.rarityRamp.floor + (1 - CONFIG.rarityRamp.floor) * progress)
    }
    const stepsBelow = tierIdx - i
    if (stepsBelow >= 2) w *= Math.pow(CONFIG.rarityObsolescence, stepsBelow - 1)
    return w
  })
  const total = weights.reduce((a, b) => a + b, 0)
  return Object.fromEntries(RARITIES.map((r, i) => [r, weights[i]! / total])) as Record<Rarity, number>
}

export function growthMultiplier(civ: Civ): number {
  return CONFIG.economy.growthPerEra * (1 + buildingLevel(civ, 'granary') * CONFIG.buildings.growthPerLevel)
}

export function income(civ: Civ): number {
  const { incomeBase, incomePerLog10Pop } = CONFIG.economy
  return Math.round(
    incomeBase +
      incomePerLog10Pop * Math.log10(civ.population) +
      buildingLevel(civ, 'market') * CONFIG.buildings.incomePerLevel,
  )
}
