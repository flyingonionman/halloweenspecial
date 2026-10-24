/**
 * Every tunable number lives here so balance passes don't require touching logic.
 */

export const RARITIES = ['common', 'uncommon', 'rare', 'epic', 'legendary'] as const
export type Rarity = (typeof RARITIES)[number]

export const CONFIG = {
  rounds: 5,
  erasPerRound: 3,
  troopSize: 6,
  benchSize: 10,
  shopSize: 100,

  start: {
    population: 100,
    money: 20,
    hp: 100,
  },

  /** Population at which each rarity can start appearing. Common is the default state. */
  rarityThresholds: {
    common: 0,
    uncommon: 100,
    rare: 1_000,
    epic: 100_000,
    legendary: 1_000_000,
  } satisfies Record<Rarity, number>,

  /** Relative shop weight once a rarity is fully ramped in. */
  rarityBaseWeight: { common: 100, uncommon: 45, rare: 22, epic: 10, legendary: 4 } satisfies Record<Rarity, number>,

  /**
   * A newly unlocked rarity starts at `rampFloor` of its weight and reaches full
   * weight once population is `rampSpan` orders of magnitude past the threshold.
   */
  rarityRamp: { floor: 0.12, span: 1 },

  /** Rarities two or more steps below your current tier fade out of the shop by this factor per step. */
  rarityObsolescence: 0.4,

  /** The "generation gap": stat multiplier per rarity. */
  rarityStatMult: { common: 1, uncommon: 1.5, rare: 2.3, epic: 3.6, legendary: 5.5 } satisfies Record<Rarity, number>,
  rarityPrice: { common: 2, uncommon: 3, rare: 5, epic: 8, legendary: 12 } satisfies Record<Rarity, number>,

  quality: { min: 0.85, max: 1.15 },

  level: {
    max: 5,
    statPerLevel: 0.3,
    /** Cost of going from level L to L+1 = rarityPrice * costFactor * costGrowth^(L-1). */
    costFactor: 0.8,
    costGrowth: 1.5,
    /** Veterans (units that survived battles) upgrade cheaper. */
    discountPerBattleSurvived: 0.15,
    maxDiscount: 0.6,
  },

  /** Fraction of purchase price refunded when releasing a unit. */
  releaseRefund: 0.4,

  economy: {
    growthPerEra: 2.0,
    incomeBase: 6,
    incomePerLog10Pop: 1.5,
  },

  buildings: {
    /** Each level of a tag building adds this much relative weight to its tag in the shop. */
    tagWeightPerLevel: 0.6,
    /** Each level shifts quality rolls for its tag toward the top of the range. */
    qualityBiasPerLevel: 0.08,
    /** Each level gives matching offers this chance to roll one rarity higher (if unlocked). */
    rarityBumpPerLevel: 0.06,
    growthPerLevel: 0.15,
    incomePerLevel: 2,
    maxLevel: 5,
  },

  /** HP damage on a loss = base + perRound * round + perSurvivor * enemy survivors. Wins deal no damage. */
  damage: { base: 6, perRound: 2, perSurvivor: 4 },

  /**
   * The AI civ you face at each round. An unbuilt player shops at
   * 100 × 2^(3·round + era); the AI drafts from roughly that round's middle era.
   */
  opponent: {
    populationByRound: [150, 1_500, 12_000, 100_000, 900_000],
    levelByRound: [1, 1.5, 2, 2.5, 3],
    buildingLevelByRound: [0, 1, 2, 3, 4],
  },

  combat: {
    tick: 0.05,
    maxSeconds: 45,
    fieldWidth: 24,
    fieldHeight: 12,
    energyPerAttack: 10,
    energyPerHit: 4,
    separationRadius: 0.9,
  },
} as const
