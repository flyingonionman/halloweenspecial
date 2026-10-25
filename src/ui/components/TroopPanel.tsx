import {
  AFFINITY_DEFS,
  CONFIG,
  EFFECT_TEXT,
  city,
  computeSynergies,
  moveToBench,
  moveToTroop,
  releaseRefund,
  releaseUnit,
  swapUnits,
  synergyEffects,
  troopAffinityPoints,
  troopSize,
  type Effects,
} from '../../game'
import { useState } from 'react'
import { useGame } from '../useGame'
import { AffinityChips, UnitCard } from './UnitCard'
import { UnitDetail } from './UnitDetail'
import { LevelUpButton } from './LevelUpButton'
import { AFFINITY_COLOR, AFFINITY_GLYPH } from '../theme'

export const effectsText = (fx: Effects) =>
  (Object.entries(fx) as [keyof typeof EFFECT_TEXT, number][]).map(([k, v]) => EFFECT_TEXT[k](v)).join(', ')

export function TroopPanel() {
  const [s, dispatch] = useGame()
  const [detail, setDetail] = useState<string | null>(null)
  const detailUnit = detail ? [...s.troop, ...s.bench].find((u) => u.uid === detail) : undefined
  const size = troopSize(s)
  const levels = city(s).affinityLevels
  // Grouped by affinity tier; within a tier, active synergies and bigger stacks first.
  const synergies = computeSynergies(s.troop, levels).sort(
    (a, b) => AFFINITY_DEFS[a.def.id].tier - AFFINITY_DEFS[b.def.id].tier || b.tier - a.tier || b.points[0]! - a.points[0]!,
  )

  // Drag a card onto another to swap places; onto an empty post or the bench to move it there.
  const [dragging, setDragging] = useState<string | null>(null)
  const dropZone = (target: string) => ({
    onDragOver: (e: React.DragEvent) => dragging && e.preventDefault(),
    onDrop: (e: React.DragEvent) => {
      e.preventDefault()
      e.stopPropagation()
      const uid = dragging
      setDragging(null)
      if (!uid) return
      dispatch((st) => (target === 'troop' ? moveToTroop(st, uid) : target === 'bench' ? moveToBench(st, uid) : swapUnits(st, uid, target)))
    },
  })
  const card = (u: (typeof s.troop)[number], where: 'troop' | 'bench') => (
    <div
      key={u.uid}
      className={`drag-card ${dragging === u.uid ? 'dragging' : ''}`}
      draggable
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = 'move'
        e.dataTransfer.setData('text/plain', u.uid)
        setDragging(u.uid)
      }}
      onDragEnd={() => setDragging(null)}
      {...dropZone(u.uid)}
    >
      <UnitCard unit={u} compact footer={actions(u.uid, where)} />
    </div>
  )

  const actions = (uid: string, where: 'troop' | 'bench') => {
    const u = [...s.troop, ...s.bench].find((x) => x.uid === uid)!
    return (
      <div className="uc-actions">
        <button className="btn btn-small btn-detail" onClick={() => setDetail(uid)}>
          Details
        </button>
        <LevelUpButton unit={u} compact />
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
          data-help="release"
          onClick={() => confirm(`Release ${u.name}? Refund: ${releaseRefund(u)}`) && dispatch((st) => releaseUnit(st, uid))}
        >
          ✕
        </button>
      </div>
    )
  }

  if (detailUnit) return <UnitDetail inline unit={detailUnit} s={s} inTroop={s.troop.includes(detailUnit)} onClose={() => setDetail(null)} />

  return (
    <div className="troop-panel">
      <h3 className="section-title first" data-help="troop">
        Troop <small>{s.troop.length}/{size}</small>
      </h3>
      <div className="troop-slots">
        {Array.from({ length: size }, (_, i) => {
          const u = s.troop[i]
          return u ? (
            card(u, 'troop')
          ) : (
            <div key={`empty-${i}`} className="slot-empty" {...dropZone('troop')}>
              empty post
            </div>
          )
        })}
      </div>

      <h3 className="section-title" data-help="synergies">
        Synergies
      </h3>
      {s.troop.length > 0 && <AffinityChips points={troopAffinityPoints(s.troop)} />}
      <ul className="synergies">
        {synergies.length === 0 && <li className="empty">Affinity points in your troop add up to synergies.</li>}
        {synergies.map((syn, i) => {
          const tierHead =
            i === 0 || AFFINITY_DEFS[syn.def.id].tier !== AFFINITY_DEFS[synergies[i - 1]!.def.id].tier ? (
              <li key={`t${AFFINITY_DEFS[syn.def.id].tier}`} className="aff-tier">
                Tier {AFFINITY_DEFS[syn.def.id].tier}
              </li>
            ) : null
          const preview = syn.tier > 0 ? syn.effects : synergyEffects(syn.def, 1, syn.level)
          return [
            tierHead,
            <li key={syn.def.id} data-help={`synergy:${syn.def.id}`} className={`${syn.tier > 0 ? 'active' : ''} ${syn.def.components.length > 1 ? 'compound' : ''}`}>
              <span className="syn-tier" title="Tier (from troop points)" data-help="synergy-tier">
                {[1, 2, 3, 4].map((t) => (
                  <i key={t} className={t <= syn.tier ? 'on' : ''} />
                ))}
              </span>
              <span className="syn-name">
                {syn.def.name}
                <span className="syn-level" title="Affinity level (from academies)" data-help="affinity-level">
                  academy Lv{syn.level} ×{CONFIG.affinity.levelMult[syn.level]}
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
            </li>,
          ]
        })}
      </ul>

      <h3 className="section-title" data-help="bench">
        Bench <small>{s.bench.length}/{CONFIG.benchSize}</small>
      </h3>
      <div className="bench" {...dropZone('bench')}>
        {s.bench.length === 0 && <p className="empty">Benched units stay with you between battles.</p>}
        {s.bench.map((u) => (
          card(u, 'bench')
        ))}
      </div>
    </div>
  )
}
