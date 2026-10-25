/**
 * Affinities form a research tree.
 *
 *   Tier 1 — the elements (Fire, Water, Earth, Wind), Arcane, Light and Dark.
 *            Born from your land (or a Church / Crypt). Mostly economy, small combat.
 *            Researchable at the Academy when its neighbours hold that element.
 *   Tier 2+ — unlock when every parent reaches CONFIG.affinity.unlockLevel; then
 *            citizens start being born with it and the Academy can raise it.
 *   Tier 4 — abstract, rare, and the strongest.
 *
 * All research happens at the one Academy: you contribute the essences of an
 * affinity's tier-1 roots (Magma = fire + earth) to raise its level.
 *
 * Scope is chosen per affinity (`team`): most synergies empower only the units
 * carrying that affinity; some empower every unit in the troop.
 *
 * Units carry affinity points. Troop points set each affinity's synergy tier
 * (CONFIG.affinity.thresholds); its academy level multiplies the strength.
 * Effects go to every unit carrying that affinity (or the whole troop for team
 * synergies), whatever its type.
 */
import { CONFIG } from './config'
import type { Cost, ElementId, ResourceId } from './world/terrain'

export const AFFINITIES = [
  // tier 1
  'fire',
  'water',
  'earth',
  'wind',
  'arcane',
  'light',
  'dark',
  // tier 2
  'magma',
  'weaponry',
  'steel',
  'ice',
  'verdance',
  'storm',
  // tier 3
  'archery',
  'electricity',
  'knighthood',
  'spellblade',
  'sanctity',
  'necromancy',
  // tier 4
  'machinery',
  'thunder',
  'eclipse',
] as const
export type Affinity = (typeof AFFINITIES)[number]
export type AffinityPoints = Partial<Record<Affinity, number>>

/** Numeric combat modifiers a synergy can grant. Percentages are fractions (0.1 = 10%). */
export const EFFECT_KEYS = [
  'hpPct',
  'atkPct',
  'defPct',
  'atkSpeedPct',
  'moveSpeedPct',
  'critChance',
  'spellPowerPct',
  'energyGainPct',
  'damageReduction',
  'bonusMagic',
  'slowOnHit',
  'startShield',
  'thorns',
  'doubleStrike',
  'lifesteal',
  'chain',
] as const
export type EffectKey = (typeof EFFECT_KEYS)[number]
export type Effects = Partial<Record<EffectKey, number>>

const pct = (v: number) => `${Math.round(v * 100)}%`

export const EFFECT_TEXT: Record<EffectKey, (v: number) => string> = {
  hpPct: (v) => `+${pct(v)} HP`,
  atkPct: (v) => `+${pct(v)} attack`,
  defPct: (v) => `+${pct(v)} defense`,
  atkSpeedPct: (v) => `+${pct(v)} attack speed`,
  moveSpeedPct: (v) => `+${pct(v)} move speed`,
  critChance: (v) => `+${pct(v)} crit chance`,
  spellPowerPct: (v) => `+${pct(v)} ability power`,
  energyGainPct: (v) => `+${pct(v)} energy gain`,
  damageReduction: (v) => `${pct(v)} less damage taken`,
  bonusMagic: (v) => `attacks deal +${pct(v)} as magic`,
  slowOnHit: (v) => `hits slow by ${pct(v)}`,
  startShield: (v) => `start with a ${pct(v)} HP shield`,
  thorns: (v) => `reflect ${pct(v)} of damage taken`,
  doubleStrike: (v) => `${pct(v)} chance to strike again`,
  lifesteal: (v) => `heal for ${pct(v)} of damage dealt`,
  chain: (v) => `attacks arc to a nearby enemy for ${pct(v)}`,
}

/** City-side bonuses from tier-1 synergies ("resource dripping"). */
export type Economy = { resource: ResourceId; values: Tier4 } | { morale: Tier4 }

type Tier4 = readonly [number, number, number, number]
/** Effect values at synergy tiers 1–4, before the academy-level multiplier. */
type TierValues = Partial<Record<EffectKey, Tier4>>

export interface AffinityDef {
  id: Affinity
  label: string
  tier: 1 | 2 | 3 | 4
  /** Affinities that must reach the unlock level first. Empty for tier 1. */
  parents: readonly Affinity[]
  combat: TierValues
  economy?: Economy
  /** Design choice per affinity: if true, its synergy empowers every unit in the troop, not just carriers. */
  team?: boolean
  flavour: string
}

const T = (a: number, b: number, c: number, d: number): Tier4 => [a, b, c, d]

