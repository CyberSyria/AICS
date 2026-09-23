/** Equal integer weights that sum to 100. */
export function equalWeights(count: number): number[] {
  if (count <= 0) return []
  const base = Math.floor(100 / count)
  const rem = 100 - base * count
  return Array.from({ length: count }, (_, i) => base + (i < rem ? 1 : 0))
}

/**
 * Change weight at `index` without touching other phases.
 * Clamped to [0, remaining] where remaining = 100 − sum(others).
 */
export function setWeightIndependent(weights: number[], index: number, newValue: number): number[] {
  const n = weights.length
  if (n <= 0) return []
  if (n === 1) return [Math.max(0, Math.min(100, Math.round(newValue)))]

  const othersSum = weights.reduce((s, w, i) => (i === index ? s : s + Math.max(0, w || 0)), 0)
  const maxAllowed = Math.max(0, 100 - othersSum)
  const next = [...weights]
  next[index] = Math.max(0, Math.min(maxAllowed, Math.round(newValue)))
  return next
}

/** @deprecated Use setWeightIndependent — kept for any external callers. */
export function redistributeWeights(weights: number[], index: number, newValue: number): number[] {
  return setWeightIndependent(weights, index, newValue)
}

export function normalizeWeights(items: { weight_percent?: number }[]): number[] {
  const raw = items.map((i) => Math.max(0, Number(i.weight_percent) || 0))
  const sum = raw.reduce((a, b) => a + b, 0)
  if (sum === 100) return raw
  if (sum <= 0) return equalWeights(items.length)
  const scaled = raw.map((w) => Math.floor((w / sum) * 100))
  let leftover = 100 - scaled.reduce((a, b) => a + b, 0)
  for (let i = 0; leftover > 0 && i < scaled.length; i++) {
    scaled[i] += 1
    leftover -= 1
  }
  return scaled
}

export type DateRange = { start: string; end: string; days: number }

/** Split [start, end] by weight percentages into contiguous day ranges. */
export function scheduleDateRanges(
  startStr: string | undefined,
  endStr: string | undefined,
  weights: number[],
): DateRange[] {
  if (!weights.length) return []
  const start = startStr ? new Date(startStr + 'T00:00:00') : new Date()
  start.setHours(0, 0, 0, 0)
  let end = endStr ? new Date(endStr + 'T00:00:00') : new Date(start)
  end.setHours(0, 0, 0, 0)
  if (end.getTime() <= start.getTime()) {
    end = new Date(start)
    end.setDate(end.getDate() + Math.max(7, weights.length * 3) - 1)
  }

  const totalDays = Math.max(
    Math.round((end.getTime() - start.getTime()) / 86400000) + 1,
    weights.length,
  )
  const weightSum = weights.reduce((a, b) => a + Math.max(0, b), 0) || 100
  const raw = weights.map((w) => {
    const ww = Math.max(0, w)
    if (ww <= 0) return 0
    return Math.max(1, Math.round(totalDays * (ww / weightSum)))
  })
  const nonzero = raw.map((d, i) => (d > 0 ? i : -1)).filter((i) => i >= 0)
  let drift = totalDays - raw.reduce((a, b) => a + b, 0)
  let i = 0
  while (drift !== 0 && nonzero.length) {
    const idx = nonzero[i % nonzero.length]
    raw[idx] = Math.max(1, raw[idx] + (drift > 0 ? 1 : -1))
    drift = totalDays - raw.reduce((a, b) => a + b, 0)
    i += 1
    if (i > 500) break
  }

  const pad = (d: Date) => {
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    return `${y}-${m}-${day}`
  }

  const ranges: DateRange[] = []
  const cursor = new Date(start)
  for (const days of raw) {
    if (days <= 0) {
      ranges.push({ start: pad(cursor), end: pad(cursor), days: 0 })
      continue
    }
    const s = new Date(cursor)
    const e = new Date(cursor)
    e.setDate(e.getDate() + Math.max(days - 1, 0))
    ranges.push({ start: pad(s), end: pad(e), days })
    cursor.setTime(e.getTime())
    cursor.setDate(cursor.getDate() + 1)
  }
  return ranges
}

/** Remaining days relative to today within the phase window. */
export function daysRemainingFromToday(start?: string | null, end?: string | null, status?: string | null): number | null {
  if (!end) return null
  const code = (status || '').toLowerCase()
  if (code === 'completed' || code === 'skipped') return 0
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const endD = new Date(end + 'T00:00:00')
  if (start) {
    const startD = new Date(start + 'T00:00:00')
    if (today < startD) {
      return Math.round((endD.getTime() - startD.getTime()) / 86400000) + 1
    }
  }
  return Math.round((endD.getTime() - today.getTime()) / 86400000)
}
