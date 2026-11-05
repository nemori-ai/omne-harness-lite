import { readFile } from 'node:fs/promises'
import { expect, it } from 'vitest'
import {
  SchedulePreviewRequestSchema,
  ScheduleDefinitionSchema,
  ScheduleInstantSchema,
} from '@omne-harness/schedule-contract'
import { seededWorld } from './seeded-world.ts'

async function request() {
  return SchedulePreviewRequestSchema.parse(
    JSON.parse(
      await readFile(new URL('../../examples/calendar-preview.json', import.meta.url), 'utf8'),
    ),
  )
}

it('uses released CN holidays and make-up Saturdays through both real Cordis providers without writes', async () => {
  const world = await seededWorld()
  try {
    const input = await request()
    const before = world.schedule.sql('SELECT * FROM sc_schedules')
    const first = await world.app.queries.preview(world.context, input)
    expect(first.kind).toBe('ok')
    if (first.kind !== 'ok') throw new Error(JSON.stringify(first))
    expect(first.value.complete).toBe(true)
    expect(first.value.candidates.map(item => item.adjustedLocal)).toEqual([
      '2026-02-14T09:00:00',
      '2026-02-24T09:00:00',
      '2026-02-25T09:00:00',
      '2026-02-26T09:00:00',
      '2026-02-27T09:00:00',
      '2026-02-28T09:00:00',
    ])
    expect(first.value.basis.calendarVersionId).toBe(world.snapshot.versionId)
    expect(first.value.excluded).toHaveLength(9)
    expect(await world.app.queries.preview(world.context, input)).toEqual(first)
    expect(world.schedule.sql('SELECT * FROM sc_schedules')).toEqual(before)
    expect(world.schedule.sql('SELECT * FROM sc_revisions')).toEqual([])
    expect(world.schedule.sql('SELECT * FROM sc_outbox')).toEqual([])
  } finally {
    await world.close()
  }
})

it.each([
  { adjust: 'nextWorkingDay', index: 1, date: '2026-02-24T09:00:00' },
  { adjust: 'previousWorkingDay', index: 0, date: '2026-02-14T09:00:00' },
] as const)(
  'moves holidays with $adjust and preserves collisions and environment revision',
  async ({ adjust, index, date }) => {
    const world = await seededWorld()
    try {
      const original = await request()
      if (original.source.kind !== 'inline') throw new Error('Expected inline fixture')
      const input = SchedulePreviewRequestSchema.parse({
        ...original,
        source: {
          kind: 'inline',
          definition: {
            ...original.source.definition,
            binding: { kind: 'followUserEnvironment' },
            calendarOverlay: { predicate: 'workingDay', adjust },
          },
        },
      })
      const result = await world.app.queries.preview(world.context, input)
      expect(result.kind, JSON.stringify(result)).toBe('ok')
      if (result.kind !== 'ok') throw new Error(JSON.stringify(result))
      expect(result.value.basis.environmentRevision).toBe('fixture-environment:1')
      expect(result.value.candidates[index]).toMatchObject({
        adjustedLocal: date,
        sourceKeys: expect.any(Array),
      })
      expect(result.value.candidates[index]?.sourceKeys).toHaveLength(10)
      expect(result.value.candidates).toHaveLength(6)
    } finally {
      await world.close()
    }
  },
)

it('reports missing seed coverage instead of a successful empty preview', async () => {
  const world = await seededWorld()
  try {
    const original = await request()
    if (original.source.kind !== 'inline') throw new Error('Expected inline fixture')
    const result = await world.app.queries.preview(world.context, {
      source: {
        kind: 'inline',
        definition: ScheduleDefinitionSchema.parse({
          ...original.source.definition,
          recurrence: {
            kind: 'cron',
            expression: '0 9 * * *',
            begin: '2027-01-04T00:00:00',
            until: '2027-01-04T23:59:59',
          },
        }),
      },
      after: ScheduleInstantSchema.parse('2027-01-01T00:00:00.000Z'),
      count: 1,
    })
    expect(result).toMatchObject({ kind: 'error', error: { code: 'coverage_insufficient' } })
  } finally {
    await world.close()
  }
})
