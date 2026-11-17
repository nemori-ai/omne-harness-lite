import { expect, it } from 'vitest'
import { tenantCodec } from '@omne-harness/legal-identity'
import type { SettingsTargetView } from '@omne-harness/settings'
import { heldAssetOf } from '../../../src/rows/governance/tenant-settings-service.ts'
import type { TenantAssetsAccess } from '../../../src/rows/governance/tenant-runtime.ts'
import { fixtureTenant } from '../../entry/support.ts'

const A = fixtureTenant('a')
const encoded = tenantCodec.encode(A)
if (!encoded.ok) throw new Error('fixture: tenant text')
const TENANT = encoded.value

type Answer = Awaited<ReturnType<TenantAssetsAccess['readHolding']>>

function view(policyId = 'asset'): SettingsTargetView {
  return {
    target: { policyId, targetRef: 'test.gadget.one', scopeRef: TENANT },
  } as unknown as SettingsTargetView
}

function holding(state: 'held' | 'removed'): Answer {
  return {
    kind: 'holding',
    holding: { category: 'gadget', name: 'one', state },
    selected: null,
  } as unknown as Answer
}

function world(answer: Answer | undefined) {
  const reads: unknown[] = []
  const assetOf = heldAssetOf({
    async assets(tenantRef) {
      reads.push(tenantRef)
      return answer === undefined
        ? undefined
        : {
            async readHolding(input) {
              reads.push(input)
              return answer
            },
          }
    },
  })
  return { assetOf, reads }
}

it('a target that is not an asset has no asset and reads nothing', async () => {
  const w = world(holding('held'))
  expect(await w.assetOf(A, view('independent'))).toBeUndefined()
  expect(w.reads).toEqual([])
})

it('a held holding names its own category and name, read for the tenant of the request', async () => {
  const w = world(holding('held'))
  expect(await w.assetOf(A, view())).toEqual({ category: 'gadget', name: 'one' })
  expect(w.reads).toEqual([TENANT, { holdingRef: 'test.gadget.one', scopeRef: TENANT }])
})

it('a holding that is removed or absent has no asset', async () => {
  expect(await world(holding('removed')).assetOf(A, view())).toBeUndefined()
  expect(await world({ kind: 'absent' }).assetOf(A, view())).toBeUndefined()
})

it('a holding that cannot be read, or a tenant whose assets are not open, throws', async () => {
  await expect(
    world({ kind: 'rejected', reason: 'unavailable' }).assetOf(A, view()),
  ).rejects.toThrow(/the holding cannot be read: unavailable/)
  await expect(world(undefined).assetOf(A, view())).rejects.toThrow(
    /the assets of the tenant are unavailable/,
  )
})
