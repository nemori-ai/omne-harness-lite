import { expect, it } from 'vitest'
import type { ContentBlock } from '@omne-harness/content-block'
import {
  acquisitionRef,
  originRef,
  type ManagedResource,
  type OriginalAcquisition,
} from '@omne-harness/execution-environment-contract'
import { succeed } from '@omne-harness/operation-result'
import { createMemoryToolLedgerStore } from '@omne-harness/tool/testing'
import { canonicalDigest } from '@omne-harness/tool'
import type { PreparationRecord } from '@omne-harness/tool-contract/provider'
import { createEnvironmentResourceLedger } from '../../src/environment-resource-ledger.ts'
import { createEnvironmentStateStore } from '../../src/environment-state.ts'
import { adoption, callId, evidence, operationId, request, tenantA } from '../coordinator-values.ts'

async function fixture() {
  const store = createMemoryToolLedgerStore<ContentBlock>()
  const state = createEnvironmentStateStore({ store, mode: 'test' })
  const preparation: PreparationRecord = {
    tenant: tenantA,
    call: callId('call'),
    operation: operationId('prepare'),
    adoption: adoption('environment'),
    inputDigest: 'input',
    purpose: 'initial',
    request: request(),
  }
  const original: OriginalAcquisition = {
    tenant: tenantA,
    acquisition: acquisitionRef('original'),
    origin: originRef('caller'),
    scope: preparation.request.requesterScope,
    placement: {
      kind: 'placement',
      binding: { kind: 'host_machine' },
      requirement: {
        allowedBindings: [{ kind: 'host_machine' }],
        facilities: ['command'],
        isolation: [],
      },
      provider: { name: 'fixture', version: '1', generation: '1' },
      quotaDomain: 'fixture',
      continuity: { kind: 'not_guaranteed' },
    },
  }
  await state.update(preparation, () =>
    succeed({
      preparation,
      original,
      digest: canonicalDigest(preparation),
      allocation: { kind: 'sent' },
      closed: false,
      evidence: evidence('original'),
      release: null,
      resources: [],
    }),
  )
  let allowed = true
  const build = () =>
    createEnvironmentResourceLedger({
      state: createEnvironmentStateStore({ store, mode: 'test' }),
      address: preparation,
      authorize: async () => (allowed ? 'authorized' : 'notAuthorized'),
    })
  const ledger = await build()
  const resource: ManagedResource = {
    key: 'process',
    provider: 'fixture',
    reference: { kind: 'string', value: 'generation-1' },
  }
  return {
    store,
    state,
    preparation,
    ledger,
    resource,
    build,
    revoke: () => {
      allowed = false
    },
  }
}

it('cannot permit a resource that has no original acquisition record', async () => {
  const ledger = await createEnvironmentResourceLedger({
    state: {
      read: async () => ({ ok: null }),
      update: async () => ({ failure: { kind: 'not-settled' } }),
      onClosed: () => () => {},
    },
    address: { tenant: tenantA, call: callId('call'), operation: operationId('prepare') },
    authorize: async () => 'authorized',
  })
  expect(await ledger.permit('missing')).toBe('unavailable')
})

it('requires a confirmed durable plan and preserves input conflicts', async () => {
  const f = await fixture()
  expect(await f.ledger.permit(f.resource.key)).toBe('unavailable')
  f.store.injectCommit('unknown-dropped')
  expect(await f.ledger.plan(f.resource)).toBe('unavailable')
  expect(await f.ledger.permit(f.resource.key)).toBe('unavailable')
  expect(await f.ledger.plan(f.resource)).toBe('recorded')
  expect(await f.ledger.plan({ ...f.resource, provider: 'other' })).toBe('conflict')
  expect(await f.ledger.permit(f.resource.key)).toBe('confirmed')
})

it('does not confirm a lost permit and recognizes a committed receipt', async () => {
  const f = await fixture()
  await f.ledger.plan(f.resource)
  f.store.injectCommit('unknown-dropped')
  expect(await f.ledger.permit(f.resource.key)).toBe('unavailable')
  expect(await f.ledger.inspect()).toMatchObject([{ permitted: false }])
  f.store.injectCommit('unknown-applied')
  expect(await f.ledger.permit(f.resource.key)).toBe('confirmed')
  expect(await f.ledger.inspect()).toMatchObject([{ permitted: true }])
})

it('keeps unconfirmed stop responsibilities across reconstruction', async () => {
  const f = await fixture()
  await f.ledger.plan(f.resource)
  await f.ledger.permit(f.resource.key)
  expect(await f.ledger.stopped(f.resource.key, 'unconfirmed')).toBe('recorded')
  const rebuilt = await f.build()
  expect(await rebuilt.inspect()).toMatchObject([{ resource: f.resource, stop: 'unconfirmed' }])
  f.store.injectCommit('unknown-dropped')
  expect(await rebuilt.stopped(f.resource.key, 'confirmed')).toBe('unavailable')
  expect(await rebuilt.inspect()).toMatchObject([{ stop: 'unconfirmed' }])
})

it('reads durable closure on every permit and aborts all local views after close', async () => {
  const f = await fixture()
  const other = await f.build()
  await f.ledger.plan(f.resource)
  expect(await other.close()).toBe('confirmed')
  expect(f.ledger.closed.aborted).toBe(true)
  expect(await f.ledger.permit(f.resource.key)).toBe('closed')
  const cold = await f.build()
  expect(cold.closed.aborted).toBe(true)
  expect(await cold.plan({ ...f.resource, key: 'new' })).toBe('closed')
  expect(await cold.stopped(f.resource.key, 'confirmed')).toBe('recorded')
})

it('checks current authorization before adopting an existing resource', async () => {
  const f = await fixture()
  await f.ledger.plan(f.resource)
  f.revoke()
  expect(await f.ledger.adopt(f.resource.key)).toBe('unavailable')
  expect(await f.ledger.inspect()).toMatchObject([{ adopted: false }])
})
