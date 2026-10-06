// @module-tag slow
// Real Cordis, SQLite and JSONL verify creation identity and durable publication.
import { expect, test, vi } from 'vitest'
import { LosslessNumber, writeJsonLossless } from '@omne-harness-lite/content-blocks'
import type { LogEntryInput } from '@omne-harness-lite/session-log'
import { acknowledgementHost } from './acknowledgement-host-fixture.ts'
import { kinds } from './acknowledgement-host-fixture.ts'
import { ControlledSettlementOwner, deferred, policy } from './settlement-fixture.ts'
import {
  captureModelLogValue,
  prepareModelLogEntry,
} from '@omne-harness-lite/model-request-runtime'
import { parseOpaqueIdentifier, unwrap } from '@omne-harness-lite/identity-values'
import type { AvailabilityReport } from '@omne-harness-lite/asset-registry'
import { instantFromEpochMs } from '@omne-harness-lite/offer-expiry'

function isCreation(entries: readonly LogEntryInput[]): boolean {
  return entries.some(entry => {
    const wrapper = entry.payload
    if (wrapper === null || typeof wrapper !== 'object' || !('value' in wrapper)) return false
    const record = wrapper.value
    return (
      record !== null &&
      typeof record === 'object' &&
      'kind' in record &&
      record.kind === 'model_call_created'
    )
  })
}

test('S-85: an unacknowledged equal creation returns its original reference without adoption', async () => {
  const h = await acknowledgementHost()
  try {
    const request = h.request('recognize-created')
    const first = await h.service.openCall(request)
    expect(first).toHaveProperty('ref')
    if (!('ref' in first)) throw new Error('initial creation')
    const entries = await h.entries()
    const container = h.calls.find(first.ref)
    const plans = h.wire.plans()
    expect(await h.service.openCall(request)).toEqual(first)
    expect(h.calls.find(first.ref)).toBe(container)
    expect(h.wire.plans()).toBe(plans)
    expect(h.wire.sends()).toBe(0)
    expect(await h.entries()).toEqual(entries)
    expect(await h.contentRows(first.callId)).toBe(1)
    expect(kinds(entries).filter(kind => kind === 'model_call_created')).toHaveLength(1)
    expect(await h.service.dispatch(first.ref)).toHaveProperty('replyPending')
    expect(h.wire.sends()).toBe(1)
    expect(await h.service.openCall(request)).toEqual({ ...first, state: 'complete' })
    expect(h.wire.sends()).toBe(1)
  } finally {
    expect(await h.runtime.close()).toEqual({ released: true })
    await h.host.close()
  }
})

test('S-85: creation comparison uses JSON values and exact decimal numbers', async () => {
  const h = await acknowledgementHost()
  try {
    const parameters = {
      seed: new LosslessNumber('9007199254740993'),
      stopSequences: ['a', 'b'],
      extra: { first: 1, second: 2 },
    }
    const request = h.request('recognize-values', { parameters })
    const first = await h.service.openCall(request)
    expect(first).toHaveProperty('ref')
    const entries = await h.entries()
    expect(
      await h.service.openCall({
        ...request,
        parameters: {
          extra: { second: 2, first: 1 },
          stopSequences: ['a', 'b'],
          seed: new LosslessNumber('9007199254740993.0'),
        },
      }),
    ).toEqual(first)
    for (const changed of [
      { ...parameters, seed: new LosslessNumber('9007199254740992') },
      { ...parameters, stopSequences: ['b', 'a'] },
      { ...parameters, extra: { ...parameters.extra, absent: null } },
    ]) {
      expect(await h.service.openCall({ ...request, parameters: changed })).toEqual({
        creationConflict: true,
      })
    }
    h.changeSourceVersions({ fixture: 'changed' })
    expect(await h.service.openCall(request)).toEqual({ creationConflict: true })
    h.restoreSourceVersions()
    expect(await h.service.openCall(request)).toEqual(first)
    expect(await h.entries()).toEqual(entries)
    expect(h.wire.plans()).toBe(1)
    expect(h.wire.sends()).toBe(0)
  } finally {
    expect(await h.runtime.close()).toEqual({ released: true })
    await h.host.close()
  }
})

