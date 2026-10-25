/**
 * Click help. Elements opt in with `data-help="<key>"`; keys are either
 * plain ("tier") or parameterized ("building:farm", "affinity:fire").
 *
 * Every number shown here is read from CONFIG or the live state, so the
 * glossary can't drift from the rules.
 */
import type { ReactNode } from 'react'
import {
  AFFINITY_LABEL,
  AFFINITIES,
  AFFINITY_DEFS,
  isUnlocked,
  BUILDING_DEFS,
  CONFIG,
  EFFECT_TEXT,
  RARITIES,
  RESOURCE_LABEL,
  SPECIES,
  SYNERGY_DEFS,
  TERRAIN_DEFS,
  TYPE_DEFS,
  musterSize,
  growthRate,
  effectiveYields,
  moraleMult,
  rerollCost,
  city,
  civTier,
  claimCost,
  ownedTiles,
  territoryCap,
  type Affinity,
  type BuildingId,
  type EffectKey,
  type GameState,
  type Rarity,
  type ResourceId,
  type SpeciesId,
  type TerrainId,
  type UnitType,
} from '../../game'
import { fmtOutputs } from '../format'
import { fmtPop } from '../theme'

export interface HelpEntry {
  title: string
  /** Small label above the title, e.g. "Building" or "Affinity". */
  kind?: string
  body: ReactNode
  /** Your current numbers, if relevant. */
  live?: ReactNode
  /** Related keys, shown as links. */
  see?: string[]
}

const pct = (v: number) => `${Math.round(v * 100)}%`
const A = CONFIG.affinity

type Resolver = (s: GameState) => HelpEntry

