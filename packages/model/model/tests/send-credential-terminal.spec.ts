import { expect, it } from 'vitest'
import { createModelRuntime } from '@omne-harness/model'
import { encodeModelInvocationRef } from '@omne-harness/model-contract'
import {
  configuration,
  createAcceptanceAssembly,
  operation,
} from '../acceptance/fixtures/runtime.ts'

// A missing or unreadable tenant credential does not come back by itself. The real driver must
// end the call as a failure with cause `credential`; a caller that waits on `unavailable` hangs.
for (const [kind, diagnostic] of [
  ['absent', 'credential-missing'],
  ['unreadable', 'credential-unreadable'],
] as const)
  it(`settles the call as failed when the tenant credential is ${kind}`, async () => {
    const f = createAcceptanceAssembly({
      facts: [],
      termination: { kind: 'completed', reason: 'stop' },
      tenantCredential: true,
      credentials: {
        present: () => ({ kind: 'unavailable' }),
        resolve: () => ({ kind }),
        resolveFor: () => ({ kind }),
      },
    })
    const provider = createModelRuntime(f.dependencies, configuration)
    const access = { ...f.access, call: f.call }
    const admission = operation('admit')
    const encoded = encodeModelInvocationRef({ tenant: f.access.tenant, call: f.call, admission })
    if ('failure' in encoded) throw new Error('Invalid invocation reference')
    expect(
      await provider.runtime.calls.admit({
        ...access,
        operation: admission,
        request: f.request,
        consumer: f.consumer,
        capacity: f.capacity,
      }),
    ).toMatchObject({ ok: { call: f.call } })
    const fault = { cause: 'credential', diagnostic, upstreamStatus: null }
    try {
      expect(await provider.driver.drive(f.driveInput, new AbortController().signal)).toEqual({
        ok: undefined,
      })
      const dispatches = await provider.runtime.calls.dispatches(access)
      if ('failure' in dispatches) throw new Error('Cannot inspect dispatches')
      expect(dispatches.ok).toHaveLength(1)
      expect(dispatches.ok[0]).toMatchObject({
        send: 'not-sent',
        terminal: { kind: 'failed', fault },
      })
      const lookup = await provider.runtime.calls.inspect({ ...f.access, reference: encoded.ok })
      if ('failure' in lookup || lookup.ok.kind !== 'found') throw new Error('Call disappeared')
      expect(lookup.ok.state).toMatchObject({
        phase: 'settled',
        settlement: { termination: { kind: 'failed', fault } },
      })
      expect(f.upstream.counts()).toMatchObject({ start: 0 })
      expect(f.counts.settlements).toBe(1)
    } finally {
      await f.withdrawPublication()
    }
  })