test('S-85: a fresh runtime recognizes durable creation without a local success cache', async () => {
  const h = await acknowledgementHost()
  const restarted = h.restarted()
  try {
    const request = h.request('recognize-restarted')
    const first = await h.service.openCall(request)
    expect(first).toHaveProperty('ref')
    const entries = await h.entries()
    expect(await restarted.service.openCall(request)).toEqual(first)
    expect(restarted.wire.plans()).toBe(0)
    expect(restarted.wire.sends()).toBe(0)
    expect(await h.entries()).toEqual(entries)
  } finally {
    expect(await restarted.runtime.close()).toEqual({ released: true })
    expect(await h.runtime.close()).toEqual({ released: true })
    await h.host.close()
  }
})

for (const committed of [true, false]) {
  test(`S-85: an unknown creation ${committed ? 'recognizes the committed' : 'resends only the absent'} original batch`, async () => {
    const owner = new ControlledSettlementOwner()
    const batches: string[] = []
    const h = await acknowledgementHost({
      owner,
      settlementContention: { ...policy(), limits: { ...policy().limits, concurrent: 1 } },
      append:
        real =>
        async (...args) => {
          if (isCreation(args[1])) {
            batches.push(writeJsonLossless(args[1]))
            if (batches.length === 1) {
              if (committed) expect(await real(...args)).not.toHaveProperty('failure')
              return { failure: 'unavailable' }
            }
          }
          return await real(...args)
        },
    })
    try {
      const request = h.request(`unknown-${committed}`)
      expect(await h.service.openCall(request)).toEqual({ unavailable: true })
      expect(owner.active).toBe(1)
      expect(h.wire.plans()).toBe(1)
      const recognized = await h.service.openCall(request)
      expect(recognized).toEqual({
        ref: { session: h.host.session, callId: 'a22-call-1' },
        callId: 'a22-call-1',
        state: 'open',
      })
      expect(owner.active).toBe(0)
      expect(h.wire.plans()).toBe(1)
      expect(h.wire.sends()).toBe(0)
      expect(batches).toHaveLength(committed ? 1 : 2)
      expect(new Set(batches).size).toBe(1)
      expect(kinds(await h.entries()).filter(kind => kind === 'model_call_created')).toHaveLength(1)
      expect(await h.service.openCall(request)).toEqual(recognized)
      expect(batches).toHaveLength(committed ? 1 : 2)
    } finally {
      expect(await h.runtime.close()).toEqual({ released: true })
      expect(owner.active).toBe(0)
      await h.host.close()
    }
  })
}

test('S-85: a visible marker cannot bypass the original writer actual stop', async () => {
  const owner = new ControlledSettlementOwner()
  const stopped = deferred<void>()
  const requested = deferred<void>()
  const acquire = owner.acquire
  vi.spyOn(owner, 'acquire').mockImplementation(limit => {
    const grant = acquire(limit)
    if (!('registration' in grant)) return grant
    const original = grant.registration
    return {
      registration: {
        ...original,
        start(kind, operation) {
          const task = original.start(kind, operation)
          return {
            ...task,
            requestStop() {
              if (kind === 'controlAppend') requested.resolve()
              task.requestStop()
            },
          }
        },
      },
    }
  })
  let writes = 0
  const h = await acknowledgementHost({
    owner,
    settlementContention: { ...policy(), limits: { ...policy().limits, concurrent: 1 } },
    append:
      real =>
      async (...args) => {
        if (!isCreation(args[1])) return await real(...args)
        writes++
        expect(await real(...args)).not.toHaveProperty('failure')
        owner.stopBarrier = stopped.promise
        return { failure: 'unavailable' }
      },
  })
  let retry: ReturnType<typeof h.service.openCall> | undefined
  try {
    const request = h.request('unknown-stop')
    expect(await h.service.openCall(request)).toEqual({ unavailable: true })
    expect(kinds(await h.entries()).filter(kind => kind === 'model_call_created')).toHaveLength(1)
    const beforeReads = owner.starts.filter(kind => kind === 'read').length
    let returned = false
    retry = h.service.openCall(request).then(result => {
      returned = true
      return result
    })
    await requested.promise
    expect(returned).toBe(false)
    expect(owner.starts.filter(kind => kind === 'read')).toHaveLength(beforeReads)
    expect(owner.active).toBe(1)
    expect(await h.service.openCall(request)).toEqual({ unavailable: true })
    expect(writes).toBe(1)
    owner.stopBarrier = undefined
    stopped.resolve()
    expect(await retry).toHaveProperty('ref.callId', 'a22-call-1')
    expect(owner.active).toBe(0)
    expect(writes).toBe(1)
  } finally {
    owner.stopBarrier = undefined
    stopped.resolve()
    await retry
    expect(await h.runtime.close()).toEqual({ released: true })
    await h.host.close()
  }
})

