import { describe, expect, it } from 'vitest'
import { unwrap, parseOpaqueIdentifier } from '@omne-harness-lite/identity-values'
import type { PlannedSemantics, RuntimeCloseResult } from '@omne-harness-lite/model-request-runtime'
import { createCallContainer, createCallContainerStore } from '../src/service-container.ts'
import { retainRuntimeExecutions } from '../src/execution-source.ts'
import type { CreateCallContainerInput, CallContainerStore } from '../src/service-types.ts'

const session = unwrap(parseOpaqueIdentifier('source-session', 'SessionRef'))
const otherSession = unwrap(parseOpaqueIdentifier('other-source-session', 'SessionRef'))

/** Only unused model-preparation ports are omitted; store, container, and close are real. */
function container(callId: string, sessionId = session) {
  const log = {
    session: sessionId,
    tenant: { organization: 'test', account: 'test' },
    generation: {},
  }
  return createCallContainer({
    key: { session: sessionId, callId },
    session: { log, selection: { binding: log } },
    binding: { lease: { release() {} } },
    request: {
      session: sessionId,
      host: { signal: new AbortController().signal, stopping: () => false },
    },
    owner: { opened: () => ({ confirmed: true }), unresolvedWrites: () => [] },
    coordinator: { close: async () => {} },
    systemStop: async () => ({ released: true }),
  } as unknown as CreateCallContainerInput<PlannedSemantics, never>)
}

function reservation(store: CallContainerStore<PlannedSemantics, never>, callId: string) {
  const held = store.reserve({ session, callId })
  if (!('reservation' in held)) throw new Error('reservation absent')
  return held.reservation
}