export const AFFINITY_DEFS: Record<Affinity, AffinityDef> = {
  // ── Tier 1: the land ───────────────────────────────────────────────
  fire: {
    id: 'fire', label: 'Fire', tier: 1, parents: [],
    combat: { atkPct: T(0.03, 0.06, 0.09, 0.13) }, economy: { resource: 'fire', values: T(0.2, 0.4, 0.7, 1) },
    flavour: 'The first flame. Forges, burns, and feeds everything hotter.',
  },
  water: {
    id: 'water', label: 'Water', tier: 1, parents: [],
    combat: { hpPct: T(0.03, 0.06, 0.09, 0.13) }, economy: { resource: 'food', values: T(0.15, 0.3, 0.5, 0.75) },
    flavour: 'Feeds the fields and tempers steel.',
  },
  earth: {
    id: 'earth', label: 'Earth', tier: 1, parents: [],
    combat: { defPct: T(0.05, 0.1, 0.15, 0.22) }, economy: { resource: 'earth', values: T(0.2, 0.4, 0.7, 1) },
    flavour: 'Bedrock and patience.',
  },
  wind: {
    id: 'wind', label: 'Wind', tier: 1, parents: [],
    // Attack speed at about half of Storm's, so its tier-2 child still feels like a step up.
    combat: { moveSpeedPct: T(0.05, 0.1, 0.15, 0.2), atkSpeedPct: T(0.04, 0.08, 0.13, 0.2) }, economy: { resource: 'wind', values: T(0.2, 0.4, 0.7, 1) },
    flavour: 'Restless and quick: moves and strikes faster.',
  },
  arcane: {
    id: 'arcane', label: 'Arcane', tier: 1, parents: [],
    combat: { spellPowerPct: T(0.05, 0.1, 0.15, 0.22) }, economy: { resource: 'arcane', values: T(0.2, 0.4, 0.7, 1) },
    flavour: 'Raw magic, pooled in the ley lines.',
  },
  light: {
    id: 'light', label: 'Light', tier: 1, parents: [],
    combat: { hpPct: T(0.03, 0.05, 0.08, 0.12) }, economy: { morale: T(2, 4, 6, 9) },
    flavour: 'Holiness, raised by building a church. Lifts your people’s spirits.',
  },
  dark: {
    id: 'dark', label: 'Dark', tier: 1, parents: [],
    combat: { critChance: T(0.03, 0.05, 0.08, 0.12) }, economy: { resource: 'gold', values: T(0.1, 0.2, 0.35, 0.5) },
    flavour: 'What the crypt keeps. Profitable, and a little dangerous.',
  },

  // ── Tier 2 ─────────────────────────────────────────────────────────
  magma: {
    id: 'magma', label: 'Magma', tier: 2, parents: ['fire', 'earth'],
    combat: { thorns: T(0.1, 0.2, 0.3, 0.45) },
    flavour: 'Molten stone. Opens the way to weapons and steel.',
  },
  weaponry: {
    id: 'weaponry', label: 'Weaponry', tier: 2, parents: ['magma'],
    combat: { atkPct: T(0.1, 0.2, 0.35, 0.55) },
    flavour: 'Blades hammered on stone. Every Weaponry unit simply hits harder.',
  },
  steel: {
    id: 'steel', label: 'Steel', tier: 2, parents: ['magma', 'water'],
    combat: { damageReduction: T(0.06, 0.12, 0.2, 0.3) },
    flavour: 'Iron, quenched. Armour that holds.',
  },
  ice: {
    id: 'ice', label: 'Ice', tier: 2, parents: ['water', 'wind'],
    combat: { slowOnHit: T(0.1, 0.15, 0.22, 0.3) },
    flavour: 'Cold that bites and slows.',
  },
  verdance: {
    id: 'verdance', label: 'Verdance', tier: 2, parents: ['water', 'earth'],
    combat: { hpPct: T(0.1, 0.2, 0.35, 0.55) },
    flavour: 'Growing life. Hardy, and the root of holy and unholy arts.',
  },
  storm: {
    id: 'storm', label: 'Storm', tier: 2, parents: ['wind', 'fire'],
    combat: { atkSpeedPct: T(0.08, 0.16, 0.26, 0.4) },
    flavour: 'Wind with a temper.',
  },

  // ── Tier 3 ─────────────────────────────────────────────────────────
  archery: {
    id: 'archery', label: 'Archery', tier: 3, parents: ['wind', 'weaponry'],
    combat: { doubleStrike: T(0.1, 0.18, 0.28, 0.4), critChance: T(0.05, 0.1, 0.15, 0.2) },
    flavour: 'Weapons given to the wind: the bow. Gale-quick volleys.',
  },
  electricity: {
    id: 'electricity', label: 'Electricity', tier: 3, parents: ['storm', 'water'],
    combat: { bonusMagic: T(0.1, 0.2, 0.32, 0.48) },
    flavour: 'The storm caught and carried.',
  },
  knighthood: {
    id: 'knighthood', label: 'Knighthood', tier: 3, parents: ['weaponry', 'steel'],
    combat: { startShield: T(0.1, 0.18, 0.28, 0.4) },
    flavour: 'Sword and plate, sworn to an order.',
  },
  spellblade: {
    id: 'spellblade', label: 'Spellblade', tier: 3, parents: ['weaponry', 'arcane'],
    combat: { energyGainPct: T(0.2, 0.4, 0.7, 1) },
    flavour: 'Runes on steel: abilities come faster.',
  },
  sanctity: {
    id: 'sanctity', label: 'Sanctity', tier: 3, parents: ['light', 'verdance'],
    combat: { lifesteal: T(0.08, 0.14, 0.22, 0.32) },
    flavour: 'Holy life. Wounds close as blows land.',
  },
  necromancy: {
    id: 'necromancy', label: 'Necromancy', tier: 3, parents: ['dark', 'verdance'],
    combat: { thorns: T(0.08, 0.15, 0.24, 0.35), critChance: T(0.05, 0.1, 0.15, 0.2) },
    flavour: 'Life, inverted.',
  },

  // ── Tier 4 ───────────────────────────────────────────────────────────────────────────────────────────────────
  machinery: {
    id: 'machinery', label: 'Machinery', tier: 4, parents: ['electricity', 'steel'],
    team: true, combat: { atkSpeedPct: T(0.08, 0.15, 0.25, 0.4), defPct: T(0.1, 0.2, 0.35, 0.5) },
    flavour: 'Lightning harnessed in steel. The whole troop moves like clockwork.',
  },
  thunder: {
    id: 'thunder', label: 'Thunder', tier: 4, parents: ['electricity', 'arcane'],
    team: true, combat: { chain: T(0.15, 0.25, 0.4, 0.6) },
    flavour: 'Lightning mages. Every attack in the troop arcs to another foe.',
  },
  eclipse: {
    id: 'eclipse', label: 'Eclipse', tier: 4, parents: ['sanctity', 'necromancy'],
    team: true, combat: { spellPowerPct: T(0.15, 0.3, 0.5, 0.8), critChance: T(0.05, 0.1, 0.15, 0.25) },
    flavour: 'Light and dark in balance. The rarest power there is.',
  },
}

