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
  musterCost,
  city,
  civTier,
  claimCost,
  claimEarthCost,
  landOf,
  rootsOf,
  buildingName,
  baseOutput,
  BIOMES,
  BIOME_SPECIALS,
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
      body: `Your people’s spirit, 0–${m.max}. It pays for recruiting (calling a muster) and for enlisting citizens, and it drives your economy: every field produces ×${m.outputAtZero} at 0 morale up to ×${m.outputAtMax} at full. Recruit too hard and your fields slow down. Regains ${m.regen} per turn; festivals, raids and victories raise it.`,
      live: `${s.morale}/${m.max} → fields at ×${moraleMult(s.morale).toFixed(2)}.`,
      see: ['muster', 'recruit', 'recruit-price'],
    }
  },
  recruit: (s) => ({
    title: 'Recruit',
    body: `Each turn starts with nobody waiting. Recruit to spend morale and call a muster of citizens, then enlist the ones you want. Recruiting again sends whoever is still waiting home and calls new ones. Costs ${CONFIG.muster.call.base} morale, then ${CONFIG.muster.call.step} more for each further recruit this turn.`,
    live: `Next recruit: ${musterCost(s)} morale.`,
    see: ['morale', 'muster', 'recruit-price'],
  }),
  elimination: () => ({
    title: 'Sudden elimination',
    body: 'Lose a round battle, or fight it to a stalemate, and your civilization falls: the run is over. Raids on camps only cost you the units that die.',
    see: ['battle', 'permadeath'],
  }),
  stores: () => ({
    title: 'Stores',
    body: 'Resources you’ve stockpiled, with what your land adds each turn. Stone and the seven essences come from tiles: raw tiles yield a little, Mines yield more. Every building costs stone; essences train units and feed academies (an upfront payment plus a share of every turn’s income), and each has a second use. The “+N” is what you keep after academy upkeep.',
    see: ['tile-output', 'trade', 'resource:stone', 'resource:earth'],
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
      body: `Tiles you own / tiles your people can hold. The cap grows with population: ${t.capBase} + ${t.capPerDoubling} per doubling past ${CONFIG.start.population}. Claiming costs ${t.claimBase} gold + ${t.claimPerOwned} per tile beyond your first ${t.startTiles}, or 1 mud per ${t.goldPerEarth} of that gold. Razing a camp claims its tile for free.`,
      live: `${ownedTiles(s.map).length} of ${territoryCap(s)}; next claim costs ${claimCost(s)} gold or ${claimEarthCost(s)} mud.`,
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
        Two separate rolls make each citizen. <b>Rarity</b> comes from population alone and sets how strong the unit is. <b>Affinity</b> comes from academies alone: a
        citizen is born plain (weight {A.birth.none}) unless an academy gives it one (weight {A.birth.perLevel} × the academy’s level), and only ever one. The academy’s
        level is the most points it can carry; each extra point is {pct(A.birth.pointDecay)} as likely as the one before.
      </>
    ),
    see: ['tier', 'affinity-vs-resource', 'kind:research'],
  }),
  'affinity-vs-resource': () => ({
    title: 'Affinity is not a resource',
    body: 'Your land gives you resources; only academies give your people affinities. A volcanic field yields ember, but nobody is born with Fire until you dedicate an academy to it. The ember is what you pay with: commit its flow to academies, spend it on training, or use its side role. A land rich in ember often ends up with a Fire troop, but it doesn’t have to.',
    see: ['birth-odds', 'kind:research', 'stores'],
  }),
  trade: (s) => ({
    title: 'Trade',
    body: `Open your Trading Post’s tile to run trade routes (up to ${CONFIG.trade.maxRoutes}). Like an academy, a route commits income: every turn it gives N × the rate of one material and brings in N of another. The rate is ${CONFIG.trade.worst}:1 by default, improved by a lake or market beside the post, down to ${CONFIG.trade.best}:1. The income is set aside the moment you open a route; deliveries start next turn, and a turn it can’t be paid it delivers nothing. Close a route any time.`,
    live: city(s).tradeRate !== null ? `Your rate: ${city(s).tradeRate}:1.` : 'You have no Trading Post.',
    see: ['building:trading-post'],
  }),
  chronicle: () => ({ title: 'Chronicle', body: 'A running log of what happened in your civilization.' }),
  buildbar: () => ({
    title: 'Build bar',
    body: 'Pick a building to place it. Every tile where it can go shows what it would produce there. Click a tile to build. Esc cancels. If you’re missing anything, the button shakes and a note says what.',
    see: ['adjacency', 'kind:gather', 'kind:civic', 'kind:faith', 'kind:military', 'kind:research'],
  }),
  'kind:civic': () => ({ title: 'Civic buildings', kind: 'Building group', body: 'Food, gold and trade. The economy that everything else runs on. The Fishery is the only building that stands on a lake.', see: ['building:farm', 'building:fishery', 'building:market', 'building:trading-post'] }),
  'kind:gather': () => ({ title: 'Gathering', kind: 'Building group', body: 'One building line for every resource. A Mine digs whatever its tile holds (stone on hills and mountains, mud on steppe and forest, and so on): raw yield + its level, +1 per neighbouring tile of the same terrain (up to 3). Upgrade it into a Quarry, then an Excavator.', see: ['building:mine', 'adjacency', 'stores'] }),
  'kind:faith': () => ({ title: 'Faith', kind: 'Building group', body: 'The Church makes light and the Crypt makes dark: the two essences no land gives, and what Light and Dark academies run on. Open a Church to offer light for morale.', see: ['building:church', 'building:crypt', 'kind:research'] }),
  'kind:military': () => ({ title: 'Military buildings', kind: 'Building group', body: 'Permanent bonuses for every unit, whatever their affinities. This is the tempo line: strong without committing to synergies.', see: ['building:barracks', 'building:walls', 'building:armory', 'troop-bonus'] }),
  'kind:research': (s) => ({
    title: 'Academies',
    kind: 'Building group',
    body: `The only source of affinities. Build one anywhere (every academy after your first also costs ${A.extraAcademyArcane} arcane per academy you own: arcane’s main use). It goes up empty. Open its tile to dedicate it to an element (a Water Academy), raise it up to Lv${A.maxLevel}, or, from Lv${A.unlockLevel}, evolve it into a higher tier (Fire → Magma, once Fire and Earth are both Lv${A.unlockLevel}). Each step costs two things: an upfront payment, and a standing commitment of income: ${A.flowPerLevel} of each root essence per turn per level, × tier (a Lv2 Water Academy draws 2 hydrocorals every turn; Magma draws ember and mud). The change takes effect next turn, one change per academy per turn. If its upkeep can’t be paid, it starves and teaches nothing. More academies of an affinity, and higher levels, mean more citizens born with it, with more points.`,
    live: city(s).academies.length
      ? `Yours: ${city(s).academies.map((a) => `${AFFINITY_LABEL[a.affinity]} Lv${a.level}`).join(', ')}.`
      : city(s).academyCount
        ? 'Your academies are still empty.'
        : 'You have no academy.',
    see: ['birth-odds', 'affinity-vs-resource', 'affinity-level', 'synergies'],
  }),
  biome: (s) => ({
    title: 'Biome',
    body: `Every run’s land is one biome: mostly one basic terrain, patched with two speciality terrains and a few strays. ${BIOMES.map((b) => `${TERRAIN_DEFS[b].label}: ${BIOME_SPECIALS[b].map((t) => TERRAIN_DEFS[t].label.toLowerCase()).join(' and ')}`).join('; ')}.`,
    live: `You settled ${TERRAIN_DEFS[s.map.homeBiome].label.toLowerCase()}.`,
    see: ['land', 'kind:research'],
  }),
  adjacency: () => ({
    title: 'Adjacency',
    body: 'Most buildings produce more with the right neighbours: mines among their own terrain, barracks next to mines, walls by hills and mountains, farms and fisheries next to lakes. Where you build matters as much as what you build.',
    see: ['buildbar', 'tile-output'],
  }),
  'tile-output': () => ({
    title: 'Tile output',
    body: 'What this tile gives each turn, and why. Each line is one source: the base amount, then each adjacency bonus. A tile with a building gives the building’s output instead of the raw terrain yield.',
    see: ['adjacency'],
  }),
  claim: (s) => ({
    title: 'Claiming land',
    body: 'Take an unowned tile on your border, paying gold or mud. New land adds its raw yield, shifts your birth odds toward its affinity, and gives you room to build.',
    live: `Next claim: ${claimCost(s)} gold or ${claimEarthCost(s)} mud (${ownedTiles(s.map).length}/${territoryCap(s)} tiles).`,
    see: ['land', 'birth-odds'],
  }),
  demolish: () => ({ title: 'Demolish', body: `Tear a building down for ${pct(CONFIG.demolishRefund)} of everything you spent on it. Use it to pivot when your plans change.` }),
  'tab:tile': () => ({ title: 'Tile', body: 'The tile you selected on the board: what it produces, what you can build there, and whether you can claim or raid it.', see: ['tile-output', 'claim', 'camp'] }),
  'tab:muster': () => ({ title: 'Muster', body: 'Recruit to call this turn’s citizens, then enlist who you want. Both cost morale. Each turn starts empty.', see: ['muster', 'recruit'] }),
  'tab:build': () => ({ title: 'Build', body: 'Every building, grouped. Open one for its stats, adjacency and model, then place it on the board.', see: ['adjacency', 'kind:research'] }),
  'tab:troop': () => ({ title: 'Troop', body: 'Your fighters, your bench, and the synergies your troop’s affinities add up to.', see: ['troop', 'bench', 'synergies'] }),
  'tab:scout': () => ({ title: 'Scout', body: 'This round’s opponent, known from turn 1 so you can plan against it.', see: ['scout'] }),
  muster: (s) => ({
    title: 'Muster',
    body: 'The citizens who answered when you recruited this turn, shaped by your population (rarity) and your academies (affinities). Enlist them with morale; whoever you pass on goes home at the end of the turn (or when you recruit again). Enlisted citizens join your troop, or your bench if it’s full.',
    live: `${musterSize(s.species)} citizens per muster.`,
    see: ['birth-odds', 'recruit-price', 'recruit'],
  }),
  'recruit-price': () => ({
    title: 'Recruit price',
    body: `Morale to enlist this citizen. Base price by rarity (${RARITIES.map((r) => `${r} ${CONFIG.recruitMorale[r]}`).join(', ')}), adjusted by the unit’s quality roll. Spending morale lowers your fields’ output until it recovers.`,
    see: ['morale', 'quality'],
  }),
  quality: () => ({ title: 'Quality', body: `Each unit rolls ${CONFIG.quality.min}–${CONFIG.quality.max}× stats. The level of the academy a citizen’s affinity came from biases the roll upward.` }),
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
        <b>multiplier</b> comes from your <b>city</b>: your best academy of that affinity ({A.levelMult.map((m, i) => `Lv${i} ×${m}`).join(', ')}). Effect = the tier’s value × the multiplier.
        Effects go to units that have the affinity, or to the whole troop for whole-troop affinities.
      </>
    ),
    see: ['synergy-tier', 'affinity-level', 'synergy:weaponry'],
  }),
  'synergy-tier': () => ({ title: 'Synergy tier', body: `Lit diamonds = active tier, from your troop: tiers unlock at ${A.thresholds.join(' / ')} points of the affinity among deployed units. Separate from the affinity level, which comes from academies.`, see: ['synergies', 'affinity-level'] }),
  'affinity-level': () => ({
    title: 'Affinity level',
    body: `From your city, not your troop: an affinity’s level is the level of your best academy dedicated to it (0–${A.maxLevel}). It multiplies that affinity’s synergy (${A.levelMult.map((m, i) => `Lv${i} ×${m}`).join(', ')}) and gives units with the affinity +${pct(A.combatBonusPerLevel)} HP and attack per level.`,
    see: ['kind:research'],
  }),
  level: () => ({
    title: 'Unit level',
    body: `Levels 1–${CONFIG.level.max}; each adds +${pct(CONFIG.level.statPerLevel)} to base stats. Levelling is a big investment: gold grows ×${CONFIG.level.goldGrowth} per level and with rarity, and from Lv${CONFIG.level.essenceFrom} training also takes the essences of the unit’s affinity roots (a Magma unit needs ember and mud). Double-click the level button to confirm. Veterans pay less.`,
    see: ['veteran'],
  }),
  veteran: () => ({ title: 'Veteran', body: `Stars show battles survived. Each one cuts upgrade costs by ${pct(CONFIG.level.discountPerBattleSurvived)}, up to ${pct(CONFIG.level.maxDiscount)}.` }),
  release: () => ({ title: 'Release', body: `Let a unit go and get back ${pct(CONFIG.releaseRefund)} of the morale it cost to recruit.`, see: ['morale'] }),
  'stat:hp': () => ({ title: 'HP', kind: 'Stat', body: 'Health. Boosted by rarity, quality, level, Walls, academies, and Water and Light synergies.' }),
  'stat:atk': () => ({ title: 'Attack', kind: 'Stat', body: 'Damage per hit, and the base for abilities. Boosted by rarity, quality, level, Barracks, academies, and Fire and Weaponry synergies.' }),
  'stat:def': () => ({ title: 'Defense', kind: 'Stat', body: `Reduces damage taken: damage × 100/(100+DEF). Magic damage counts only ${pct(CONFIG.combat.magicDefFactor)} of defense.` }),
  'stat:rng': () => ({
    title: 'Reach and speed',
    kind: 'Stat',
    body: `Reach is how many arena cells away the unit can hit from (1 = melee, next to it). Battles run in ticks (${CONFIG.combat.ticksPerSecond} a second): a step to the next cell and every attack take a set number of ticks, so faster units simply act more often.`,
  }),
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
    body: `After turn ${CONFIG.turnsPerRound}, your troop auto-fights the round’s opponent on a hex arena, tick by tick. Tanks draw the enemy's fighters, rangers and mages; healers keep allies up. Win for gold and morale. Lose and the run is over. Either way, units that fall are gone.`,
    see: ['elimination', 'permadeath', 'scout'],
  }),
}

