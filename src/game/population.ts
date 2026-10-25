/** Population → unit rarity: which rarities are unlocked, and the odds of each. */
import { CONFIG, RARITIES, type Rarity } from './config'
import { speciesMods, type SpeciesId } from './species'

/** Highest rarity unlocked by population. */
export function civTier(population: number): Rarity {
  let tier: Rarity = 'common'
  for (const r of RARITIES) if (population >= CONFIG.rarityThresholds[r]) tier = r
  return tier
}

/** Normalized probability of each rarity rolling (before a Dragon's rarity shift). */
export function rarityOdds(population: number, species: SpeciesId | null = null): Record<Rarity, number> {
  const tierIdx = RARITIES.indexOf(civTier(population))
  const rareMult = speciesMods(species).rareOddsMult ?? 1
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
