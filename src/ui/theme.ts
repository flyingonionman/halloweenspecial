/** Colors shared by the DOM UI and the WebGL scenes. Keep in sync with styles.css tokens. */
import type { Affinity, BuildingKind, Rarity, ResourceId, TerrainId, UnitType } from '../game'

export const TERRAIN_COLOR: Record<TerrainId, string> = {
  plains: '#9aa65a',
  lake: '#3f7f9e',
  forest: '#3f6b3a',
  hills: '#8a7a55',
  mountains: '#7c7a78',
  steppe: '#c2a865',
  tundra: '#c9d9de',
  volcanic: '#4a3530',
  leyfield: '#6b5a8e',
  highlands: '#6f8a86',
}

export const RESOURCE_COLOR: Record<ResourceId, string> = {
  gold: '#e9b44c',
  food: '#b5c46a',
  stone: '#a8a5a0',
  fire: '#e8692f',
  water: '#4f9fd8',
  earth: '#b08850',
  wind: '#6fd6bd',
  light: '#f3e2a0',
  dark: '#9a7aba',
  arcane: '#c08cf0',
}

/** Essences share their element's glyph. */
export const RESOURCE_GLYPH: Record<ResourceId, string> = {
  gold: '◉',
  food: '❦',
  stone: '▧',
  fire: '♨',
  water: '≋',
  earth: '▲',
  wind: '☁',
  light: '☀',
  dark: '☾',
  arcane: '✦',
}

export const KIND_COLOR: Record<BuildingKind, string> = {
  capital: '#e9b44c',
  gather: '#b89a6a',
  civic: '#e8dcc4',
  faith: '#f3e2a0',
  military: '#c94a3a',
  research: '#c08cf0',
}

export const AFFINITY_COLOR: Record<Affinity, string> = {
  fire: '#e8692f',
  water: '#4f9fd8',
  earth: '#b08850',
  wind: '#6fd6bd',
  arcane: '#c08cf0',
  light: '#f3e2a0',
  dark: '#7a5a9a',
  magma: '#ff5a2a',
  weaponry: '#d8d0bd',
  steel: '#9fb0c4',
  ice: '#a8e2f5',
  verdance: '#7fc46a',
  storm: '#8fa8ff',
  archery: '#a9d77a',
  electricity: '#f5e05a',
  knighthood: '#e0b45c',
  spellblade: '#d58cf0',
  sanctity: '#fff2c0',
  necromancy: '#8fbf8a',
  machinery: '#c9a26a',
  thunder: '#fff36a',
  eclipse: '#ff9ad5',
}

export const AFFINITY_GLYPH: Record<Affinity, string> = {
  fire: '♨',
  water: '≋',
  earth: '▲',
  wind: '☁',
  arcane: '✦',
  light: '☀',
  dark: '☾',
  magma: '☢',
  weaponry: '⚔',
  steel: '⛨',
  ice: '❄',
  verdance: '☘',
  storm: '☈',
  archery: '➶',
  electricity: '↯',
  knighthood: '♕',
  spellblade: '✠',
  sanctity: '✝',
  necromancy: '☠',
  machinery: '⚙',
  thunder: 'ϟ',
  eclipse: '◐',
}

/** Colour for a plain citizen born without an affinity. */
export const PLAIN_COLOR = '#a89f8e'

/** A unit's main affinity colour, or the plain colour. */
export const unitColor = (a: Affinity | null) => (a ? AFFINITY_COLOR[a] : PLAIN_COLOR)

export const RARITY_COLOR: Record<Rarity, string> = {
  common: '#8d867a',
  uncommon: '#7fb069',
  rare: '#5e9be0',
  epic: '#b57be8',
  legendary: '#f0b43c',
}

export const TYPE_GLYPH: Record<UnitType, string> = {
  fighter: '†', // dagger
  tank: '▣', // squared square
  ranger: '➴', // arrow
  mage: '✵', // star
  healer: '✚', // cross
}

export const SPECIES_GLYPH = {
  human: '♛',
  ork: '☠',
  goblin: '❀',
  dwarf: '⚒',
  elf: '❧',
  golem: '◈',
  dragon: '♲',
} as const

export const fmtPop = (n: number) =>
  n >= 1e6 ? `${(n / 1e6).toFixed(n >= 1e7 ? 0 : 1)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(n >= 1e4 ? 0 : 1)}k` : `${n}`