const STATIC: Record<string, Resolver> = {
  people: (s) => ({
    title: 'Species',
    kind: 'Run setting',
    body: 'Chosen once per run. Your species bends the rules of your civilization (births, troop slots, rarity, permadeath, costs) but never fights for you: it has no effect on combat stats.',
    live: s.species ? `${SPECIES[s.species].name}: ${SPECIES[s.species].text}` : undefined,
    see: s.species ? [`species:${s.species}`] : [],
  }),
  turn: (s) => ({
    title: 'Rounds & turns',
    body: `A run is ${CONFIG.rounds} rounds. Each round is ${CONFIG.turnsPerRound} turns of city-building, then one battle against that round’s opponent. Each turn: build, claim, trade and recruit as much as you can afford, plus one deed.`,
    live: `Round ${s.round + 1} of ${CONFIG.rounds}, turn ${s.turn + 1} of ${CONFIG.turnsPerRound}.`,
    see: ['muster', 'scout', 'end-turn'],
  }),
  timeline: () => ({
    title: 'Timeline',
    body: 'Each round shows its turns, then a battle marker (⚔): green for a win, red for a loss.',
    see: ['turn'],
  }),
  'end-turn': () => ({
    title: 'End turn',
    body: `Collects every tile’s yields, grows your population, births new citizens into the muster, and sends away citizens who waited too long. On turn ${CONFIG.turnsPerRound} it marches your troop to battle instead. Marching with an empty troop forfeits.`,
    see: ['growth', 'muster'],
  }),
  population: (s) => ({
    title: 'Population',
    body: 'The size of your civilization. It multiplies by your growth rate every turn. Population unlocks rarer citizens (your tier) and lets you hold more land.',
    live: `${s.population.toLocaleString()} souls.`,
    see: ['tier', 'growth', 'land'],
  }),
  tier: (s) => {
    const next = RARITIES.find((r) => CONFIG.rarityThresholds[r] > s.population)
    return {
      title: 'Tier',
      body: (
        <>
          The rarest kind of citizen your population can produce. Each rarity unlocks at a population threshold, and every soul you add after that makes it more likely, until the next rarity unlocks:{' '}
          {RARITIES.filter((r) => r !== 'common')
            .map((r) => `${r} at ${fmtPop(CONFIG.rarityThresholds[r])}`)
            .join(', ')}
          . Rarities two or more steps below your tier fade out of births.
        </>
      ),
      live: `You are ${civTier(s.population)} at ${fmtPop(s.population)}.${next ? ` ${next[0]!.toUpperCase() + next.slice(1)} unlocks at ${fmtPop(CONFIG.rarityThresholds[next])}.` : ' Every rarity is unlocked.'}`,
      see: ['rarity:common', 'population', 'birth-odds'],
    }
  },
  gold: (s) => ({
    title: 'Gold',
    kind: 'Resource',
    body: 'Pays for unit upgrades, claiming land, and every building. Earned from your capital, markets, caravans, raids, and winning battles. Like every field yield, it scales with morale.',
    live: `+${effectiveYields(s).gold} per turn from your land.`,
    see: ['resource:gold', 'stores'],
  }),
  morale: (s) => {
    const m = CONFIG.morale
    return {
      title: 'Morale',
      kind: 'Resource',
      body: `Your people’s spirit, 0–${m.max}. It pays for recruiting and for rerolling the muster, and it drives your economy: every field produces ×${m.outputAtZero} at 0 morale up to ×${m.outputAtMax} at full. Recruit too hard and your fields slow down. Regains ${m.regen} per turn; festivals, raids and victories raise it.`,
      live: `${s.morale}/${m.max} → fields at ×${moraleMult(s.morale).toFixed(2)}.`,
      see: ['muster', 'reroll', 'recruit-price'],
    }
  },
  reroll: (s) => ({
    title: 'Reroll the muster',
    body: `Spend morale to send everyone waiting home and call a fresh muster. Costs ${CONFIG.muster.reroll.base}, then ${CONFIG.muster.reroll.step} more for each reroll this turn.`,
    live: `Next reroll: ${rerollCost(s)} morale.`,
    see: ['morale', 'muster'],
  }),
  elimination: () => ({
    title: 'Sudden elimination',
    body: 'Lose a round battle, or fight it to a stalemate, and your civilization falls: the run is over. Raids on camps only cost you the units that die.',
    see: ['battle', 'permadeath'],
  }),
  stores: () => ({
    title: 'Stores',
    body: 'Resources you’ve stockpiled, with what your land adds each turn. Materials come from tiles: raw tiles yield 1, extractors yield more. Buildings and trades spend them.',
    see: ['tile-output', 'trade', 'resource:timber'],
  }),
  food: (s) => ({
    title: 'Food',
    kind: 'Resource',
    body: `Food isn’t stored. It feeds growth: each point of food adds ${pct(CONFIG.economy.growthPerFood)} growth per turn. Plains, lakes and farms produce it.`,
    live: `${effectiveYields(s).food} food this turn.`,
    see: ['growth', 'building:farm'],
  }),
  growth: (s) => {
    const e = CONFIG.economy
    return {
      title: 'Growth',
      body: `How much your population multiplies by each turn: ${pct(e.growthBase)} base + ${pct(e.growthPerFood)} per food, capped at ${pct(e.maxGrowth)}. Food comes from your fields, so morale matters here too.`,
      live: `+${pct(growthRate(s))} this turn.`,
      see: ['food', 'morale', 'population'],
    }
  },
  land: (s) => {
    const t = CONFIG.territory
    return {
      title: 'Land',
      body: `Tiles you own / tiles your people can hold. The cap grows with population: ${t.capBase} + ${t.capPerDoubling} per doubling past ${CONFIG.start.population}. Claiming costs ${t.claimBase} gold + ${t.claimPerOwned} per tile beyond your first ${t.startTiles}. Razing a camp claims its tile for free.`,
      live: `${ownedTiles(s.map).length} of ${territoryCap(s)}; next claim costs ${claimCost(s)} gold.`,
      see: ['claim', 'camp'],
    }
  },
  'troop-bonus': (s) => {
    const c = city(s)
    return {
      title: 'Troop bonuses',
      body: 'Every unit in your troop gets these, in raids and round battles. They come from military buildings: Barracks, Walls and Armory.',
      live: fmtOutputs({ atkPct: c.atkPct, hpPct: c.hpPct, defPct: c.defPct }),
      see: ['building:barracks', 'building:walls', 'building:armory'],
    }
  },
  'birth-odds': () => ({
    title: 'Birth odds',
    body: (
      <>
        The bar is the rarity mix of new citizens. Below it, the chance a citizen carries each affinity: a mutation floor of {A.birthWeight.mutation}, +{A.birthWeight.perTile} per tile of that
        affinity’s terrain, +{A.birthWeight.perLevel} per academy level, +{A.birthWeight.perAttune} per attunement. Claim land and build academies to steer who is born.
      </>
    ),
    see: ['tier', 'mutation', 'attune'],
  }),
  mutation: () => ({
    title: 'Mutations',
    body: 'Every affinity keeps a small chance to appear even if you own none of its land. A mutation can be a gift, like a frost mage on a volcanic start, but supporting it means trading or expanding for its resource.',
    see: ['birth-odds', 'trade'],
  }),
  trade: (s) => ({
    title: 'Trade',
    body: `Needs a Trading Post. Swap any material for another at a fixed rate: ${CONFIG.trade.worst}:1 by default, improved by a lake or market beside the post, down to ${CONFIG.trade.best}:1.`,
    live: city(s).tradeRate !== null ? `Your rate: ${city(s).tradeRate}:1.` : 'You have no Trading Post.',
    see: ['building:trading-post'],
  }),
  chronicle: () => ({ title: 'Chronicle', body: 'A running log of what happened in your civilization.' }),
  buildbar: () => ({
    title: 'Build bar',
    body: 'Pick a building to place it. Every tile where it can go shows what it would produce there, and the best spot glows gold. Click a tile to build. Esc cancels. Struck-through costs are ones you can’t afford yet.',
    see: ['adjacency', 'kind:civic', 'kind:extractor', 'kind:military', 'kind:research'],
  }),
  'kind:civic': () => ({ title: 'Civic buildings', kind: 'Building group', body: 'Food, gold and trade. The economy that everything else runs on.', see: ['building:farm', 'building:market', 'building:trading-post'] }),
  'kind:extractor': () => ({ title: 'Extractors', kind: 'Building group', body: 'Each one works a single terrain for its resource: 2 base, +1 per neighbouring tile of the same terrain (up to 3). Clusters of one terrain make the best mines.', see: ['adjacency', 'stores'] }),
  'kind:military': () => ({ title: 'Military buildings', kind: 'Building group', body: 'Permanent bonuses for every unit, whatever their affinities. This is the tempo line: strong without committing to synergies.', see: ['building:barracks', 'building:walls', 'building:armory', 'troop-bonus'] }),
  'kind:research': () => ({ title: 'Academies', kind: 'Building group', body: `One per affinity, levels 1–${A.maxLevel}, built with that affinity’s resource. An academy’s level is the affinity’s level: more citizens with it, stronger units of that affinity, and a bigger synergy multiplier.`, see: ['affinity-level', 'attune', 'synergies'] }),
  adjacency: () => ({
    title: 'Adjacency',
    body: 'Most buildings produce more with the right neighbours: extractors next to their terrain, barracks next to mines, walls next to quarries, farms next to lakes, academies next to their terrain. Where you build matters as much as what you build.',
    see: ['buildbar', 'tile-output'],
  }),
  'tile-output': () => ({
    title: 'Tile output',
    body: 'What this tile gives each turn, and why. Each line is one source: the base amount, then each adjacency bonus. A tile with a building gives the building’s output instead of the raw terrain yield.',
    see: ['adjacency'],
  }),
  claim: (s) => ({
    title: 'Claiming land',
    body: 'Take an unowned tile on your border. New land adds its raw yield, shifts your birth odds toward its affinity, and gives you room to build.',
    live: `Next claim: ${claimCost(s)} gold (${ownedTiles(s.map).length}/${territoryCap(s)} tiles).`,
    see: ['land', 'birth-odds'],
  }),
  demolish: () => ({ title: 'Demolish', body: `Tear a building down for ${pct(CONFIG.demolishRefund)} of everything you spent on it. Use it to pivot when your plans change.` }),
  'tab:tile': () => ({ title: 'Tile', body: 'The tile you selected on the board: what it produces, what you can build there, and whether you can claim or raid it.', see: ['tile-output', 'claim', 'camp'] }),
  'tab:muster': () => ({ title: 'Muster', body: 'This turn’s citizens. Recruit with morale; a fresh muster is called every turn.', see: ['muster', 'reroll'] }),
  'tab:build': () => ({ title: 'Build', body: 'Every building, grouped. Open one for its stats, adjacency and model, then place it on the board.', see: ['adjacency', 'kind:research'] }),
  'tab:troop': () => ({ title: 'Troop', body: 'Your fighters, your bench, and the synergies your troop’s affinities add up to.', see: ['troop', 'bench', 'synergies'] }),
  'tab:scout': () => ({ title: 'Scout', body: 'This round’s opponent, known from turn 1 so you can plan against it.', see: ['scout'] }),
  muster: (s) => ({
    title: 'Muster',
    body: 'Every turn a fresh set of citizens answers the call, shaped by your population (rarity) and your land and academies (affinities). Recruit them with morale now; whoever you pass on goes home at the end of the turn. Recruits join your troop, or your bench if it’s full.',
    live: `${musterSize(s.species)} citizens per muster.`,
    see: ['birth-odds', 'recruit-price', 'reroll'],
  }),
  'recruit-price': () => ({
    title: 'Recruit price',
    body: `Morale to recruit. Base price by rarity (${RARITIES.map((r) => `${r} ${CONFIG.recruitMorale[r]}`).join(', ')}), adjusted by the unit’s quality roll. Spending morale lowers your fields’ output until it recovers.`,
    see: ['morale', 'quality'],
  }),
  quality: () => ({ title: 'Quality', body: `Each unit rolls ${CONFIG.quality.min}–${CONFIG.quality.max}× stats. Academy levels for a unit’s affinities bias the roll upward.` }),
  troop: (s) => ({
    title: 'Troop',
    body: 'The units that fight in raids and round battles. Their affinities add up to synergies. Units that die in battle are gone for good.',
    live: `${s.troop.length} deployed.`,
    see: ['bench', 'synergies', 'permadeath'],
  }),
  bench: () => ({ title: 'Bench', body: `Up to ${CONFIG.benchSize} units held in reserve. They don’t fight and don’t count toward synergies, but they’re safe and stay with you.` }),
  permadeath: () => ({ title: 'Permadeath', body: 'Units that fall in any battle, raid or round, are gone forever, unless you play Elves. Survivors become veterans.', see: ['veteran', 'species:elf'] }),
  synergies: () => ({
    title: 'Synergies',
    body: (
      <>
        Two separate numbers decide a synergy. Its <b>tier</b> (1–4) comes from your <b>troop</b>: affinity points across deployed units, unlocking at {A.thresholds.join(' / ')}. Its{' '}
        <b>multiplier</b> comes from your <b>city</b>: the affinity’s academy level ({A.levelMult.map((m, i) => `Lv${i} ×${m}`).join(', ')}). Effect = the tier’s value × the multiplier.
        Effects go to units that have the affinity, or to the whole troop for whole-troop affinities.
      </>
    ),
    see: ['synergy-tier', 'affinity-level', 'synergy:weaponry'],
  }),
  'synergy-tier': () => ({ title: 'Synergy tier', body: `Lit diamonds = active tier, from your troop: tiers unlock at ${A.thresholds.join(' / ')} points of the affinity among deployed units. Separate from the affinity level, which comes from academies.`, see: ['synergies', 'affinity-level'] }),
  'affinity-level': () => ({
    title: 'Affinity level',
    body: `From your city, not your troop: an affinity’s level is its academy’s level (0–${A.maxLevel}). It multiplies that affinity’s synergy (${A.levelMult.map((m, i) => `Lv${i} ×${m}`).join(', ')}), gives units with the affinity +${pct(A.combatBonusPerLevel)} HP and attack per level, and makes it more common in births.`,
    see: ['kind:research', 'attune'],
  }),
  attune: () => ({
    title: 'Attunement',
    body: `Each tile of an academy’s terrain beside it adds 1 attunement (max 3): +${pct(A.combatBonusPerAttune)} HP and attack for units with that affinity, and more births of that affinity.`,
    see: ['kind:research', 'adjacency'],
  }),
  level: () => ({
    title: 'Unit level',
    body: `Levels 1–${CONFIG.level.max}; each adds +${pct(CONFIG.level.statPerLevel)} to base stats. Levelling is a big investment: gold grows ×${CONFIG.level.goldGrowth} per level and with rarity, and higher levels also need ${CONFIG.level.materials.map((m) => `${RESOURCE_LABEL[m.resource].toLowerCase()} (from Lv${m.fromLevel})`).join(' and ')}. Double-click the level button to confirm. Veterans pay less.`,
    see: ['veteran'],
  }),
  veteran: () => ({ title: 'Veteran', body: `Stars show battles survived. Each one cuts upgrade costs by ${pct(CONFIG.level.discountPerBattleSurvived)}, up to ${pct(CONFIG.level.maxDiscount)}.` }),
  release: () => ({ title: 'Release', body: `Let a unit go and get back ${pct(CONFIG.releaseRefund)} of the morale it cost to recruit.`, see: ['morale'] }),
  'stat:hp': () => ({ title: 'HP', kind: 'Stat', body: 'Health. Boosted by rarity, quality, level, Walls, academies, and Earth synergies.' }),
  'stat:atk': () => ({ title: 'Attack', kind: 'Stat', body: 'Damage per hit, and the base for abilities. Boosted by rarity, quality, level, Barracks, academies, and Sword synergies.' }),
  'stat:def': () => ({ title: 'Defense', kind: 'Stat', body: `Reduces damage taken: damage × 100/(100+DEF). Magic damage counts only ${pct(CONFIG.combat.magicDefFactor)} of defense.` }),
  'stat:rng': () => ({ title: 'Range', kind: 'Stat', body: 'How far the unit can attack from. Melee is about 1.2. Placement only matters through range and cohesion synergies.' }),
  'stat:pwr': () => ({ title: 'Power', kind: 'Stat', body: 'A rough single-number strength: √(damage per second × effective HP). Handy for comparing, but it ignores synergies and abilities.' }),
  camp: () => ({
    title: 'Camps',
    body: `NPC strongholds on the map, strength I–III. Raid one on your border with your troop: units can die, but win and you get gold, morale, the tile’s resource, and the tile itself. Losing a raid only costs units and a little morale.`,
    see: ['permadeath', 'land'],
  }),
  scout: () => ({
    title: 'Scouting',
    body: 'This round’s opponent: a ghost, a snapshot of another civilization at the same round. You know who they are, their homeland and what they lean toward from turn 1, but their troop stays hidden until the battle. Today ghosts are generated; in async play they’ll be other players.',
    see: ['battle', 'turn'],
  }),
  battle: () => ({
    title: 'Round battle',
    body: `After turn ${CONFIG.turnsPerRound}, your troop auto-fights the round’s opponent. Win for gold and morale. Lose and the run is over. Either way, units that fall are gone.`,
    see: ['elimination', 'permadeath', 'scout'],
  }),
}

