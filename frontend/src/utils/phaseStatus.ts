/** Resolve phase status payload; prompt for reason when required. */
export function phaseStatusPayload(
  status: string,
  t: (key: string) => string,
): { status: string; status_reason?: string } | null {
  if (status === 'blocked' || status === 'skipped') {
    const reason = window.prompt(t('common.reason'))
    if (!reason || !reason.trim()) return null
    return { status, status_reason: reason.trim() }
  }
  return { status }
}
