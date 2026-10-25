/**
 * Click anything marked with `data-help` to open a popover explaining it.
 *
 * Interactive elements (buttons, links, inputs) keep their own click: if the
 * click lands on or inside one, no popover opens. Their entries live in the
 * Lexicon instead.
 */
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useGame } from '../useGame'
import { getHelp, helpLabel } from './glossary'

interface Open {
  keys: string[]
  x: number
  y: number
}

const INTERACTIVE = 'button, a, select, input, textarea, label, [role="button"]'

export function HelpLayer() {
  const [s] = useGame()
  const [open, setOpen] = useState<Open | null>(null)
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState({ left: 0, top: 0 })

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (e.button !== 0) return
      const target = e.target as Element | null
      if (!target?.closest || ref.current?.contains(target)) return
      if (target.closest(INTERACTIVE)) return
      const key = target.closest('[data-help]')?.getAttribute('data-help')
      if (!key || !getHelp(key, s)) return
      setOpen({ keys: [key], x: e.clientX, y: e.clientY })
    }
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(null)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(null)
    }
    document.addEventListener('click', onClick)
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('click', onClick)
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [s])

  // Keep the popover on screen.
  useLayoutEffect(() => {
    if (!open || !ref.current) return
    const r = ref.current.getBoundingClientRect()
    const pad = 12
    setPos({
      left: Math.max(pad, Math.min(open.x + 10, window.innerWidth - r.width - pad)),
      top: Math.max(pad, Math.min(open.y + 10, window.innerHeight - r.height - pad)),
    })
  }, [open])

  if (!open) return null
  const key = open.keys[open.keys.length - 1]!
  const entry = getHelp(key, s)
  if (!entry) return null

  return (
    <div ref={ref} className="help-pop" style={pos} role="dialog" aria-label={entry.title}>
      <div className="help-head">
        {open.keys.length > 1 && (
          <button className="help-back" onClick={() => setOpen({ ...open, keys: open.keys.slice(0, -1) })} aria-label="Back">
            ‹
          </button>
        )}
        <div>
          {entry.kind && <span className="help-kind">{entry.kind}</span>}
          <h4>{entry.title}</h4>
        </div>
        <button className="help-close" onClick={() => setOpen(null)} aria-label="Close">
          ×
        </button>
      </div>
      <div className="help-body">{entry.body}</div>
      {entry.live && <div className="help-live">{entry.live}</div>}
      {entry.see && entry.see.length > 0 && (
        <div className="help-see">
          <span>See</span>
          {entry.see.map((k) => (
            <button key={k} onClick={() => setOpen({ ...open, keys: [...open.keys, k] })}>
              {helpLabel(k, s)}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
