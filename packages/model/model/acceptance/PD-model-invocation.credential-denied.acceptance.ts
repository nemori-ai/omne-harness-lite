// covers: PD-model-invocation S3
import { expect, it } from 'vitest'
import { createModelRuntime } from '@omne-harness/model'
import type { CredentialPort } from '@omne-harness/model-contract'
import { configuration, createAcceptanceAssembly, operation } from './fixtures/runtime.ts'

it('keeps a real driver credential refusal local and not sent', async () => {
  const sentinel = 'synthetic-send-credential'
  const resolved: {
    reference: Parameters<CredentialPort['resolve']>[0]
    face: Parameters<CredentialPort['resolve']>[1]
  }[] = []
  const f = createAcceptanceAssembly({
    facts: [],
    termination: { kind: 'completed', reason: 'stop' },
    tenantCredential: true,
    credentials: {
      present: () => ({ kind: 'unavailable' }),
      resolve(reference, face) {
        resolved.push({ reference, face })
        return { kind: 'denied' }
      },
    },
  })
  const provider = createModelRuntime(f.dependencies, configuration)
  const access = { ...f.access, call: f.call }
  const admission = operation('admit')
  expect(
    await provider.runtime.calls.admit({
      ...access,
      operation: admission,
      request: f.request,
      consumer: f.consumer,
      capacity: f.capacity,
    }),
  ).toMatchObject({ ok: { call: f.call } })
  try {
    const driven = await provider.driver.drive(f.driveInput, new AbortController().signal)
    expect(driven).toEqual({ failure: { kind: 'denied', action: 'model-credential' } })
    expect(resolved).toEqual([
      {
        reference: { id: f.tenantKey, tenant: f.access.tenant, purpose: 'model-send' },
        face: { authorized: true, official: false },
      },
    ])
    const dispatches = await provider.runtime.calls.dispatches(access)
    if ('failure' in dispatches) throw new Error('Cannot inspect dispatches')
    expect(dispatches.ok).toHaveLength(1)
    expect(dispatches.ok[0]).toMatchObject({ send: 'not-sent', terminal: null })
    const lookup = await provider.runtime.calls.inspect({ ...access, admission })
    if ('failure' in lookup || lookup.ok.kind !== 'found')
      throw new Error('Admitted call disappeared')
    expect(lookup.ok.state.phase).toBe('running')
    expect(lookup.ok.state.custody).toEqual({ kind: 'producer' })
    expect(f.upstream.counts()).toMatchObject({ start: 0, closeMaterialized: 1 })
    expect(f.counts.preserves).toBe(0)
    expect(f.counts.settlements).toBe(0)
    expect(JSON.stringify({ driven, dispatches, lookup, resolved })).not.toContain(sentinel)
  } finally {
    await f.withdrawPublication()
  }
})