export const AFFINITY_LABEL = Object.fromEntries(AFFINITIES.map((a) => [a, AFFINITY_DEFS[a].label])) as Record<Affinity, string>

export const affinitiesOfTier = (t: number) => AFFINITIES.filter((a) => AFFINITY_DEFS[a].tier === t)

/** Children unlocked (in part) by this affinity. */
export const childrenOf = (a: Affinity) => AFFINITIES.filter((c) => AFFINITY_DEFS[c].parents.includes(a))

/** The tier-1 elements an affinity grows from (Magma → fire, earth). A tier-1 affinity is its own root. */
export function rootsOf(a: Affinity): ElementId[] {
  const d = AFFINITY_DEFS[a]
  if (d.tier === 1) return [a as ElementId]
  return [...new Set(d.parents.flatMap(rootsOf))]
}

/**
 * Throughput an academy of `a` at `level` draws every turn: a fixed amount per level of each
 * tier-1 root's essence, scaled by tier. Paid out of each turn's income for as long as it stands.
 */
export function academyFlow(a: Affinity, level: number): Cost {
  const cost: Cost = {}
  for (const r of rootsOf(a)) cost[r] = CONFIG.affinity.flowPerLevel * level * AFFINITY_DEFS[a].tier
  return cost
}

/** The upfront payment to dedicate an academy to `a`, raise it to `level`, or evolve into `a` (level 1). */
export function researchCost(a: Affinity, level: number): Cost {
  const { essence, gold } = CONFIG.affinity.research
  const t = AFFINITY_DEFS[a].tier
  const cost: Cost = { gold: gold * level * t }
  for (const r of rootsOf(a)) cost[r] = essence * level * t
  return cost
}

/** A unit's main affinity, or null for a plain citizen born without one. */
export const primaryAffinity = (points: AffinityPoints): Affinity | null =>
  (Object.entries(points) as [Affinity, number][])
    .filter(([, n]) => n > 0)
    .sort((a, b) => b[1] - a[1] || AFFINITY_DEFS[b[0]].tier - AFFINITY_DEFS[a[0]].tier)[0]?.[0] ?? null

export const affinityEntries = (points: AffinityPoints) =>
  (Object.entries(points) as [Affinity, number][]).filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1])

// ── Back-compat shims for the synergy layer ───────────────────────────

export interface SynergyDef {
  id: Affinity
  name: string
  components: readonly Affinity[]
  tiers: TierValues
}

/** One synergy per affinity. */
export const SYNERGY_DEFS: SynergyDef[] = AFFINITIES.map((a) => ({ id: a, name: AFFINITY_LABEL[a], components: [a], tiers: AFFINITY_DEFS[a].combat }))
