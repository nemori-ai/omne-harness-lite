/** The content of an IERS `leap-seconds.list`, with every timestamp as `YYYY-MM-DDTHH:MM:SS` UTC. */
export type LeapSecondsList = {
  readonly version: string
  readonly expires: string
  /** Days `YYYY-MM-DD` whose last minute has a second 60. */
  readonly insertions: readonly string[]
  /** Days `YYYY-MM-DD` whose last minute ends after second 58. */
  readonly deletions: readonly string[]
}

export type LeapSecondsListFailure = { readonly kind: 'syntax' | 'step' }

export type LeapSecondsListRead =
  | { readonly ok: true; readonly value: LeapSecondsList }
  | { readonly ok: false; readonly failure: LeapSecondsListFailure }

const SECONDS_PER_DAY = 86_400
// Days from 0000-03-01 to 1900-01-01, the NTP epoch, in the proleptic Gregorian calendar.
const NTP_EPOCH_DAY = 693_901

const VERSION_LINE = /^#\$\s+(\d{1,10})\s*$/u
const EXPIRY_LINE = /^#@\s+(\d{1,10})\s*$/u
const DATA_LINE = /^(\d{1,10})\s+(\d{1,3})\s*(?:#.*)?$/u

/**
 * Reads the IERS format. The first data row is the 1972-01-01 base offset, not a leap second.
 * Each later row changes TAI-UTC by +1 (a second 60 on the previous day) or -1 (a deleted second
 * 59 on the previous day). The `#h` hash is not checked here.
 */
export function readLeapSecondsList(text: string): LeapSecondsListRead {
  const syntax = { ok: false, failure: { kind: 'syntax' } } as const
  const step = { ok: false, failure: { kind: 'step' } } as const
  let version: number | undefined
  let expires: number | undefined
  const rows: { readonly ntp: number; readonly offset: number }[] = []
  for (const line of text.split('\n')) {
    if (line.startsWith('#$')) {
      const match = VERSION_LINE.exec(line)
      if (match === null || version !== undefined) return syntax
      version = decimal(match[1] ?? '')
    } else if (line.startsWith('#@')) {
      const match = EXPIRY_LINE.exec(line)
      if (match === null || expires !== undefined) return syntax
      expires = decimal(match[1] ?? '')
    } else if (!line.startsWith('#') && line.trim() !== '') {
      const match = DATA_LINE.exec(line)
      if (match === null) return syntax
      rows.push({ ntp: decimal(match[1] ?? ''), offset: decimal(match[2] ?? '') })
    }
  }
  if (version === undefined || expires === undefined || rows.length === 0) return syntax

  const insertions: string[] = []
  const deletions: string[] = []
  for (const [index, row] of rows.entries()) {
    if (row.ntp % SECONDS_PER_DAY !== 0) return step
    const previous = rows[index - 1]
    if (previous === undefined) continue
    if (row.ntp <= previous.ntp) return step
    const day = civilText(row.ntp - SECONDS_PER_DAY).slice(0, 10)
    if (row.offset === previous.offset + 1) insertions.push(day)
    else if (row.offset === previous.offset - 1) deletions.push(day)
    else return step
  }
  return {
    ok: true,
    value: { version: civilText(version), expires: civilText(expires), insertions, deletions },
  }
}

function decimal(digits: string): number {
  let value = 0
  for (const digit of digits) value = value * 10 + digit.charCodeAt(0) - 48
  return value
}

// Civil-from-days by Howard Hinnant, http://howardhinnant.github.io/date_algorithms.html
function civilText(ntp: number): string {
  const secondOfDay = ntp % SECONDS_PER_DAY
  const days = (ntp - secondOfDay) / SECONDS_PER_DAY + NTP_EPOCH_DAY
  const era = Math.floor(days / 146_097)
  const dayOfEra = days - era * 146_097
  const yearOfEra = Math.floor(
    (dayOfEra -
      Math.floor(dayOfEra / 1_460) +
      Math.floor(dayOfEra / 36_524) -
      Math.floor(dayOfEra / 146_096)) /
      365,
  )
  const dayOfYear =
    dayOfEra - (365 * yearOfEra + Math.floor(yearOfEra / 4) - Math.floor(yearOfEra / 100))
  const monthFromMarch = Math.floor((5 * dayOfYear + 2) / 153)
  const day = dayOfYear - Math.floor((153 * monthFromMarch + 2) / 5) + 1
  const month = monthFromMarch < 10 ? monthFromMarch + 3 : monthFromMarch - 9
  const year = yearOfEra + era * 400 + (month <= 2 ? 1 : 0)
  const hour = Math.floor(secondOfDay / 3_600)
  const minute = Math.floor((secondOfDay % 3_600) / 60)
  const second = secondOfDay % 60
  return `${pad(year, 4)}-${pad(month, 2)}-${pad(day, 2)}T${pad(hour, 2)}:${pad(minute, 2)}:${pad(second, 2)}`
}

function pad(value: number, width: number): string {
  return `${value}`.padStart(width, '0')
}
