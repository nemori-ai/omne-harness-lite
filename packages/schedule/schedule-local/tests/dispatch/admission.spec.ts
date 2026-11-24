// @module-tag slow
import { describe, expect, it } from 'vitest'
import { context } from '../storage/data.ts'
import { dispatchWorld, everyMinute, MINUTE, START } from './world.ts'

const at = (minutes: number) => new Date(START + minutes * MINUTE).toISOString()

describe(
  'the dispatcher accepts due slots, one commit each',
  { tags: ['slow'], timeout: 120_000 },
  () => {
    it('a schedule made active is watched from its activation; each due minute becomes one Job, counted once', async () => {
      const w = await dispatchWorld()
      try {
        const id = await w.create(everyMinute(), 'minute-1')
        const dispatcher = w.dispatcher()
        await dispatcher.round()
        expect(w.receipts(id)).toEqual([])
        w.time.advance(MINUTE)
        await dispatcher.round()
        w.time.advance(MINUTE)
        await dispatcher.round()
        await dispatcher.round()
        expect(w.receipts(id).map(item => [item.at, item.disposition, item.reasonCode])).toEqual([
          [at(1), 'acceptedExecution', 'accepted'],
          [at(2), 'acceptedExecution', 'accepted'],
        ])
        expect(w.jobs(id).map(job => [job['slot_at'], job['state']])).toEqual([
          [at(1), 'accepted'],
          [at(2), 'accepted'],
        ])
        expect(w.view(id)).toMatchObject({
          eligibleConsumed: 2,
          acceptedJobCount: 2,
          control: 'active',
        })
        expect(w.view(id)['nextOccurrence']).toMatchObject({ scheduledAt: at(3) })
        expect(w.rows(`SELECT count(*) AS n FROM sc_outbox`)[0]?.['n']).toBe(0)
        await dispatcher.close()
      } finally {
        await w.close()
      }
    })

    it('a schedule already active before the dispatcher first saw it is watched from that moment: earlier slots are not its slots', async () => {
      const w = await dispatchWorld()
      try {
        const id = await w.create(everyMinute(), 'takeover')
        const updated = await w.app.commands.execute(context, {
          action: 'update',
          scheduleId: id,
          patch: { kind: 'label', label: 'Taken over' },
          meta: { operationKey: 'takeover-update', expectedRevision: 1 },
        } as never)
        expect(updated.kind).toBe('committed')
        w.time.advance(3 * MINUTE)
        const dispatcher = w.dispatcher()
        await dispatcher.round()
        const state = JSON.parse(
          String(w.rows(`SELECT state FROM sc_dispatch WHERE schedule_id = '${id}'`)[0]?.['state']),
        )
        expect(state).toMatchObject({
          watchedCause: 'takeover',
          watchedFrom: new Date(START + 3 * MINUTE + 10_000).toISOString(),
        })
        expect(state.next.scheduledAt).toBe(at(4))
        w.time.advance(MINUTE)
        await dispatcher.round()
        expect(w.receipts(id).map(item => item.at)).toEqual([at(4)])
        await dispatcher.close()
      } finally {
        await w.close()
      }
    })

    it('two dispatchers on one store accept a slot once', async () => {
      const w = await dispatchWorld()
      try {
        const id = await w.create(everyMinute(), 'minute-2')
        const first = w.dispatcher()
        const second = w.dispatcher()
        await first.round()
        w.time.advance(MINUTE)
        await Promise.all([first.round(), second.round(), first.round(), second.round()])
        expect(w.receipts(id).map(item => item.at)).toEqual([at(1)])
        expect(w.jobs(id)).toHaveLength(1)
        expect(w.view(id)).toMatchObject({ eligibleConsumed: 1, acceptedJobCount: 1 })
        await Promise.all([first.close(), second.close()])
      } finally {
        await w.close()
      }
    })

    it('a job limit of two over three eligible slots: two Jobs, then the schedule is exhausted in the same commit and its quota freed', async () => {
      const w = await dispatchWorld()
      try {
        const id = await w.create(
          everyMinute({ limits: { eligibleLimit: 3, jobLimit: 2, excludeDates: [] } }),
          'limits',
        )
        const dispatcher = w.dispatcher()
        await dispatcher.round()
        for (const _ of [1, 2, 3]) {
          w.time.advance(MINUTE)
          await dispatcher.round()
        }
        expect(w.receipts(id).map(item => item.disposition)).toEqual([
          'acceptedExecution',
          'acceptedExecution',
        ])
        expect(w.view(id)).toMatchObject({
          control: 'exhausted',
          acceptedJobCount: 2,
          nextOccurrence: null,
        })
        expect(
          w.rows(`SELECT held FROM fixture_schedule_quota WHERE schedule_id = '${id}'`)[0]?.[
            'held'
          ],
        ).toBe(0)
        await dispatcher.close()
      } finally {
        await w.close()
      }
    })

    it('a definition changed after preparing: the old preparation retreats, the new one is accepted', async () => {
      const w = await dispatchWorld()
      try {
        const id = await w.create(everyMinute(), 'changed')
        const dispatcher = w.dispatcher()
        await dispatcher.round()
        const renamed = await w.app.commands.execute(context, {
          action: 'update',
          scheduleId: id,
          patch: { kind: 'label', label: 'Renamed' },
          meta: { operationKey: 'rename-1', expectedRevision: 1 },
        } as never)
        expect(renamed.kind).toBe('committed')
        w.time.advance(MINUTE)
        await dispatcher.round()
        expect(w.receipts(id).map(item => item.at)).toEqual([at(1)])
        expect(w.view(id)).toMatchObject({ revision: 2, definition: { label: 'Renamed' } })
        await dispatcher.close()
      } finally {
        await w.close()
      }
    })

    it('an owner refused now gets a rejected slot; an owner whose standing is unknown gets no write this round', async () => {
      let standing: 'eligible' | 'refused' | 'unknown' = 'unknown'
      const w = await dispatchWorld({
        standing: async () =>
          standing === 'refused'
            ? { kind: 'refused', reason: 'member-removed' }
            : { kind: standing },
      })
      try {
        const id = await w.create(everyMinute(), 'standing')
        const dispatcher = w.dispatcher()
        await dispatcher.round()
        w.time.advance(MINUTE)
        await dispatcher.round()
        expect(w.receipts(id)).toEqual([])
        standing = 'refused'
        await dispatcher.round()
        expect(w.receipts(id).map(item => [item.disposition, item.reasonCode, item.job])).toEqual([
          ['rejected', 'member-removed', null],
        ])
        expect(w.view(id)).toMatchObject({ eligibleConsumed: 1, acceptedJobCount: 0 })
        await dispatcher.close()
      } finally {
        await w.close()
      }
    })

    it('a missing carrier blocks the schedule and writes no slot; when it is back the slot is accepted', async () => {
      let missing: readonly string[] = ['executor:program']
      const w = await dispatchWorld({ missingCarriers: () => missing })
      try {
        const id = await w.create(everyMinute(), 'carrier')
        const dispatcher = w.dispatcher()
        await dispatcher.round()
        w.time.advance(MINUTE)
        await dispatcher.round()
        expect(w.receipts(id)).toEqual([])
        const state = JSON.parse(
          String(w.rows(`SELECT state FROM sc_dispatch WHERE schedule_id = '${id}'`)[0]?.['state']),
        )
        expect(state.block).toEqual({
          kind: 'blocked',
          reasons: ['carrier-missing:executor:program'],
        })
        missing = []
        await dispatcher.round()
        expect(w.receipts(id).map(item => item.disposition)).toEqual(['acceptedExecution'])
        await dispatcher.close()
      } finally {
        await w.close()
      }
    })
  },
)
