import { RESOURCE_LABEL, RESOURCES, type Cost, type OutputKey, type Outputs, type ResourceId } from '../game'

const STAT_LABEL: Partial<Record<OutputKey, (v: number) => string>> = {
  atkPct: (v) => `+${(v * 100).toFixed(1).replace(/\.0$/, '')}% ATK`,
  hpPct: (v) => `+${(v * 100).toFixed(1).replace(/\.0$/, '')}% HP`,
  defPct: (v) => `+${(v * 100).toFixed(1).replace(/\.0$/, '')}% DEF`,
  trade: (v) => (v > 0 ? `trade −${v}` : 'trading'),
}

export interface OutputPart {
  key: OutputKey
  text: string
}

export function outputParts(o: Outputs): OutputPart[] {
  const parts: OutputPart[] = []
  for (const r of RESOURCES) if (o[r]) parts.push({ key: r, text: `+${o[r]} ${RESOURCE_LABEL[r]}` })
  for (const [k, fmt] of Object.entries(STAT_LABEL) as [OutputKey, (v: number) => string][]) {
    if (o[k] !== undefined && (o[k] !== 0 || k === 'trade')) parts.push({ key: k, text: fmt(o[k]!) })
  }
  return parts
}

export const fmtOutputs = (o: Outputs) => outputParts(o).map((p) => p.text).join(' · ') || '—'

export function costParts(c: Cost): { key: ResourceId; amount: number }[] {
  return (Object.entries(c) as [ResourceId, number][]).filter(([, v]) => v > 0).map(([key, amount]) => ({ key, amount }))
}

/** A single comparable number for "how good is this spot", used to highlight the best placement. */
export function outputScore(o: Outputs): number {
  let s = 0
  for (const r of RESOURCES) s += o[r] ?? 0
  s += ((o.atkPct ?? 0) + (o.hpPct ?? 0) + (o.defPct ?? 0)) * 60
  s += (o.trade ?? 0) * 2
  return s
}
