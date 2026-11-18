import { parseInstant } from '@omne-harness/utc-instant'
import type { Entry } from '../../src/model/inbox-machine.ts'

export const instant = (text = '2026-11-18T06:00:00.000Z') => {
  const parsed = parseInstant(text)
  if (!parsed.ok) throw new Error('fixture instant')
  return parsed.value
}

export const NONE = { seenAt: null, resolved: null, supersededBy: null } as const

export function entry(event: string, sequence: number, more: Partial<Entry> = {}): Entry {
  return {
    source: 'demo.things',
    event,
    recipient: { kind: 'person' },
    sequence,
    type: 'changed',
    title: `Title ${event}`,
    level: 'weak',
    cause: { kind: 'type-default' },
    acceptedAt: instant(),
    marks: NONE,
    ...more,
  }
}

export const seen = { ...NONE, seenAt: instant() }
export const done = { ...seen, resolved: { how: 'done' as const, at: instant() } }
export const dismissed = { ...NONE, resolved: { how: 'dismissed' as const, at: instant() } }
export const superseded = { ...NONE, supersededBy: { source: 'demo.things', event: 'newer' } }

export const page = (entries: readonly Entry[], next: number | null = null) =>
  ({ outcome: 'succeeded', body: { entries: [...entries], next } }) as const

export const view = (item: Entry, body = 'Body') => ({
  ...item,
  subject: 'repo/a',
  at: instant('2026-11-18T05:59:00.000Z'),
  body,
  locator: null,
})
