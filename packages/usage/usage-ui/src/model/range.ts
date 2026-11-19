export const RANGES = ['today', 'week', 'month', 'quarter'] as const
export type RangeChoice = (typeof RANGES)[number]

export const RANGE_LABELS: Readonly<Record<RangeChoice, string>> = {
  today: '今天',
  week: '7 天',
  month: '30 天',
  quarter: '90 天',
}

const DAYS: Readonly<Record<RangeChoice, number>> = { today: 1, week: 7, month: 30, quarter: 90 }

export type RangeWindow = Readonly<{ since: Date; before: Date; bucket: 'hour' | 'day' }>

/** Whole local days ending with today, so that day and hour buckets start on the zone's boundaries. */
export function windowOf(choice: RangeChoice, now: Date): RangeWindow {
  const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1)
  const since = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1 - DAYS[choice])
  return { since, before: tomorrow, bucket: choice === 'today' ? 'hour' : 'day' }
}
