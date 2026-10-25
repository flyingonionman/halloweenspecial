/**
 * Full detail sheet for a unit you own: combat style, and stats as they stand
 * on paper vs in battle (with your buildings, academies and troop synergies).
 */
import { useEffect } from 'react'
import {
  CONFIG,
  attackTicks,
  moveTicks,
  EFFECT_TEXT,
  TYPE_DEFS,
  affinityEntries,
  AFFINITY_LABEL,
  city,
  cityBonuses,
  combatStats,
  computeSynergies,
  unitPower,
  unitStats,
  unitUpgradeCost,
  upgradeDiscount,
  type GameState,
  type Unit,
} from '../../game'
import { AFFINITY_COLOR, AFFINITY_GLYPH, RARITY_COLOR } from '../theme'
import { AffinityChips } from './UnitCard'
import { Portrait } from './Portrait'
import { LevelUpButton } from './LevelUpButton'
import { CostChips } from './BuildingBits'
import { useState } from 'react'
import { useGame } from '../useGame'
import { renameUnit } from '../../game'

/** Click the name to rename; Enter or blur saves, Escape cancels. */
function EditableName({ unit }: { unit: Unit }) {
  const [, dispatch] = useGame()
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(unit.name)
  if (!editing) {
    return (
      <h3 className="us-name editable" title="Click to rename" onClick={() => (setDraft(unit.name), setEditing(true))}>
        {unit.name} <span className="us-pencil">✎</span>
      </h3>
    )
  }
  const save = () => {
    dispatch((st) => renameUnit(st, unit.uid, draft))
    setEditing(false)
  }
  return (
    <input
      className="us-name-input"
      autoFocus
      maxLength={32}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={save}
      onKeyDown={(e) => {
        if (e.key === 'Enter') save()
        if (e.key === 'Escape') {
          e.stopPropagation()
          setEditing(false)
        }
      }}
    />
  )
}

const pct = (v: number) => `${Math.round(v * 100)}%`

