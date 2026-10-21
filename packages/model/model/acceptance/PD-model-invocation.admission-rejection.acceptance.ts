// covers: PD-model-invocation S2
import { expect, it } from 'vitest'
import { createModelRuntime } from '@omne-harness/model'
import { encodeModelInvocationRef } from '@omne-harness/model-contract'
import { configuration, createAcceptanceAssembly, operation } from './fixtures/runtime.ts'

it('rejects temperature 2.1 before creating or scheduling a call', async () => {
  const f = createAcceptanceAssembly({
    facts: [],
    termination: { kind: 'completed', reason: 'stop' },
  })
  const provider = createModelRuntime(f.dependencies, configuration)
  const access = { ...f.access, call: f.call }
  const admission = operation('admit')
  const encoded = encodeModelInvocationRef({ tenant: f.access.tenant, call: f.call, admission })
  if ('failure' in encoded) throw new Error('Invalid acceptance invocation reference')
  const lookupAccess = { ...f.access, reference: encoded.ok }
  expect(
    await provider.runtime.calls.admit({
      ...access,
      operation: admission,
      request: { ...f.request, parameters: [{ kind: 'temperature', value: 2.1 }] },
      consumer: f.consumer,
      capacity: f.capacity,
    }),
  ).toEqual({ failure: { kind: 'invalid', field: '/request/parameters/0/value', reason: 'range' } })
  expect(await provider.runtime.calls.inspect(lookupAccess)).toEqual({
    ok: { kind: 'not-accepted', operation: admission },
  })
  expect(await provider.runtime.instances.connect(lookupAccess)).toEqual({
    failure: { kind: 'invalid', field: 'call', reason: 'not-found' },
  })
  expect(f.counts).toEqual({ schedules: 0, windows: 0, preserves: 0, settlements: 0 })
  expect(f.upstream.counts()).toMatchObject({ prepare: 0, start: 0 })
})
