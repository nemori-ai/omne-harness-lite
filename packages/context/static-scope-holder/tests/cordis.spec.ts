import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it } from 'vitest'
import type { RuntimeContextOperations } from '@omne-harness/runtime-context-contract'
import {
  RuntimeContextService,
  runtimeContextTenantBlocksKey,
  runtimeContextTenantBlocksPlugin,
  runtimeContextTenantScopeKey,
} from '@omne-harness/runtime-context-cordis-contract/cordis'
import { createRuntimeContext } from '@omne-harness/runtime-context'
import { TENANT_SCOPE_KIND, tenantScopePlugin } from '@omne-harness/static-scope-holder/cordis'
import { staticScopeOf } from '@omne-harness/static-scope-holder'
import { block, readWith, supplied, supplyOf, tenantA, trustOf } from './support.ts'

const BUDGET = block('test.budget')
const KEY = BUDGET.declaration.key
const READER = { consumer: 'coordinator', blocks: [KEY], needs: [] } as const

type Ops = RuntimeContextOperations<unknown>

function runtimeOf(rc: Ops) {
  return class Runtime extends RuntimeContextService<unknown> {
    registerProducer = rc.registerProducer as RuntimeContextService<unknown>['registerProducer']
    prepareRegistration: Ops['prepareRegistration'] = (...args) => rc.prepareRegistration(...args)
    issueEligibility: Ops['issueEligibility'] = (...args) => rc.issueEligibility(...args)
    revokeEligibility: Ops['revokeEligibility'] = (...args) => rc.revokeEligibility(...args)
    applyCommit: Ops['applyCommit'] = (...args) => rc.applyCommit(...args)
    beginReplay: Ops['beginReplay'] = (...args) => rc.beginReplay(...args)
    finishReplay: Ops['finishReplay'] = (...args) => rc.finishReplay(...args)
    bind: Ops['bind'] = (...args) => rc.bind(...args)
  }
}

const owner = {
  name: 'owner-of-the-budget',
  inject: [runtimeContextTenantBlocksKey],
  apply(ctx: Context) {
    ctx.runtimeContextTenantBlocks.register({ blocks: [BUDGET] })
  },
}

async function tree() {
  const rc = createRuntimeContext<unknown>({ trust: trustOf(), config: {} })
  const root = new Context()
  const runtime = await root.plugin(runtimeOf(rc))
  await root.plugin(runtimeContextTenantBlocksPlugin)
  await root.plugin(tenantScopePlugin)
  return { rc, root, runtime }
}

describe('the tenant scope plugin', () => {
  it('holds the tenant-level scope with what the tree contributes at each ensure', async () => {
    const { rc, root } = await tree()
    const holder = root.runtimeContextTenantScope
    expect(holder.scopeOf(tenantA)).toEqual(staticScopeOf(TENANT_SCOPE_KIND, tenantA))
    const before = await holder.issue('holder', tenantA, READER)
    expect(before).toMatchObject({ ok: { missing: { blocks: [KEY] } } })
    const fiber = await root.plugin(owner)
    const granted = await holder.issue('holder', tenantA, READER)
    expect(granted).toMatchObject({ ok: { missing: { blocks: [] } } })
    if ('failure' in granted) return
    supplied.set(supplyOf(KEY, tenantA), 12)
    expect(await readWith(rc, granted.ok.eligibility)).toMatchObject({ values: { [KEY]: 12 } })
    await fiber.dispose()
    const after = await holder.issue('holder', tenantA, READER)
    expect(after).toMatchObject({ ok: { missing: { blocks: [KEY] } } })
  })

  it('is there only while Runtime Context and the registration point are both there', async () => {
    const { root, runtime } = await tree()
    expect(root.get(runtimeContextTenantScopeKey)).toBeDefined()
    await runtime.dispose()
    expect(root.get(runtimeContextTenantScopeKey)).toBeUndefined()
  })
})
