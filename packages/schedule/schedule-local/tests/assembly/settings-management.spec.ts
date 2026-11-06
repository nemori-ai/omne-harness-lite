import { expect, it } from 'vitest'
import { ScheduleDefinitionSchema, ScheduleInstantSchema } from '@omne-harness/schedule-contract'
import { settingsWorld } from './settings-world.ts'

const definition = ScheduleDefinitionSchema.parse({
  label: 'Settings-backed workday reminder',
  recurrence: {
    kind: 'cron',
    expression: '0 9 * * *',
    begin: '2026-11-05T00:00:00',
    until: '2026-11-10T23:59:59',
  },
  binding: { kind: 'followUserEnvironment' },
  calendarOverlay: { predicate: 'workingDay', adjust: 'skip' },
  limits: { eligibleLimit: null, jobLimit: null, excludeDates: [] },
  purpose: {
    kind: 'reminder',
    content: { title: null, body: 'Read the daily report' },
    admissionPolicy: 'reminder-window-v1',
    overlap: 'parallel',
  },
})
const preview = {
  source: { kind: 'inline' as const, definition },
  after: ScheduleInstantSchema.parse('2026-11-04T00:00:00.000Z'),
  count: 2,
}

it('uses real Settings through both Cordis providers and persists the management lifecycle', async () => {
  const world = await settingsWorld()
  try {
    const first = await world.app.queries.preview(world.context, preview)
    expect(first).toMatchObject({
      kind: 'ok',
      value: {
        complete: true,
        candidates: [
          { scheduledAt: '2026-11-05T01:00:00.000Z' },
          { scheduledAt: '2026-11-06T01:00:00.000Z' },
        ],
      },
    })
    if (first.kind !== 'ok') throw new Error(JSON.stringify(first))
    expect(first.value.basis.environmentRevision).toBeTruthy()
    expect(first.value.basis.calendarVersionId).toBe(world.snapshot.versionId)
    const request = {
      definition,
      initial: { kind: 'active' as const },
      meta: { operationKey: 'settings-create', expectedRevision: null, consentRef: null },
    }
    const created = await world.app.commands.create(world.context, request)
    expect(created).toMatchObject({
      kind: 'committed',
      replayed: false,
      value: { control: 'active', revision: 1 },
    })
    if (created.kind !== 'committed') throw new Error(JSON.stringify(created))
    const id = created.value.scheduleId
    expect(created.value.nextOccurrence?.basis).toEqual({
      ...first.value.basis,
      definitionRevision: 1,
    })
    expect(await world.app.commands.create(world.context, request)).toMatchObject({
      kind: 'committed',
      replayed: true,
      value: { scheduleId: id, revision: 1 },
    })
    expect(
      await world.app.commands.queryOperation(world.context, {
        kind: 'ref',
        operationRef: created.operationRef,
      }),
    ).toMatchObject({ kind: 'ok', value: { kind: 'committed', result: { scheduleId: id } } })
    for (const [action, expectedRevision, control] of [
      ['pause', 1, 'paused'],
      ['resume', 2, 'active'],
      ['stop', 3, 'stopped'],
    ] as const) {
      const result = await world.app.commands.execute(world.context, {
        action,
        reason: null,
        scheduleId: id,
        meta: { operationKey: `settings-${action}`, expectedRevision, consentRef: null },
      })
      expect(result).toMatchObject({
        kind: 'committed',
        value: { scheduleId: id, control, revision: expectedRevision + 1 },
      })
    }
    expect(world.schedule.sql('SELECT count(*) AS count FROM sc_schedules')).toEqual([{ count: 1 }])
    expect(world.schedule.sql('SELECT count(*) AS count FROM sc_revisions')).toEqual([{ count: 4 }])
    expect(
      world.schedule.sql('SELECT count(*) AS count FROM fixture_schedule_quota WHERE held = 1'),
    ).toEqual([{ count: 0 }])
  } finally {
    await world.close()
  }
})

it('observes setting changes and membership removal without creating schedule facts', async () => {
  const world = await settingsWorld()
  try {
    const before = await world.app.queries.preview(world.context, preview)
    expect(before.kind).toBe('ok')
    expect(
      await world.settings.change('timezone', { kind: 'set', value: 'Asia/Tokyo' }, 2),
    ).toMatchObject({ kind: 'committed' })
    expect(await world.app.queries.preview(world.context, preview)).toMatchObject({
      kind: 'error',
      error: { code: 'environment_incoherent' },
    })
    expect(
      await world.settings.change('timezone', { kind: 'set', value: 'Asia/Shanghai' }, 3),
    ).toMatchObject({ kind: 'committed' })
    const after = await world.app.queries.preview(world.context, preview)
    expect(after).toMatchObject({
      kind: 'ok',
      value: {
        candidates: [
          { scheduledAt: '2026-11-05T01:00:00.000Z' },
          { scheduledAt: '2026-11-06T01:00:00.000Z' },
        ],
      },
    })
    if (before.kind !== 'ok' || after.kind !== 'ok') throw new Error('Expected complete previews')
    expect(after.value.basis.environmentRevision).not.toBe(before.value.basis.environmentRevision)
    await world.settings.removeMember()
    expect(await world.app.queries.preview(world.context, preview)).toMatchObject({
      kind: 'error',
      error: { code: 'authority_unavailable' },
    })
    expect(world.schedule.sql('SELECT * FROM sc_schedules')).toEqual([])
    expect(world.schedule.sql('SELECT * FROM sc_revisions')).toEqual([])
    expect(world.schedule.sql('SELECT * FROM sc_outbox')).toEqual([])
  } finally {
    await world.close()
  }
})
