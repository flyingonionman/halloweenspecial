import { primaryAffinity, type Affinity, type AffinityPoints } from '../affinities'
import type { UnitType } from './types'
import type { Rng } from '../rng'

const FIRST = [
  'Ash', 'Bram', 'Cora', 'Dov', 'Edda', 'Fen', 'Gile', 'Hollis', 'Ivo', 'Juna', 'Kest', 'Lark',
  'Mira', 'Nod', 'Orla', 'Pell', 'Quill', 'Rook', 'Sable', 'Tamsin', 'Ulf', 'Vesna', 'Wren', 'Yara',
  'Zev', 'Agna', 'Bertil', 'Cass', 'Dunstan', 'Elske', 'Fenna', 'Grim', 'Hesper', 'Isolde', 'Jory',
]

const EPITHET: Record<Affinity, string[]> = {
  fire: ['the Kindled', 'Emberhand', 'of the Pyre'],
  water: ['the Tidal', 'of the Deep', 'Rainborn'],
  earth: ['the Rooted', 'Stonehand', 'of the Barrow'],
  wind: ['the Restless', 'Galeborn', 'of the Squall'],
  arcane: ['the Learned', 'Runeborn', 'of the Ninth Page'],
  light: ['the Bright', 'of the Dawn', 'Haloed'],
  dark: ['the Hollow', 'of the Crypt', 'Duskborn'],
  magma: ['Cinderheart', 'of the Caldera'],
  weaponry: ['the Keen', 'Bladesworn', 'of the Edge'],
  steel: ['Ironside', 'the Tempered'],
  ice: ['Rimeheart', 'the Pale', 'Hoarfrost'],
  verdance: ['Mossback', 'of the Grove', 'Greenhand'],
  storm: ['Thunderkin', 'of the Squall'],
  archery: ['Farshot', 'the Fletched'],
  electricity: ['Sparkblood', 'the Charged'],
  knighthood: ['the Sworn', 'of the Order'],
  spellblade: ['Runeblade', 'the Inscribed'],
  sanctity: ['the Blessed', 'of the Cathedral'],
  necromancy: ['Gravecaller', 'the Unburied'],
  machinery: ['Cogheart', 'the Wound'],
  thunder: ['Stormcaller', 'of the Ninth Bolt'],
  eclipse: ['the Twilit', 'of the Black Sun'],
}

const TITLE: Record<UnitType, string[]> = {
  fighter: ['Blade', 'Reaver', 'Duelist'],
  tank: ['Warden', 'Ser', 'Dame'],
  ranger: ['Fletcher', 'Ranger', 'Bowman'],
  mage: ['Magus', 'Adept', 'Seer'],
  healer: ['Sister', 'Brother', 'Abbot'],
}

export function unitName(type: UnitType, affinities: AffinityPoints, rng: Rng): string {
  const a = primaryAffinity(affinities)
  // Plain citizens (no affinity) go by title and name alone.
  return `${rng.pick(TITLE[type])} ${rng.pick(FIRST)}${a ? ` ${rng.pick(EPITHET[a])}` : ''}`
}
