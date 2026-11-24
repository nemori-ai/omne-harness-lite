// @module-tag slow
import { describe, expect, it } from 'vitest'
import type { ScheduleProgram } from '@omne-harness/schedule-local'
import { dispatchWorld, everyMinute, MINUTE } from './world.ts'

/** A program each run of which waits until the test releases it, or until it is stopped. */
function probe() {
  const runs: { jobId: string; release: (result: boolean) => void; stopped: boolean }[] = []
  const log: string[] = []
  const program: ScheduleProgram = {
    name: 'probe',
    run: (_input, { signal, jobId }) =>
      new Promise((resolve, reject) => {
        const entry = { jobId, stopped: false, release: (result: boolean) => resolve({ result }) }
        runs.push(entry)
        log.push(`start:${runs.length}`)
        signal.addEventListener('abort', () => {
          entry.stopped = true
          log.push(`stop:${runs.indexOf(entry) + 1}`)
          reject(new Error('stopped'))
        })
      }),
  }
  return { program, runs, log }
}

const settle = () => new Promise(resolve => setImmediate(resolve))

function overlapped(policy: 'skip' | 'wait' | 'replace' | 'parallel') {
  const base = everyMinute()
  if (base.purpose.kind !== 'execution') throw new Error('execution expected')
  return { ...base, purpose: { ...base.purpose, overlap: policy } } as typeof base
}

async function world(policy: 'skip' | 'wait' | 'replace' | 'parallel' = 'parallel') {
  const p = probe()
  const w = await dispatchWorld({ programs: { probe: p.program } })
  const id = await w.create(overlapped(policy), `overlap-${policy}`)
  const dispatcher = w.dispatcher()
  await dispatcher.round()
  const next = async () => {
    w.time.advance(MINUTE)
    await dispatcher.round()
    await settle()
  }
  const states = () => w.jobs(id).map(job => job['state'])
  const outcomes = () =>
    w.rows(`SELECT job FROM sc_jobs WHERE schedule_id = '${id}' ORDER BY slot_at`).map(row => {
      const job = JSON.parse(String(row['job']))
      return [
        job.summary.body.executionState,
        job.summary.body.outcome,
        job.summary.stopState,
        job.reason,
      ]
    })
  return { p, w, id, dispatcher, next, states, outcomes }
}

