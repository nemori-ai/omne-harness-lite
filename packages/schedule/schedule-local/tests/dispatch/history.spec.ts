// @module-tag slow
import { describe, expect, it } from 'vitest'
import type { ScheduleProgram } from '@omne-harness/schedule-local'
import { context } from '../storage/data.ts'
import { dispatchWorld, everyMinute, MINUTE, START } from './world.ts'

const at = (minutes: number) => new Date(START + minutes * MINUTE).toISOString()
const untilStopped: ScheduleProgram = {
  name: 'probe',
  run: (_input, { signal }) =>
    new Promise((_resolve, reject) =>
      signal.addEventListener('abort', () => reject(signal.reason)),
    ),
}
const work = { kind: 'program', programRef: 'probe', input: {} } as const

async function executions(
  w: Awaited<ReturnType<typeof dispatchWorld>>,
  scheduleId: string | null,
  cursor: string | null = null,
  limit = 50,
) {
  const page = await w.app.queries.executions(context, {
    scheduleId: scheduleId as never,
    from: null,
    to: null,
    cursor,
    limit,
  })
  if (page.kind !== 'ok') throw new Error(JSON.stringify(page))
  return page.value
}

describe('the history of a schedule and of a tenant', { tags: ['slow'], timeout: 300_000 }, () => {
  it('one page holds the disposed slots with their Jobs (interrupted by the restart) and the missed stretch, newest first; a cursor continues it', async () => {
    const w = await dispatchWorld({ programs: { probe: untilStopped }, gapMs: 2 * MINUTE })
    try {
      const id = await w.create(everyMinute(), 'history')
      const before = w.dispatcher()
      await before.round()
      for (const _ of [1, 2]) {
        w.time.advance(MINUTE)
        await before.round()
      }
      await before.close()
      w.time.setWall(START + 10 * MINUTE + 10_000)
      const after = w.dispatcher()
      await after.round()
      const page = await executions(w, id)
      expect(page.items.map(row => [row.kind, row.originalScheduledAt])).toEqual([
        ['lapse', at(3)],
        ['slot', at(2)],
        ['slot', at(1)],
      ])
      const [lapse, newest] = page.items
      expect(lapse).toMatchObject({
        kind: 'lapse',
        through: new Date(START + 10 * MINUTE + 10_000).toISOString(),
        count: 8,
        cause: 'stopped',
      })
      expect(newest).toMatchObject({
        kind: 'slot',
        run: { origin: 'due', startedAt: expect.any(String), endedAt: expect.any(String) },
        receipt: { disposition: 'acceptedExecution' },
        job: { body: { executionState: 'concluded', outcome: 'failed' } },
      })
      expect(page.total).toEqual({ kind: 'exact', value: 3 })
      const first = await executions(w, id, null, 2)
      expect(first.items.map(row => row.rowRef)).toEqual(
        page.items.slice(0, 2).map(row => row.rowRef),
      )
      const rest = await executions(w, id, first.nextCursor, 2)
      expect(rest.items.map(row => row.rowRef)).toEqual([page.items[2]?.rowRef])
      expect(rest.nextCursor).toBeNull()
      await after.close()
    } finally {
      await w.close()
    }
  })

  it('the tenant view also lists Jobs started outside any schedule', async () => {
    const w = await dispatchWorld({ programs: { probe: untilStopped } })
    try {
      const dispatcher = w.dispatcher()
      const started = await dispatcher.startDirect(work, 'direct-history')
      const page = await executions(w, null)
      expect(page.items).toMatchObject([
        {
          kind: 'direct',
          job: { jobId: started.jobId },
          run: { origin: 'system', startedAt: null, endedAt: null },
          rowRef: `direct:${started.jobId}`,
        },
      ])
      await dispatcher.close()
    } finally {
      await w.close()
    }
  })
})

describe('reading, cancelling and starting one Job', { tags: ['slow'], timeout: 300_000 }, () => {
  it('a Job reads with its work, where it runs and each step; a cancel commits once, is recalled by its key, and changes nothing again', async () => {
    const w = await dispatchWorld({ programs: { probe: untilStopped } })
    try {
      const id = await w.create(everyMinute(), 'one-job')
      const dispatcher = w.dispatcher()
      const jobs = w.facet(dispatcher)
      await dispatcher.round()
      w.time.advance(MINUTE)
      await dispatcher.round()
      const jobId = String(w.jobs(id)[0]?.['job_id'])
      const read = await jobs.get(context, { jobId: jobId as never })
      expect(read).toMatchObject({
        kind: 'ok',
        value: {
          scheduleId: id,
          purpose: { work },
          executionWhere: { kind: 'program', programRef: 'probe' },
          events: [{ seq: 1, kind: 'accepted' }, { kind: 'startIntent' }, { kind: 'taken' }],
        },
      })
      const cancel = { jobId: jobId as never, operationKey: 'cancel-1' }
      expect(await jobs.cancel(context, cancel)).toMatchObject({
        kind: 'ok',
        value: { outcome: 'committed', detail: { job: { stopState: 'requested' } } },
      })
      expect(await jobs.queryCancel(context, cancel)).toMatchObject({
        kind: 'ok',
        value: { committed: true },
      })
      expect(
        await jobs.queryCancel(context, { ...cancel, operationKey: 'cancel-other' }),
      ).toMatchObject({ kind: 'ok', value: { committed: false } })
      expect(await jobs.cancel(context, { ...cancel, operationKey: 'cancel-2' })).toMatchObject({
        kind: 'ok',
        value: { outcome: 'noChange' },
      })
      expect(
        await jobs.get(context, { jobId: '00000000-0000-4000-8000-000000000000' as never }),
      ).toMatchObject({ kind: 'error', error: { code: 'not_found' } })
      await dispatcher.close()
    } finally {
      await w.close()
    }
  })

  it('a direct start commits once under its key; the same key answers the same Job; other work under that key is a conflict', async () => {
    const w = await dispatchWorld({ programs: { probe: untilStopped } })
    try {
      const dispatcher = w.dispatcher()
      const jobs = w.facet(dispatcher)
      const request = { work, operationKey: 'start-1' }
      const first = await jobs.start(context, request)
      expect(first).toMatchObject({
        kind: 'ok',
        value: {
          outcome: 'committed',
          detail: { scheduleId: null, purpose: { work }, run: { origin: context.actor.kind } },
        },
      })
      const again = await jobs.start(context, request)
      expect(again.kind === 'ok' && again.value.detail?.job.jobId).toBe(
        first.kind === 'ok' && first.value.detail?.job.jobId,
      )
      expect(await jobs.queryStart(context, request)).toMatchObject({
        kind: 'ok',
        value: { committed: true },
      })
      expect(
        await jobs.queryStart(context, { ...request, operationKey: 'start-unused' }),
      ).toMatchObject({ kind: 'ok', value: { committed: false, detail: null } })
      const other = { ...request, work: { ...work, input: { other: true } } }
      expect(await jobs.start(context, other)).toMatchObject({
        kind: 'error',
        error: { code: 'operation_key_conflict' },
      })
      expect(await jobs.queryStart(context, other)).toMatchObject({
        kind: 'error',
        error: { code: 'operation_key_conflict' },
      })
      await dispatcher.close()
    } finally {
      await w.close()
    }
  })
})