// ── Parameterized resolvers ───────────────────────────────────────────

function building(id: BuildingId): Resolver {
  return (s) => {
    const def = BUILDING_DEFS[id]
    const adj = def.adjacency.map((r) => {
      const who = 'terrain' in r.per ? TERRAIN_DEFS[r.per.terrain].label : 'building' in r.per ? BUILDING_DEFS[r.per.building].name : 'same terrain'
      return `${fmtOutputs(r.add)} per adjacent ${who.toLowerCase()}${r.cap ? ` (max ${r.cap})` : ''}`
    })
    const count = s.map.tiles.filter((t) => t.building?.id === id).length
    return {
      title: def.name,
      kind: { capital: 'Capital', extractor: 'Extractor', civic: 'Civic building', military: 'Military building', research: 'Academy' }[def.kind],
      body: (
        <>
          {def.text}
          {Object.keys(def.base).length > 0 && <p className="help-line">Base: {fmtOutputs(def.base)}</p>}
          {adj.length > 0 && <p className="help-line">Adjacency: {adj.join('; ')}.</p>}
          <p className="help-line">
            Placed on: {def.allowed === 'any' ? 'any land' : def.allowed.map((t) => TERRAIN_DEFS[t].label).join(', ')}
            {def.unique ? '. Only one allowed' : ''}
            {def.maxLevel > 1 ? `. Levels 1–${def.maxLevel}` : ''}.
          </p>
        </>
      ),
      live: count ? `You have ${count}.` : undefined,
      see: [...(def.kind === 'capital' ? ['muster'] : [`kind:${def.kind}`, 'adjacency']), ...(def.affinity ? [`affinity:${def.affinity}`] : [])],
    }
  }
}

