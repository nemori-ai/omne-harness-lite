// @module-tag slow
import { describe, expect, it } from 'vitest'
import { createScheduleDispatchSqlStore } from '@omne-harness/schedule-local'
import { context } from '../storage/data.ts'
import { dispatchWorld, everyMinute, MINUTE } from './world.ts'

describe(
  'a dispatch commit decides again under the lock',
  { tags: ['slow'], timeout: 120_000 },
  () => {
    async function prepared() {
      const w = await dispatchWorld()
      const id = await w.create(everyMinute(), 'store')
      const dispatcher = w.dispatcher()
      await dispatcher.round()
      await dispatcher.close()
      w.time.advance(MINUTE)
      const store = createScheduleDispatchSqlStore({
        storage: w.world.storage,
        scope: w.world.scope,
        owner: context.owner,
        transactionDomain: w.world.combination.transactionDomain,
        combinationVersion: w.world.combination.combinationVersion,
        manifestDigest: w.world.combination.manifestDigest,
        guards: {
          participant: w.world.guards.participant,
          dispatch: requirement => ({
            participant: w.world.guards.participant,
            facts: { dispatch: requirement as never },
          }),
        },
      })
      const pending = await store.pending(new Date(w.time.source.now()).toISOString() as never, 20)
      if (pending.kind !== 'ok') throw new Error('pending unavailable')
      const [item] = pending.value.due
      if (item?.state?.next === null || item?.state === null || item === undefined)
        throw new Error('nothing due')
      const command = {
        kind: 'admit' as const,
        owner: context.owner,
        scheduleId: item.record.view.scheduleId,
        revision: item.record.view.revision,
        slot: item.state.next!,
        next: null,
        prepared: {
          hasNext: true,
          missingCarriers: [],
          reminderClosed: null,
          standing: { kind: 'eligible' as const },
        },
        decision: {
          kind: 'accept' as const,
          start: 'ready' as const,
          stopPredecessors: false,
          exhausts: false,
        },
        holding: item.record.quota,
        receiptId: '00000000-0000-8000-8000-000000000001' as never,
        jobId: '00000000-0000-8000-8000-000000000002' as never,
        at: new Date(w.time.source.now()).toISOString() as never,
      }
      return { w, id, store, command }
    }

    it('the prepared command commits once; the same command again is recalled, not done twice', async () => {
      const { w, id, store, command } = await prepared()
      try {
        expect(await store.commit(command)).toEqual({ kind: 'committed', replayed: false })
        expect(await store.commit(command)).toEqual({ kind: 'committed', replayed: true })
        expect(w.jobs(id)).toHaveLength(1)
      } finally {
        await w.close()
      }
    })

    it('a decision the locked facts do not give rolls back and writes nothing', async () => {
      const { w, id, store, command } = await prepared()
      try {
        expect(
          await store.commit({
            ...command,
            decision: { kind: 'skip', reason: 'overlap', exhausts: false },
          }),
        ).toEqual({ kind: 'stale' })
        expect(await store.commit({ ...command, revision: command.revision + 1 })).toEqual({
          kind: 'stale',
        })
        expect(w.receipts(id)).toEqual([])
        expect(w.jobs(id)).toEqual([])
        expect(w.view(id)).toMatchObject({ eligibleConsumed: 0, acceptedJobCount: 0 })
      } finally {
        await w.close()
      }
    })

    it('a slot already disposed is not disposed again by a later command for it', async () => {
      const { w, id, store, command } = await prepared()
      try {
        expect(await store.commit(command)).toMatchObject({ kind: 'committed' })
        expect(await store.commit({ ...command, next: command.slot })).toEqual({ kind: 'stale' })
        expect(w.receipts(id)).toHaveLength(1)
      } finally {
        await w.close()
      }
    })
  },
)
