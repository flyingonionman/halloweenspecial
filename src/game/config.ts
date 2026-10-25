/**
 * Every tunable number lives here so balance passes don't require touching logic.
 */

export const RARITIES = ['common', 'uncommon', 'rare', 'epic', 'legendary'] as const
export type Rarity = (typeof RARITIES)[number]

export const CONFIG = {
  rounds: 5,
  turnsPerRound: 10,
  /** Before species modifiers. */
  troopSize: 6,
  benchSize: 8,

  start: {
    population: 100,
    gold: 12,
    hp: 100,
    /** Starting stock of the home biome's resource. */
    homeResource: 4,
  },

  map: {
    radius: 5,
    /** Voronoi seeds that become terrain regions. */
    regions: 18,
    camps: 10,
    campMinDistance: 3,
  },

  /** Population at which each rarity can start appearing. Common is the default state. */
  rarityThresholds: {
    common: 0,
    uncommon: 100,
    rare: 1_000,
    epic: 100_000,
    legendary: 1_000_000,
  } satisfies Record<Rarity, number>,

  /** Relative birth weight once a rarity is fully ramped in. */
  rarityBaseWeight: { common: 100, uncommon: 45, rare: 22, epic: 10, legendary: 4 } satisfies Record<Rarity, number>,

  /**
   * A newly unlocked rarity starts at `floor` of its weight and reaches full
   * weight once population is `span` orders of magnitude past the threshold.
   */
  rarityRamp: { floor: 0.12, span: 1 },

  /** Rarities two or more steps below your current tier fade out by this factor per step. */
  rarityObsolescence: 0.4,

  /** The "generation gap": stat multiplier per rarity. */
  rarityStatMult: { common: 1, uncommon: 1.5, rare: 2.3, epic: 3.6, legendary: 5.5 } satisfies Record<Rarity, number>,
  rarityPrice: { common: 2, uncommon: 3, rare: 5, epic: 8, legendary: 12 } satisfies Record<Rarity, number>,

  quality: { min: 0.85, max: 1.15 },

  affinity: {
    /** Total affinity points a unit carries, by rarity. */
    pointsByRarity: { common: 1, uncommon: 2, rare: 3, epic: 4, legendary: 5 } satisfies Record<Rarity, number>,
    /** Chance a unit with 2+ points splits them across two affinities. */
    dualChance: 0.5,
    /** Troop points needed for synergy tiers 1–4. */
    thresholds: [2, 4, 6, 9],
    /** Synergy effect multiplier by affinity level 0–4 (academy level). */
    levelMult: [0.6, 1, 1.35, 1.7, 2.1],
    maxLevel: 4,
    /** Birth weight of an affinity = mutation + perTile × owned tiles of its terrain + perLevel × academy level + perAttune × attunement. */
    birthWeight: { mutation: 1, perTile: 2, perLevel: 4, perAttune: 1 },
    /** Per academy level: carriers' quality rolls skew upward. */
    qualityBiasPerLevel: 0.08,
    /** Per academy level: carriers get this much extra HP and attack in combat. */
    combatBonusPerLevel: 0.05,
    /** Per point of attunement (academy adjacency): extra carrier HP and attack. */
    combatBonusPerAttune: 0.03,
  },

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

  muster: {
    /** Turns a newborn citizen waits to be recruited before moving on. */
    lifespan: 3,
  },

  economy: {
    /** Population × (1 + base + perFood × food + building growth) each turn. */
    growthBase: 0.1,
    growthPerFood: 0.02,
    maxGrowth: 0.6,
    /** Humans: +1 gold per `per` held at turn end, up to `max`. */
    interest: { per: 10, max: 3 },
  },

  territory: {
    /** You start owning the capital and its ring. */
    startTiles: 7,
    /** Max owned tiles = base + perDoubling × log2(population / startPopulation). */
    capBase: 9,
    capPerDoubling: 2.5,
    /** Gold to claim a tile = base + perOwned × (owned − startTiles). */
    claimBase: 3,
    claimPerOwned: 1,
  },

  /** Fraction of a building's total cost refunded on demolition. */
  demolishRefund: 0.5,

  trade: {
    /** Give `rate` of one resource for 1 of another. Improved by Trading Post adjacency, floored at `best`. */
    worst: 4,
    best: 2,
  },

  /** HP damage on a round loss = base + perRound * round + perSurvivor * enemy survivors. */
  damage: { base: 6, perRound: 2, perSurvivor: 4 },

  rewards: {
    /** Gold for winning a round battle = base + perRound × round. */
    battleGold: { base: 6, perRound: 4 },
    /** Camp loot: gold = base + perStrength × strength + perRound × round; tile resource = resPerStrength × strength. */
    camp: { base: 3, perStrength: 3, perRound: 2, resPerStrength: 3 },
  },

  /** Glory = development × 2^wins × (victoryMult if all rounds won). */
  glory: { perLog10Pop: 10, perTile: 1, perBuildingLevel: 1, victoryMult: 2 },

  /**
   * Round opponents (ghosts). An average player is roughly at
   * 100 × 1.2^(10·round + 5) population mid-round.
   */
  opponent: {
    populationByRound: [200, 1_500, 10_000, 60_000, 400_000],
    levelByRound: [1, 1.5, 2, 2.5, 3],
    researchByRound: [0, 1, 1, 2, 3],
    genericByRound: [0, 0.1, 0.15, 0.25, 0.35],
  },

  /** NPC camps on the map. Troop size and population scale with camp strength (1–3) and round. */
  camps: {
    sizeByStrength: [0, 2, 3, 5],
    populationMult: [0, 0.5, 1, 2],
  },

  combat: {
    tick: 0.05,
    maxSeconds: 45,
    fieldWidth: 24,
    fieldHeight: 12,
    energyPerAttack: 10,
    energyPerHit: 4,
    separationRadius: 0.9,
    /** Magic damage only counts this fraction of the target's defense. */
    magicDefFactor: 0.5,
    slowSeconds: 1.5,
    maxDamageReduction: 0.75,
  },
} as const