function affinity(a: Affinity): Resolver {
  return (s) => {
    const c = city(s)
    const d = AFFINITY_DEFS[a]
    const open = isUnlocked(a, c.affinityLevels)
    const kids = AFFINITIES.filter((k) => AFFINITY_DEFS[k].parents.includes(a))
    return {
      title: AFFINITY_LABEL[a],
      kind: `Tier ${d.tier} affinity`,
      body: (
        <>
          {d.flavour}{' '}
          {d.tier === 1
            ? d.land
              ? `Born from ${d.land.map((t) => TERRAIN_DEFS[t].label.toLowerCase()).join(' and ')} land and its ${d.academy}.`
              : `Born once you build a ${d.academy}.`
            : `Unlocked when ${d.parents.map((p) => AFFINITY_LABEL[p]).join(' and ')} reach academy Lv${CONFIG.affinity.unlockLevel}; then citizens are born with it once you build its ${d.academy}.`}
          {kids.length > 0 && <p className="help-line">Leads to: {kids.map((k) => AFFINITY_LABEL[k]).join(', ')}.</p>}
          {d.team && <p className="help-line">Its synergy empowers your whole troop.</p>}
        </>
      ),
      live: open ? `Academy Lv${c.affinityLevels[a]} · attunement ${c.attune[a]}.` : 'Locked.',
      see: [`synergy:${a}`, `building:${a}-academy`, ...d.parents.map((p) => `affinity:${p}`), ...kids.map((k) => `affinity:${k}`)],
    }
  }
}

