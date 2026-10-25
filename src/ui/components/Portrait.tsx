/**
 * A unit's portrait: a full-body render of its battle model (the same blocky
 * figure that fights in the arena, same skin tone) in a tall 3:4 frame, over a
 * backdrop in its affinity colour, framed in its rarity colour. `animate` swaps
 * the still for a live, moving render.
 */
import { useRef } from 'react'
import { primaryAffinity, type Unit } from '../../game'
import { RARITY_COLOR, unitColor } from '../theme'
import { PORTRAIT_H, PORTRAIT_W, useLivePortrait, usePortrait } from './portraitRenderer'

export function Portrait({ unit, width, animate = false, bare = false }: { unit: Unit; width?: number; animate?: boolean; bare?: boolean }) {
  const url = usePortrait(unit)
  const canvas = useRef<HTMLCanvasElement>(null)
  useLivePortrait(unit, canvas, animate)
  return (
    <span
      className={`portrait ${animate ? 'is-live' : ''} ${bare ? 'bare' : ''}`}
      style={{ width, height: width ? (width * PORTRAIT_H) / PORTRAIT_W : undefined, '--aff': unitColor(primaryAffinity(unit.affinities)), '--frame': RARITY_COLOR[unit.rarity] } as React.CSSProperties}
      aria-hidden
    >
      {url && <img src={url} alt="" draggable={false} />}
      <canvas ref={canvas} width={PORTRAIT_W} height={PORTRAIT_H} />
    </span>
  )
}