// ── Parameterized resolvers ───────────────────────────────────────────

function building(id: BuildingId): Resolver {
  return (s) => {
    const def = BUILDING_DEFS[id]
    const adj = def.adjacency.map((r) => {
      const who =
        'terrain' in r.per
          ? (typeof r.per.terrain === 'string' ? [r.per.terrain] : r.per.terrain).map((t) => TERRAIN_DEFS[t].label).join('/')
          : 'building' in r.per
            ? BUILDING_DEFS[r.per.building].name
            : 'tile of the same terrain'
      return `${r.add === 'tile' ? '+1 of the tile’s resource' : fmtOutputs(r.add)} per adjacent ${who.toLowerCase()}${r.cap ? ` (max ${r.cap})` : ''}`
    })
    const count = s.map.tiles.filter((t) => t.building?.id === id).length
    return {
      title: buildingName(id),
      kind: { capital: 'Capital', gather: 'Gathering', civic: 'Civic building', faith: 'Faith', military: 'Military building', research: 'Research' }[def.kind],
      body: (
        <>
          {def.text}
          {typeof def.base !== 'function' && Object.keys(def.base).length > 0 && <p className="help-line">Base: {fmtOutputs(baseOutput(def, 'plains'))}</p>}
          {adj.length > 0 && <p className="help-line">Adjacency: {adj.join('; ')}.</p>}
          <p className="help-line">
            Placed on: {def.allowed === 'any' ? 'any land' : def.allowed.map((t) => TERRAIN_DEFS[t].label).join(', ')}
            {def.unique ? '. Only one allowed' : ''}
            {def.levelNames ? `. Grows: ${def.levelNames.join(' → ')}` : def.maxLevel > 1 ? `. Levels 1–${def.maxLevel}` : ''}.
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
            ? landOf(a).length
              ? `Dedicate an academy with ${RESOURCE_LABEL[a as keyof typeof RESOURCE_LABEL].toLowerCase()} (mined from ${landOf(a).map((t) => TERRAIN_DEFS[t].label.toLowerCase()).join(' and ')}) to have citizens born with it.`
              : `Dedicate an academy with ${a} essence (from a ${a === 'light' ? 'Church' : 'Crypt'}) to have citizens born with it.`
            : `Opens once ${d.parents.map((p) => AFFINITY_LABEL[p]).join(' and ')} each have an academy at Lv${CONFIG.affinity.unlockLevel}; then an academy can be dedicated to it with ${rootsOf(a).map((r) => RESOURCE_LABEL[r].toLowerCase()).join(', ')}.`}
          {kids.length > 0 && <p className="help-line">Leads to: {kids.map((k) => AFFINITY_LABEL[k]).join(', ')}.</p>}
          {d.team && <p className="help-line">Its synergy empowers your whole troop.</p>}
        </>
      ),
      live: open ? (c.affinityLevels[a] ? `Your best ${AFFINITY_LABEL[a]} academy: Lv${c.affinityLevels[a]}.` : 'No academy yet.') : 'Locked.',
      see: [`synergy:${a}`, 'kind:research', ...d.parents.map((p) => `affinity:${p}`), ...kids.map((k) => `affinity:${k}`)],
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
          {def.basic ? <> A basic terrain: one of these makes up most of a biome.</> : <> A speciality terrain.</>}
          {!def.buildable && <> Only a Fishery can stand on it; farms and trading posts beside it benefit.</>}
        </>
      ),
      see: [`resource:${def.resource}`, ...(def.affinity ? [`affinity:${def.affinity}`] : [])],
    }
  }
}

