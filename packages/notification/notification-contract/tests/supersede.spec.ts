import { describe, expect, it } from 'vitest'
import { supersede, UNMARKED, type NotificationRecord } from '@omne-harness/notification-contract'
import { at, event, identity, person } from './fixtures.ts'

const record = (
  eventId: string,
  overrides: Partial<NotificationRecord> = {},
): NotificationRecord => ({
  identity: identity(eventId),
  recipient: person,
  sequence: 1,
  level: 'weak',
  cause: { kind: 'type-default' },
  acceptedAt: at(0),
  marks: UNMARKED,
  replaceKey: 'progress',
  ...overrides,
})

describe('supersede', () => {
  const incoming = identity('new')

  it('answers nothing when the event has no replace key', () => {
    expect(supersede(incoming, event(), [record('old')])).toEqual([])
  })

  it('takes every earlier notification with the same key, resolved or not', () => {
    const box = [
      record('open'),
      record('done', { marks: { ...UNMARKED, resolved: { how: 'done', at: at(1) } } }),
      record('dismissed', { marks: { ...UNMARKED, resolved: { how: 'dismissed', at: at(1) } } }),
      record('replaced', { marks: { ...UNMARKED, supersededBy: identity('open') } }),
    ]
    expect(supersede(incoming, event({ replaceKey: 'progress' }), box)).toEqual(
      box.map(entry => entry.identity),
    )
  })

  it('leaves another key, a keyless notification and the incoming one alone', () => {
    const box = [
      record('other', { replaceKey: 'other' }),
      record('none', { replaceKey: null }),
      record('new'),
    ]
    expect(supersede(incoming, event({ replaceKey: 'progress' }), box)).toEqual([])
  })
})