export function UnitDetail({
  unit,
  s,
  inTroop,
  onClose,
  actions,
  inline,
}: {
  unit: Unit
  s: GameState
  inTroop: boolean
  onClose: () => void
  /** Main actions, shown at the top under the header (e.g. Enlist from the muster, Bench/Deploy). */
  actions?: React.ReactNode
  /** Render inside a panel (with a back arrow) instead of as a modal. */
  inline?: boolean
}) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && !(e.target instanceof HTMLInputElement) && onClose()
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [onClose])

  const type = TYPE_DEFS[unit.type]
  const base = unitStats(unit)
  const c = city(s)
  const synergies = computeSynergies(inTroop ? s.troop : [...s.troop, unit], c.affinityLevels)
  const battle = combatStats(unit, synergies, cityBonuses(c))
  const carried = synergies.filter((syn) => syn.tier > 0 && syn.def.components.some((a) => (unit.affinities[a] ?? 0) > 0))
  const cost = unitUpgradeCost(s, unit)
  const owned = s.troop.some((u) => u.uid === unit.uid) || s.bench.some((u) => u.uid === unit.uid)

  const row = (label: string, help: string, a: string | number, b: string | number) => (
    <tr data-help={help}>
      <th>{label}</th>
      <td>{a}</td>
      <td className={String(a) !== String(b) ? 'up' : ''}>{b}</td>
    </tr>
  )

  const extras: [string, string][] = [
    battle.critChance > 0.05 ? ['Crit chance', pct(battle.critChance)] : null,
    battle.spellPower > 1 ? ['Ability power', `×${battle.spellPower.toFixed(2)}`] : null,
    battle.energyGain > 1 ? ['Energy gain', `×${battle.energyGain.toFixed(2)}`] : null,
    battle.damageReduction > 0 ? ['Damage taken', `−${pct(battle.damageReduction)}`] : null,
    battle.bonusMagic > 0 ? ['Bonus magic on hit', pct(battle.bonusMagic)] : null,
    battle.slowOnHit > 0 ? ['Slow on hit', pct(battle.slowOnHit)] : null,
    battle.startShield > 0 ? ['Starting shield', `${pct(battle.startShield)} HP`] : null,
    battle.thorns > 0 ? ['Thorns', pct(battle.thorns)] : null,
    battle.doubleStrike > 0 ? ['Strike again', pct(battle.doubleStrike)] : null,
    battle.lifesteal > 0 ? ['Lifesteal', pct(battle.lifesteal)] : null,
  ].filter((x): x is [string, string] => !!x)

  const body = (
      <div className={`sheet unit-sheet ${inline ? 'inline' : ''}`} role={inline ? undefined : 'dialog'} aria-label={unit.name} style={{ '--rarity': RARITY_COLOR[unit.rarity] } as React.CSSProperties}>
        {inline && (
          <button className="bp-back us-back" onClick={onClose} aria-label="Back">
            ←
          </button>
        )}
        {/* Hero: the animated figure on the left; who it is, how it fights, and the main action on the right. */}
        <header className="us-hero">
          <Portrait unit={unit} animate />
          <div className="us-hero-info">
            <span className="help-kind">
              <span data-help={`rarity:${unit.rarity}`} style={{ color: RARITY_COLOR[unit.rarity] }}>
                {unit.rarity}
              </span>{' '}
              · <span data-help={`type:${unit.type}`}>{type.label}</span> · <span data-help="level">Lv{unit.level}</span>
              {unit.battlesSurvived > 0 && (
                <span data-help="veteran">
                  {' '}
                  · {'★'.repeat(Math.min(3, unit.battlesSurvived))} {unit.battlesSurvived} battle{unit.battlesSurvived === 1 ? '' : 's'}
                </span>
              )}
            </span>
            {owned ? <EditableName unit={unit} /> : <h3>{unit.name}</h3>}
            <AffinityChips points={unit.affinities} />
            <dl className="us-brief">
              <div data-help="stat:rng">
                <dt>Reach</dt>
                <dd>
                  {base.range} cell{base.range === 1 ? '' : 's'} · {base.range < 2 ? 'melee' : 'ranged'}
                </dd>
              </div>
              <div data-help="stat:atk">
                <dt>Attack</dt>
                <dd>
                  every {attackTicks(base.atkSpeed)} ticks · {type.damage}
                </dd>
              </div>
              <div data-help="stat:rng">
                <dt>Step</dt>
                <dd>{moveTicks(base.moveSpeed)} ticks per cell</dd>
              </div>
              <div>
                <dt>Skill</dt>
                <dd>
                  {type.abilityLabel} at {base.maxEnergy} energy
                </dd>
              </div>
            </dl>
            {actions && <div className="us-actions">{actions}</div>}
          </div>
          {!inline && (
            <button className="help-close" onClick={onClose} aria-label="Close">
              ×
            </button>
          )}
        </header>

        <section>
          <h4>Stats</h4>
          <table className="us-stats">
            <thead>
              <tr>
                <th />
                <th>Unit</th>
                <th>In battle</th>
              </tr>
            </thead>
            <tbody>
              {row('HP', 'stat:hp', base.hp, battle.hp)}
              {row('Attack', 'stat:atk', base.atk, battle.atk)}
              {row('Defense', 'stat:def', base.def, battle.def)}
              {row('Reach (cells)', 'stat:rng', base.range, battle.range)}
              {row('Ticks per attack', 'stat:atk', attackTicks(base.atkSpeed), attackTicks(battle.atkSpeed))}
              {row('Ticks per step', 'stat:rng', moveTicks(base.moveSpeed), moveTicks(battle.moveSpeed))}
              {row('Power', 'stat:pwr', unitPower(unit), '—')}
            </tbody>
          </table>
          {extras.length > 0 && (
            <ul className="us-extras">
              {extras.map(([k, v]) => (
                <li key={k}>
                  <span>{k}</span>
                  <b>{v}</b>
                </li>
              ))}
            </ul>
          )}
          <p className="muted">
            Quality roll ×{unit.quality.toFixed(3)} · ×{CONFIG.rarityStatMult[unit.rarity]} for {unit.rarity}
            {unit.level > 1 && ` · +${pct(CONFIG.level.statPerLevel * (unit.level - 1))} from levels`}.
            {!inTroop && ' In-battle numbers assume this unit joins your troop.'}
          </p>
        </section>

        <section>
          <h4>Where the bonuses come from</h4>
          <ul className="us-sources">
            {(c.atkPct > 0 || c.hpPct > 0 || c.defPct > 0) && (
              <li data-help="troop-bonus">
                Military buildings: +{pct(c.atkPct)} ATK, +{pct(c.hpPct)} HP, +{pct(c.defPct)} DEF
              </li>
            )}
            {affinityEntries(unit.affinities).map(([a]) =>
              c.affinityLevels[a] ? (
                <li key={a} data-help="affinity-level">
                  <span style={{ color: AFFINITY_COLOR[a] }}>{AFFINITY_GLYPH[a]}</span> {AFFINITY_LABEL[a]} researched to Lv{c.affinityLevels[a]}: +
                  {pct(c.affinityLevels[a] * CONFIG.affinity.combatBonusPerLevel)} HP & ATK
                </li>
              ) : null,
            )}
            {carried.map((syn) => (
              <li key={syn.def.id} data-help={`synergy:${syn.def.id}`}>
                {syn.def.name} tier {syn.tier} × research Lv{syn.level} (×{CONFIG.affinity.levelMult[syn.level]}):{' '}
                {(Object.entries(syn.effects) as [keyof typeof EFFECT_TEXT, number][]).map(([k, v]) => EFFECT_TEXT[k](v)).join(', ')}
              </li>
            ))}
            {!carried.length && !(c.atkPct || c.hpPct || c.defPct) && <li className="muted">Nothing yet: build military, raise academies, or stack affinities.</li>}
          </ul>
        </section>

        <footer className="us-foot">
          {owned ? (
            <LevelUpButton unit={unit} />
          ) : (
            <span className="muted">
              {cost === null ? 'Max level.' : <>Levelling to {unit.level + 1}: <CostChips cost={cost} /></>}
            </span>
          )}
          {owned && upgradeDiscount(unit) > 0 && <span className="muted">veteran −{pct(upgradeDiscount(unit))}</span>}
        </footer>
      </div>
  )
  if (inline) return body
  return (
    <div className="sheet-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      {body}
    </div>
  )
}
