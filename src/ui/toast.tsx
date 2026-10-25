/**
 * Small auto-dismissing toasts, bottom right, plus the "you can't afford this"
 * check: the button shakes red and a toast lists what's missing.
 */
import { useCallback, useEffect, useState } from 'react'
import { RESOURCE_LABEL, shortfall, type Cost, type ResourceId } from '../game'
import { useGame } from './useGame'
import { RESOURCE_COLOR, RESOURCE_GLYPH } from './theme'

interface Toast {
  id: number
  body: React.ReactNode
}

const TTL = 2800
let nextId = 1
const listeners = new Set<(t: Toast) => void>()

export function showToast(body: React.ReactNode) {
  const t = { id: nextId++, body }
  for (const l of listeners) l(t)
}

export function Toaster() {
  const [toasts, setToasts] = useState<Toast[]>([])
  useEffect(() => {
    const add = (t: Toast) => {
      setToasts((ts) => [...ts.slice(-2), t])
      setTimeout(() => setToasts((ts) => ts.filter((x) => x.id !== t.id)), TTL)
    }
    listeners.add(add)
    return () => void listeners.delete(add)
  }, [])
  return (
    <div className="toaster" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className="toast">
          {t.body}
        </div>
      ))}
    </div>
  )
}

/** Shake a button red and toast why (for costs that aren't stock, like morale). */
export function deny(el: HTMLElement | null, body: React.ReactNode) {
  if (el) shake(el)
  showToast(body)
}

/** Restart the deny-shake on a button. */
function shake(el: HTMLElement) {
  el.classList.remove('deny')
  void el.offsetWidth // reflow so the animation plays again
  el.classList.add('deny')
  el.addEventListener('animationend', () => el.classList.remove('deny'), { once: true })
}

/**
 * Returns a check for click handlers: true when you can pay `cost`; otherwise
 * it shakes the button and toasts what's missing, and returns false.
 */
export function useRequirementCheck() {
  const [s] = useGame()
  return useCallback(
    (el: HTMLElement | null, cost: Cost) => {
      const missing = Object.entries(shortfall(s, cost)) as [ResourceId, number][]
      if (!missing.length) return true
      if (el) shake(el)
      showToast(
        <>
          You are missing {missing.length} requirement{missing.length === 1 ? '' : 's'}:{' '}
          {missing.map(([k, v], i) => (
            <span key={k} style={{ color: RESOURCE_COLOR[k] }}>
              {i > 0 && ', '}
              {RESOURCE_GLYPH[k]} {v} {RESOURCE_LABEL[k].toLowerCase()}
            </span>
          ))}
        </>,
      )
      return false
    },
    [s],
  )
}
