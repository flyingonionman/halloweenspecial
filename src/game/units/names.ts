import type { Element, UnitClass } from './archetypes'
import type { Rng } from '../rng'

const FIRST = [
  'Ash', 'Bram', 'Cora', 'Dov', 'Edda', 'Fen', 'Gile', 'Hollis', 'Ivo', 'Juna', 'Kest', 'Lark',
  'Mira', 'Nod', 'Orla', 'Pell', 'Quill', 'Rook', 'Sable', 'Tamsin', 'Ulf', 'Vesna', 'Wren', 'Yara',
  'Zev', 'Agna', 'Bertil', 'Cass', 'Dunstan', 'Elske', 'Fenna', 'Grim', 'Hesper', 'Isolde', 'Jory',
]

const EPITHET: Record<Element, string[]> = {
  fire: ['the Kindled', 'Emberhand', 'of the Pyre', 'Ashborn', 'the Scorched'],
  frost: ['the Pale', 'Rimeheart', 'of the Long Night', 'Hoarfrost', 'the Still'],
  storm: ['the Loud', 'Thunderkin', 'of the Squall', 'Galeborn', 'the Restless'],
  earth: ['the Rooted', 'Stonehand', 'of the Barrow', 'Mossback', 'the Unmoved'],
}

const TITLE: Record<UnitClass, string[]> = {
  knight: ['Ser', 'Dame', 'Warden'],
  rider: ['Outrider', 'Lancer', 'Herald'],
  mage: ['Magus', 'Adept', 'Seer'],
  archer: ['Bowman', 'Fletcher', 'Ranger'],
  cleric: ['Sister', 'Brother', 'Abbot'],
  rogue: ['Knave', 'Cutpurse', 'Shade'],
}

export function unitName(cls: UnitClass, element: Element, rng: Rng): string {
  return `${rng.pick(TITLE[cls])} ${rng.pick(FIRST)} ${rng.pick(EPITHET[element])}`
}
