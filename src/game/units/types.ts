/**
 * Unit types are the *fighting style*: how a unit moves, attacks and what its
 * ability does. They are fixed per unit and independent of affinities.
 */
import { CONFIG } from '../config'

export const UNIT_TYPES = ['fighter', 'tank', 'ranger', 'mage', 'healer'] as const
export type UnitType = (typeof UNIT_TYPES)[number]

export type DamageKind = 'physical' | 'magic'
export type AbilityId = 'cleave' | 'taunt' | 'volley' | 'blast' | 'mend'

export interface Stats {
  hp: number
  atk: number
  def: number
  /** Reach in arena cells (1 = adjacent, melee). */
  range: number
  /** Attacks per second. */
  atkSpeed: number
  /** Cells per second. */
  moveSpeed: number
  /** Energy needed to cast the ability. */
  maxEnergy: number
}

export interface TypeDef {
  id: UnitType
  label: string
  blurb: string
  /** Who this type goes for in a fight (the combat cadence, in words). */
  targeting: string
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
    targeting: 'Goes for enemy tanks first, then whoever is nearest.',
    base: { hp: 540, atk: 52, def: 24, range: 1, atkSpeed: 1.0, moveSpeed: 2.2, maxEnergy: 70 },
    damage: 'physical',
    ability: 'cleave',
    abilityLabel: 'Cleave',
    abilityText: 'Hits the target for 170% attack and every enemy next to it for 100%.',
  },
  tank: {
    id: 'tank',
    label: 'Tank',
    blurb: 'Grabs aggro and soaks.',
    targeting: 'Draws the enemy: their fighters, rangers and mages attack tanks first. Fights the nearest enemy.',
    base: { hp: 720, atk: 34, def: 45, range: 1, atkSpeed: 0.75, moveSpeed: 1.6, maxEnergy: 80 },
    damage: 'physical',
    ability: 'taunt',
    abilityLabel: 'Taunt',
    abilityText: 'Gains a shield worth 25% of max HP and locks every enemy within 3 cells onto itself for 3 seconds.',
  },
  ranger: {
    id: 'ranger',
    label: 'Ranger',
    blurb: 'Longest reach.',
    targeting: 'Shoots enemy tanks first, then whoever is nearest.',
    base: { hp: 360, atk: 48, def: 12, range: 5, atkSpeed: 0.95, moveSpeed: 1.8, maxEnergy: 80 },
    damage: 'physical',
    ability: 'volley',
    abilityLabel: 'Volley',
    abilityText: 'Hits the 3 nearest enemies for 130% attack.',
  },
  mage: {
    id: 'mage',
    label: 'Mage',
    blurb: 'Magic damage, splashes.',
    targeting: 'Blasts enemy tanks first, then whoever is nearest.',
    base: { hp: 340, atk: 56, def: 10, range: 4, atkSpeed: 0.6, moveSpeed: 1.5, maxEnergy: 70 },
    damage: 'magic',
    ability: 'blast',
    abilityLabel: 'Blast',
    abilityText: `Deals 180% attack as magic to the target and every enemy within ${CONFIG.combat.blastRadius} cells of it.`,
  },
  healer: {
    id: 'healer',
    label: 'Healer',
    blurb: 'Mostly heals.',
    targeting: 'Heals the most hurt ally in reach. When nobody is hurt, hexes the strongest enemy in reach: a weak hit that cuts its damage.',
    base: { hp: 400, atk: 26, def: 18, range: 3, atkSpeed: 0.7, moveSpeed: 1.6, maxEnergy: 60 },
    damage: 'magic',
    ability: 'mend',
    abilityLabel: 'Mend',
    abilityText: 'Heals the most wounded ally for 18% of their max HP plus 150% attack.',
  },
}

const { ticksPerSecond: TPS, minActionTicks: MIN } = CONFIG.combat
/** Ticks one attack takes at this attack speed (the unit can't act again until it's done). */
export const attackTicks = (atkSpeed: number) => Math.max(MIN, Math.round(TPS / atkSpeed))
/** Ticks one step to a neighbouring cell takes at this move speed. */
export const moveTicks = (moveSpeed: number) => Math.max(MIN, Math.round(TPS / moveSpeed))

export const isRanged = (t: UnitType) => TYPE_DEFS[t].base.range >= 2
