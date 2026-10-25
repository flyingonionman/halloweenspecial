import { primaryAffinity, type Affinity, type AffinityPoints } from '../affinities'
import type { UnitType } from './types'
import type { Rng } from '../rng'

const FIRST = [
  'Ash', 'Bram', 'Cora', 'Dov', 'Edda', 'Fen', 'Gile', 'Hollis', 'Ivo', 'Juna', 'Kest', 'Lark',
  'Mira', 'Nod', 'Orla', 'Pell', 'Quill', 'Rook', 'Sable', 'Tamsin', 'Ulf', 'Vesna', 'Wren', 'Yara',
  'Zev', 'Agna', 'Bertil', 'Cass', 'Dunstan', 'Elske', 'Fenna', 'Grim', 'Hesper', 'Isolde', 'Jory',
]

const EPITHET: Record<Affinity, string[]> = {
  sword: ['the Keen', 'Bladesworn', 'of the Edge'],
  shield: ['the Wall', 'Ironside', 'the Steadfast'],
  bow: ['Farshot', 'the Fletched', 'of the Long Draw'],
  arcane: ['the Learned', 'Runeborn', 'of the Ninth Page'],
  fire: ['the Kindled', 'Emberhand', 'of the Pyre', 'Ashborn'],
  frost: ['the Pale', 'Rimeheart', 'of the Long Night', 'Hoarfrost'],
  wind: ['the Restless', 'Galeborn', 'of the Squall'],
  earth: ['the Rooted', 'Stonehand', 'of the Barrow', 'Mossback'],
}

const TITLE: Record<UnitType, string[]> = {
  fighter: ['Blade', 'Reaver', 'Duelist'],
  tank: ['Warden', 'Ser', 'Dame'],
  ranger: ['Fletcher', 'Ranger', 'Bowman'],
  mage: ['Magus', 'Adept', 'Seer'],
  healer: ['Sister', 'Brother', 'Abbot'],
}

export function unitName(type: UnitType, affinities: AffinityPoints, rng: Rng): string {
  return `${rng.pick(TITLE[type])} ${rng.pick(FIRST)} ${rng.pick(EPITHET[primaryAffinity(affinities)])}`
}