function synergy(id: string): Resolver {
  return () => {
    const def = SYNERGY_DEFS.find((d) => d.id === id)!
    const rows = (Object.entries(def.tiers) as [EffectKey, readonly number[]][]).map(([k, v]) => (
      <p key={k} className="help-line">
        {v.map((x, i) => `T${i + 1}: ${EFFECT_TEXT[k](x)}`).join(' · ')}
      </p>
    ))
    return {
      title: def.components.length > 1 ? def.name : `${def.name} synergy`,
      kind: def.components.length > 1 ? 'Compound synergy' : 'Synergy',
      body: (
        <>
          {def.components.length > 1
            ? `Needs both ${def.components.map((a) => AFFINITY_LABEL[a]).join(' and ')}; its tier is the lower of the two.`
            : `From ${AFFINITY_LABEL[def.components[0]!]} points in your troop.`}{' '}
          Effects at level 1 (multiplied by the affinity level):
          {rows}
        </>
      ),
      see: ['synergies', ...def.components.map((a) => `affinity:${a}`)],
    }
  }
}

function terrain(t: TerrainId): Resolver {
  return () => {
    const def = TERRAIN_DEFS[t]
    return {
      title: def.label,
      kind: 'Terrain',
      body: (
        <>
          Owned, it yields {def.rawYield} {RESOURCE_LABEL[def.resource].toLowerCase()} per turn with nothing built on it.
          {def.affinity && <> Every tile you own raises the odds of {AFFINITY_LABEL[def.affinity]} citizens.</>}
          {!def.buildable && <> Nothing can be built on it, but farms and trading posts beside it benefit.</>}
        </>
      ),
      see: [`resource:${def.resource}`, ...(def.affinity ? [`affinity:${def.affinity}`] : [])],
    }
  }
}

