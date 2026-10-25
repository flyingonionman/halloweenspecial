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
    stone: 4,
  },

  map: {
    /** 4 = 9 tiles across. */
    radius: 4,
    /** Share of the land that is the biome's speciality terrains, and stray tiles of anything else. The rest is basic. */
    mix: { special: 0.4, stray: 0.1 },
    camps: 7,
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
   * A newly unlocked rarity starts at `floor` of its weight and ramps (log scale)
   * to full weight as population climbs toward the *next* rarity's threshold:
   * every soul between 100 and 1,000 makes uncommon citizens more likely.
   * Legendary, having no next threshold, ramps over `lastSpan` orders of magnitude.
   */
  rarityRamp: { floor: 0.12, lastSpan: 1 },

  /** Rarities two or more steps below your current tier fade out by this factor per step. */
  rarityObsolescence: 0.4,

  /** The "generation gap": stat multiplier per rarity. */
  rarityStatMult: { common: 1, uncommon: 1.5, rare: 2.3, epic: 3.6, legendary: 5.5 } satisfies Record<Rarity, number>,
  /** Gold scale for unit upgrades. */
  rarityPrice: { common: 2, uncommon: 3, rare: 5, epic: 8, legendary: 12 } satisfies Record<Rarity, number>,
  /** Morale to recruit a citizen, by rarity (adjusted by quality). */
  recruitMorale: { common: 8, uncommon: 11, rare: 15, epic: 20, legendary: 26 } satisfies Record<Rarity, number>,

  quality: { min: 0.85, max: 1.15 },

  affinity: {
    /**
     * Births. Citizens are born with no affinity unless your academies give them one (only ever one).
     * Each muster citizen picks between "none" (weight `none`) and every dedicated academy
     * (weight perLevel × its level). From the chosen academy (level L) it gets 1..L points:
     * each extra point is `pointDecay` times as likely as the one before.
     */
    birth: { none: 6, perLevel: 4, pointDecay: 0.25 },
    /** Every Academy after your first also costs this much arcane per academy you already have. */
    extraAcademyArcane: 3,
    /** Troop points needed for synergy tiers 1–4. The top tiers demand a committed troop. */
    thresholds: [2, 5, 9, 15],
    /** Synergy effect multiplier by affinity level 0–4 (your best academy of that affinity). */
    levelMult: [0.6, 1, 1.35, 1.7, 2.1],
    /** Highest academy level, and so the most points a unit can be born with. */
    maxLevel: 4,
    /** An academy can evolve into a higher-tier child once every parent of that child has an academy at this level. */
    unlockLevel: 2,
    /**
     * Growing an academy (dedicate → Lv1, raise, or evolve into a child at Lv1) costs two things:
     * an upfront payment for a tier-T affinity at level L — essence × L × T of each tier-1 root,
     * plus gold × L × T — and a standing throughput commitment of flowPerLevel × L × T of each
     * root essence per turn, taken from every turn's income from the next turn on.
     */
    research: { essence: 2, gold: 2 },
    flowPerLevel: 1,
    /** Per affinity level: its units' quality rolls skew upward. */
    qualityBiasPerLevel: 0.08,
    /** Per affinity level: its units get this much extra HP and attack in combat. */
    combatBonusPerLevel: 0.05,
  },

  /** Church: offer light for morale. */
  faith: { lightPerOffering: 3, moralePerOffering: 10 },

  level: {
    max: 5,
    statPerLevel: 0.3,
    /** Gold to go from level L to L+1 = goldBase × (rarity rank 1–5) × goldGrowth^(L-1). */
    goldBase: 8,
    goldGrowth: 2.2,
    /**
     * Training also takes the essences of the unit's primary affinity's tier-1 roots:
     * essencePerLevel × (target − essenceFrom + 1) of each, once the target reaches essenceFrom.
     */
    essenceFrom: 2,
    essencePerLevel: 2,
    /** Veterans (units that survived battles) upgrade cheaper. */
    discountPerBattleSurvived: 0.15,
    maxDiscount: 0.6,
  },

  /** Fraction of a unit's recruit morale given back when releasing it. */
  releaseRefund: 0.4,

  muster: {
    /** A fresh muster is called every turn: this many citizens (before species modifiers). */
    size: 6,
    /**
     * The muster starts each turn empty. Recruiting (calling a muster) costs
     * morale: base + step × musters already called this turn. Calling again
     * sends whoever is waiting home.
     */
    call: { base: 10, step: 10 },
  },

  /**
   * Morale (0–max): spent to call a muster and to enlist citizens from it, and it scales
   * every field's output from `outputAtZero` (empty) to `outputAtMax` (full).
   */
  morale: {
    start: 60,
    max: 100,
    regen: 8,
    outputAtZero: 0.5,
    outputAtMax: 1.5,
    battleWin: 25,
    raidWin: 10,
    raidLoss: -10,
  },

  economy: {
    /** Population × (1 + base + perFood × food) each turn. */
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
    /** Earth can pay for claims instead: 1 earth per this much gold of the claim cost (rounded up). */
    goldPerEarth: 3,
  },

  /** Fraction of a building's total cost refunded on demolition. */
  demolishRefund: 0.5,

  trade: {
    /** Give `rate` of one resource for 1 of another. Improved by Trading Post adjacency, floored at `best`. */
    worst: 4,
    /** Standing routes a Trading Post can run at once. */
    maxRoutes: 3,
    best: 2,
  },

  rewards: {
    /** Gold for winning a round battle = base + perRound × round. */
    battleGold: { base: 6, perRound: 4 },
    /** Camp loot: gold = base + perStrength × strength + perRound × round; tile resource = resPerStrength × strength. */
    camp: { base: 3, perStrength: 3, perRound: 2, resPerStrength: 3 },
  },

  /**
   * Round opponents (ghosts). An average player is roughly at
   * 100 × 1.2^(10·round + 5) population mid-round. Losing a round battle ends the run.
   */
  opponent: {
    populationByRound: [200, 1_500, 10_000, 60_000, 400_000],
    levelByRound: [1, 1.5, 2, 2.5, 3],
    researchByRound: [0, 1, 1, 2, 3],
    /** Tier of the affinity the opponent builds its troop around. */
    targetTierByRound: [1, 2, 2, 3, 4],
    genericByRound: [0, 0.1, 0.15, 0.25, 0.35],
  },

  /** NPC camps on the map. Troop size and population scale with camp strength (1–3) and round. */
  camps: {
    sizeByStrength: [0, 2, 3, 5],
    populationMult: [0, 0.5, 1, 2],
  },

  /**
   * Combat is tick based on a hex arena: one unit per cell, and every action
   * (a step to the next cell, an attack, a skill) occupies the unit for a whole
   * number of ticks.
   */
  combat: {
    ticksPerSecond: 10,
    maxSeconds: 60,
    /** Overtime from this tick on: damage +overtimeRamp per second (×1.5 after 5s), healing divided by the same. */
    overtimeAfter: 300,
    overtimeRamp: 0.1,
    /** Hex radius of the arena (7 → 15 cells across). */
    arenaRadius: 7,
    energyPerAttack: 10,
    energyPerHit: 4,
    /** Fewest ticks any attack or step can take. */
    minActionTicks: 3,
    /** An attack lands this fraction of the way through its swing (max `maxWindup` ticks). */
    windup: 0.35,
    maxWindup: 4,
    /** A skill: ticks before it takes effect, ticks the caster is busy in total. */
    castWindup: 4,
    castTicks: 8,
    /** Taunt: reach in cells and how long enemies are locked onto the tank. */
    tauntRadius: 3,
    /** Mage Blast: hits every enemy within this many cells of its target. */
    blastRadius: 2,
    tauntTicks: 30,
    /** Healers: an ally counts as hurt below this fraction of max HP. */
    hurtBelow: 0.97,
    /** Healer basic heal = attack × this. */
    healPower: 2,
    /** Healer hex: attack × damage, and the target deals `weaken` less damage for `weakenTicks`. */
    hexDamage: 0.6,
    weaken: 0.25,
    weakenTicks: 30,
    /** Magic damage only counts this fraction of the target's defense. */
    magicDefFactor: 0.5,
    slowTicks: 15,
    maxDamageReduction: 0.75,
  },
} as const
