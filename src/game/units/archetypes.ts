/**
 * Layer 1 of the unit model: the static archetypes every individual unit is
 * rolled from. A unit's tags are its class + its element; synergies, buildings
 * and shop odds all key off these tags.
 */

export const CLASSES = ['knight', 'rider', 'mage', 'archer', 'cleric', 'rogue'] as const
export type UnitClass = (typeof CLASSES)[number]

export const ELEMENTS = ['fire', 'frost', 'storm', 'earth'] as const
export type Element = (typeof ELEMENTS)[number]

export type Tag = UnitClass | Element
export const TAGS: readonly Tag[] = [...CLASSES, ...ELEMENTS]

export type AbilityId = 'bulwark' | 'charge' | 'blast' | 'volley' | 'mend' | 'backstab'

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

export interface ClassDef {
  id: UnitClass
  label: string
  blurb: string
  base: Stats
  ability: AbilityId
  abilityLabel: string
  abilityText: string
}

export const CLASS_DEFS: Record<UnitClass, ClassDef> = {
  knight: {
    id: 'knight',
    label: 'Knight',
    blurb: 'Holds the line.',
    base: { hp: 620, atk: 40, def: 40, range: 1.2, atkSpeed: 0.8, moveSpeed: 2.2, maxEnergy: 80 },
    ability: 'bulwark',
    abilityLabel: 'Bulwark',
    abilityText: 'Gains a shield worth 30% of max HP.',
  },
  rider: {
    id: 'rider',
    label: 'Rider',
    blurb: 'Fast, hits hard on arrival.',
    base: { hp: 520, atk: 52, def: 24, range: 1.3, atkSpeed: 0.9, moveSpeed: 4.2, maxEnergy: 60 },
    ability: 'charge',
    abilityLabel: 'Charge',
    abilityText: 'Strikes the target for 220% attack.',
  },
  mage: {
    id: 'mage',
    label: 'Mage',
    blurb: 'Fragile, splashes damage.',
    base: { hp: 340, atk: 58, def: 10, range: 5, atkSpeed: 0.6, moveSpeed: 2.0, maxEnergy: 70 },
    ability: 'blast',
    abilityLabel: 'Blast',
    abilityText: 'Deals 180% attack to the target and enemies near it.',
  },
  archer: {
    id: 'archer',
    label: 'Archer',
    blurb: 'Longest reach on the field.',
    base: { hp: 360, atk: 48, def: 12, range: 6.5, atkSpeed: 0.95, moveSpeed: 2.2, maxEnergy: 80 },
    ability: 'volley',
    abilityLabel: 'Volley',
    abilityText: 'Hits the 3 nearest enemies for 130% attack.',
  },
  cleric: {
    id: 'cleric',
    label: 'Cleric',
    blurb: 'Keeps the troop standing.',
    base: { hp: 400, atk: 28, def: 18, range: 4, atkSpeed: 0.7, moveSpeed: 2.0, maxEnergy: 60 },
    ability: 'mend',
    abilityLabel: 'Mend',
    abilityText: 'Heals the most wounded ally for 18% of their max HP plus 150% attack.',
  },
  rogue: {
    id: 'rogue',
    label: 'Rogue',
    blurb: 'Hunts the weakest.',
    base: { hp: 420, atk: 56, def: 15, range: 1.1, atkSpeed: 1.2, moveSpeed: 3.4, maxEnergy: 70 },
    ability: 'backstab',
    abilityLabel: 'Backstab',
    abilityText: 'Leaps to the weakest enemy and hits for 250% attack.',
  },
}

export interface ElementDef {
  id: Element
  label: string
  /** Multiplicative stat bonus every unit of this element carries. */
  passive: Partial<Record<keyof Stats, number>>
  passiveText: string
}

export const ELEMENT_DEFS: Record<Element, ElementDef> = {
  fire: { id: 'fire', label: 'Fire', passive: { atk: 1.15 }, passiveText: '+15% attack' },
  frost: { id: 'frost', label: 'Frost', passive: { def: 1.3 }, passiveText: '+30% defense' },
  storm: { id: 'storm', label: 'Storm', passive: { atkSpeed: 1.15 }, passiveText: '+15% attack speed' },
  earth: { id: 'earth', label: 'Earth', passive: { hp: 1.15 }, passiveText: '+15% HP' },
}

export const isMelee = (cls: UnitClass) => CLASS_DEFS[cls].base.range < 2