test('S-85: closing an absent unknown creation never resubmits it', async () => {
  const owner = new ControlledSettlementOwner()
  let writes = 0
  const h = await acknowledgementHost({
    owner,
    append:
      real =>
      async (...args) => {
        if (!isCreation(args[1])) return await real(...args)
        writes++
        return { failure: 'unavailable' }
      },
  })
  try {
    expect(await h.service.openCall(h.request('unknown-close'))).toEqual({ unavailable: true })
    expect(owner.active).toBe(1)
    expect(await h.runtime.close()).toEqual({ released: true })
    expect(owner.active).toBe(0)
    expect(writes).toBe(1)
    expect(kinds(await h.entries())).not.toContain('model_call_created')
  } finally {
    await h.runtime.close()
    await h.host.close()
  }
})

test('S-85: overlapping creation requests never start a second publisher', async () => {
  const entered = deferred<void>()
  const finish = deferred<void>()
  let writes = 0
  const h = await acknowledgementHost({
    append:
      real =>
      async (...args) => {
        if (isCreation(args[1])) {
          writes++
          entered.resolve()
          await finish.promise
        }
        return await real(...args)
      },
  })
  let pending: ReturnType<typeof h.service.openCall> | undefined
  try {
    const request = h.request('overlapping')
    pending = h.service.openCall(request)
    await entered.promise
    expect(await h.service.openCall(request)).toEqual({ unavailable: true })
    expect(h.wire.plans()).toBe(1)
    expect(writes).toBe(1)
    finish.resolve()
    const first = await pending
    expect(first).toHaveProperty('ref')
    expect(await h.service.openCall(request)).toEqual(first)
    expect(writes).toBe(1)
  } finally {
    finish.resolve()
    await pending
    expect(await h.runtime.close()).toEqual({ released: true })
    await h.host.close()
  }
})

test('S-85: Run and exact attempt belong to the original creation association', async () => {
  const h = await acknowledgementHost()
  try {
    const run = 'recognition-run'
    const captured = captureModelLogValue({
      category: 'message',
      input: {
        kind: 'value',
        value: {
          id: 'recognition-start',
          type: 'system_reminder',
          nature: 'event',
          source: {
            kind: 'attempt_started',
            attempt: 1,
            reason: 'first',
            at: '2026-10-04T00:00:00Z',
          },
          blocks: [],
          createdAt: '2026-10-04T00:00:00Z',
        },
      },
    })
    if (!('ok' in captured)) throw new Error('attempt capture')
    const prepared = prepareModelLogEntry({
      session: h.host.session,
      shell: { tenant: h.host.tenant, run, attempt: 1 },
      captured: captured.ok,
      purpose: { kind: 'message' },
      messagePrefix: [],
    })
    if (!('ok' in prepared)) throw new Error('attempt entry')
    expect(
      await h.host.log.append(
        h.host.session,
        [prepared.ok],
        { kind: 'fenced', run, attempt: 1 },
        { kind: 'unconditional' },
      ),
    ).not.toHaveProperty('failure')
    const report: AvailabilityReport = {
      session: h.host.session,
      runId: run,
      attempt: 1,
      computedAt: unwrap(instantFromEpochMs(0)),
      snapshots: [],
      availability: [],
      mcpActions: [],
      endpointHoldings: [],
      effectivePermissions: {},
      skillGate: [],
    }
    const request = h.request('recognition-run-key', { run, attempt: 1, report })
    const first = await h.service.openCall(request)
    expect(first).toHaveProperty('ref')
    expect(await h.service.openCall({ ...request, attempt: new LosslessNumber('1.0') })).toEqual(
      first,
    )
    const entries = await h.entries()
    expect(await h.service.openCall(h.request('recognition-run-key'))).toEqual({
      creationConflict: true,
    })
    expect(
      await h.service.openCall({ ...request, attempt: 2, report: { ...report, attempt: 2 } }),
    ).toEqual({ creationConflict: true })
    expect(
      await h.service.openCall({
        ...request,
        run: 'other-run',
        report: { ...report, runId: 'other-run' },
      }),
    ).toEqual({ creationConflict: true })
    expect(await h.entries()).toEqual(entries)
    expect(h.wire.plans()).toBe(1)
    expect(h.wire.sends()).toBe(0)
  } finally {
    expect(await h.runtime.close()).toEqual({ released: true })
    await h.host.close()
  }
})

