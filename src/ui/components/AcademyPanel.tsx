/**
 * Opened from an academy's tile. An empty academy lists every affinity you
 * could dedicate it to; a dedicated one shows its level, what it does for
 * births, and the offering that raises it.
 */
import { useState } from 'react'
import {
  AFFINITY_DEFS,
  AFFINITY_LABEL,
  RESOURCE_LABEL,
  rootsOf,
  CONFIG,
  affinitiesOfTier,
  affinityOdds,
  city,
  isUnlocked,
  offerBlock,
  offerToAcademy,
  offeringCost,
  pointOdds,
  tileAt,
  type Affinity,
  type Hex,
} from '../../game'
import { useGame } from '../useGame'
import { useRequirementCheck } from '../toast'
import { CostChips } from './BuildingBits'
import { AFFINITY_COLOR, AFFINITY_GLYPH, RESOURCE_GLYPH } from '../theme'

const pct = (v: number) => `${Math.round(v * 100)}%`

export function AcademyPanel({ hex }: { hex: Hex }) {
  const [s] = useGame()
  const b = tileAt(s.map, hex)!.building!
  return b.affinity ? <Dedicated hex={hex} affinity={b.affinity} level={b.level} /> : <Empty hex={hex} />
}

/** "♨ Ember → Fire", or "♨ Ember + ▲ Mud → Magma": what you offer and what it makes. */
const offerLabel = (a: Affinity) => `${rootsOf(a).map((r) => `${RESOURCE_GLYPH[r]} ${RESOURCE_LABEL[r]}`).join(' + ')} → ${AFFINITY_LABEL[a]}`

function Empty({ hex }: { hex: Hex }) {
  const [s, dispatch] = useGame()
  const levels = city(s).affinityLevels
  const options = [1, 2, 3, 4].flatMap((t) => affinitiesOfTier(t).filter((a) => isUnlocked(a, levels)))
  const [pick, setPick] = useState<Affinity>(options[0]!)
  const cost = offeringCost(s, hex, pick)
  const check = useRequirementCheck()
  return (
    <div className="academy" data-help="kind:research">
      <span className="label">Dedicate this academy</span>
      <p className="muted">Pick what to offer. Citizens will then be born with that affinity more often.</p>
      <div className="ac-dedicate">
        <select value={pick} onChange={(e) => setPick(e.target.value as Affinity)} aria-label="Offering">
          {[1, 2, 3, 4].map((t) => {
            const list = options.filter((a) => AFFINITY_DEFS[a].tier === t)
            return list.length ? (
              <optgroup key={t} label={`Tier ${t}`}>
                {list.map((a) => (
                  <option key={a} value={a}>
                    {offerLabel(a)}
                  </option>
                ))}
              </optgroup>
            ) : null
          })}
        </select>
        <CostChips cost={cost} />
        <button
          className="btn btn-primary btn-small"
          onClick={(e) => check(e.currentTarget, cost) && dispatch((st) => offerToAcademy(st, hex, pick))}
        >
          Dedicate
        </button>
      </div>
      {options.every((a) => AFFINITY_DEFS[a].tier === 1) && (
        <p className="muted">
          Tier 2 opens when both parents have an academy at Lv{CONFIG.affinity.unlockLevel} (e.g. Ember + Mud → Magma).
        </p>
      )}
    </div>
  )
}

function Dedicated({ hex, affinity, level }: { hex: Hex; affinity: Affinity; level: number }) {
  const [s] = useGame()
  const odds = affinityOdds(city(s).academies).affinities.find((x) => x.affinity === affinity)
  const points = pointOdds(level)
  return (
    <div className="academy" data-help={`affinity:${affinity}`}>
      <span className="label">
        <span style={{ color: AFFINITY_COLOR[affinity] }}>
          {AFFINITY_GLYPH[affinity]} {AFFINITY_LABEL[affinity]}
        </span>{' '}
        academy · Lv{level}/{CONFIG.affinity.maxLevel}
      </span>
      <dl className="city-stats">
        <div data-help="birth-odds">
          <dt>Citizens born {AFFINITY_LABEL[affinity]}</dt>
          <dd>{odds ? pct(odds.chance) : '—'}</dd>
        </div>
        <div data-help="birth-odds">
          <dt>From this academy</dt>
          <dd className="mono">{points.map((p, i) => `${i + 1}pt ${pct(p)}`).join(' · ')}</dd>
        </div>
      </dl>
      {level < CONFIG.affinity.maxLevel ? (
        <ul className="ac-list">
          <OfferRow hex={hex} a={affinity} label={`Raise to Lv${level + 1}`} />
        </ul>
      ) : (
        <p className="muted">Mastered.</p>
      )}
    </div>
  )
}

function OfferRow({ hex, a, label }: { hex: Hex; a: Affinity; label: string }) {
  const [s, dispatch] = useGame()
  const cost = offeringCost(s, hex, a)
  const check = useRequirementCheck()
  const block = offerBlock(s, hex, a)
  return (
    <li data-help={`affinity:${a}`}>
      <span className="ac-name" style={{ color: AFFINITY_COLOR[a] }}>
        {AFFINITY_GLYPH[a]} {AFFINITY_LABEL[a]}
      </span>
      <CostChips cost={cost} />
      <button
        className="btn btn-small"
        disabled={block !== null && block !== 'cost'}
        onClick={(e) => check(e.currentTarget, cost) && dispatch((st) => offerToAcademy(st, hex, a))}
      >
        {label}
      </button>
    </li>
  )
}