function resource(r: ResourceId): Resolver {
  return (s) => {
    const sources = Object.values(TERRAIN_DEFS).filter((t) => t.resource === r)
    const users = Object.values(BUILDING_DEFS).filter((b) => Object.keys(b.cost(1)).includes(r) || Object.keys(b.cost(2)).includes(r))
    return {
      title: RESOURCE_LABEL[r],
      kind: 'Resource',
      body: (
        <>
          {sources.length > 0 && <>From {sources.map((t) => t.label.toLowerCase()).join(' and ')} tiles. </>}
          {users.length > 0 && <>Used for: {users.map((b) => b.name).join(', ')}.</>}
        </>
      ),
      live: r === "food" ? `${effectiveYields(s).food} per turn.` : `${s.stock[r]} stored, +${effectiveYields(s)[r]} per turn.`,
      see: sources.map((t) => `terrain:${t.id}`),
    }
  }
}

function species(id: SpeciesId): Resolver {
  return () => ({ title: SPECIES[id].name, kind: 'Species', body: SPECIES[id].text, see: ['people'] })
}

function unitType(t: UnitType): Resolver {
  return () => {
    const d = TYPE_DEFS[t]
    return {
      title: d.label,
      kind: 'Unit type',
      body: (
        <>
          {d.blurb} Deals {d.damage} damage{d.damage === 'magic' ? `, which counts only ${pct(CONFIG.combat.magicDefFactor)} of defense` : ''}.
          <p className="help-line">
            <b>{d.abilityLabel}:</b> {d.abilityText} Cast when energy is full.
          </p>
        </>
      ),
      see: ['stat:rng', 'synergies'],
    }
  }
}

