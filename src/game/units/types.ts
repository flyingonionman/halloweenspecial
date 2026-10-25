/**
 * Unit types are the *fighting style*: how a unit moves, attacks and what its
 * ability does. They are fixed per unit and independent of affinities.
 */

export const UNIT_TYPES = ['fighter', 'tank', 'ranger', 'mage', 'healer'] as const
export type UnitType = (typeof UNIT_TYPES)[number]

export type DamageKind = 'physical' | 'magic'
export type AbilityId = 'cleave' | 'taunt' | 'volley' | 'blast' | 'mend'

export interface Stats {
  hp: number
  atk: number
  def: number
  /** World units. Melee is ~1.2. */
  range: number
  /** Attacks per second. */
  atkSpeed: number
  /** World units per second. */
  moveSpeed: number
  /** Energy needed to cast the ability. */
  maxEnergy: number
}

export interface TypeDef {
  id: UnitType
  label: string
  blurb: string
  base: Stats
  damage: DamageKind
  ability: AbilityId
  abilityLabel: string
  abilityText: string
}

export const TYPE_DEFS: Record<UnitType, TypeDef> = {
  fighter: {
    id: 'fighter',
    label: 'Fighter',
    blurb: 'Melee damage.',
    base: { hp: 540, atk: 52, def: 24, range: 1.2, atkSpeed: 1.0, moveSpeed: 3.2, maxEnergy: 70 },
    damage: 'physical',
    ability: 'cleave',
    abilityLabel: 'Cleave',
    abilityText: 'Hits the target for 170% attack and enemies beside it for 100%.',
  },
  tank: {
    id: 'tank',
    label: 'Tank',
    blurb: 'Soaks and protects.',
    base: { hp: 720, atk: 34, def: 45, range: 1.2, atkSpeed: 0.75, moveSpeed: 2.2, maxEnergy: 80 },
    damage: 'physical',
    ability: 'taunt',
    abilityLabel: 'Taunt',
    abilityText: 'Gains a shield worth 25% of max HP and forces nearby enemies to attack it.',
  },
  ranger: {
    id: 'ranger',
    label: 'Ranger',
    blurb: 'Longest reach.',
    base: { hp: 360, atk: 48, def: 12, range: 6.5, atkSpeed: 0.95, moveSpeed: 2.4, maxEnergy: 80 },
    damage: 'physical',
    ability: 'volley',
    abilityLabel: 'Volley',
    abilityText: 'Hits the 3 nearest enemies for 130% attack.',
  },
  mage: {
    id: 'mage',
    label: 'Mage',
    blurb: 'Magic damage, splashes.',
    base: { hp: 340, atk: 56, def: 10, range: 5, atkSpeed: 0.6, moveSpeed: 2.0, maxEnergy: 70 },
    damage: 'magic',
    ability: 'blast',
    abilityLabel: 'Blast',
    abilityText: 'Deals 180% attack as magic to the target and enemies near it.',
  },
  healer: {
    id: 'healer',
    label: 'Healer',
    blurb: 'Keeps the troop standing.',
    base: { hp: 400, atk: 26, def: 18, range: 4, atkSpeed: 0.7, moveSpeed: 2.0, maxEnergy: 60 },
    damage: 'magic',
    ability: 'mend',
    abilityLabel: 'Mend',
    abilityText: 'Heals the most wounded ally for 18% of their max HP plus 150% attack.',
  },
}

export const isRanged = (t: UnitType) => TYPE_DEFS[t].base.range >= 2
