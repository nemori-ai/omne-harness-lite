import { expect, it } from 'vitest'
import { tenantCodec } from '@omne-harness/legal-identity'
import type { AssetTarget } from '@omne-harness/settings'
import { settingsHoldingOf } from '../../../src/rows/governance/tenant-settings-service.ts'
import type { TenantAssetsAccess } from '../../../src/rows/governance/tenant-runtime.ts'
import { fixtureTenant } from '../../entry/support.ts'

const A = fixtureTenant('a')
const encoded = tenantCodec.encode(A)
if (!encoded.ok) throw new Error('fixture: tenant text')
const TENANT = encoded.value
const TARGET: AssetTarget = { kind: 'asset', holdingRef: 'test.gadget.one', scopeRef: TENANT }

type Answer = Awaited<ReturnType<TenantAssetsAccess['readHolding']>>

function holding(state: 'held' | 'removed'): Answer {
  return {
    kind: 'holding',
    holding: { category: 'gadget', name: 'one', state },
    selected: null,
  } as unknown as Answer
}

function world(answer: Answer | undefined) {
  const reads: unknown[] = []
  const holdingOf = settingsHoldingOf({
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
  return { holdingOf, reads }
}

it('a held holding names its own category and name, read for the tenant of the request', async () => {
  const w = world(holding('held'))
  expect(await w.holdingOf(A, TARGET)).toEqual({ category: 'gadget', name: 'one' })
  expect(w.reads).toEqual([TENANT, { holdingRef: 'test.gadget.one', scopeRef: TENANT }])
})

it('a holding that is removed or absent has no asset', async () => {
  expect(await world(holding('removed')).holdingOf(A, TARGET)).toBeUndefined()
  expect(await world({ kind: 'absent' }).holdingOf(A, TARGET)).toBeUndefined()
})

it('a holding that cannot be read, or a tenant whose assets are not open, throws', async () => {
  await expect(
    world({ kind: 'rejected', reason: 'unavailable' }).holdingOf(A, TARGET),
  ).rejects.toThrow(/the holding cannot be read: unavailable/)
  await expect(world(undefined).holdingOf(A, TARGET)).rejects.toThrow(
    /the assets of the tenant are unavailable/,
  )
})
