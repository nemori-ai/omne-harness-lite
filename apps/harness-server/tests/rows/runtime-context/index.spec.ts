// @module-tag slow
// The `runtime-context` row: the real Runtime Context provider (`createRuntimeContextPlugin()` of
// `@omne-harness/runtime-context-cordis/cordis`) on a real Cordis. The row is ACTIVE and provides
// `runtimeContext` once the trusted `runtimeContextTrust` is present; without it the row stays
// PENDING and names that key. The trust is a test stand-in over the contract's scripted authority
// ports: the real one is built by the assembly entry from the session bridge. The configuration is
// the bounds and the diagnostics level of the assembly page; unknown fields and values outside a
// bound are refused.
import { afterEach, describe, expect, it } from 'vitest'
import type { Context } from '@deepseek-ai/cordis'
import { tenantCodec } from '@omne-harness/legal-identity'
import {
  decodeScopeRef,
  type RuntimeContextOperations,
} from '@omne-harness/runtime-context-contract'
import {
  createTestAuthorityPorts,
  type TestAuthorityPorts,
} from '@omne-harness/runtime-context-contract/testing'
import {
  RuntimeContextTrustService,
  runtimeContextKey,
  runtimeContextTrustKey,
} from '@omne-harness/runtime-context-cordis-contract/cordis'
import { rowDeclarationOf } from '../../../src/row.ts'
import { serveProfile } from '../../../src/profile.ts'
import { runtimeContextRow } from '../../../src/rows/runtime-context/index.ts'
import type { EntryObjectModule, RowId } from '../../../src/types.ts'
import { declared, loadTree, makeBase, type LoadedTree } from '../session-fixtures/tree.ts'

const tenantResult = tenantCodec.parse(
  JSON.stringify({
    organization: 'org_00000000000000000000000000',
    account: 'acc_00000000000000000000000001',
  }),
)
if (!tenantResult.ok) throw new Error('fixture tenant does not parse')
const tenant = tenantResult.value

const scopeResult = decodeScopeRef({ ref: 'scope-1' })
if (!('ok' in scopeResult)) throw new Error('fixture scope does not decode')
const scope = scopeResult.ok

/** Stands in for the assembly entry's `runtimeContextTrust`: the two original ports, scripted. */
function trustObject(ports: TestAuthorityPorts<unknown>): EntryObjectModule {
  class Trust extends RuntimeContextTrustService<unknown> {
    readonly authority = ports.authority
    readonly bindings = ports.bindings
  }
  return {
    name: runtimeContextTrustKey,
    implementation: 'contract-double',
    install(installScope: Context) {
      new Trust(installScope)
    },
  }
}

const release: Array<() => Promise<void> | void> = []
afterEach(async () => {
  for (const close of release.splice(0).reverse()) await close()
})

async function start(options: {
  trust: TestAuthorityPorts<unknown> | null
  config?: unknown
}): Promise<LoadedTree> {
  const base = makeBase()
  release.push(() => base.release())
  const tree = await loadTree({
    base,
    rows: [declared(runtimeContextRow, options.config ?? {})],
    entryObjects: options.trust === null ? [] : [trustObject(options.trust)],
    readinessTimeoutMs: options.trust === null ? 2000 : 10_000,
  })
  release.push(() => tree.dispose())
  return tree
}

type Schema = { '~standard': { validate(value: unknown): { issues?: unknown } } }
function accepts(value: unknown): boolean {
  const config = runtimeContextRow.Config as Schema | undefined
  expect(config).toBeDefined()
  return config?.['~standard'].validate(value).issues === undefined
}

describe('the runtime-context row: declaration', () => {
  it('is the real row and equals the table row of the assembly page, with no shutdown phase', () => {
    const declaration = rowDeclarationOf(runtimeContextRow)
    expect(declaration).toEqual({
      row: 'runtime-context',
      implementation: 'real',
      manifest: {
        provides: ['runtimeContext'],
        injects: ['runtimeContextTrust'],
        phase: null,
        sameProviderGroup: null,
      },
      lifecycle: { kind: 'none' },
    })
    const table = serveProfile().stubManifests.get('runtime-context' as RowId)
    expect(declaration?.manifest).toEqual(table)
  })

  it('accepts the bounds and the diagnostics level of the page', () => {
    expect(accepts({})).toBe(true)
    expect(
      accepts({
        retention: 64,
        replayCapacity: 10000,
        supplyBoundMs: 30000,
        settleBoundMs: 1000,
        readCacheEntries: 256,
        diagnostics: 'warn',
      }),
    ).toBe(true)
    expect(accepts({ readCacheEntries: 0 })).toBe(true)
  })

  it('refuses an unknown field, a bound out of range and an unknown level', () => {
    expect(accepts({ retension: 64 })).toBe(false)
    expect(accepts({ readCacheEntries: -1 })).toBe(false)
    expect(accepts({ retention: 'many' })).toBe(false)
    expect(accepts({ diagnostics: 'loud' })).toBe(false)
  })
})

describe('the runtime-context row: on a test stand-in of `runtimeContextTrust`', () => {
  it('is ACTIVE and provides `runtimeContext`', { timeout: 60_000 }, async () => {
    const tree = await start({ trust: createTestAuthorityPorts<unknown>() })
    expect(tree.allActive).toBe(true)
    expect(tree.state('runtime-context')).toMatchObject({ state: 'ACTIVE', missing: [] })
    expect(tree.service(runtimeContextKey)).toBeDefined()
  })

  it(
    'without the trust stays PENDING and names `runtimeContextTrust`',
    { timeout: 60_000 },
    async () => {
      const tree = await start({ trust: null })
      expect(tree.state('runtime-context')).toMatchObject({
        state: 'PENDING',
        missing: ['runtimeContextTrust'],
      })
      expect(tree.service(runtimeContextKey)).toBeUndefined()
    },
  )

  it('asks the ports of the trust for every operation', { timeout: 60_000 }, async () => {
    const ports = createTestAuthorityPorts<unknown>()
    ports.bind(scope, tenant)
    const tree = await start({ trust: ports })
    const service = tree.service<RuntimeContextOperations<unknown>>(runtimeContextKey)!
    const begun = await service.beginReplay('holder', {
      scope,
      tenant,
      through: null,
      supersedes: null,
    })
    expect(begun.kind).toBe('replaying')
    expect(ports.calls.map(call => call.face)).toContain('holder')
  })

  it('does not answer for a holder the authority refuses', { timeout: 60_000 }, async () => {
    const ports = createTestAuthorityPorts<unknown>()
    ports.bind(scope, tenant)
    ports.script(call => (call.face === 'holder' ? { kind: 'refused' } : undefined))
    const tree = await start({ trust: ports })
    const service = tree.service<RuntimeContextOperations<unknown>>(runtimeContextKey)!
    const begun = await service.beginReplay('holder', {
      scope,
      tenant,
      through: null,
      supersedes: null,
    })
    expect(begun.kind).not.toBe('replaying')
  })

  it('fails the row on a configuration the plugin refuses', { timeout: 60_000 }, async () => {
    const tree = await start({
      trust: createTestAuthorityPorts<unknown>(),
      config: { retension: 64 },
    })
    expect(tree.state('runtime-context').state).toBe('FAILED')
    expect(tree.service(runtimeContextKey)).toBeUndefined()
  })
})
