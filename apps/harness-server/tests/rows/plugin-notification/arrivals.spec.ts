import { sendRequestSchema, sourceNameSchema } from '@omne-harness/notification-contract'
import { describe, expect, it } from 'vitest'
import {
  CATEGORY_ADDED,
  POINT_ADDED,
  arrivalRequest,
  arrivals,
  type ExtensionShape,
} from '../../../src/rows/plugin-notification/arrivals.ts'

const shape = (
  points: Record<string, string>,
  categories: Record<string, string> = {},
): ExtensionShape => ({
  points: new Map(Object.entries(points)),
  categories: new Map(Object.entries(categories)),
})

describe('what the extensions tell as one-time events', () => {
  it('a point or a category that is there now and was not before arrives; one that went or changed its words does not', () => {
    const before = shape(
      { 'skill.skills': 'Skills.', 'shell.tokens': 'Tokens.' },
      { skill: 'Skills' },
    )
    const now = shape(
      { 'skill.skills': 'Skills, now with more.', 'note.notes': 'Notes.' },
      { skill: 'Skills', note: 'Notes' },
    )
    expect(arrivals(before, now)).toEqual([
      { type: CATEGORY_ADDED, name: 'note', says: 'Notes' },
      { type: POINT_ADDED, name: 'note.notes', says: 'Notes.' },
    ])
    expect(arrivals(now, now)).toEqual([])
  })

  it('is told as a send Notification takes, identified by the arrival so that telling it again is recalled', () => {
    const source = sourceNameSchema.parse('extensions.changes')
    const request = arrivalRequest(
      source,
      'tenant/o/a',
      { type: POINT_ADDED, name: 'note.notes', says: 'Notes.' },
      '2026-11-23T12:00:00.000Z',
    )
    expect(sendRequestSchema.safeParse(request).success).toBe(true)
    expect(request.identity).toEqual({
      tenant: 'tenant/o/a',
      source,
      eventId: 'point-added:note.notes',
    })
    expect(request.event.content).toEqual({
      title: '多了一个点 note.notes',
      body: 'Notes.',
      locator: null,
    })
  })
})
