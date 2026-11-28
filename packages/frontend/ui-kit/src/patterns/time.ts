import { useEffect, useReducer } from 'react'

export const AGE_TICK_MS = 30_000

const LANGUAGE = 'zh-CN'

const formats = new Map<string, Intl.DateTimeFormat>()

function formatOf(
  language: string | undefined,
  options: Intl.DateTimeFormatOptions,
): Intl.DateTimeFormat {
  const key = JSON.stringify([language ?? null, options])
  const held = formats.get(key)
  if (held !== undefined) return held
  const made = new Intl.DateTimeFormat(language, options)
  formats.set(key, made)
  return made
}

export function useAgeClock(
  active: boolean,
  now: () => number = Date.now,
  tickMs: number = AGE_TICK_MS,
): number {
  const [, tick] = useReducer((count: number) => count + 1, 0)
  useEffect(() => {
    if (!active) return
    const handle = setInterval(tick, tickMs)
    return () => clearInterval(handle)
  }, [active, tickMs])
  return now()
}

export type RelativeWords = Readonly<{
  justNow: string
  minutes: (count: number) => string
  hours: (count: number) => string
  days: (count: number) => string
}>

export const RELATIVE_WORDS: RelativeWords = {
  justNow: '刚刚',
  minutes: count => `${count} 分钟前`,
  hours: count => `${count} 小时前`,
  days: count => `${count} 天前`,
}

export function formatRelative(
  iso: string | null,
  nowMs: number,
  words: RelativeWords = RELATIVE_WORDS,
): string {
  if (iso === null) return '—'
  const then = Date.parse(iso)
  if (Number.isNaN(then)) return '—'
  const seconds = Math.max(0, Math.round((nowMs - then) / 1000))
  if (seconds < 45) return words.justNow
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return words.minutes(minutes)
  const hours = Math.round(minutes / 60)
  if (hours < 24) return words.hours(hours)
  const days = Math.round(hours / 24)
  if (days < 30) return words.days(days)
  const sameYear = new Date(then).getFullYear() === new Date(nowMs).getFullYear()
  return formatOf(LANGUAGE, {
    month: 'short',
    day: 'numeric',
    ...(sameYear ? {} : { year: 'numeric' }),
  }).format(then)
}

function systemHourCycle(): 'h12' | 'h23' {
  const cycle = formatOf(undefined, { hour: 'numeric' }).resolvedOptions().hourCycle
  return cycle === 'h11' || cycle === 'h12' ? 'h12' : 'h23'
}

export function formatInstant(iso: string, hourCycle: 'h12' | 'h23' = systemHourCycle()): string {
  const instant = Date.parse(iso)
  if (Number.isNaN(instant)) return ''
  const date = formatOf(LANGUAGE, { dateStyle: 'full' }).format(instant)
  const clock = formatOf(LANGUAGE, { hour: 'numeric', minute: '2-digit', hourCycle }).format(
    instant,
  )
  return `${date} ${clock}`
}
