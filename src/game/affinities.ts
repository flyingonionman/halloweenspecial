/**
 * Affinities are points a unit carries (e.g. Sword 2, Fire 1). They don't change
 * how a unit fights. They add up across the troop to unlock synergies, and pairs
 * of affinities combine into compound synergies (Sword + Shield → Knight).
 *
 * Synergy strength has two independent axes:
 *   tier  (1–4) from how many points the troop carries   → CONFIG.affinity.thresholds
 *   level (0–4) from the affinity's research building    → CONFIG.affinity.levelMult
 *
 * Effects apply directly to every unit carrying a component affinity, whatever
 * its type: a mage with Knight still deals magic damage, it just also gets the shield.
 */

export const AFFINITIES = ['sword', 'shield', 'bow', 'arcane', 'fire', 'frost', 'wind', 'earth'] as const
export type Affinity = (typeof AFFINITIES)[number]
export type AffinityPoints = Partial<Record<Affinity, number>>

export const AFFINITY_LABEL: Record<Affinity, string> = {
  sword: 'Sword',
  shield: 'Shield',
  bow: 'Bow',
  arcane: 'Arcane',
  fire: 'Fire',
  frost: 'Frost',
  wind: 'Wind',
  earth: 'Earth',
}

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
}

/** Effect values at tiers 1–4, before the affinity-level multiplier. */
type TierValues = Partial<Record<EffectKey, readonly [number, number, number, number]>>

export interface SynergyDef {
  id: string
  name: string
  /** One affinity = base synergy, two = compound. */
  components: readonly Affinity[]
  tiers: TierValues
}

export const BASE_SYNERGIES: SynergyDef[] = [
  { id: 'sword', name: 'Sword', components: ['sword'], tiers: { atkPct: [0.1, 0.2, 0.35, 0.55] } },
  { id: 'shield', name: 'Shield', components: ['shield'], tiers: { damageReduction: [0.06, 0.12, 0.2, 0.3] } },
  { id: 'bow', name: 'Bow', components: ['bow'], tiers: { critChance: [0.08, 0.15, 0.25, 0.4] } },
  { id: 'arcane', name: 'Arcane', components: ['arcane'], tiers: { spellPowerPct: [0.15, 0.3, 0.5, 0.8] } },
  { id: 'fire', name: 'Fire', components: ['fire'], tiers: { bonusMagic: [0.08, 0.15, 0.25, 0.4] } },
  { id: 'frost', name: 'Frost', components: ['frost'], tiers: { slowOnHit: [0.1, 0.15, 0.22, 0.3] } },
  { id: 'wind', name: 'Wind', components: ['wind'], tiers: { atkSpeedPct: [0.08, 0.16, 0.26, 0.4], moveSpeedPct: [0.1, 0.15, 0.2, 0.3] } },
  { id: 'earth', name: 'Earth', components: ['earth'], tiers: { hpPct: [0.1, 0.2, 0.35, 0.55] } },
]

export const COMPOUND_SYNERGIES: SynergyDef[] = [
  { id: 'knight', name: 'Knight', components: ['sword', 'shield'], tiers: { startShield: [0.1, 0.18, 0.28, 0.4] } },
  { id: 'spellblade', name: 'Spellblade', components: ['sword', 'arcane'], tiers: { energyGainPct: [0.2, 0.4, 0.7, 1.0] } },
  { id: 'warbrand', name: 'Warbrand', components: ['sword', 'fire'], tiers: { lifesteal: [0.08, 0.14, 0.22, 0.32] } },
  { id: 'blizzard', name: 'Blizzard', components: ['frost', 'wind'], tiers: { slowOnHit: [0.1, 0.15, 0.2, 0.25], critChance: [0.05, 0.1, 0.15, 0.2] } },
  { id: 'magma', name: 'Magma', components: ['fire', 'earth'], tiers: { thorns: [0.1, 0.2, 0.3, 0.45] } },
  { id: 'gale', name: 'Gale', components: ['bow', 'wind'], tiers: { doubleStrike: [0.1, 0.18, 0.28, 0.4] } },
  { id: 'bastion', name: 'Bastion', components: ['shield', 'earth'], tiers: { defPct: [0.2, 0.4, 0.65, 1.0] } },
]

export const SYNERGY_DEFS: SynergyDef[] = [...BASE_SYNERGIES, ...COMPOUND_SYNERGIES]

export const primaryAffinity = (points: AffinityPoints): Affinity =>
  (Object.entries(points) as [Affinity, number][]).sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'sword'

export const affinityEntries = (points: AffinityPoints) =>
  (Object.entries(points) as [Affinity, number][]).filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1])