describe('physical execution source', () => {
  it('retains both real generations, selects explicitly, and clears only after confirmed close', async () => {
    const physical = createCallContainerStore<PlannedSemantics, never>()
    let closed = false
    const { calls, source } = retainRuntimeExecutions(physical, () => closed)
    const first = container('call')
    const held = reservation(calls, 'call')
    expect(calls.insert(held, first)).toBe(true)
    const oldGeneration = first.view().executionGeneration
    const beforeClose = source.lookup(first.key)
    expect(beforeClose).toMatchObject({ execution: { registered: true, released: false } })
    expect(source.release()).toEqual({ unavailable: true })
    expect(await first.close()).toEqual({ released: true })
    expect(calls.remove(held)).toBe(true)
    const second = container('call')
    expect(calls.insert(held, second)).toBe(true)
    const current = source.lookup(first.key)
    if (!('execution' in current)) throw new Error('current execution missing')
    expect(current.execution.executionGeneration).toBe(second.view().executionGeneration)
    const original = source.lookup(first.key, oldGeneration)
    if (!('execution' in original)) throw new Error('original execution missing')
    expect(original.execution.executionGeneration).toBe(oldGeneration)
    expect(original.execution.released).toBe(true)
    expect(original.execution.registered).toBe(false)
    expect(Object.isFrozen(original.execution.key)).toBe(true)
    expect(await second.close()).toEqual({ released: true })
    expect(calls.remove(held)).toBe(true)
    held.release()
    expect(source.snapshot(session)).toHaveLength(2)
    expect(source.snapshot(otherSession)).toEqual([])
    expect(source.lookup(first.key)).toEqual({ unknown: true })
    expect(source.lookup(first.key, {})).toEqual({ unknown: true })
    expect(source.lookup(first.key, oldGeneration)).toHaveProperty('execution')
    expect(await calls.close()).toEqual({ released: true })
    expect(source.snapshot(session)).toHaveLength(2)
    closed = true
    expect(source.release()).toEqual({ released: true })
    expect(source.release()).toEqual({ released: true })
    expect(source.snapshot(session)).toEqual([])
    expect(source.lookup(first.key, oldGeneration)).toEqual({ unknown: true })
  })

  it('does not keep rejected insertion or erase a previously accepted original', async () => {
    const physical = createCallContainerStore<PlannedSemantics, never>()
    const { calls, source } = retainRuntimeExecutions(physical, () => false)
    const held = reservation(calls, 'call')
    const first = container('call'),
      rejected = container('call')
    expect(calls.insert(held, first)).toBe(true)
    expect(calls.insert(held, rejected)).toBe(false)
    expect(calls.insert(held, first)).toBe(false)
    expect(source.snapshot(session)).toHaveLength(1)
    expect(source.lookup(first.key)).toHaveProperty('execution')
    held.release()
    expect(await rejected.close()).toEqual({ released: true })
    expect(await calls.close()).toEqual({ released: true })
  })

  it('keeps an actually accepted candidate when insert throws after acceptance, preserving receivers', async () => {
    const actual = createCallContainerStore<PlannedSemantics, never>()
    const receivers: string[] = []
    const physical: CallContainerStore<PlannedSemantics, never> = {
      find(key) {
        expect(this).toBe(physical)
        receivers.push('find')
        return actual.find(key)
      },
      reserve(key) {
        expect(this).toBe(physical)
        receivers.push('reserve')
        return actual.reserve(key)
      },
      waitReserve(key, input) {
        expect(this).toBe(physical)
        receivers.push('wait')
        return actual.waitReserve(key, input)
      },
      insert(held, prepared) {
        expect(this).toBe(physical)
        expect(actual.insert(held, prepared)).toBe(true)
        throw new Error('accepted but return lost')
      },
      remove(held) {
        expect(this).toBe(physical)
        receivers.push('remove')
        return actual.remove(held)
      },
      close() {
        expect(this).toBe(physical)
        receivers.push('close')
        return actual.close()
      },
    }
    const { calls, source } = retainRuntimeExecutions(physical, () => false)
    const held = reservation(calls, 'call')
    const first = container('call')
    expect(() => calls.insert(held, first)).toThrow('accepted but return lost')
    const observed = source.lookup(first.key)
    if (!('execution' in observed)) throw new Error('accepted candidate erased')
    expect(observed.execution.session).toBe(first.view().session)
    expect(observed.execution.owner).toBe(first.view().owner)
    expect(observed.execution.registered).toBe(true)
    expect(await first.close()).toEqual({ released: true })
    expect(calls.remove(held)).toBe(true)
    held.release()
    const waited = await calls.waitReserve(first.key, {
      signal: new AbortController().signal,
      policy: { maxWaitersPerCall: 1, timeoutMs: 10 },
      scheduler: {
        nowMonotonicMs: () => 0,
        wait: () => {
          throw new Error('unexpected wait')
        },
      },
    })
    if (!('reservation' in waited)) throw new Error('wait reservation unavailable')
    waited.reservation.release()
    expect(await calls.close()).toEqual({ released: true })
    expect(receivers).toEqual(
      expect.arrayContaining(['find', 'reserve', 'wait', 'remove', 'close']),
    )
  })

  it('preserves a source while the real container has not completed physical close', async () => {
    let complete!: (result: RuntimeCloseResult) => void
    const stopped = new Promise<RuntimeCloseResult>(resolve => {
      complete = resolve
    })
    const physical = createCallContainerStore<PlannedSemantics, never>()
    const { calls, source } = retainRuntimeExecutions(physical, () => false)
    const first = container('call')
    first.retainStopped(stopped.then(() => {}))
    const held = reservation(calls, 'call')
    expect(calls.insert(held, first)).toBe(true)
    held.release()
    const closing = calls.close()
    await Promise.resolve()
    expect(source.lookup(first.key)).toMatchObject({ execution: { released: false } })
    expect(source.release()).toEqual({ unavailable: true })
    complete({ released: true })
    expect(await closing).toEqual({ released: true })
    expect(source.lookup(first.key)).toMatchObject({
      execution: { released: true, registered: false },
    })
  })

  it('refuses a malformed generation projection instead of choosing an apparently current record', async () => {
    const physical = createCallContainerStore<PlannedSemantics, never>()
    const { calls, source } = retainRuntimeExecutions(physical, () => false)
    const held = reservation(calls, 'call')
    const first = container('call'),
      second = container('call')
    expect(calls.insert(held, first)).toBe(true)
    expect(await first.close()).toEqual({ released: true })
    expect(calls.remove(held)).toBe(true)
    // Protocol-error control: physical close remains real; only the generation is malformed.
    const collision = {
      ...second,
      view: () => ({ ...second.view(), executionGeneration: first.view().executionGeneration }),
    }
    expect(calls.insert(held, collision)).toBe(true)
    expect(source.lookup(first.key)).toEqual({ unknown: true })
    expect(source.lookup(first.key, first.view().executionGeneration)).toEqual({ unknown: true })
    expect(source.snapshot(session)).toHaveLength(2)
    held.release()
    expect(await calls.close()).toEqual({ released: true })
  })

  it('seals original capture, preserves pins, and replaces only stopped originals with metadata', async () => {
    const physical = createCallContainerStore<PlannedSemantics, never>()
    let closed = false
    const { calls, source, runtimeCopies } = retainRuntimeExecutions(physical, () => closed)
    const first = container('call')
    const held = reservation(calls, 'call')
    expect(calls.insert(held, first)).toBe(true)
    const captured = source.capture(session)
    if (!('capture' in captured)) throw new Error('capture missing')
    runtimeCopies.stopCapture(first.key)
    expect(runtimeCopies.releaseCopies(first.view().session.log, first.key)).toEqual([
      'writer_in_flight',
    ])
    expect(await first.close()).toEqual({ released: true })
    expect(calls.remove(held)).toBe(true)
    held.release()
    expect(runtimeCopies.releaseCopies(first.view().session.log, first.key)).toEqual([
      'external_retention',
    ])
    const afterSeal = source.capture(session)
    if (!('capture' in afterSeal)) throw new Error('metadata capture missing')
    expect(afterSeal.capture.executions[0]).not.toHaveProperty('invocation')
    captured.capture.release()
    captured.capture.release()
    expect(captured.capture.executions).toEqual([])
    expect(runtimeCopies.releaseCopies(first.view().session.log, first.key)).toEqual([])
    expect(source.lookup(first.key)).toMatchObject({
      execution: {
        registered: false,
        released: true,
        copyReleased: true,
      },
    })
    closed = true
    expect(source.release()).toEqual({ unavailable: true })
    afterSeal.capture.release()
    expect(source.release()).toEqual({ released: true })
    expect(source.capture(session)).toEqual({ unavailable: true })
  })

  it('refuses a different original log binding and preserves a stopped non-ACK generation', async () => {
    const physical = createCallContainerStore<PlannedSemantics, never>()
    const { calls, source, runtimeCopies } = retainRuntimeExecutions(physical, () => false)
    const first = container('call'),
      other = container('other')
    const held = reservation(calls, 'call')
    expect(calls.insert(held, first)).toBe(true)
    expect(await first.close()).toEqual({ released: true })
    expect(calls.remove(held)).toBe(true)
    held.release()
    expect(runtimeCopies.releaseCopies(other.view().session.log, first.key)).toEqual([
      'receipt_unknown',
    ])
    expect(source.lookup(first.key)).toMatchObject({ execution: { copyReleased: false } })
    const captured = source.capture(session)
    if (!('capture' in captured)) throw new Error('non-ACK original missing')
    expect(captured.capture.executions).toHaveLength(1)
    expect(captured.capture.executions[0]?.executionGeneration).toBe(
      first.view().executionGeneration,
    )
    captured.capture.release()
    expect(await other.close()).toEqual({ released: true })
  })
})
