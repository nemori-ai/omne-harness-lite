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
import { filesToolModule, screenToolModule, shellToolModule } from '@omne-harness/tool-definitions'
import { notificationsToolModule } from '@omne-harness/notification-tools'
import { principalIssuer, sessionWorkIssuerOf } from '../../../src/entry/principals.ts'
import { createToolReleaseEntries } from '../../../src/entry/tool-release.ts'
import { governanceOf } from '../../../src/entry/tool-release-manifest.ts'
import {
  createReleaseAvailability,
  modelReadsOver,
  type ModelReads,
} from '../../../src/rows/tool-bindings/availability.ts'
import {
  startAuthorityProxy,
  toolBindingsRow,
  bundleScope,
  bundleSettle,
} from '../../../src/rows/tool-bindings/index.ts'
import { recordHostOffers } from '../../../src/rows/execution-host/offers.ts'
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
  const reads: { asked: unknown[]; answer: Awaited<ReturnType<ModelReads>> } = {
    asked: [],
    answer: 'taken',
  }
  const availability = createReleaseAvailability(fixture.root, async (access, modalities) => {
    reads.asked.push({ session: access.session, modalities })
    return reads.answer
  })
  const files = okOf(filesToolModule.createAuthor(tree(TEST_CONSTRUCTION.Files)), 'author')
  const filesDefinition = okOf(
    judgeToolDefinition(
      deriveDefinition(governanceOf(entryOf(fixture.manifest, 'Files')), files.facts),
    ),
    'definition',
  )
  const judge = (overrides: object = {}) =>
    availability.judge({
      principal,
      tenant,
      definition,
      command: null,
      layer: { kind: 'official' },
      consumer,
      ...overrides,
    })
  const store = () =>
    fixture.root.plugin({
      name: 'store',
      apply: (ctx: Context) => void new StubService(ctx, 'toolMediaStore', 'media', {}),
    })
  const open = () => judge({ definition: filesDefinition, command: 'open' })
  return {
    fixture,
    tenant,
    principal,
    definition,
    consumer,
    judge,
    reads,
    store,
    open,
    filesDefinition,
  }
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
        productsStorable: true,
      }),
    )
  })

  it('gives the Notifications tool its two capabilities as dependencies, each there only while its service is', async () => {
    const { fixture, judge } = await judged()
    const created = okOf(
      notificationsToolModule.createAuthor(tree(TEST_CONSTRUCTION.Notifications)),
      'author',
    )
    const definition = okOf(
      judgeToolDefinition(
        deriveDefinition(governanceOf(entryOf(fixture.manifest, 'Notifications')), created.facts),
      ),
      'definition',
    )
    const dependencies = async () => okOf(await judge({ definition }), 'judge').dependencies
    expect(await dependencies()).toEqual([
      { name: 'notification.read', available: false },
      { name: 'notification.write', available: false },
    ])
    const inbox = fixture.root.plugin({
      name: 'inbox',
      apply: (ctx: Context) => void new StubService(ctx, 'notificationInbox', 'notification', {}),
    })
    await inbox
    expect(await dependencies()).toEqual([
      { name: 'notification.read', available: true },
      { name: 'notification.write', available: false },
    ])
    await fixture.root.plugin({
      name: 'sending',
      apply: (ctx: Context) => void new StubService(ctx, 'notificationSending', 'notification', {}),
    })
    expect((await dependencies()).map(dependency => dependency.available)).toEqual([true, true])
    await inbox.dispose()
    expect((await dependencies()).map(dependency => dependency.available)).toEqual([false, true])
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

  it('a command that adds no modality is judged as the tool: neither the store nor the model is looked at', async () => {
    const { judge, reads, filesDefinition } = await judged()
    for (const command of ['read', null])
      expect(await judge({ definition: filesDefinition, command })).toMatchObject({
        ok: { qualification: 'allowed', outputCompatible: true, productsStorable: true },
      })
    expect(reads.asked).toEqual([])
  })

  it('a command that adds a picture, with no store of products: unstorable, and the model is not asked', async () => {
    const { open, reads } = await judged()
    expect(await open()).toMatchObject({
      ok: { qualification: 'allowed', outputCompatible: true, productsStorable: false },
    })
    expect(reads.asked).toEqual([])
  })

  it('with the store there, it asks whether the model of this session takes what the command adds', async () => {
    const { open, reads, store } = await judged()
    await store()
    expect(await open()).toMatchObject({ ok: { outputCompatible: true, productsStorable: true } })
    expect(reads.asked).toEqual([{ session: 'ses-1', modalities: ['image'] }])
    reads.answer = 'not-taken'
    expect(await open()).toMatchObject({ ok: { outputCompatible: false, productsStorable: true } })
  })

  it('answers unavailable, not available, when what the model takes cannot be read', async () => {
    const { open, reads, store } = await judged()
    await store()
    reads.answer = { unreadable: 'the saved model selection cannot be read' }
    expect(await open()).toEqual({
      failure: {
        kind: 'unavailable',
        dependency: 'tool-availability',
        diagnostic: 'the saved model selection cannot be read',
      },
    })
  })

  it('the store leaving makes the command unstorable again, at the next question', async () => {
    const { open, store } = await judged()
    const installed = await store()
    expect(await open()).toMatchObject({ ok: { productsStorable: true } })
    await installed.dispose()
    expect(await open()).toMatchObject({ ok: { productsStorable: false } })
  })

  it('Screen needs the host to offer the screen: its capability is there only while the host row offers it', async () => {
    const { fixture, judge } = await judged()
    const created = okOf(screenToolModule.createAuthor(tree(TEST_CONSTRUCTION.Screen)), 'author')
    const definition = okOf(
      judgeToolDefinition(
        deriveDefinition(governanceOf(entryOf(fixture.manifest, 'Screen')), created.facts),
      ),
      'definition',
    )
    const capability = async () =>
      okOf(await judge({ definition }), 'judge').dependencies.find(
        dependency => dependency.name === 'screen.read',
      )
    expect(await capability()).toEqual({ name: 'screen.read', available: false })
    const without = fixture.root.plugin({
      name: 'host-without-screen',
      apply: (ctx: Context) => recordHostOffers(ctx, ['files', 'command', 'terminal']),
    })
    await without
    expect(await capability()).toEqual({ name: 'screen.read', available: false })
    await without.dispose()
    const host = fixture.root.plugin({
      name: 'host-with-screen',
      apply: (ctx: Context) => recordHostOffers(ctx, ['files', 'command', 'terminal', 'screen']),
    })
    await host
    expect(await capability()).toEqual({ name: 'screen.read', available: true })
    await host.dispose()
    expect(await capability()).toEqual({ name: 'screen.read', available: false })
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
      command: null,
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

describe('what the model of a session takes, read from its saved selection and the profile of that route', () => {
  const access = { principal: 'p', tenant: fixtureTenant('a'), session: 'ses-1' }
  const selection = succeed({ selection: { name: 'vision' } })
  const resolved = (reasons: readonly string[]) =>
    succeed({ kind: 'resolved', selectable: reasons.length === 0, reasons })
  const over = (readSelection: unknown, resolveProfile: unknown) =>
    modelReadsOver({ readSelection, resolveProfile } as never)(access, ['image'])

  it('asks the profile of the saved route for words and what the command adds', async () => {
    const asked: unknown[] = []
    const answer = await over(
      async (input: unknown) => (asked.push(input), selection),
      async (input: { route: string; required: { modalities: unknown } }) => {
        asked.push({ route: input.route, modalities: input.required.modalities })
        return resolved([])
      },
    )
    expect(answer).toBe('taken')
    expect(asked).toEqual([access, { route: 'vision', modalities: ['text', 'image'] }])
  })

  it.each([
    ['the profile refuses for modality', ['modality'], 'not-taken'],
    ['the profile refuses for modality among other reasons', ['locked', 'modality'], 'not-taken'],
    ['the profile is refused for another reason only', ['locked'], 'taken'],
  ])('%s', async (_, reasons, answer) => {
    expect(
      await over(
        async () => selection,
        async () => resolved(reasons),
      ),
    ).toBe(answer)
  })

  it.each([
    ['the session service is not there', undefined, async () => resolved([])],
    [
      'the selection cannot be read',
      async () => fail({ kind: 'unavailable' }),
      async () => resolved([]),
    ],
    ['the profiles service is not there', async () => selection, undefined],
    [
      'the profile cannot be read',
      async () => selection,
      async () => fail({ kind: 'unavailable' }),
    ],
    [
      'the route has no profile',
      async () => selection,
      async () => succeed({ kind: 'absent', reason: 'withdrawn' }),
    ],
    ['reading throws', async () => selection, async () => Promise.reject(new Error('down'))],
  ])('is unreadable when %s', async (_, readSelection, resolveProfile) => {
    const ports = {
      readSelection: readSelection ?? (() => undefined),
      resolveProfile: resolveProfile ?? (() => undefined),
    }
    expect(await over(ports.readSelection, ports.resolveProfile)).toEqual({
      unreadable: expect.any(String),
    })
  })
})