function rarity(r: Rarity): Resolver {
  return (s) => ({
    title: r[0]!.toUpperCase() + r.slice(1),
    kind: 'Rarity',
    body: `×${CONFIG.rarityStatMult[r]} stats, ${CONFIG.affinity.pointsByRarity[r]} affinity point${CONFIG.affinity.pointsByRarity[r] === 1 ? '' : 's'}, base price ${CONFIG.rarityPrice[r]} gold. ${r === 'common' ? 'Always available.' : `Unlocks at ${fmtPop(CONFIG.rarityThresholds[r])} population.`} Older rarities fall behind as the game goes on: the generation gap.`,
    live: `Your tier: ${civTier(s.population)}.`,
    see: ['tier'],
  })
}

const PARAM: Record<string, (arg: string) => Resolver | undefined> = {
  building: (a) => (a in BUILDING_DEFS ? building(a as BuildingId) : undefined),
  affinity: (a) => (a in AFFINITY_LABEL ? affinity(a as Affinity) : undefined),
  synergy: (a) => (SYNERGY_DEFS.some((d) => d.id === a) ? synergy(a) : undefined),
  terrain: (a) => (a in TERRAIN_DEFS ? terrain(a as TerrainId) : undefined),
  resource: (a) => (a in RESOURCE_LABEL ? resource(a as ResourceId) : undefined),
  species: (a) => (a in SPECIES ? species(a as SpeciesId) : undefined),
  type: (a) => (a in TYPE_DEFS ? unitType(a as UnitType) : undefined),
  rarity: (a) => ((RARITIES as readonly string[]).includes(a) ? rarity(a as Rarity) : undefined),
}

export function getHelp(key: string, s: GameState): HelpEntry | null {
  const fixed = STATIC[key]
  if (fixed) return fixed(s)
  const [ns, arg] = key.split(':')
  const r = ns && arg ? PARAM[ns]?.(arg) : undefined
  return r ? r(s) : null
}

/** Short label for a "see also" link. */
export function helpLabel(key: string, s: GameState): string {
  return getHelp(key, s)?.title ?? key
}
