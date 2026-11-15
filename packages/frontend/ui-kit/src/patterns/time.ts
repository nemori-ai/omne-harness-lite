import { useEffect, useReducer } from 'react'

export const AGE_TICK_MS = 30_000

const LANGUAGE = 'zh-CN'

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

export function formatRelative(iso: string | null, nowMs: number): string {
  if (iso === null) return '—'
  const then = Date.parse(iso)
  if (Number.isNaN(then)) return '—'
  const seconds = Math.max(0, Math.round((nowMs - then) / 1000))
  if (seconds < 45) return '刚刚'
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return `${minutes} 分钟前`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours} 小时前`
  const days = Math.round(hours / 24)
  if (days < 30) return `${days} 天前`
  const sameYear = new Date(then).getFullYear() === new Date(nowMs).getFullYear()
  return new Intl.DateTimeFormat(LANGUAGE, {
    month: 'short',
    day: 'numeric',
    ...(sameYear ? {} : { year: 'numeric' }),
  }).format(then)
}

function systemHourCycle(): 'h12' | 'h23' {
  const cycle = new Intl.DateTimeFormat(undefined, { hour: 'numeric' }).resolvedOptions().hourCycle
  return cycle === 'h11' || cycle === 'h12' ? 'h12' : 'h23'
}

export function formatInstant(iso: string, hourCycle: 'h12' | 'h23' = systemHourCycle()): string {
  const instant = Date.parse(iso)
  if (Number.isNaN(instant)) return ''
  const date = new Intl.DateTimeFormat(LANGUAGE, { dateStyle: 'full' }).format(instant)
  const clock = new Intl.DateTimeFormat(LANGUAGE, {
    hour: 'numeric',
    minute: '2-digit',
    hourCycle,
  }).format(instant)
  return `${date} ${clock}`
}
