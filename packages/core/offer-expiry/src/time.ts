import { type Branded, type Parsed, invalidInput, ok } from '@omne-harness-lite/identity-values'

/**
 * 时间点：品牌化的毫秒整数（Unix epoch）。交换表示是带时区偏移的 RFC 3339 字符串（S-22），
 * 只在边界解析与格式化；比较按时间点语义，不按字符串字典序。
 * Node 24 没有稳定的 Temporal，按节点设计退到毫秒整数。
 */
export type Instant = Branded<number, 'Instant'>

/** 时长：品牌化的正整数毫秒（S-14：取值必须为正）。 */
export type Duration = Branded<number, 'Duration'>

const RFC3339 =
  /^([0-9]{4})-([0-9]{2})-([0-9]{2})[Tt]([0-9]{2}):([0-9]{2}):([0-9]{2})(?:\.([0-9]+))?([Zz]|[+-][0-9]{2}:[0-9]{2})$/

export function instantFromEpochMs(value: unknown): Parsed<Instant> {
  if (typeof value !== 'number' || !Number.isSafeInteger(value)) {
    return invalidInput('Instant: not an integer millisecond value')
  }
  return ok(value as Instant)
}

function calendarMatches(
  check: Date,
  year: string,
  month: string,
  day: string,
  hour: string,
  minute: string,
  second: string,
): boolean {
  return (
    check.getUTCFullYear() === Number(year) &&
    check.getUTCMonth() === Number(month) - 1 &&
    check.getUTCDate() === Number(day) &&
    check.getUTCHours() === Number(hour) &&
    check.getUTCMinutes() === Number(minute) &&
    check.getUTCSeconds() === Number(second)
  )
}

function offsetMilliseconds(offset: string): number | undefined {
  if (offset === 'Z' || offset === 'z') return 0
  const sign = offset.startsWith('-') ? -1 : 1
  const [oh, om] = offset.slice(1).split(':') as [string, string]
  if (Number(oh) > 23 || Number(om) > 59) return undefined
  return sign * (Number(oh) * 60 + Number(om)) * 60_000
}

/** 解析 RFC 3339 时间点；日期（无时刻）与无偏移的串一律拒绝，与 Schema 的 pattern 一致。 */
export function instantFromRfc3339(value: unknown): Parsed<Instant> {
  if (typeof value !== 'string') return invalidInput('Instant: not a string')
  const match = RFC3339.exec(value)
  if (match === null) return invalidInput('Instant: not an RFC 3339 date-time')
  const [, y, mo, d, h, mi, s, frac, offset] = match as unknown as [
    string,
    string,
    string,
    string,
    string,
    string,
    string,
    string | undefined,
    string,
  ]
  const millis = frac === undefined ? 0 : Number(`0.${frac}`) * 1000
  // Date.UTC remaps years 0..99 to 1900..1999; setUTCFullYear preserves
  // the four-digit RFC 3339 year, including leap year 0000.
  const check = new Date(0)
  check.setUTCFullYear(Number(y), Number(mo) - 1, Number(d))
  check.setUTCHours(Number(h), Number(mi), Number(s), 0)
  const base = check.getTime()
  if (Number.isNaN(base)) return invalidInput('Instant: invalid calendar value')
  // 拒绝 Date setters 会静默进位的值（如 2026-02-30）。
  if (!calendarMatches(check, y, mo, d, h, mi, s)) {
    return invalidInput('Instant: invalid calendar value')
  }
  const offsetMs = offsetMilliseconds(offset)
  if (offsetMs === undefined) return invalidInput('Instant: invalid offset')
  return ok(Math.round(base + millis - offsetMs) as Instant)
}

/**
 * 规范书写：通常为 UTC 三位毫秒；UTC 年界外采用合法偏移保留四位年。
 * 无法在 RFC 3339 四位年范围表示时抛 RangeError，不夹紧或截断时间点。
 */
export function instantToRfc3339(instant: Instant): string {
  const utc = new Date(instant)
  const year = utc.getUTCFullYear()
  if (year >= 0 && year <= 9999) return utc.toISOString()

  const offsetMinutes = year < 0 ? 1439 : -1439
  const local = new Date(instant + offsetMinutes * 60_000)
  const localYear = local.getUTCFullYear()
  if (!(localYear >= 0 && localYear <= 9999)) {
    throw new RangeError('Instant: cannot be represented within the RFC 3339 four-digit year range')
  }
  const offset = year < 0 ? '+23:59' : '-23:59'
  return `${local.toISOString().slice(0, -1)}${offset}`
}

export function compareInstants(a: Instant, b: Instant): -1 | 0 | 1 {
  return a < b ? -1 : a > b ? 1 : 0
}

export function addDuration(instant: Instant, duration: Duration): Instant {
  return (instant + duration) as Instant
}

const ISO_DURATION = /^P(?:(\d+)W|(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?)$/

/**
 * S-14 的 `offer_ttl` 解析：正整数毫秒，或 ISO 8601 时长（`P7D`、`PT1H30M`、`P2W`；不含年月，因为不定长）。
 * 非正、非有限、不合形状 ⇒ `invalidInput`。缺席（`undefined`）不进解析器——由调用方分流到默认值。
 */
export function parseOfferTtl(value: unknown): Parsed<Duration> {
  if (typeof value === 'number') {
    if (!Number.isSafeInteger(value) || value <= 0) {
      return invalidInput('offer_ttl: must be a positive integer number of milliseconds')
    }
    return ok(value as Duration)
  }
  if (typeof value === 'string') {
    const match = ISO_DURATION.exec(value)
    if (match === null || value === 'P' || value.endsWith('T')) {
      return invalidInput('offer_ttl: not an ISO 8601 duration')
    }
    const [, weeks, days, hours, minutes, seconds] = match
    const total =
      Number(weeks ?? 0) * 7 * 86_400_000 +
      Number(days ?? 0) * 86_400_000 +
      Number(hours ?? 0) * 3_600_000 +
      Number(minutes ?? 0) * 60_000 +
      Number(seconds ?? 0) * 1000
    if (!Number.isSafeInteger(total) || total <= 0) {
      return invalidInput('offer_ttl: must be positive')
    }
    return ok(total as Duration)
  }
  return invalidInput('offer_ttl: not a number or ISO 8601 duration')
}

/**
 * 时间源的形状（S-16）：只定形状，不给实现；实现归装配（`infra/clock`）。
 * `'unavailable'` 是返回值不是异常，消费者无法不接。
 */
export interface Clock {
  now(): Instant | 'unavailable'
}
