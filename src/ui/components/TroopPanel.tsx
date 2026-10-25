import {
  CONFIG,
  EFFECT_TEXT,
  canUpgrade,
  city,
  computeSynergies,
  moveToBench,
  moveToTroop,
  releaseRefund,
  releaseUnit,
  synergyEffects,
  troopAffinityPoints,
  troopSize,
  unitUpgradeCost,
  upgradeUnit,
  type Effects,
} from '../../game'
import { useGame } from '../useGame'
import { AffinityChips, UnitCard } from './UnitCard'
import { AFFINITY_COLOR, AFFINITY_GLYPH } from '../theme'

export const effectsText = (fx: Effects) =>
  (Object.entries(fx) as [keyof typeof EFFECT_TEXT, number][]).map(([k, v]) => EFFECT_TEXT[k](v)).join(', ')

export function TroopPanel() {
  const [s, dispatch] = useGame()
  const size = troopSize(s)
  const levels = city(s).affinityLevels
  const synergies = computeSynergies(s.troop, levels).sort(
    (a, b) => b.tier - a.tier || b.def.components.length - a.def.components.length || Math.min(...b.points) - Math.min(...a.points),
  )

  const actions = (uid: string, where: 'troop' | 'bench') => {
    const u = [...s.troop, ...s.bench].find((x) => x.uid === uid)!
    const cost = unitUpgradeCost(s, u)
    return (
      <div className="uc-actions">
        <button className="btn btn-small" disabled={!canUpgrade(s, uid)} onClick={() => dispatch((st) => upgradeUnit(st, uid))}>
          {cost === null ? (
            'Max'
          ) : (
            <>
              Lv↑ <b className="gold">{cost}</b>
            </>
          )}
        </button>
        {where === 'troop' ? (
          <button className="btn btn-small" disabled={s.bench.length >= CONFIG.benchSize} onClick={() => dispatch((st) => moveToBench(st, uid))}>
            Bench
          </button>
        ) : (
          <button className="btn btn-small" onClick={() => dispatch((st) => moveToTroop(st, uid))}>
            {s.troop.length < size ? 'Deploy' : 'Swap in'}
          </button>
        )}
        <button
          className="btn btn-small btn-ghost"
          title={`Release for ${releaseRefund(u)}`}
          onClick={() => confirm(`Release ${u.name}? Refund: ${releaseRefund(u)}`) && dispatch((st) => releaseUnit(st, uid))}
        >
          ✕
        </button>
      </div>
    )
  }

  return (
    <div className="troop-panel">
      <h3 className="section-title first">
        Troop <small>{s.troop.length}/{size}</small>
      </h3>
      <div className="troop-slots">
        {Array.from({ length: size }, (_, i) => {
          const u = s.troop[i]
          return u ? (
            <UnitCard key={u.uid} unit={u} compact footer={actions(u.uid, 'troop')} />
          ) : (
            <div key={`empty-${i}`} className="slot-empty">
              empty post
            </div>
          )
        })}
      </div>

      <h3 className="section-title">Synergies</h3>
      {s.troop.length > 0 && <AffinityChips points={troopAffinityPoints(s.troop)} />}
      <ul className="synergies">
        {synergies.length === 0 && <li className="empty">Affinity points in your troop add up to synergies.</li>}
        {synergies.map((syn) => {
          const preview = syn.tier > 0 ? syn.effects : synergyEffects(syn.def, 1, syn.level)
          return (
            <li key={syn.def.id} className={`${syn.tier > 0 ? 'active' : ''} ${syn.def.components.length > 1 ? 'compound' : ''}`}>
              <span className="syn-tier" title="Tier (from troop points)">
                {[1, 2, 3, 4].map((t) => (
                  <i key={t} className={t <= syn.tier ? 'on' : ''} />
                ))}
              </span>
              <span className="syn-name">
                {syn.def.name}
                <span className="syn-level" title="Affinity level (from academies)">
                  Lv{syn.level} ×{CONFIG.affinity.levelMult[syn.level]}
                </span>
              </span>
              <span className="syn-points">
                {syn.def.components.map((a, i) => (
                  <span key={a} style={{ color: AFFINITY_COLOR[a] }}>
                    {AFFINITY_GLYPH[a]} {syn.points[i]}
                    {syn.nextAt !== null && <small>/{syn.nextAt}</small>}
                  </span>
                ))}
              </span>
              <span className="syn-text">{effectsText(preview)}</span>
            </li>
          )
        })}
      </ul>

      <h3 className="section-title">
        Bench <small>{s.bench.length}/{CONFIG.benchSize}</small>
      </h3>
      <div className="bench">
        {s.bench.length === 0 && <p className="empty">Benched units stay with you between battles.</p>}
        {s.bench.map((u) => (
          <UnitCard key={u.uid} unit={u} compact footer={actions(u.uid, 'bench')} />
        ))}
      </div>
    </div>
  )
}
