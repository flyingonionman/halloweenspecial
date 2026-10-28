import { AFFINITY_DEFS, AFFINITY_LABEL, affinityEntries, type AffinityPoints } from '../../game'
import { AFFINITY_COLOR, AFFINITY_GLYPH } from '../theme'

export function AffinityChips({ points }: { points: AffinityPoints }) {
  return (
    <div className="aff-chips">
      {affinityEntries(points).map(([a, n]) => (
        <span key={a} className="aff-chip" data-help={`affinity:${a}`} style={{ '--aff': AFFINITY_COLOR[a] } as React.CSSProperties}>
          <i>{AFFINITY_GLYPH[a]}</i>
          {AFFINITY_LABEL[a]}
          <b>{n}</b>
        </span>
      ))}
    </div>
  )
}

/**
 * A unit's affinity at a glance, for face tiles: colour, glyph, name, its points
 * (×2) and its tier in the tree (T1–T4). Plain citizens say so.
 */
export function AffinityBadge({ points }: { points: AffinityPoints }) {
  const main = affinityEntries(points)[0]
  if (!main) return <span className="aff-badge plain">no affinity</span>
  const [a, n] = main
  return (
    <span className="aff-badge" data-help={`affinity:${a}`} style={{ '--aff': AFFINITY_COLOR[a] } as React.CSSProperties} title={`Tier ${AFFINITY_DEFS[a].tier} affinity, ${n} point${n === 1 ? '' : 's'}`}>
      <i>{AFFINITY_GLYPH[a]}</i>
      {AFFINITY_LABEL[a]}
      {n > 1 && <b>×{n}</b>}
      <small>T{AFFINITY_DEFS[a].tier}</small>
    </span>
  )
}
