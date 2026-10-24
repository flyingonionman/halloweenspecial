/**
 * Synergies: counting tags across the 6-unit troop unlocks bonuses. Some are
 * flat stat bonuses; "cohesion" bonuses only apply in combat while a unit is
 * standing near an ally of the same tag (placement matters only via range and these).
 */
import type { Stats, Tag } from './units/archetypes'
import { tagsOf, unitStats, type Unit } from './units/unit'

export interface CombatStats extends Stats {
  critChance: number
  /** Multiplier on ability damage and healing. */
  spellPower: number
  /** Set when a cohesion synergy is active for this unit. */
  cohesion: { tag: Tag; radius: number; damageReduction: number; atkBonus: number } | null
}

type StatKey = 'hp' | 'atk' | 'def' | 'range' | 'atkSpeed' | 'moveSpeed' | 'critChance' | 'spellPower'

type Effect =
  | { kind: 'mult'; stat: StatKey; value: number; scope: 'tagged' | 'team' }
  | { kind: 'add'; stat: StatKey; value: number; scope: 'tagged' | 'team' }
  | { kind: 'cohesion'; radius: number; damageReduction: number; atkBonus: number }

export interface SynergyDef {
  tag: Tag
  name: string
  /** Units needed for each tier. */
  thresholds: number[]
  /** One effect per tier; higher tiers replace lower ones. */
  tiers: Effect[]
  describe: (tier: number) => string
}

export const SYNERGIES: SynergyDef[] = [
  {
    tag: 'knight', name: 'Shield Wall', thresholds: [2, 4],
    tiers: [
      { kind: 'cohesion', radius: 2.5, damageReduction: 0.2, atkBonus: 0 },
      { kind: 'cohesion', radius: 3, damageReduction: 0.35, atkBonus: 0.1 },
    ],
    describe: (t) => (t === 0 ? 'Knights near another knight take 20% less damage' : 'Knights near another knight take 35% less damage, +10% attack'),
  },
  {
    tag: 'rider', name: 'Cavalry Wing', thresholds: [2, 4],
    tiers: [
      { kind: 'cohesion', radius: 3, damageReduction: 0, atkBonus: 0.2 },
      { kind: 'cohesion', radius: 3.5, damageReduction: 0.1, atkBonus: 0.4 },
    ],
    describe: (t) => (t === 0 ? 'Riders near another rider get +20% attack' : 'Riders near another rider get +40% attack, 10% less damage taken'),
  },
  {
    tag: 'mage', name: 'Coven', thresholds: [2, 4],
    tiers: [
      { kind: 'mult', stat: 'spellPower', value: 1.25, scope: 'tagged' },
      { kind: 'mult', stat: 'spellPower', value: 1.6, scope: 'tagged' },
    ],
    describe: (t) => `Mages deal ${t === 0 ? '+25%' : '+60%'} ability damage`,
  },
  {
    tag: 'archer', name: 'Longbows', thresholds: [2, 4],
    tiers: [
      { kind: 'add', stat: 'range', value: 1, scope: 'tagged' },
      { kind: 'add', stat: 'range', value: 2.5, scope: 'tagged' },
    ],
    describe: (t) => `Archers gain ${t === 0 ? '+1' : '+2.5'} range`,
  },
  {
    tag: 'cleric', name: 'Litany', thresholds: [2, 3],
    tiers: [
      { kind: 'mult', stat: 'hp', value: 1.08, scope: 'team' },
      { kind: 'mult', stat: 'hp', value: 1.18, scope: 'team' },
    ],
    describe: (t) => `The whole troop gains ${t === 0 ? '+8%' : '+18%'} HP`,
  },
  {
    tag: 'rogue', name: 'Ambush', thresholds: [2, 4],
    tiers: [
      { kind: 'add', stat: 'critChance', value: 0.15, scope: 'tagged' },
      { kind: 'add', stat: 'critChance', value: 0.35, scope: 'tagged' },
    ],
    describe: (t) => `Rogues gain ${t === 0 ? '15%' : '35%'} crit chance`,
  },
  {
    tag: 'fire', name: 'Wildfire', thresholds: [2, 4],
    tiers: [
      { kind: 'mult', stat: 'atk', value: 1.12, scope: 'tagged' },
      { kind: 'mult', stat: 'atk', value: 1.3, scope: 'tagged' },
    ],
    describe: (t) => `Fire units gain ${t === 0 ? '+12%' : '+30%'} attack`,
  },
  {
    tag: 'frost', name: 'Permafrost', thresholds: [2, 4],
    tiers: [
      { kind: 'mult', stat: 'def', value: 1.25, scope: 'tagged' },
      { kind: 'mult', stat: 'def', value: 1.6, scope: 'tagged' },
    ],
    describe: (t) => `Frost units gain ${t === 0 ? '+25%' : '+60%'} defense`,
  },
  {
    tag: 'storm', name: 'Squall', thresholds: [2, 4],
    tiers: [
      { kind: 'mult', stat: 'atkSpeed', value: 1.12, scope: 'tagged' },
      { kind: 'mult', stat: 'atkSpeed', value: 1.3, scope: 'tagged' },
    ],
    describe: (t) => `Storm units gain ${t === 0 ? '+12%' : '+30%'} attack speed`,
  },
  {
    tag: 'earth', name: 'Deep Roots', thresholds: [2, 4],
    tiers: [
      { kind: 'mult', stat: 'hp', value: 1.12, scope: 'tagged' },
      { kind: 'mult', stat: 'hp', value: 1.3, scope: 'tagged' },
    ],
    describe: (t) => `Earth units gain ${t === 0 ? '+12%' : '+30%'} HP`,
  },
]

export interface ActiveSynergy {
  def: SynergyDef
  count: number
  /** -1 when not yet active. */
  tier: number
  /** Count needed for the next tier, or null at max. */
  next: number | null
}

export function computeSynergies(troop: readonly Unit[]): ActiveSynergy[] {
  const counts = new Map<Tag, number>()
  for (const u of troop) for (const t of tagsOf(u)) counts.set(t, (counts.get(t) ?? 0) + 1)
  return SYNERGIES.filter((s) => counts.has(s.tag)).map((def) => {
    const count = counts.get(def.tag) ?? 0
    const tier = def.thresholds.findLastIndex((n) => count >= n)
    return { def, count, tier, next: def.thresholds[tier + 1] ?? null }
  })
}

export function combatStats(unit: Unit, synergies: readonly ActiveSynergy[]): CombatStats {
  const s: CombatStats = { ...unitStats(unit), critChance: 0.05, spellPower: 1, cohesion: null }
  const tags = tagsOf(unit)
  for (const syn of synergies) {
    if (syn.tier < 0) continue
    const effect = syn.def.tiers[syn.tier]!
    const applies = effect.kind === 'cohesion' || effect.scope === 'tagged' ? tags.includes(syn.def.tag) : true
    if (!applies) continue
    if (effect.kind === 'cohesion') {
      s.cohesion = { tag: syn.def.tag, radius: effect.radius, damageReduction: effect.damageReduction, atkBonus: effect.atkBonus }
    } else if (effect.kind === 'mult') {
      s[effect.stat] *= effect.value
    } else {
      s[effect.stat] += effect.value
    }
  }
  s.hp = Math.round(s.hp)
  s.atk = Math.round(s.atk)
  s.def = Math.round(s.def)
  return s
}
