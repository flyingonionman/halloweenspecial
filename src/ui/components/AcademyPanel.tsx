/**
 * Opened from an academy's tile. An empty academy lists every affinity you
 * could dedicate it to; a dedicated one shows its level, what it does for
 * births, and the offering that raises it.
 */
import {
  AFFINITY_LABEL,
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
import { AFFINITY_COLOR, AFFINITY_GLYPH } from '../theme'

const pct = (v: number) => `${Math.round(v * 100)}%`

export function AcademyPanel({ hex }: { hex: Hex }) {
  const [s] = useGame()
  const b = tileAt(s.map, hex)!.building!
  return b.affinity ? <Dedicated hex={hex} affinity={b.affinity} level={b.level} /> : <Empty hex={hex} />
}

function Empty({ hex }: { hex: Hex }) {
  const [s] = useGame()
  const levels = city(s).affinityLevels
  const tiers = [1, 2, 3, 4].map((t) => ({ t, list: affinitiesOfTier(t).filter((a) => isUnlocked(a, levels)) })).filter((g) => g.list.length)
  return (
    <div className="academy" data-help="kind:research">
      <span className="label">Dedicate this academy</span>
      <p className="muted">Offer an affinity’s essences. Citizens will then be born with that affinity more often.</p>
      {tiers.map((g) => (
        <section key={g.t}>
          <h5 className="aff-tier">Tier {g.t}</h5>
          <ul className="ac-list">
            {g.list.map((a) => (
              <OfferRow key={a} hex={hex} a={a} label="Dedicate" />
            ))}
          </ul>
        </section>
      ))}
      {tiers.length === 1 && (
        <p className="muted">
          Tier 2 opens when both parents have an academy at Lv{CONFIG.affinity.unlockLevel} (e.g. Fire + Earth → Magma).
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
