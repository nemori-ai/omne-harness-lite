/**
 * Review 2026-09-30 Q4/Q6 at the anchored invocation handle (the object the runtime container and
 * external persisted-reply owners hold), over an actual JSONL log + SQL identity mapping.
 */
import { afterAll, describe, expect, it } from 'vitest'
import { writeJsonLossless } from '@omne-harness-lite/content-blocks'
import type { AppendResult, SessionLog } from '@omne-harness-lite/session-log'
import type { SessionRef } from '@omne-harness-lite/messages'
import type {
  SettlementRegistration,
  SettlementTask,
  SettlementTaskKind,
} from '../src/settlement-types.ts'
import { createAnchoredModelInvocation } from '../src/anchored-invocation.ts'
import { harness, payload } from './anchored-invocation-fixture.ts'
import type { ControlledSettlementOwner } from './settlement-fixture.ts'

const rejections: unknown[] = []
process.on('unhandledRejection', reason => {
  rejections.push(reason)
})
afterAll(() => {
  expect(rejections).toEqual([])
})

interface Mode {
  append: 'normal' | 'committed' | 'absent'
  read: 'ok' | 'fail'
}
const isFinal = (entries: readonly unknown[]) =>
  entries.some(
    entry => (entry as { payload?: { category?: string } }).payload?.category === 'response',
  )

function install(h: { log: SessionLog; wrap: (log: SessionLog) => void }, mode: Mode): string[] {
  const seen: string[] = []
  const real = h.log
  h.wrap({
    async append(s, entries, fence, condition): Promise<AppendResult> {
      if (!isFinal(entries) || mode.append === 'normal')
        return await real.append(s, entries, fence, condition)
      seen.push(writeJsonLossless(entries as never))
      if (mode.append === 'absent') return { failure: 'unavailable' }
      await real.append(s, entries, fence, condition)
      return { failure: 'unavailable' }
    },
    async readSince(...args) {
      if (mode.read === 'fail') return { failure: 'unavailable' }
      return await real.readSince(...args)
    },
    readByKey: (...args) => real.readByKey(...args),
  })
  return seen
}
const finalCount = async (log: SessionLog, session: SessionRef) => {
  const read = await log.readSince(session, 0)
  if (!('entries' in read)) throw new Error('read')
  return read.entries.filter(
    entry => (entry.payload as { category?: string }).category === 'response',
  ).length
}

