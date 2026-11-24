// @module-tag slow
import { describe, expect, it } from 'vitest'
import { context } from '../storage/data.ts'
import { dispatchWorld, everyMinute, MINUTE, START } from './world.ts'

const HOUR = 60 * MINUTE
const DAY = 24 * HOUR
const iso = (ms: number) => new Date(ms).toISOString()

function hourly(catchUp: { kind: 'none' } | { kind: 'latest'; maximum: number }) {
  const base = everyMinute()
  if (base.purpose.kind !== 'execution') throw new Error('execution expected')
  return {
    ...base,
    recurrence: { ...base.recurrence, expression: '0 * * * *' },
    purpose: { ...base.purpose, catchUp },
  } as typeof base
}

describe(
  'watching and catching up: a missed stretch is disposed in one commit',
  { tags: ['slow'], timeout: 300_000 },
  () => {
    it('scenario 4: the host was off from before 08:00 to 10:30; with latest 1 only 10:00 is done, 08:00 and 09:00 are written as missed', async () => {
      const w = await dispatchWorld({ gapMs: 2 * HOUR })
      try {
        const id = await w.create(hourly({ kind: 'latest', maximum: 1 }), 'scenario-4')
        const before = w.dispatcher()
        for (let hour = 0; hour < 8; hour += 1) {
          await before.round()
          w.time.advance(HOUR)
        }
        await before.close()
        w.time.setWall(START + 10 * HOUR + 30 * MINUTE)
        const dispatcher = w.dispatcher()
        await dispatcher.round()
        const accepted = w.receipts(id).map(item => item.at)
        expect(accepted.slice(-2)).toEqual([iso(START + 7 * HOUR), iso(START + 10 * HOUR)])
        const origins = w
          .rows(`SELECT slot_at, job FROM sc_jobs WHERE schedule_id = '${id}' ORDER BY slot_at`)
          .map(row => [row['slot_at'], JSON.parse(String(row['job'])).run.origin])
        expect(origins.slice(-2)).toEqual([
          [iso(START + 7 * HOUR), 'due'],
          [iso(START + 10 * HOUR), 'catchUp'],
        ])
        const lapses = w.rows(
          `SELECT from_at, through_at, lapse FROM sc_lapses WHERE schedule_id = '${id}'`,
        )
        expect(lapses).toHaveLength(1)
        expect(lapses[0]?.['from_at']).toBe(iso(START + 8 * HOUR))
        expect(JSON.parse(String(lapses[0]?.['lapse']))).toMatchObject({
          cause: 'stopped',
          reason: 'catch-up-latest',
          count: 2,
          selected: 1,
        })
        w.time.advance(30 * MINUTE)
        await dispatcher.round()
        expect(
          w
            .receipts(id)
            .map(item => item.at)
            .at(-1),
        ).toBe(iso(START + 11 * HOUR))
        expect(w.view(id)).toMatchObject({ eligibleConsumed: 11, acceptedJobCount: 9 })
        await dispatcher.close()
      } finally {
        await w.close()
      }
    })

    it('a month off with latest 2: two are done, the rest is one lapse, and another round adds nothing', async () => {
      const w = await dispatchWorld({ gapMs: 2 * HOUR })
      try {
        const id = await w.create(hourly({ kind: 'latest', maximum: 2 }), 'month')
        const before = w.dispatcher()
        await before.round()
        await before.close()
        w.time.setWall(START + 30 * DAY + 10 * MINUTE)
        const dispatcher = w.dispatcher()
        await dispatcher.round()
        await dispatcher.round()
        expect(w.receipts(id).map(item => item.at)).toEqual([
          iso(START + 30 * DAY - HOUR),
          iso(START + 30 * DAY),
        ])
        const [lapse] = w.rows(`SELECT lapse FROM sc_lapses WHERE schedule_id = '${id}'`)
        expect(JSON.parse(String(lapse?.['lapse']))).toMatchObject({
          count: 30 * 24 - 2,
          selected: 2,
        })
        expect(
          w.rows(`SELECT count(*) AS n FROM sc_lapses WHERE schedule_id = '${id}'`)[0]?.['n'],
        ).toBe(1)
        expect(w.view(id)).toMatchObject({ eligibleConsumed: 30 * 24, acceptedJobCount: 2 })
        await dispatcher.close()
      } finally {
        await w.close()
      }
    })

    it('paused across two slots, then resumed: those two are missed by the catch-up policy, the next is on time', async () => {
      const w = await dispatchWorld({ gapMs: 2 * HOUR })
      try {
        const id = await w.create(hourly({ kind: 'none' }), 'paused')
        const dispatcher = w.dispatcher()
        await dispatcher.round()
        const control = async (action: 'pause' | 'resume', revision: number) => {
          await w.stamp()
          return w.app.commands.execute(context, {
            action,
            scheduleId: id,
            reason: null,
            meta: { operationKey: `${action}-${revision}`, expectedRevision: revision },
          } as never)
        }
        expect((await control('pause', 1)).kind).toBe('committed')
        for (const _ of [1, 2]) {
          w.time.advance(HOUR)
          await dispatcher.round()
        }
        w.time.advance(10 * MINUTE)
        expect((await control('resume', 2)).kind).toBe('committed')
        w.time.advance(MINUTE)
        await dispatcher.round()
        await dispatcher.round()
        expect(w.receipts(id)).toEqual([])
        expect(w.view(id)).toMatchObject({ eligibleConsumed: 2 })
        const [lapse] = w.rows(`SELECT lapse FROM sc_lapses WHERE schedule_id = '${id}'`)
        expect(JSON.parse(String(lapse?.['lapse']))).toMatchObject({
          cause: 'paused',
          reason: 'catch-up-none',
          count: 2,
        })
        w.time.advance(HOUR)
        await dispatcher.round()
        expect(w.receipts(id).map(item => item.at)).toEqual([iso(START + 3 * HOUR)])
        await dispatcher.close()
      } finally {
        await w.close()
      }
    })

    it('a per-minute schedule off for a year goes over the counting budget: one lapse, not counted one by one, none caught up, done within the round', async () => {
      const w = await dispatchWorld({ gapMs: 2 * HOUR })
      try {
        const id = await w.create(everyMinute(), 'year')
        const before = w.dispatcher()
        await before.round()
        await before.close()
        w.time.setWall(START + 365 * DAY + 10_000)
        const dispatcher = w.dispatcher()
        const started = performance.now()
        await dispatcher.round()
        const took = performance.now() - started
        expect(w.receipts(id)).toEqual([])
        const lapses = w.rows(`SELECT lapse FROM sc_lapses WHERE schedule_id = '${id}'`)
        expect(lapses).toHaveLength(1)
        expect(JSON.parse(String(lapses[0]?.['lapse']))).toMatchObject({
          reason: 'over-budget',
          count: null,
          selected: 0,
        })
        expect(took).toBeLessThan(60_000)
        w.time.advance(MINUTE)
        await dispatcher.round()
        expect(w.receipts(id).map(item => item.at)).toEqual([iso(START + 365 * DAY + MINUTE)])
        await dispatcher.close()
      } finally {
        await w.close()
      }
    })

    it('with an eligible limit, an over-budget stretch is counted over several commits: none caught up, the count reaches the limit, the schedule is exhausted', async () => {
      const w = await dispatchWorld({ gapMs: 2 * HOUR })
      try {
        const id = await w.create(
          everyMinute({ limits: { eligibleLimit: 1500, jobLimit: null, excludeDates: [] } }),
          'counted',
        )
        const before = w.dispatcher()
        await before.round()
        await before.close()
        w.time.setWall(START + 365 * DAY + 10_000)
        const dispatcher = w.dispatcher()
        await dispatcher.round()
        expect(w.receipts(id)).toEqual([])
        const lapses = w
          .rows(`SELECT lapse FROM sc_lapses WHERE schedule_id = '${id}' ORDER BY from_at`)
          .map(row => JSON.parse(String(row['lapse'])))
        expect(lapses.map(lapse => [lapse.count, lapse.more])).toEqual([
          [1000, true],
          [500, false],
        ])
        expect(w.view(id)).toMatchObject({ eligibleConsumed: 1500, control: 'exhausted' })
        await dispatcher.close()
      } finally {
        await w.close()
      }
    })
  },
)
