/**
 * Omens: one round-long twist per round, never in the first or last round,
 * never the same twice in a run. Nobody picks them: each is rolled a round
 * ahead (so the Scout can warn you) from what fits your land. Every omen
 * cuts both ways.
 */
export const OMEN_IDS = ['plague', 'comet', 'warFever', 'harvest', 'leySurge', 'pilgrims'] as const
export type OmenId = (typeof OMEN_IDS)[number]

export interface OmenDef {
  id: OmenId
  name: string
  glyph: string
  up: string
  down: string
}

export const OMEN_DEFS: Record<OmenId, OmenDef> = {
  plague: { id: 'plague', name: 'Plague Year', glyph: '☣', up: 'Recruiting is free: the desperate enlist.', down: 'Population grows half as fast.' },
  comet: { id: 'comet', name: 'Ember Comet', glyph: '☄', up: 'Ember income is doubled.', down: 'Each turn, 1 in 10 a building on volcanic land burns down.' },
  warFever: { id: 'warFever', name: 'War Fever', glyph: '⚔', up: 'Raids and site fights pay double loot.', down: 'Morale does not regenerate.' },
  harvest: { id: 'harvest', name: 'Bountiful Harvest', glyph: '❀', up: 'Food +50%.', down: 'Citizens cost 50% more morale to enlist: everyone is in the fields.' },
  leySurge: { id: 'leySurge', name: 'Ley Surge', glyph: '✺', up: 'Academy upkeep is halved.', down: '3 in 10 citizens are born with a wild affinity, not your academies’.' },
  pilgrims: { id: 'pilgrims', name: 'Pilgrims', glyph: '✝', up: '+3 morale a turn.', down: 'Gold income −25%: alms for the road.' },
}

export const omenText = (o: OmenDef) => `${o.up} ${o.down}`
