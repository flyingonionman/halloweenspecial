/**
 * Sites: thematic events on wild tiles. A few appear each round, matched to
 * their terrain; the far ones (toward the map's edge) risk more for more.
 * Once a site is on your border (or yours), its tile offers a choice card.
 * Leaving it is always free: you just don't choose. Odds are shown plainly.
 */
import type { Affinity } from './affinities'
import type { Rarity } from './config'
import type { Cost, TerrainId } from './world/terrain'

export const SITE_IDS = ['caravan', 'shrine', 'grove', 'caldera', 'dwarfhold', 'champion', 'leystorm'] as const
export type SiteId = (typeof SITE_IDS)[number]

/** What an outcome does. Everything optional; several can combine. */
export interface SiteEffect {
  gain?: Cost
  morale?: number
  /** A citizen joins (troop if there's room, else bench). Rarity is rolled from population unless fixed; `rarityUp` bumps it. */
  citizen?: { affinity?: Affinity; rarity?: Rarity; rarityUp?: number }
  /** A random unit in your troop dies (not for Elves). */
  killUnit?: boolean
  /** Population change as a fraction (−0.15 = lose 15%). */
  populationPct?: number
  /** One of your dedicated academies gains a level. */
  academyUp?: boolean
  /** Extra food per turn for a few turns. */
  boon?: { food: number; turns: number }
  /** A skirmish (camp combat, permadeath). Winning applies `reward` and claims the tile. */
  fight?: { name: string; strength: number; reward: SiteEffect }
}

export interface SiteOutcome {
  chance: number
  text: string
  effect: SiteEffect
}

export interface SiteOption {
  label: string
  cost?: Cost
  /** Morale paid up front. */
  morale?: number
  outcomes: SiteOutcome[]
}

export interface SiteDef {
  id: SiteId
  name: string
  glyph: string
  terrains: readonly TerrainId[]
  /** Far sites sit toward the edge and gamble harder. */
  far: boolean
  text: string
  /** Empty for the caravan, which trades instead. */
  options: SiteOption[]
}

const sure = (text: string, effect: SiteEffect): SiteOutcome[] => [{ chance: 1, text, effect }]

export const SITE_DEFS: Record<SiteId, SiteDef> = {
  caravan: {
    id: 'caravan', name: 'Wandering Caravan', glyph: '⛺', terrains: ['plains', 'steppe', 'highlands'], far: false,
    text: 'Traders resting their beasts. They swap anything one for one, until they move on at the end of the turn you trade.',
    options: [],
  },
  shrine: {
    id: 'shrine', name: 'Drowned Shrine', glyph: '⛩', terrains: ['lake'], far: false,
    text: 'A temple roof breaks the water. Something still keeps it.',
    options: [
      {
        label: 'Dive',
        outcomes: [
          { chance: 0.5, text: 'A Water citizen, one rarity higher, follows you up', effect: { citizen: { affinity: 'water', rarityUp: 1 } } },
          { chance: 0.5, text: 'Nothing but cold and fear: −10 morale', effect: { morale: -10 } },
        ],
      },
      { label: 'Drain it', cost: { earth: 6 }, outcomes: sure('+12 Hydrocorals from the shrine floor', { gain: { water: 12 } }) },
    ],
  },
  grove: {
    id: 'grove', name: 'Hollow Grove', glyph: '❦', terrains: ['forest'], far: false,
    text: 'Old trees with faces. The spirits here want something.',
    options: [
      { label: 'Pay tribute', cost: { gold: 20 }, outcomes: sure('+3 food a turn for 3 turns', { boon: { food: 3, turns: 3 } }) },
      {
        label: 'Fight the guardians',
        outcomes: sure('A strength II fight. Win: an uncommon Earth citizen and the tile', {
          fight: { name: 'Grove Guardians', strength: 2, reward: { citizen: { affinity: 'earth', rarity: 'uncommon' } } },
        }),
      },
    ],
  },
  caldera: {
    id: 'caldera', name: 'Waking Caldera', glyph: '♨', terrains: ['volcanic'], far: true,
    text: 'The mountain breathes. Ember lies thick on the rim.',
    options: [
      {
        label: 'Mine the vents',
        outcomes: [
          { chance: 0.75, text: '+10 Ember', effect: { gain: { fire: 10 } } },
          { chance: 0.25, text: '+10 Ember, but an eruption kills one of your troop', effect: { gain: { fire: 10 }, killUnit: true } },
        ],
      },
      { label: 'Offer to the fire', morale: 15, outcomes: sure('A Fire citizen walks out of the smoke', { citizen: { affinity: 'fire' } }) },
    ],
  },
  dwarfhold: {
    id: 'dwarfhold', name: 'Sealed Dwarfhold', glyph: '⚒', terrains: ['mountains', 'hills'], far: true,
    text: 'A stone door, barred from inside. Someone is still guarding the vault.',
    options: [
      {
        label: 'Break in',
        outcomes: sure('A strength III fight. Win: 60 gold, 15 stone and the tile', {
          fight: { name: 'Hold Wardens', strength: 3, reward: { gain: { gold: 60, stone: 15 } } },
        }),
      },
    ],
  },
  champion: {
    id: 'champion', name: 'Frozen Champion', glyph: '❄', terrains: ['tundra'], far: true,
    text: 'A warrior locked in the ice, eyes open.',
    options: [
      {
        label: 'Thaw them',
        cost: { fire: 8 },
        outcomes: [
          { chance: 0.7, text: 'An epic citizen swears to you', effect: { citizen: { rarity: 'epic' } } },
          {
            chance: 0.3,
            text: 'It wakes hostile: a strength III fight. Win: 30 gold and the tile',
            effect: { fight: { name: 'Frozen Champion', strength: 3, reward: { gain: { gold: 30 } } } },
          },
        ],
      },
    ],
  },
  leystorm: {
    id: 'leystorm', name: 'Ley Storm', glyph: '✺', terrains: ['leyfield'], far: true,
    text: 'The ley lines are boiling over. Raw magic for whoever dares.',
    options: [
      {
        label: 'Channel it',
        outcomes: [
          { chance: 0.6, text: 'One of your academies gains a level', effect: { academyUp: true } },
          { chance: 0.4, text: 'An academy gains a level, but the storm takes 15% of your people', effect: { academyUp: true, populationPct: -0.15 } },
        ],
      },
      { label: 'Bottle it', outcomes: sure('+8 arcane', { gain: { arcane: 8 } }) },
    ],
  },
}

export const SITES = SITE_IDS.map((id) => SITE_DEFS[id])

/** Every effect an option might have, across its outcomes (fight rewards included). */
export function possibleEffects(o: SiteOption): SiteEffect[] {
  const out: SiteEffect[] = []
  const walk = (e: SiteEffect) => {
    out.push(e)
    if (e.fight) walk(e.fight.reward)
  }
  for (const x of o.outcomes) walk(x.effect)
  return out
}
