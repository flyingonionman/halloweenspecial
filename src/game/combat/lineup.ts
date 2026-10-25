/**
 * Hand-built troops for the combat sandbox, the sim CLI and tests.
 *
 * Spec strings, comma separated, one unit each:
 *   type[:rarity][:level][@affinity[points]]
 *   e.g. "tank:rare:3, fighter@fire2, ranger, healer:epic"
 */
import { RARITIES, type Rarity } from '../config'
import { AFFINITIES, type Affinity } from '../affinities'
import { UNIT_TYPES, type UnitType } from '../units/types'
import type { Unit } from '../units/unit'

export interface UnitSpec {
  type: UnitType
  rarity: Rarity
  level: number
  affinity: Affinity | null
  points: number
}

export const defaultSpec = (type: UnitType): UnitSpec => ({ type, rarity: 'common', level: 1, affinity: null, points: 1 })

/** A deterministic unit for a spec: quality 1, no veteran stars. */
export function specUnit(spec: UnitSpec, uid: string): Unit {
  const label = spec.type[0]!.toUpperCase() + spec.type.slice(1)
  return {
    uid,
    name: `${label} ${uid}`,
    type: spec.type,
    affinities: spec.affinity ? { [spec.affinity]: spec.points } : {},
    rarity: spec.rarity,
    quality: 1,
    level: spec.level,
    battlesSurvived: 0,
  }
}

export function parseSpec(text: string): UnitSpec {
  const [body, aff] = text.trim().split('@') as [string, string | undefined]
  const [type, ...rest] = body.split(':').map((s) => s.trim().toLowerCase())
  if (!UNIT_TYPES.includes(type as UnitType)) throw new Error(`Unknown unit type "${type}" (use ${UNIT_TYPES.join(', ')})`)
  const spec = defaultSpec(type as UnitType)
  for (const r of rest) {
    if (RARITIES.includes(r as Rarity)) spec.rarity = r as Rarity
    else if (/^\d+$/.test(r)) spec.level = Number(r)
    else if (r) throw new Error(`Can't read "${r}" in "${text}" (rarity or level)`)
  }
  if (aff) {
    const m = /^([a-z]+)(\d*)$/.exec(aff.trim().toLowerCase())
    if (!m || !AFFINITIES.includes(m[1] as Affinity)) throw new Error(`Unknown affinity "${aff}"`)
    spec.affinity = m[1] as Affinity
    spec.points = m[2] ? Number(m[2]) : 1
  }
  return spec
}

export const parseLineup = (text: string): UnitSpec[] => text.split(',').filter((s) => s.trim()).map(parseSpec)

export const formatSpec = (s: UnitSpec) =>
  `${s.type}${s.rarity !== 'common' ? `:${s.rarity}` : ''}${s.level !== 1 ? `:${s.level}` : ''}${s.affinity ? `@${s.affinity}${s.points !== 1 ? s.points : ''}` : ''}`

export const lineupUnits = (specs: readonly UnitSpec[], prefix: string): Unit[] => specs.map((s, i) => specUnit(s, `${prefix}${i + 1}`))
