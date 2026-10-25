/**
 * Species: chosen once per run. They change the rules of the meta game (births,
 * slots, economy, vitality, permadeath) and never touch combat stats directly.
 */

export const SPECIES_IDS = ['human', 'ork', 'goblin', 'feline', 'dwarf', 'elf', 'golem', 'dragon'] as const
export type SpeciesId = (typeof SPECIES_IDS)[number]

export interface SpeciesMods {
  birthsMult?: number
  troopSizeDelta?: number
  /** Multiplies the odds of every rarity above common. */
  rareOddsMult?: number
  /** Every citizen is born this many rarities up. */
  rarityShift?: number
  startHp?: number
  /** Multiplies the birth weight of ranged unit types. */
  rangedWeightMult?: number
  noPermadeath?: boolean
  upgradeCostMult?: number
  interest?: boolean
}

export interface SpeciesDef {
  id: SpeciesId
  name: string
  text: string
  mods: SpeciesMods
}

export const SPECIES: Record<SpeciesId, SpeciesDef> = {
  human: { id: 'human', name: 'Humans', text: 'Earn interest on gold you hold at the end of each turn.', mods: { interest: true } },
  ork: { id: 'ork', name: 'Orks', text: 'Twice as many citizens are born each turn.', mods: { birthsMult: 2 } },
  goblin: { id: 'goblin', name: 'Goblins', text: 'Two extra troop slots, but the odds of rarer citizens are halved.', mods: { troopSizeDelta: 2, rareOddsMult: 0.5 } },
  feline: { id: 'feline', name: 'Felines', text: 'Start with 150 vitality.', mods: { startHp: 150 } },
  dwarf: { id: 'dwarf', name: 'Dwarves', text: 'Ranged citizens are almost never born, so your people are mostly melee.', mods: { rangedWeightMult: 0.05 } },
  elf: { id: 'elf', name: 'Elves', text: 'Units that fall in battle return afterwards.', mods: { noPermadeath: true } },
  golem: { id: 'golem', name: 'Golems', text: 'Unit upgrades cost 40% less.', mods: { upgradeCostMult: 0.6 } },
  dragon: { id: 'dragon', name: 'Dragons', text: 'Two fewer troop slots, but every citizen is born one rarity higher.', mods: { troopSizeDelta: -2, rarityShift: 1 } },
}

export const speciesMods = (id: SpeciesId | null): SpeciesMods => (id ? SPECIES[id].mods : {})
