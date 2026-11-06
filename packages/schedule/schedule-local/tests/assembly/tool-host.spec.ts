import { readFile } from 'node:fs/promises'
import { expect, it } from 'vitest'
import { calendarResolveSchema, calendarResolveResultSchema } from '@omne-harness/calendar-contract'
import { SchedulePreviewRequestSchema } from '@omne-harness/schedule-contract'
import { scheduleToolResultSchema } from '@omne-harness/schedule-tools'
import { openToolHostWorld } from './tool-host-world.ts'
import { value } from './tool-host-values.ts'
import { definition } from '../storage/data.ts'

const create = {
  action: 'create',
  input: {
    definition,
    initial: { kind: 'active' },
    meta: { expectedRevision: null, consentRef: null },
  },
}

it('requires the real host and loads both domain Cordis tools through its loader', async () => {
  await expect(openToolHostWorld({ host: false })).rejects.toThrow('Real Tool host is required')
  const world = await openToolHostWorld()
  try {
    expect(world.registeredNames()).toEqual(['Calendar', 'Schedule'])
    expect(world.loadedNames.sort()).toEqual(['Calendar', 'Schedule'])
  } finally {
    await world.close()
  }
})

it('matches direct Calendar resolve and Schedule preview on released 2026 seed dates', async () => {
  const world = await openToolHostWorld()
  try {
    const input = calendarResolveSchema.parse({
      selection: { kind: 'explicit', calendarId: 'cn-legal-holidays' },
      version: { kind: 'latest' },
      query: { kind: 'day', date: '2026-02-14' },
    })
    const calendar = await world.invoke('Calendar', { action: 'resolve', input })
    expect(calendar.terminal.kind).toBe('completed')
    expect(calendarResolveResultSchema.parse(calendar.returned)).toEqual(
      await world.queries.resolve(world.context, input),
    )
    const preview = SchedulePreviewRequestSchema.parse(
      JSON.parse(
        await readFile(new URL('../../examples/calendar-preview.json', import.meta.url), 'utf8'),
      ),
    )
    const tool = await world.invoke('Schedule', { action: 'preview', input: preview })
    const result = scheduleToolResultSchema.parse(tool.returned)
    expect(result).toMatchObject({ kind: 'result', action: 'preview' })
    if (result.kind !== 'result' || result.action !== 'preview' || result.result.kind !== 'ok')
      throw new Error(JSON.stringify(result))
    expect(result.result).toEqual(await world.app.queries.preview(world.context, preview))
    expect(result.result.value.candidates.map(candidate => candidate.adjustedLocal)).toEqual([
      '2026-02-14T09:00:00',
      '2026-02-24T09:00:00',
      '2026-02-25T09:00:00',
      '2026-02-26T09:00:00',
      '2026-02-27T09:00:00',
      '2026-02-28T09:00:00',
    ])
    expect(result.result.value.basis.calendarVersionId).toBe(world.snapshot.versionId)
    expect(tool.output.content.length).toBeGreaterThan(0)
    expect(world.schedule.sql('SELECT * FROM sc_schedules')).toEqual([])
    expect(world.schedule.sql('SELECT * FROM sc_outbox')).toEqual([])
  } finally {
    await world.close()
  }
})

