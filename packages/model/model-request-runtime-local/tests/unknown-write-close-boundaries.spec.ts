import { UnknownAppendTracker } from '@omne-harness-lite/model-request-runtime'
import { sessionModelRequestPreparation } from '@omne-harness-lite/session-runtime-local'
import { expect, test } from 'vitest'
import { interpretCallHistory } from '@omne-harness-lite/model-request-runtime'
import { controlled, deferred, policy } from './settlement-fixture.ts'
import { prepare, session } from './log-codec-fixture.ts'

test('unknown close stops every original writer and retries reader and release failures without rewriting', async () => {
  await controlled('unknown-close-original-failures', async ({ binding, owner, submissions }) => {
    const tracker = new UnknownAppendTracker()
    const actualStop = deferred<void>()
    const stops: number[] = []
    const reads = [0, 0]
    let readerFails = true
    let releaseFails = true
    for (const index of [0, 1]) {
      const acquired = owner.acquire(policy().limits.concurrent)
      if (!('registration' in acquired)) throw new Error('original writer admission')
      const original = acquired.registration
      const task = original.start('append', async () => {
        await binding.log.append(
          session,
          [
            prepare(
              'record',
              { kind: 'model_call_interrupt_intent', call: 'call', initiator: 'user' },
              { kind: 'record' },
            ),
          ],
          { kind: 'unfenced' },
          { kind: 'unconditional' },
        )
        return { failure: 'unavailable' } as const
      })
      await task.completion
      await task.stopped
      tracker.keep(
        { session, callId: 'call' },
        binding,
        owner,
        {
          start: original.start,
          release() {
            if (index === 0 && releaseFails) throw new Error('original release not confirmed')
            original.release()
          },
        },
        {
          completion: task.completion,
          stopped: index === 0 ? actualStop.promise : task.stopped,
          requestStop() {
            stops.push(index)
            if (index === 0) throw new Error('stop request failed')
            task.requestStop()
          },
        },
        (prefix, callId) => {
          reads[index] = (reads[index] ?? 0) + 1
          if (index === 0 && readerFails) throw new Error('original reader unavailable')
          return interpretCallHistory({ prefix, callId })
        },
        sessionModelRequestPreparation.readCall,
      )
    }
    const before = await binding.log.readSince(session, 0)
    const first = tracker.close()
    expect(stops).toEqual([0, 1])
    expect(tracker.close()).toBe(first)
    expect(owner.active).toBe(2)
    expect(owner.releases).toBe(0)
    actualStop.resolve()
    expect(await first).toEqual({ unavailable: true })
    expect(reads).toEqual([1, 1])
    expect(owner.active).toBe(1)
    expect(owner.releases).toBe(1)
    readerFails = false
    expect(await tracker.close()).toEqual({ unavailable: true })
    expect(owner.active).toBe(1)
    expect(owner.releases).toBe(1)
    releaseFails = false
    expect(await tracker.close()).toEqual({ released: true })
    expect(reads).toEqual([3, 1])
    expect(stops).toEqual([0, 1, 0, 0])
    expect(owner.active).toBe(0)
    expect(owner.releases).toBe(2)
    expect(await tracker.close()).toEqual({ released: true })
    expect(await binding.log.readSince(session, 0)).toEqual(before)
    expect(submissions.map(item => item.count)).toEqual([2, 1, 1])
  })
})

test('unknown close cannot bypass the Session original-call reader', async () => {
  await controlled('unknown-close-session-reader', async ({ binding, owner }) => {
    const tracker = new UnknownAppendTracker()
    const acquired = owner.acquire(policy().limits.concurrent)
    if (!('registration' in acquired)) throw new Error('original writer admission')
    const task = acquired.registration.start('append', async () => ({
      failure: 'unavailable' as const,
    }))
    await task.completion
    await task.stopped
    let reads = 0
    let readable = false
    tracker.keep(
      { session, callId: 'call' },
      binding,
      owner,
      acquired.registration,
      task,
      () => ({ absent: true }),
      async input => {
        reads++
        expect(input.binding).toBe(binding)
        expect(input.callId).toBe('call')
        return readable ? { absent: true } : { unavailable: true, reason: 'history' }
      },
    )
    expect(await tracker.close()).toEqual({ unavailable: true })
    expect(reads).toBe(1)
    expect(owner.active).toBe(1)
    readable = true
    expect(await tracker.close()).toEqual({ released: true })
    expect(reads).toBe(2)
    expect(owner.active).toBe(0)
  })
})
