import { describe, expect, it } from 'vitest'
import { AFFINITIES, BUILDING_DEFS, RARITIES, RESOURCES, SPECIES_IDS, SYNERGY_DEFS, TERRAINS, UNIT_TYPES, chooseSpecies, newGame } from '../../game'
import { getHelp } from './glossary'

const s = chooseSpecies(newGame(1), 'human')

const sources = import.meta.glob('../**/*.tsx', { query: '?raw', import: 'default', eager: true }) as Record<string, string>

describe('right-click help', () => {
  it('every literal data-help key in the UI resolves', () => {
    const keys = new Set<string>()
    for (const src of Object.values(sources)) {
      for (const m of src.matchAll(/data-help="([a-z:-]+)"/g)) keys.add(m[1]!)
      for (const m of src.matchAll(/data-help=\{`([a-z-]+):\$\{/g)) keys.add(`${m[1]}:`)
      for (const m of src.matchAll(/data-help=\{[^}]*\? '([a-z-]+)' : '([a-z-]+)'\}/g)) keys.add(m[1]!).add(m[2]!)
    }
    expect(keys.size).toBeGreaterThan(20)
    for (const k of keys) if (!k.endsWith(':')) expect(getHelp(k, s), k).not.toBeNull()
  })

  it('every parameterized key resolves, and every see-also link resolves', () => {
    const all = [
      ...Object.keys(BUILDING_DEFS).map((b) => `building:${b}`),
      ...AFFINITIES.map((a) => `affinity:${a}`),
      ...SYNERGY_DEFS.map((d) => `synergy:${d.id}`),
      ...TERRAINS.map((t) => `terrain:${t}`),
      ...RESOURCES.map((r) => `resource:${r}`),
      ...SPECIES_IDS.map((x) => `species:${x}`),
      ...UNIT_TYPES.map((t) => `type:${t}`),
      ...RARITIES.map((r) => `rarity:${r}`),
      ...['gather', 'civic', 'faith', 'military', 'research'].map((k) => `kind:${k}`),
      'biome',
      ...['tile', 'muster', 'troop', 'build', 'scout'].map((k) => `tab:${k}`),
      ...['hp', 'atk', 'def', 'rng', 'pwr'].map((k) => `stat:${k}`),
    ]
    const seen = new Set<string>()
    const queue = [...all]
    while (queue.length) {
      const k = queue.pop()!
      if (seen.has(k)) continue
      seen.add(k)
      const e = getHelp(k, s)
      expect(e, k).not.toBeNull()
      queue.push(...(e!.see ?? []))
    }
  })
})