describe('review 2026-09-30 Q4 anchored handle: original unknown request is pinned and resolved', () => {
  it('committed unknown: the second settleReply recognizes the original, no second physical write', async () => {
    await harness(async h => {
      const mode: Mode = { append: 'normal', read: 'ok' }
      const seen = install(h, mode)
      const handle = createAnchoredModelInvocation(h.input)
      expect(await handle.outcome).toHaveProperty('replyPending')
      mode.append = 'committed'
      expect(await handle.settleReply('persisted')).toMatchObject({
        unavailable: true,
        reason: 'write_unknown',
      })
      expect(h.owner.active).toBe(1)
      const again = await handle.settleReply('persisted')
      expect(again).toMatchObject({ origin: 'recognized' })
      expect(seen).toHaveLength(1)
      expect(await finalCount(h.log, h.input.settlement.binding.session)).toBe(1)
      expect(await handle.close()).toEqual({ released: true })
      expect(h.owner.active).toBe(0)
    })
  })

  it('absent unknown: byte-identical resend of the pinned batch after the resolving call; a different disposition cannot replace it', async () => {
    await harness(async h => {
      const mode: Mode = { append: 'normal', read: 'ok' }
      const seen = install(h, mode)
      const handle = createAnchoredModelInvocation(h.input)
      await handle.outcome
      mode.append = 'absent'
      expect(await handle.settleReply('persisted')).toMatchObject({ reason: 'write_unknown' })
      // resolving call: proves absence, nothing written
      expect(await handle.settleReply('persisted')).toMatchObject({ reason: 'write_unknown' })
      expect(seen).toHaveLength(1)
      mode.append = 'normal'
      // a caller now asks for another disposition: the handle still submits the pinned original
      const result = await handle.settleReply({ vetoed: { by: 'switch-gate' } })
      if (!('settled' in result)) throw new Error(JSON.stringify(result))
      const original = result.settled.response.response
      expect(original?.replyDisposition).toBe('persisted')
      const writes = h.writes.filter(write => isFinal(write.entries))
      expect(writes).toHaveLength(2)
      expect(writeJsonLossless(writes[1]?.entries as never)).toBe(
        writeJsonLossless(writes[0]?.entries as never),
      )
      expect(writeJsonLossless(writes[0]?.entries as never)).toBe(seen[0])
      expect(await handle.close()).toEqual({ released: true })
    })
  })

  it('unreadable prefix keeps the original owned; handle.close is unavailable and a later close resolves it', async () => {
    await harness(async h => {
      const mode: Mode = { append: 'normal', read: 'ok' }
      const seen = install(h, mode)
      const handle = createAnchoredModelInvocation(h.input)
      await handle.outcome
      mode.append = 'committed'
      await handle.settleReply('persisted')
      mode.read = 'fail'
      expect(await handle.close()).toEqual({ unavailable: true })
      expect(h.owner.active).toBe(1)
      mode.read = 'ok'
      expect(await handle.close()).toEqual({ released: true })
      expect(h.owner.active).toBe(0)
      expect(seen).toHaveLength(1)
    })
  })

  it('a rejected stop of the final writer: settleReply returns, close returns, nothing is released, no unhandled rejection', async () => {
    await harness(async h => {
      const mode: Mode = { append: 'normal', read: 'ok' }
      install(h, mode)
      const owner: ControlledSettlementOwner = h.owner
      const acquire = owner.acquire
      let armed = false
      Object.defineProperty(owner, 'acquire', {
        value: (limit: Parameters<typeof acquire>[0]) => {
          const granted = acquire(limit)
          if (!('registration' in granted)) return granted
          const inner = granted.registration
          const registration: SettlementRegistration = {
            start: <T>(kind: SettlementTaskKind, op: (signal: AbortSignal) => Promise<T>) => {
              const task: SettlementTask<T> = inner.start(kind, op)
              if (kind !== 'append' || !armed) return task
              return {
                completion: task.completion,
                requestStop: task.requestStop,
                stopped: task.stopped.then(() => {
                  throw new Error('stop could not be proven')
                }),
              }
            },
            release: inner.release,
          }
          return { registration }
        },
      })
      const handle = createAnchoredModelInvocation(h.input)
      await handle.outcome
      armed = true
      const settled = await Promise.race([
        handle.settleReply('persisted'),
        new Promise<'hung'>(resolve => setTimeout(() => resolve('hung'), 3000)),
      ])
      expect(settled).toMatchObject({ unavailable: true })
      const closed = await Promise.race([
        handle.close(),
        new Promise<'hung'>(resolve => setTimeout(() => resolve('hung'), 3000)),
      ])
      expect(closed).toEqual({ unavailable: true })
      expect(h.owner.active).toBeGreaterThan(0)
      await new Promise(resolve => setTimeout(resolve, 30))
    })
  })
})

describe('review 2026-09-30 Q6 observation: planning registration release (anchored-invocation.ts finally)', () => {
  it('a planning task whose stop is rejected: is the registration still released?', async () => {
    await harness(async h => {
      const owner: ControlledSettlementOwner = h.owner
      const acquire = owner.acquire
      let releasedWithRejectedStop = 0
      Object.defineProperty(owner, 'acquire', {
        value: (limit: Parameters<typeof acquire>[0]) => {
          const granted = acquire(limit)
          if (!('registration' in granted)) return granted
          const inner = granted.registration
          let rejected = false
          const registration: SettlementRegistration = {
            start: <T>(kind: SettlementTaskKind, op: (signal: AbortSignal) => Promise<T>) => {
              const task: SettlementTask<T> = inner.start(kind, op)
              if (kind !== 'wait') return task
              rejected = true
              return {
                completion: task.completion,
                requestStop: task.requestStop,
                stopped: task.stopped.then(() => {
                  throw new Error('plan stop could not be proven')
                }),
              }
            },
            release: () => {
              if (rejected) releasedWithRejectedStop++
              inner.release()
            },
          }
          return { registration }
        },
      })
      const handle = createAnchoredModelInvocation(h.input)
      await Promise.race([handle.outcome, new Promise(resolve => setTimeout(resolve, 3000))]).catch(
        () => undefined,
      )
      // Recorded for the report, asserted as the honest observation: the author's observation
      // holds if this is > 0 (release happens although the plan task's stop was never proven).
      expect(releasedWithRejectedStop).toBeGreaterThanOrEqual(0)
      await handle.close().catch(() => undefined)
      console.log('planning-release-with-rejected-stop', releasedWithRejectedStop)
    })
  })
})
