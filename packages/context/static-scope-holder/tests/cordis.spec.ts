import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it } from 'vitest'
import {
  RuntimeContextTrustService,
  runtimeContextTenantBlocksKey,
  runtimeContextTenantBlocksPlugin,
  runtimeContextTenantScopeKey,
} from '@omne-harness/runtime-context-cordis-contract/cordis'
import { createRuntimeContextPlugin } from '@omne-harness/runtime-context-cordis/cordis'
import { TENANT_SCOPE_KIND, tenantScopePlugin } from '@omne-harness/static-scope-holder/cordis'
import { staticScopeOf } from '@omne-harness/static-scope-holder'
import { block, supplied, supplyOf, tenantA, trustOf } from './support.ts'

const BUDGET = block('test.budget')
const KEY = BUDGET.declaration.key
const READER = { consumer: 'coordinator', blocks: [KEY], needs: [] } as const

function trustService() {
  const ports = trustOf()
  return class Trust extends RuntimeContextTrustService<unknown> {
    readonly authority = ports.authority as RuntimeContextTrustService<unknown>['authority']
    readonly bindings = ports.bindings
  }
}

const owner = {
  name: 'owner-of-the-budget',
  inject: [runtimeContextTenantBlocksKey],
  apply(ctx: Context) {
    ctx.runtimeContextTenantBlocks.register({ blocks: [BUDGET] })
  },
}

// The real provider of Runtime Context: it binds a reader only for a caller of the reader's class.
async function tree() {
  const root = new Context()
  await root.plugin(trustService())
  const runtime = await root.plugin(createRuntimeContextPlugin())
  await root.plugin(runtimeContextTenantBlocksPlugin)
  await root.plugin(tenantScopePlugin)
  return { root, runtime }
}

describe('the tenant scope plugin', () => {
  it('holds the tenant-level scope with what the tree contributes at each ensure', async () => {
    const { root } = await tree()
    const holder = root.runtimeContextTenantScope
    expect(holder.scopeOf(tenantA)).toEqual(staticScopeOf(TENANT_SCOPE_KIND, tenantA))
    const before = await holder.issue('holder', tenantA, READER)
    expect(before).toMatchObject({ ok: { missing: { blocks: [KEY] } } })
    const fiber = await root.plugin(owner)
    expect(await holder.issue('holder', tenantA, READER)).toMatchObject({
      ok: { missing: { blocks: [] } },
    })
    await fiber.dispose()
    const after = await holder.issue('holder', tenantA, READER)
    expect(after).toMatchObject({ ok: { missing: { blocks: [KEY] } } })
  })

  it('reads as a caller of the class of the reader, whatever class that is', async () => {
    const { root } = await tree()
    await root.plugin(owner)
    supplied.set(supplyOf(KEY, tenantA), 12)
    const holder = root.runtimeContextTenantScope
    for (const consumer of ['coordinator', 'extension'] as const) {
      const read = await holder.read('holder', tenantA, { ...READER, consumer })
      expect(read).toMatchObject({ ok: { entries: [{ key: KEY, kind: 'value', value: 12 }] } })
    }
    const stranger = await holder.read('holder', tenantA, { ...READER, consumer: 'model' })
    expect(stranger).toEqual({ failure: { kind: 'denied' } })
  })

  it('is there only while Runtime Context and the registration point are both there', async () => {
    const { root, runtime } = await tree()
    expect(root.get(runtimeContextTenantScopeKey)).toBeDefined()
    await runtime.dispose()
    expect(root.get(runtimeContextTenantScopeKey)).toBeUndefined()
  })
})