test('S-85: current Session and owner admission precede creation identity disclosure', async () => {
  const owner = new ControlledSettlementOwner()
  const h = await acknowledgementHost({ owner })
  try {
    const request = h.request('creation-admission')
    const first = await h.service.openCall(request)
    expect(first).toHaveProperty('ref')
    const entries = await h.entries()
    owner.state = 'closed'
    expect(await h.service.openCall(request)).toEqual({ runtimeStopped: true })
    expect(await h.service.openCall({ ...request, parameters: { seed: 2 } })).toEqual({
      runtimeStopped: true,
    })
    owner.state = 'open'
    const foreign = unwrap(parseOpaqueIdentifier('foreign-session', 'SessionRef'))
    expect(await h.service.openCall({ ...request, session: foreign })).toEqual({
      unavailable: true,
    })
    expect(await h.entries()).toEqual(entries)
    expect(h.wire.plans()).toBe(1)
  } finally {
    owner.state = 'open'
    expect(await h.runtime.close()).toEqual({ released: true })
    await h.host.close()
  }
})

test('S-85: runtime resource identity is not an input value and recognition does not replace it', async () => {
  const h = await acknowledgementHost()
  try {
    const request = h.request('creation-new-host')
    const first = await h.service.openCall(request)
    if (!('ref' in first)) throw new Error('initial creation')
    const original = h.calls.find(first.ref)
    const unregister = vi.fn()
    const controller = new AbortController()
    const host = {
      signal: controller.signal,
      stopping: () => controller.signal.aborted,
      register: () => ({ registration: { unregister } }),
    }
    expect(await h.service.openCall({ ...request, host })).toEqual(first)
    expect(unregister).toHaveBeenCalledTimes(1)
    expect(h.calls.find(first.ref)).toBe(original)
    expect(original?.view().request.host).toBe(request.host)
    controller.abort()
    expect(await h.service.openCall({ ...request, host })).toEqual({ runtimeStopped: true })
    expect(h.wire.plans()).toBe(1)
  } finally {
    expect(await h.runtime.close()).toEqual({ released: true })
    await h.host.close()
  }
})

test('S-85: recognition rechecks admission after preparation cleanup', async () => {
  const owner = new ControlledSettlementOwner()
  const h = await acknowledgementHost({ owner })
  try {
    const request = h.request('creation-cleanup-admission')
    expect(await h.service.openCall(request)).toHaveProperty('ref')
    const before = await h.entries()
    const host = {
      signal: new AbortController().signal,
      stopping: () => false,
      register: () => ({
        registration: {
          unregister() {
            owner.state = 'closed'
          },
        },
      }),
    }
    expect(await h.service.openCall({ ...request, host })).toEqual({ runtimeStopped: true })
    expect(await h.entries()).toEqual(before)
    expect(h.wire.plans()).toBe(1)
  } finally {
    owner.state = 'open'
    expect(await h.runtime.close()).toEqual({ released: true })
    await h.host.close()
  }
})
