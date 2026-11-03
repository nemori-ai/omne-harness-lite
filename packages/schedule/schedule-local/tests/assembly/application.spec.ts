import { expect, it } from 'vitest'
import type { Worker } from 'node:worker_threads'
import { createScheduleLocalApplication } from '@omne-harness/schedule-local'
import {
  createScheduleOperationIntent,
  fingerprintScheduleOperation,
  ScheduleInstantSchema,
  ScheduleCivilSchema,
} from '@omne-harness/schedule-contract'
import { openWorld } from '../storage/world.ts'
import { context, definition } from '../storage/data.ts'
import { localOptions, now } from './fixture.ts'

it('composes real SQL, worker, prediction and management with read-only queries', async () => {
  const world = await openWorld()
  const app = await createScheduleLocalApplication(localOptions(world))
  try {
    const input = {
      definition,
      initial: { kind: 'active' as const },
      meta: { operationKey: 'assembly-create', expectedRevision: null, consentRef: null },
    }
    const created = await app.commands.create(context, input)
    expect(created.kind).toBe('committed')
    if (created.kind !== 'committed') throw new Error(JSON.stringify(created))
    const id = created.value.scheduleId
    const replay = await app.commands.create(context, input)
    expect(replay).toMatchObject({
      kind: 'committed',
      replayed: true,
      operationRef: created.operationRef,
      value: { scheduleId: id },
    })
    const intent = { kind: 'create' as const, owner: context.owner, input }
    expect(
      await app.commands.queryOperation(context, {
        kind: 'identity',
        identity: createScheduleOperationIntent(intent).address,
        expectedFingerprint: fingerprintScheduleOperation(intent),
      }),
    ).toMatchObject({
      kind: 'ok',
      value: { kind: 'committed', operationRef: created.operationRef },
    })
    const stored = await app.queries.preview(context, {
      source: { kind: 'schedule', scheduleId: id },
      after: now,
      count: 1,
    })
    const inline = await app.queries.preview(context, {
      source: { kind: 'inline', definition },
      after: now,
      count: 1,
    })
    expect(stored.kind).toBe('ok')
    expect(inline.kind).toBe('ok')
    if (stored.kind !== 'ok' || inline.kind !== 'ok') throw new Error('Expected preview')
    expect(stored.value.candidates.map(c => c.scheduledAt)).toEqual(
      inline.value.candidates.map(c => c.scheduledAt),
    )
    expect(stored.value.candidates[0]?.scheduledAt).toBe(
      ScheduleInstantSchema.parse('2026-11-05T09:00:00.000Z'),
    )
    expect(await app.queries.get(context, { scheduleId: id })).toEqual({
      kind: 'ok',
      value: created.value,
    })
    expect(
      await app.queries.agenda(context, {
        from: ScheduleCivilSchema.parse('2026-11-04T00:00:00'),
        to: ScheduleCivilSchema.parse('2026-11-06T00:00:00'),
        timezone: 'UTC',
        filter: {
          agentRef: null,
          control: null,
          standing: null,
          createdBy: null,
          targetDeviceRef: null,
          calendarId: null,
          purpose: null,
        },
        cursor: null,
        limit: 50,
      }),
    ).toMatchObject({ kind: 'ok', value: { complete: true, total: { kind: 'exact', value: 1 } } })
    const paused = await app.commands.execute(context, {
      action: 'pause',
      scheduleId: id,
      reason: null,
      meta: {
        operationKey: 'assembly-pause',
        expectedRevision: created.value.revision,
        consentRef: null,
      },
    })
    expect(paused).toMatchObject({ kind: 'committed', value: { control: 'paused' } })
  } finally {
    await app.close()
    await world.close()
  }
})

it('closes admission before draining an accepted call and keeps borrowed storage alive', async () => {
  const world = await openWorld()
  const options = localOptions(world)
  let release!: () => void
  let entered!: () => void
  const arrived = new Promise<void>(resolve => {
    entered = resolve
  })
  const held = new Promise<void>(resolve => {
    release = resolve
  })
  const observe = options.query.authorizer.observe
  options.query.authorizer.observe = async input => {
    entered()
    await held
    return observe(input)
  }
  const app = await createScheduleLocalApplication(options)
  try {
    const pending = app.queries.preview(context, {
      source: { kind: 'inline', definition },
      after: now,
      count: 1,
    })
    await arrived
    const closing = app.close()
    expect(app.close()).toBe(closing)
    let closed = false
    void closing.then(() => {
      closed = true
    })
    expect(
      await app.queries.preview(context, {
        source: { kind: 'inline', definition },
        after: now,
        count: 1,
      }),
    ).toMatchObject({ kind: 'error', error: { code: 'dependency_blocked' } })
    expect(closed).toBe(false)
    release()
    expect((await pending).kind).toBe('ok')
    await closing
    await world.configure()
  } finally {
    release()
    await app.close()
    await world.close()
  }
})

it('rejects invalid query configuration and cleans the owned worker', async () => {
  const world = await openWorld()
  const threads: Worker[] = []
  const observeWorker = (worker: Worker) => threads.push(worker)
  process.on('worker', observeWorker)
  try {
    const options = localOptions(world)
    const invalid = {
      ...options,
      query: { ...options.query, limits: { ...options.query.limits, maxAgendaRows: 5001 } },
    }
    await expect(createScheduleLocalApplication(invalid)).rejects.toThrow()
    expect(threads.length).toBeGreaterThan(0)
    expect(threads.every(worker => worker.threadId === -1)).toBe(true)
    await world.configure()
  } finally {
    process.off('worker', observeWorker)
    await Promise.all(threads.map(worker => worker.terminate()))
    await world.close()
  }
})