/** Each resource's job beyond training and feeding academies. */
const ROLE: Partial<Record<ResourceId, string>> = {
  gold: 'Claims land, levels units, and pays for every building.',
  stone: 'Every building is built from stone.',
  earth: `Pays for land: claim a tile for 1 mud per ${CONFIG.territory.goldPerEarth} gold of its cost.`,
  light: `Offer ${CONFIG.faith.lightPerOffering} at a Church for +${CONFIG.faith.moralePerOffering} morale.`,
  water: 'Builds Fisheries, which turn lakes into food.',
  fire: 'Trains units and feeds academies. Barracks need it.',
  wind: 'Trains units and feeds academies.',
  dark: 'Trains units and feeds academies. Only a Crypt makes it.',
  arcane: `Its main use: every academy after your first costs ${CONFIG.affinity.extraAcademyArcane} arcane per academy you own. Leyfields are rare.`,
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
          {ROLE[r] && <p className="help-line">{ROLE[r]}</p>}
          {users.length > 0 && <p className="help-line">Builds: {users.map((b) => b.name).join(', ')}.</p>}
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
          {d.blurb} Reaches {d.base.range} cell{d.base.range === 1 ? '' : 's'} and deals {d.damage} damage
          {d.damage === 'magic' ? `, which counts only ${pct(CONFIG.combat.magicDefFactor)} of defense` : ''}.
          <p className="help-line">{d.targeting}</p>
          <p className="help-line">
            <b>{d.abilityLabel}:</b> {d.abilityText} Cast when energy is full (+{CONFIG.combat.energyPerAttack} per attack, +{CONFIG.combat.energyPerHit} when hit).
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
    body: `×${CONFIG.rarityStatMult[r]} stats (rarity only sets strength; affinities come from academies), base price ${CONFIG.rarityPrice[r]} gold. ${r === 'common' ? 'Always available.' : `Unlocks at ${fmtPop(CONFIG.rarityThresholds[r])} population.`} Older rarities fall behind as the game goes on: the generation gap.`,
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
