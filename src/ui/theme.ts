/** Colors shared by the DOM UI and the WebGL battlefield. Keep in sync with styles.css tokens. */
import type { Element, Rarity, Team } from '../game'

export const ELEMENT_COLOR: Record<Element, string> = {
  fire: '#e0692f',
  frost: '#8cc4e0',
  storm: '#c9b8ff',
  earth: '#8fa65a',
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

export const CLASS_GLYPH = {
  knight: '⛨', // shield
  rider: '♞', // horse
  mage: '✵', // star
  archer: '➶', // arrow
  cleric: '☩', // cross
  rogue: '†', // dagger
} as const

export const fmtPop = (n: number) =>
  n >= 1e6 ? `${(n / 1e6).toFixed(n >= 1e7 ? 0 : 1)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(n >= 1e4 ? 0 : 1)}k` : `${n}`
