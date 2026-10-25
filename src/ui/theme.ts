/** Colors shared by the DOM UI and the WebGL scenes. Keep in sync with styles.css tokens. */
import type { Affinity, BuildingKind, Rarity, ResourceId, Team, TerrainId, UnitType } from '../game'

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
  timber: '#8fbf6a',
  iron: '#b0a48a',
  stone: '#a8a5a0',
  hide: '#d1aa70',
  ice: '#9fd3ea',
  ember: '#f07a3a',
  crystal: '#c49af2',
  skystone: '#8fd8c8',
}

export const RESOURCE_GLYPH: Record<ResourceId, string> = {
  gold: '◉',
  food: '❦',
  timber: '♣',
  iron: '⚒',
  stone: '▧',
  hide: '❖',
  ice: '❄',
  ember: '♨',
  crystal: '♦',
  skystone: '☁',
}

export const KIND_COLOR: Record<BuildingKind, string> = {
  capital: '#e9b44c',
  extractor: '#b89a6a',
  civic: '#e8dcc4',
  military: '#c94a3a',
  research: '#c08cf0',
}

export const AFFINITY_COLOR: Record<Affinity, string> = {
  sword: '#d8d0bd',
  shield: '#8fa3bf',
  bow: '#9ccf6a',
  arcane: '#c08cf0',
  fire: '#e8692f',
  frost: '#8cc8e8',
  wind: '#6fd6bd',
  earth: '#b08850',
}

export const AFFINITY_GLYPH: Record<Affinity, string> = {
  sword: '⚔',
  shield: '⛨',
  bow: '➶',
  arcane: '✦',
  fire: '♨',
  frost: '❄',
  wind: '≋',
  earth: '▲',
}

export const RARITY_COLOR: Record<Rarity, string> = {
  common: '#8d867a',
  uncommon: '#7fb069',
  rare: '#5e9be0',
  epic: '#b57be8',
  legendary: '#f0b43c',
}

export const TEAM_COLOR: Record<Team, string> = {
  0: '#efe4cc',
  1: '#c43c3c',
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
