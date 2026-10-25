/** Population → unit rarity: which rarities are unlocked, and the odds of each. */
import { CONFIG, RARITIES, type Rarity } from './config'
import { speciesMods, type SpeciesId } from './species'

/** Highest rarity unlocked by population. */
export function civTier(population: number): Rarity {
  let tier: Rarity = 'common'
  for (const r of RARITIES) if (population >= CONFIG.rarityThresholds[r]) tier = r
  return tier
}

/**
 * 0→1: how far population has climbed from this rarity's threshold toward the
 * next rarity's (log scale). Drives how strongly the rarity has ramped in.
 */
export function rampProgress(r: Rarity, population: number): number {
  const i = RARITIES.indexOf(r)
  const from = CONFIG.rarityThresholds[r]
  if (population < from || from === 0) return population >= from ? 1 : 0
  const next = RARITIES[i + 1]
  const span = next ? Math.log10(CONFIG.rarityThresholds[next] / from) : CONFIG.rarityRamp.lastSpan
  return Math.min(1, Math.log10(population / from) / span)
}

/** The current tier, the next unlock, and how far along the climb toward it you are. */
export function tierProgress(population: number) {
  const tier = civTier(population)
  const next = RARITIES[RARITIES.indexOf(tier) + 1] ?? null
  return { tier, next, nextAt: next ? CONFIG.rarityThresholds[next] : null, progress: rampProgress(tier, population) }
}

/** Normalized probability of each rarity rolling (before a Dragon's rarity shift). */
export function rarityOdds(population: number, species: SpeciesId | null = null): Record<Rarity, number> {
  const tierIdx = RARITIES.indexOf(civTier(population))
  const rareMult = speciesMods(species).rareOddsMult ?? 1
  const weights = RARITIES.map((r, i) => {
    const threshold = CONFIG.rarityThresholds[r]
    if (population < threshold) return 0
    let w = CONFIG.rarityBaseWeight[r]
    if (threshold > 0) w *= Math.min(1, CONFIG.rarityRamp.floor + (1 - CONFIG.rarityRamp.floor) * rampProgress(r, population))
    const stepsBelow = tierIdx - i
    if (stepsBelow >= 2) w *= Math.pow(CONFIG.rarityObsolescence, stepsBelow - 1)
    if (i > 0) w *= rareMult
    return w
  })
  const total = weights.reduce((a, b) => a + b, 0)
  return Object.fromEntries(RARITIES.map((r, i) => [r, weights[i]! / total])) as Record<Rarity, number>
}

/** Odds as citizens actually arrive, including a Dragon's shift. */
export function birthRarityOdds(population: number, species: SpeciesId | null): Record<Rarity, number> {
  const odds = rarityOdds(population, species)
  const shift = speciesMods(species).rarityShift ?? 0
  if (!shift) return odds
  const out = Object.fromEntries(RARITIES.map((r) => [r, 0])) as Record<Rarity, number>
  RARITIES.forEach((r, i) => {
    out[RARITIES[Math.min(RARITIES.length - 1, i + shift)]!] += odds[r]
  })
  return out
}