describe(
  'a Job moves by its table: the executor runs registered programs',
  { tags: ['slow'], timeout: 300_000 },
  () => {
    it('a due slot becomes a Job that starts, runs and concludes succeeded when the program leaves a final result', async () => {
      const t = await world()
      try {
        await t.next()
        expect(t.states()).toEqual(['running'])
        t.p.runs[0]?.release(true)
        await settle()
        await t.dispatcher.round()
        expect(t.outcomes()).toEqual([['concluded', 'succeeded', 'none', null]])
        const [row] = t.w.rows(`SELECT job_id, job FROM sc_jobs WHERE schedule_id = '${t.id}'`)
        const events = t.w
          .rows(
            `SELECT seq, event FROM sc_job_events WHERE job_id = '${row?.['job_id']}' ORDER BY seq`,
          )
          .map(event => [Number(event['seq']), JSON.parse(String(event['event'])).kind])
        expect(events).toEqual([
          [1, 'accepted'],
          [2, 'startIntent'],
          [3, 'taken'],
          [4, 'ended'],
        ])
        expect(JSON.parse(String(row?.['job'])).summary.revision).toBe(4)
        await t.dispatcher.close()
      } finally {
        await t.w.close()
      }
    })

    it('a program that ends without a final result fails, saying so', async () => {
      const t = await world()
      try {
        await t.next()
        t.p.runs[0]?.release(false)
        await settle()
        await t.dispatcher.round()
        expect(t.outcomes()).toEqual([['concluded', 'failed', 'none', 'no-final-result']])
        await t.dispatcher.close()
      } finally {
        await t.w.close()
      }
    })

    it('skip: while the first runs, the next slot is skipped and no Job is made', async () => {
      const t = await world('skip')
      try {
        await t.next()
        await t.next()
        expect(t.w.receipts(t.id).map(item => item.disposition)).toEqual([
          'acceptedExecution',
          'skipped',
        ])
        expect(t.states()).toEqual(['running'])
        await t.dispatcher.close()
      } finally {
        await t.w.close()
      }
    })

    it('wait: the next Job waits, and starts once the first has concluded', async () => {
      const t = await world('wait')
      try {
        await t.next()
        await t.next()
        expect(t.states()).toEqual(['running', 'waiting'])
        t.p.runs[0]?.release(true)
        await settle()
        await t.dispatcher.round()
        await settle()
        await t.dispatcher.round()
        expect(t.states()).toEqual(['concluded', 'running'])
        await t.dispatcher.close()
      } finally {
        await t.w.close()
      }
    })

    it('replace: the first is asked to stop, ends cancelled with the stop confirmed, and only then the new one starts', async () => {
      const t = await world('replace')
      try {
        await t.next()
        await t.next()
        for (const _ of [1, 2, 3]) {
          await settle()
          await t.dispatcher.round()
        }
        expect(t.p.log).toEqual(['start:1', 'stop:1', 'start:2'])
        expect(t.outcomes()[0]).toEqual(['concluded', 'cancelled', 'confirmed', 'stopped'])
        expect(t.states()).toEqual(['concluded', 'running'])
        await t.dispatcher.close()
      } finally {
        await t.w.close()
      }
    })

    it('parallel: both run', async () => {
      const t = await world('parallel')
      try {
        await t.next()
        await t.next()
        expect(t.states()).toEqual(['running', 'running'])
        expect(t.p.runs).toHaveLength(2)
        await t.dispatcher.close()
      } finally {
        await t.w.close()
      }
    })

    it('cancel: a Job not yet started never starts; a running one is asked to stop and ends cancelled; cancelling again changes nothing', async () => {
      const t = await world('wait')
      try {
        await t.next()
        await t.next()
        const [first, second] = t.w.jobs(t.id).map(job => String(job['job_id']))
        expect(await t.dispatcher.cancel(second as never)).toMatchObject({
          kind: 'changed',
          facts: { state: 'concluded', outcome: 'cancelled' },
        })
        expect(await t.dispatcher.cancel(first as never)).toMatchObject({
          kind: 'changed',
          facts: { stopState: 'requested' },
        })
        await t.dispatcher.round()
        await settle()
        await t.dispatcher.round()
        expect(t.outcomes().map(row => row.slice(0, 2))).toEqual([
          ['concluded', 'cancelled'],
          ['concluded', 'cancelled'],
        ])
        expect(t.p.runs).toHaveLength(1)
        expect(await t.dispatcher.cancel(second as never)).toMatchObject({ kind: 'unchanged' })
        expect(t.w.view(t.id)).toMatchObject({ acceptedJobCount: 2 })
        await t.dispatcher.close()
      } finally {
        await t.w.close()
      }
    })

    it('a program running when the process ends is failed as interrupted by the next generation', async () => {
      const t = await world()
      try {
        await t.next()
        expect(t.states()).toEqual(['running'])
        await t.dispatcher.close()
        const after = t.w.dispatcher('00000000-0000-8000-8000-000000000009')
        await after.round()
        expect(t.outcomes()).toEqual([['concluded', 'failed', 'none', 'interrupted']])
        await after.close()
      } finally {
        await t.w.close()
      }
    })

    it('a Job started directly has no slot and no count; the same key answers the same Job', async () => {
      const t = await world()
      try {
        const work = { kind: 'program', programRef: 'probe', input: {} } as const
        const first = await t.dispatcher.startDirect(work, 'direct-1')
        const again = await t.dispatcher.startDirect(work, 'direct-1')
        expect(first).toMatchObject({ kind: 'started', replayed: false })
        expect(again).toMatchObject({ kind: 'started', jobId: first.jobId, replayed: true })
        await t.dispatcher.round()
        await settle()
        expect(t.p.runs.map(run => run.jobId)).toEqual([first.jobId])
        expect(t.w.view(t.id)).toMatchObject({ eligibleConsumed: 0, acceptedJobCount: 0 })
        await t.dispatcher.close()
      } finally {
        await t.w.close()
      }
    })
  },
)
