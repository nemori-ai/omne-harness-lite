/** Milliseconds from one recorded instant to a later one; unknown when either is missing or they are out of order. */
export function msBetween(from: string | null, to: string | null): number | null {
  if (from === null || to === null) return null
  const span = Date.parse(to) - Date.parse(from)
  return Number.isFinite(span) && span >= 0 ? span : null
}

const SECONDS = /^PT(0|[1-9][0-9]*)(?:\.([0-9]{1,3}))?S$/u

/** An account duration in SI seconds, `PT<s>.<ms>S`, as milliseconds; anything else is unknown. */
export function msOfDuration(duration: string | Readonly<{ state: 'unknown' }>): number | null {
  if (typeof duration !== 'string') return null
  const match = SECONDS.exec(duration)
  if (match === null) return null
  return Number(match[1]) * 1000 + Number((match[2] ?? '').padEnd(3, '0'))
}
