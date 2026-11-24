import { expect, it } from 'vitest'
import type {
  EnabledExtensionsRead,
  EnabledExtensionsView,
} from '@omne-harness/loop-extension-contract'
import { enabledExtensionsDescriptor } from '@omne-harness/loop-extension-contract'
import { enabledExtensionsBlock } from '@omne-harness/loop-extension-host-local'
import type { ScopeRef } from '@omne-harness/runtime-context-contract'
import { tenantA as TENANT } from './world.ts'

const view: EnabledExtensionsView = { members: [], basis: { assets: '1', settings: '1' } }
const scope = { ref: 'tenant-scope' } as ScopeRef

function blockOf(answer: () => EnabledExtensionsRead | Promise<EnabledExtensionsRead>) {
  const asked: unknown[] = []
  const block = enabledExtensionsBlock<string>({
    async read(access) {
      asked.push(access)
      return answer()
    },
  })
  return { block, asked }
}

it('declares the block of the contract and asks the view of the tenant at each read, as the reader', async () => {
  const { block, asked } = blockOf(() => ({ kind: 'view', view }))
  expect(block.declaration).toBe(enabledExtensionsDescriptor)
  const input = { scope, tenant: TENANT, principal: 'reader' }
  expect(await block.supply(input)).toEqual({ kind: 'value', value: view })
  expect(await block.supply(input)).toEqual({ kind: 'value', value: view })
  expect(asked).toEqual([
    { principal: 'reader', tenant: TENANT },
    { principal: 'reader', tenant: TENANT },
  ])
})

it('a view that cannot be read is unavailable, never an empty view', async () => {
  const { block } = blockOf(() => ({
    kind: 'unavailable',
    diagnostic: 'the holdings cannot be read',
  }))
  expect(await block.supply({ scope, tenant: TENANT, principal: 'reader' })).toEqual({
    kind: 'unavailable',
  })
})
