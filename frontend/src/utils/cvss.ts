/** CVSS v3.1 base score calculator */

export type CvssMetric =
  | 'AV'
  | 'AC'
  | 'PR'
  | 'UI'
  | 'S'
  | 'C'
  | 'I'
  | 'A'

export type CvssValues = Record<CvssMetric, string>

export const CVSS_OPTIONS: Record<CvssMetric, { value: string; label: string; score: number | ((scopeChanged: boolean) => number) }[]> = {
  AV: [
    { value: 'N', label: 'Network', score: 0.85 },
    { value: 'A', label: 'Adjacent', score: 0.62 },
    { value: 'L', label: 'Local', score: 0.55 },
    { value: 'P', label: 'Physical', score: 0.2 },
  ],
  AC: [
    { value: 'L', label: 'Low', score: 0.77 },
    { value: 'H', label: 'High', score: 0.44 },
  ],
  PR: [
    { value: 'N', label: 'None', score: (s) => (s ? 0.85 : 0.85) },
    { value: 'L', label: 'Low', score: (s) => (s ? 0.68 : 0.62) },
    { value: 'H', label: 'High', score: (s) => (s ? 0.5 : 0.27) },
  ],
  UI: [
    { value: 'N', label: 'None', score: 0.85 },
    { value: 'R', label: 'Required', score: 0.62 },
  ],
  S: [
    { value: 'U', label: 'Unchanged', score: 0 },
    { value: 'C', label: 'Changed', score: 0 },
  ],
  C: [
    { value: 'N', label: 'None', score: 0 },
    { value: 'L', label: 'Low', score: 0.22 },
    { value: 'H', label: 'High', score: 0.56 },
  ],
  I: [
    { value: 'N', label: 'None', score: 0 },
    { value: 'L', label: 'Low', score: 0.22 },
    { value: 'H', label: 'High', score: 0.56 },
  ],
  A: [
    { value: 'N', label: 'None', score: 0 },
    { value: 'L', label: 'Low', score: 0.22 },
    { value: 'H', label: 'High', score: 0.56 },
  ],
}

export const DEFAULT_CVSS: CvssValues = {
  AV: 'N',
  AC: 'L',
  PR: 'N',
  UI: 'N',
  S: 'U',
  C: 'N',
  I: 'N',
  A: 'N',
}

function roundUp1(n: number) {
  return Math.ceil(n * 10) / 10
}

function metricScore(metric: CvssMetric, value: string, scopeChanged: boolean): number {
  const opt = CVSS_OPTIONS[metric].find((o) => o.value === value)
  if (!opt) return 0
  return typeof opt.score === 'function' ? opt.score(scopeChanged) : opt.score
}

export function calculateCvss31(values: CvssValues): { score: number; vector: string; severity: string } {
  const scopeChanged = values.S === 'C'
  const av = metricScore('AV', values.AV, scopeChanged)
  const ac = metricScore('AC', values.AC, scopeChanged)
  const pr = metricScore('PR', values.PR, scopeChanged)
  const ui = metricScore('UI', values.UI, scopeChanged)
  const c = metricScore('C', values.C, scopeChanged)
  const i = metricScore('I', values.I, scopeChanged)
  const a = metricScore('A', values.A, scopeChanged)

  const iss = 1 - (1 - c) * (1 - i) * (1 - a)
  let impact: number
  if (scopeChanged) {
    impact = 7.52 * (iss - 0.029) - 3.25 * Math.pow(iss - 0.02, 15)
  } else {
    impact = 6.42 * iss
  }

  const exploitability = 8.22 * av * ac * pr * ui
  let score = 0
  if (impact <= 0) {
    score = 0
  } else if (scopeChanged) {
    score = roundUp1(Math.min(1.08 * (impact + exploitability), 10))
  } else {
    score = roundUp1(Math.min(impact + exploitability, 10))
  }

  const vector = `CVSS:3.1/AV:${values.AV}/AC:${values.AC}/PR:${values.PR}/UI:${values.UI}/S:${values.S}/C:${values.C}/I:${values.I}/A:${values.A}`

  let severity = 'None'
  if (score === 0) severity = 'None'
  else if (score <= 3.9) severity = 'Low'
  else if (score <= 6.9) severity = 'Medium'
  else if (score <= 8.9) severity = 'High'
  else severity = 'Critical'

  return { score, vector, severity }
}

export function parseCvssVector(vector?: string | null): CvssValues | null {
  if (!vector || !vector.startsWith('CVSS:3')) return null
  const parts = Object.fromEntries(
    vector
      .replace(/^CVSS:3\.[01]\//, '')
      .split('/')
      .map((p) => p.split(':') as [string, string]),
  )
  return {
    AV: parts.AV || 'N',
    AC: parts.AC || 'L',
    PR: parts.PR || 'N',
    UI: parts.UI || 'N',
    S: parts.S || 'U',
    C: parts.C || 'N',
    I: parts.I || 'N',
    A: parts.A || 'N',
  }
}
