// `tool-bindings` 行（B3-T2a 第 5、6、9 项）：一个插件一个 fiber 提供 `toolBindings` 与 `toolCatalog`；可用性只取
// 已核来源；启动权威是逐次现取的窄代理；scope 与 settle 是明确的 unavailable 占位。
import { describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { principalIssuerKey, principalVerifierKey } from '@omne-harness/identity/cordis'
import { fail, succeed } from '@omne-harness/operation-result'
import type { ToolConsumerProfile, ToolDefinition } from '@omne-harness/tool-contract'
import {
  deriveDefinition,
  judgeToolDefinition,
  type ToolStartAuthority,
} from '@omne-harness/tool-contract/provider'
import {
  ToolStartAuthorityService,
  toolBindingsKey,
  toolCatalogKey,
} from '@omne-harness/tool-cordis-contract/cordis'
import { shellToolModule } from '@omne-harness/tool-definitions'
import { principalIssuer, sessionWorkIssuerOf } from '../../../src/entry/principals.ts'
import { createToolReleaseEntries } from '../../../src/entry/tool-release.ts'
import { governanceOf } from '../../../src/entry/tool-release-manifest.ts'
import { createReleaseAvailability } from '../../../src/rows/tool-bindings/availability.ts'
import {
  startAuthorityProxy,
  toolBindingsRow,
  bundleScope,
  bundleSettle,
} from '../../../src/rows/tool-bindings/index.ts'
import { toolRuntimeHolder, type ToolRuntimeBundle } from '../../../src/rows/tool-runtime/holder.ts'
import { StubService } from '../../../src/s0/stub-plugin.ts'
import { fixtureEnv, fixtureTenant, got, okOf } from '../../entry/support.ts'
import { TEST_CONSTRUCTION, entryOf, releaseFixture, tree } from '../tool-host/support.ts'

async function judged() {
  const fixture = await releaseFixture()
  const tenant = fixtureTenant('a')
  const principal = okOf(sessionWorkIssuerOf(fixture.env)({ tenant, session: 'ses-1' }), 'issue')
  const entry = entryOf(fixture.manifest, 'Shell')
  const created = okOf(shellToolModule.createAuthor(tree(TEST_CONSTRUCTION.Shell)), 'author')
  const definition = okOf(
    judgeToolDefinition(deriveDefinition(governanceOf(entry), created.facts)),
    'definition',
  )
  const consumer: ToolConsumerProfile = {
    capabilities: fixture.manifest.consumer.capabilities,
    conversion: null,
    attachmentAccess: fixture.manifest.consumer.attachmentAccess,
  }
  const availability = createReleaseAvailability(fixture.root)
  const judge = (overrides: object = {}) =>
    availability.judge({
      principal,
      tenant,
      definition,
      layer: { kind: 'official' },
      consumer,
      ...overrides,
    })
  return { fixture, tenant, principal, definition, consumer, judge }
}

describe('tool-bindings: availability from verified sources only', () => {
  it('allows a release definition for a verified session work principal and the confirmed text consumer', async () => {
    const { judge } = await judged()
    expect(await judge()).toEqual(
      succeed({
        qualification: 'allowed',
        dependencies: [
          { name: 'facility:command', available: false },
          { name: 'facility:terminal', available: false },
        ],
        inputCompatible: true,
        outputCompatible: true,
        attachmentsReadable: true,
      }),
    )
  })

  it('answers unavailable for consumer material the release has not confirmed', async () => {
    const { judge, consumer } = await judged()
    const strange: ToolConsumerProfile = {
      ...consumer,
      capabilities: { ...consumer.capabilities, digest: `sha256:${'3'.repeat(64)}` },
    }
    expect(await judge({ consumer: strange })).toMatchObject({ failure: { kind: 'unavailable' } })
    expect(
      await judge({ consumer: { ...consumer, conversion: consumer.capabilities } }),
    ).toMatchObject({ failure: { kind: 'unavailable' } })
  })

  it('denies qualification for a definition that is not in the snapshot', async () => {
    const { judge, definition } = await judged()
    const other: ToolDefinition = { ...definition, description: 'changed' }
    expect(await judge({ definition: other })).toMatchObject({
      ok: { qualification: 'denied', outputCompatible: false, attachmentsReadable: false },
    })
  })

  it('denies qualification for a release definition at a non-official layer', async () => {
    const { judge, tenant } = await judged()
    expect(await judge({ layer: { kind: 'tenant', tenant } })).toMatchObject({
      ok: { qualification: 'denied', outputCompatible: false, attachmentsReadable: false },
    })
  })

  it('answers unavailable for an unverified principal and for another tenant', async () => {
    const { judge, principal } = await judged()
    expect(await judge({ principal: { ...principal } })).toMatchObject({
      failure: { kind: 'unavailable' },
    })
    expect(await judge({ tenant: fixtureTenant('b') })).toMatchObject({
      failure: { kind: 'unavailable' },
    })
  })

  it('answers unavailable when the principal verifier is absent', async () => {
    const { fixture, judge, principal, tenant, definition, consumer } = await judged()
    expect(await judge()).toMatchObject({ ok: { qualification: 'allowed' } })
    // Same snapshot and registrant, but no principal verifier on this root.
    const bare = fixtureEnv([principalIssuerKey])
    const entries = createToolReleaseEntries()
    await bare.install(principalIssuer)
    await bare.install(entries.registrant)
    await bare.install(entries.authority)
    expect(bare.root.get(principalVerifierKey)).toBeUndefined()
    expect(fixture.root.get(principalVerifierKey)).toBeDefined()
    const answer = await createReleaseAvailability(bare.root).judge({
      principal,
      tenant,
      definition,
      layer: { kind: 'official' },
      consumer,
    })
    expect(answer).toMatchObject({ failure: { kind: 'unavailable' } })
  })
})

describe('tool-bindings: the start authority proxy and the bundle author execution', () => {
  const call = { principal: null, tenant: fixtureTenant('a'), call: 'call-1' } as never

  it('answers unavailable without a provider and for a double that is not the contract service', async () => {
    const root = new Context()
    const proxy = startAuthorityProxy(root)
    expect(await proxy.inspect(call)).toMatchObject({
      failure: { kind: 'unavailable', dependency: 'toolStartAuthority' },
    })
    await root.plugin({
      name: 'double',
      apply: (ctx: Context) => {
        new StubService(ctx, 'toolStartAuthority', 'tool-records', {})
      },
    })
    expect(root.get('toolStartAuthority')).toBeInstanceOf(StubService)
    expect(await proxy.consume(call)).toMatchObject({ failure: { kind: 'unavailable' } })
  })

  it('reads the current provider on every call', async () => {
    const root = new Context()
    const proxy = startAuthorityProxy(root)
    const answer = fail({ kind: 'denied' as const, action: 'from-provider' })
    class Provider extends ToolStartAuthorityService<unknown> {
      readonly exclude: ToolStartAuthority<unknown>['exclude'] = async () => answer
      readonly prepare: ToolStartAuthority<unknown>['prepare'] = async () => answer
      readonly consume: ToolStartAuthority<unknown>['consume'] = async () => answer
      readonly inspect: ToolStartAuthority<unknown>['inspect'] = async () => answer
      readonly invalidate: ToolStartAuthority<unknown>['invalidate'] = async () => answer
    }
    const fiber = root.plugin({
      name: 'provider',
      apply: (ctx: Context) => {
        new Provider(ctx)
      },
    })
    await fiber
    expect(await proxy.prepare(call)).toEqual(answer)
    await fiber.dispose()
    expect(await proxy.prepare(call)).toMatchObject({ failure: { kind: 'unavailable' } })
  })

  it('has no execution scope and no settlement while the run has no runtime bundle', async () => {
    const root = new Context()
    expect(() => bundleScope(root)(call)).toThrow(/unavailable/)
    expect(await bundleSettle(root)(call)).toMatchObject({
      failure: { kind: 'unavailable', dependency: 'toolRuntime' },
    })
  })

  it('hands scope and settle to the author execution of the run bundle, read on every call', async () => {
    const root = new Context()
    const scoped = { scope: 'from-bundle' }
    const settled = succeed({ kind: 'from-bundle' })
    const authorExecution = { scope: vi.fn(() => scoped), settle: vi.fn(async () => settled) }
    const scope = bundleScope(root)
    const settle = bundleSettle(root)
    // The row reads the run's holder on each call, so a bundle built after the row still serves it.
    toolRuntimeHolder(root).bundle = {
      value: { authorExecution } as unknown as ToolRuntimeBundle,
      configDigest: 'test',
    }
    expect(scope(call)).toBe(scoped)
    expect(await settle(call)).toBe(settled)
    expect(authorExecution.scope).toHaveBeenCalledWith(call)
    expect(authorExecution.settle).toHaveBeenCalledWith(call)
  })
})

describe('tool-bindings: one plugin, one fiber, two services', () => {
  it('provides toolBindings and toolCatalog from the same row fiber, and both leave with it', async () => {
    const fixture = await releaseFixture()
    const fiber = fixture.root.plugin(toolBindingsRow)
    await fiber
    const bindings = got(fixture.root.get(toolBindingsKey), 'toolBindings')
    const catalog = got(fixture.root.get(toolCatalogKey), 'toolCatalog')
    expect(Reflect.get(bindings, 'ctx').fiber).toBe(Reflect.get(catalog, 'ctx').fiber)
    await fiber.dispose()
    expect(fixture.root.get(toolBindingsKey)).toBeUndefined()
    expect(fixture.root.get(toolCatalogKey)).toBeUndefined()
  })
})
