// R2-D164: the delivery runs of one tenant take turns in arrival order. A later call of the tenant
// waits for its turn instead of being refused with delivery-capacity, so a call that is driven
// more often cannot starve it. Real ledger over the memory store; the receiver is scripted.
import { expect, it, vi } from 'vitest'
import { succeed } from '@omne-harness/operation-result'
import { resolveToolInvocationRef, type ToolResultReceiver } from '@omne-harness/tool-contract'
import type { ContentBlock } from '@omne-harness/content-block'
import { decodeToolRevision } from '@omne-harness/tool-contract/provider'
import { callId, tenantB } from '../coordinator-values.ts'
import { createLocalToolResultDelivery } from '../../src/result-delivery.ts'
import { fixture, ok } from './fixture.ts'

type Push = Parameters<ToolResultReceiver<string, ContentBlock>['push']>[0]
/** The call a push is for, from the reference of its delivery key. */
const callOf = (input: Push) =>
  ok(resolveToolInvocationRef(input.delivery.key.reference, input.access.tenant)).call

/** The fixture call plus a later call of the same tenant, each with a pending delivery. */
async function twoCalls() {
  const f = await fixture()
  const later = callId('later-call')
  await f.store.commit({
    domain: { ...f.domain, call: later },
    expected: ok(decodeToolRevision('0')),
    revision: ok(decodeToolRevision('1')),
    writes: [
      {
        kind: 'put',
        record: {
          kind: 'call',
          call: { ...f.call, call: later, state: { ...f.call.state, call: later } },
        },
      },
      {
        kind: 'put',
        record: { kind: 'result', result: await f.resultFor({ ...f.access, call: later }) },
      },
      { kind: 'put', record: { kind: 'task', task: f.task } },
    ],
  })
  vi.mocked(f.input.position.access).mockImplementation(async ({ tenant, call }) =>
    succeed({ ...f.access, tenant, call }),
  )
  // The push of the first call waits until the test lets it go.
  let release: () => void = () => undefined
  const held = new Promise<void>(resolve => {
    release = resolve
  })
  let started: () => void = () => undefined
  const ready = new Promise<void>(resolve => {
    started = resolve
  })
  vi.mocked(f.receiver.push).mockImplementation(async input => {
    if (callOf(input) === f.access.call) {
      started()
      await held
    }
    return f.receive(input)
  })
  const worker = createLocalToolResultDelivery(f.input)
  const driveLater = () =>
    worker.drive({ ...f.access, call: later, signal: new AbortController().signal })
  const pushedCalls = () => vi.mocked(f.receiver.push).mock.calls.map(([input]) => callOf(input))
  /** A call of another tenant with its own pending delivery. */
  const otherTenant = async () => {
    const call = callId('other-tenant-call')
    await f.store.commit({
      domain: { ...f.domain, tenant: tenantB, call },
      expected: ok(decodeToolRevision('0')),
      revision: ok(decodeToolRevision('1')),
      writes: [
        {
          kind: 'put',
          record: {
            kind: 'call',
            call: { ...f.call, tenant: tenantB, call, state: { ...f.call.state, call } },
          },
        },
        {
          kind: 'put',
          record: {
            kind: 'result',
            result: await f.resultFor({ ...f.access, tenant: tenantB, call }),
          },
        },
        { kind: 'put', record: { kind: 'task', task: f.task } },
      ],
    })
    return { ...f.access, tenant: tenantB, call, signal: new AbortController().signal }
  }
  return { f, later, worker, driveLater, ready, release, pushedCalls, otherTenant }
}

it('R2-D164 a later call of the same tenant waits for its turn instead of being refused', async () => {
  const w = await twoCalls()
  const first = w.f.drive(w.worker)
  await w.ready
  const second = w.driveLater()
  const again = w.driveLater()
  await new Promise(resolve => setTimeout(resolve, 0))
  // The later call is queued behind the turn of the first one, not pushed and not refused.
  expect(w.pushedCalls()).toEqual([w.f.access.call])
  w.release()
  expect(await first).toEqual(succeed({ pending: 0 }))
  expect(await second).toEqual(succeed({ pending: 0 }))
  expect(await again).toEqual(succeed({ pending: 0 }))
  expect(w.pushedCalls()).toEqual([w.f.access.call, w.later])
  await w.worker.close()
})

it('R2-D164 close ends a queued turn before its run starts', async () => {
  const w = await twoCalls()
  const first = w.f.drive(w.worker)
  await w.ready
  const second = w.driveLater()
  await new Promise(resolve => setTimeout(resolve, 0))
  await w.worker.close()
  expect(await first).toHaveProperty('failure.kind', 'unavailable')
  expect(await second).toHaveProperty('failure.dependency', 'delivery-wait')
  expect(w.pushedCalls()).toEqual([w.f.access.call])
  w.release()
})

it('R2-D186 a queued turn of one tenant does not take the place of another tenant', async () => {
  const w = await twoCalls()
  const other = await w.otherTenant()
  // Capacity 2. Tenant A: one push that never answers, one call queued whose caller gives up.
  const first = w.f.drive(w.worker)
  await w.ready
  const caller = new AbortController()
  const second = w.worker.drive({ ...w.f.access, call: w.later, signal: caller.signal })
  await new Promise(resolve => setTimeout(resolve, 0))
  caller.abort()
  expect(await second).toHaveProperty('failure.dependency', 'delivery-wait')
  // Tenant B still has a place: it runs and finishes while A's turn and queue stay in place.
  expect(await w.worker.drive(other)).toEqual(succeed({ pending: 0 }))
  expect(w.pushedCalls()).toEqual([w.f.access.call, other.call])
  await w.worker.close()
  await first
})

it('R2-D186 the running and queued runs of one tenant stay within the capacity', async () => {
  const w = await twoCalls()
  const first = w.f.drive(w.worker)
  await w.ready
  const second = w.driveLater()
  await new Promise(resolve => setTimeout(resolve, 0))
  // Capacity 2: one running, one queued. A third call of the tenant has no place.
  const third = await w.worker.drive({
    ...w.f.access,
    call: callId('third-call'),
    signal: new AbortController().signal,
  })
  expect(third).toHaveProperty('failure.dependency', 'delivery-capacity')
  w.release()
  expect(await first).toEqual(succeed({ pending: 0 }))
  expect(await second).toEqual(succeed({ pending: 0 }))
  await w.worker.close()
})