it('recovers the fixed Tool call through a reconstructed ledger and persists one Schedule lifecycle', async () => {
  const world = await openToolHostWorld()
  try {
    const prepared = await world.prepare('Schedule', create, 'persistent-create')
    const firstEnvironment = await world.environment(prepared)
    const first = await world.execute(prepared, Promise.resolve(firstEnvironment))
    const created = scheduleToolResultSchema.parse(first.returned)
    if (
      created.kind !== 'result' ||
      created.action !== 'create' ||
      created.result.kind !== 'committed'
    )
      throw new Error(JSON.stringify(created))
    expect(world.schedule.sql('SELECT * FROM sc_schedules')).toHaveLength(1)
    world.rebuildLedger()
    expect(value(await world.loadRecovery('persistent-create'))).toEqual(prepared.recovery)
    const recoveredEnvironment = await world.environment(prepared, true)
    expect(recoveredEnvironment.schedule).toEqual(firstEnvironment.schedule)
    const replay = scheduleToolResultSchema.parse(
      (await world.execute(prepared, Promise.resolve(recoveredEnvironment), 'reconnected'))
        .returned,
    )
    expect(replay).toMatchObject({
      kind: 'result',
      action: 'create',
      operation: created.operation,
      result: {
        kind: 'committed',
        replayed: true,
        operationRef: created.result.operationRef,
        value: { scheduleId: created.result.value.scheduleId },
      },
    })
    expect(world.schedule.sql('SELECT * FROM sc_schedules')).toHaveLength(1)
    const queried = await world.invoke('Schedule', {
      action: 'queryOperation',
      input: created.operation,
    })
    expect(queried.returned).toMatchObject({
      kind: 'result',
      result: {
        kind: 'ok',
        value: { kind: 'committed', operationRef: created.result.operationRef },
      },
    })
    let revision = created.result.value.revision
    for (const [action, control] of [
      ['pause', 'paused'],
      ['resume', 'active'],
      ['stop', 'stopped'],
    ] as const) {
      const result = scheduleToolResultSchema.parse(
        (
          await world.invoke('Schedule', {
            action: 'execute',
            input: {
              action,
              scheduleId: created.result.value.scheduleId,
              reason: null,
              meta: { expectedRevision: revision, consentRef: null },
            },
          })
        ).returned,
      )
      expect(result).toMatchObject({
        kind: 'result',
        result: { kind: 'committed', value: { control } },
      })
      if (
        result.kind !== 'result' ||
        result.action !== 'execute' ||
        result.result.kind !== 'committed'
      )
        throw new Error(JSON.stringify(result))
      revision = result.result.value.revision
    }
    const read = scheduleToolResultSchema.parse(
      (
        await world.invoke('Schedule', {
          action: 'get',
          input: { scheduleId: created.result.value.scheduleId },
        })
      ).returned,
    )
    expect(read).toMatchObject({
      kind: 'result',
      result: { kind: 'ok', value: { control: 'stopped' } },
    })
    if (read.kind !== 'result' || read.action !== 'get') throw new Error(JSON.stringify(read))
    expect(read.result).toEqual(
      await world.app.queries.get(world.context, { scheduleId: created.result.value.scheduleId }),
    )
    for (const row of value(world.bindings.snapshot({ scope: 'system' })))
      expect(value(world.bindings.pins(row.key))).toBe('0')
  } finally {
    await world.close()
  }
})

it.each(['denied', 'missing', 'call', 'tenant', 'admission'] as const)(
  'rejects %s recovered context without SQL business effects',
  async fault => {
    const world = await openToolHostWorld()
    try {
      world.setContextFault(fault)
      const result = await world.invoke('Schedule', create)
      expect(result.returned).toMatchObject({
        kind: 'adapterFailure',
        action: 'create',
        operation: null,
      })
      for (const table of [
        'sc_schedules',
        'sc_definitions',
        'sc_revisions',
        'sc_observations',
        'sc_operations',
        'sc_outbox',
      ])
        expect(world.schedule.sql(`SELECT * FROM ${table}`)).toEqual([])
    } finally {
      await world.close()
    }
  },
)

it('unregisters contributions and prevents new Tool calls after withdrawal', async () => {
  const world = await openToolHostWorld()
  try {
    await world.withdrawDomain()
    expect(world.registeredNames()).toEqual([])
    await expect(world.invoke('Schedule', create)).rejects.toThrow('unknown-tool')
    expect(world.schedule.sql('SELECT * FROM sc_schedules')).toEqual([])
  } finally {
    await world.close()
  }
})

it('releases acquired leases once and leaves a supplied domain world owned by its caller', async () => {
  const { seededWorld } = await import('./seeded-world.ts')
  const domain = await seededWorld()
  const world = await openToolHostWorld({ world: domain })
  try {
    await world.invoke('Calendar', { action: 'effective' })
    const closing = world.close()
    expect(world.close()).toBe(closing)
    await closing
    expect(world.releasedCalls).toHaveLength(1)
    expect(domain.root.get('calendarQuery')).toBeDefined()
    expect((await domain.queries.effective(domain.context)).kind).toBe('ok')
    expect(world.bindings.snapshot({ scope: 'system' })).toHaveProperty(
      'failure.kind',
      'unavailable',
    )
  } finally {
    await world.close()
    await domain.close()
  }
})

it('settles malformed arguments as a failed real execution without domain writes', async () => {
  const world = await openToolHostWorld()
  try {
    const result = await world.invoke('Schedule', { action: 'create' })
    expect(result.terminal).toMatchObject({ kind: 'failed', cause: 'executor' })
    expect(result.returned).toBeUndefined()
    expect(result.output.content.length).toBeGreaterThan(0)
    for (const table of [
      'sc_schedules',
      'sc_definitions',
      'sc_revisions',
      'sc_observations',
      'sc_operations',
      'sc_outbox',
    ]) {
      expect(world.schedule.sql(`SELECT * FROM ${table}`)).toEqual([])
    }
  } finally {
    await world.close()
  }
})
