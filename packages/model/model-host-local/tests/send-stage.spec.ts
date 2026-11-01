// The send stage plugin on real Cordis 4.0.4: it serves `modelSendBoundary` over the local send
// path and statically injects the credential service and `modelCommands`. Doubles, each with its
// source:
// - ModelCommands: `createTestModelDependencies` of `@omne-harness/model/testing` (a store without
//   durability), served through a `ModelCommandsService` test class. The durable commands join
//   with the storage member; until then nothing here proves a restart.
// - The credential service: `SpyCredential`, a `ModelCredentialService` that counts its calls. The
//   real vault plugin (`LocalCredentialPlugin`) serves the slow tests.
// - The transport of the fast tests: the observing factory of `send-resources.spec.ts`, here a
//   copy that reads the slot at start. The slow tests use the real pi transport and families.
// The runtime of the driven calls is the real `createModelRuntime`; the plugin replaces its sender.
import { mkdtempSync, readFileSync, realpathSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import { accountCodec, organizationCodec, tenant, tenantEquals } from '@omne-harness/legal-identity'
import { createModelRuntime, type ModelConfiguration } from '@omne-harness/model'
import { createTestModelDependencies } from '@omne-harness/model/testing'
import {
  decodeModelCallId,
  decodeModelInstanceId,
  decodeModelOperationId,
  type Adoption,
  type FixedModelRequest,
  type ModelFailure,
} from '@omne-harness/model-contract'
import {
  decodeCredentialId,
  type CredentialPort,
  type ModelCommands,
  type ModelSendBoundary,
  type SendResult,
  type TransportFact,
} from '@omne-harness/model-contract/provider'
import {
  ModelCommandsService,
  ModelCredentialService,
  ModelSendBoundaryService,
} from '@omne-harness/model-cordis-contract/cordis'
import {
  createNetworkResources,
  type NetworkResources,
  type PiTransport,
  type PiTransportConfig,
} from '@omne-harness/pi-ai-transport'
import { GATEWAY_END_MARKER } from '@omne-harness/pi-ai-transport/testing'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createModelSendStagePlugin, LocalCredentialPlugin } from '../src/cordis.ts'
import { assembleOver, type AssemblyFactories } from '../src/assembly.ts'
import { sendStagePluginOver, type ModelSendStagePluginOptions } from '../src/plugins/send-stage.ts'
import { sendResourcesOver, type PiSendResources } from '../src/send-resources.ts'
import {
  createCertificate,
  startHttpsServer,
  type ReceivedRequest,
} from './support/https-server.ts'
import {
  decoded,
  FAMILIES,
  PLACEHOLDER,
  ROUTE_PATH,
  TRANSPORT_LIMITS,
} from './support/local-host.ts'
import { factorySupplier } from './support/profiles.ts'
import { firstRoundRequest, RECORD_CASE_NAMES, RECORD_CASES } from './support/recording-cases.ts'
import { onlyDispatch, openReplay, recordedRequest, replayLabel } from './support/replay.ts'

type Principal = Readonly<{ subject: string }>

// --- the memory side of one call, the same set-up as `support/local-host.ts` -------------------

const CONSUMER = 'local-model-consumer'
const TEST_ADOPTION: Adoption = {
  owner: 'model-host-local-tests',
  name: 'send-stage',
  revision: '1',
  digest: '0'.repeat(64),
}
const CALL_CAPACITY = { bytes: '1000000', blocks: '100', attachmentBytes: '0' }
const CONFIGURATION: ModelConfiguration = {
  outputBatchBytes: 16_384,
  outputBatchDelayMs: 100,
  observerBufferBytes: 4096,
  observerCheckIntervalMs: 25,
  resultPageTargetBytes: 1024,
  readIdleMs: 1000,
  retryBackoffMs: 0,
  cleanupRetryMs: 0,
}

function tenantOf(suffix: string) {
  const account = accountCodec.parse(`acc_abcdefghjkmnpqrstvwxyz234${suffix}`)
  const organization = organizationCodec.parse(`org_abcdefghjkmnpqrstvwxyz234${suffix}`)
  if (!account.ok || !organization.ok) throw new Error('fixture tenant')
  return tenant(organization.value, account.value)
}

/** One call over in-memory commands: what a plugin tree needs besides the plugin itself. */
function sceneOf(request: FixedModelRequest, label: string) {
  const scope = tenantOf('5')
  const principal = Object.freeze({ subject: 'local-model-test' })
  const call = decoded(decodeModelCallId(`mcall_${label}`))
  const instance = decoded(decodeModelInstanceId(`minst_${label}`))
  const operation = (name: string) => decoded(decodeModelOperationId(`mop_${name}-${label}`))
  const evidence = (record: string) => ({
    owner: 'local-model-host',
    record,
    revision: '1',
    digest: '1'.repeat(64),
  })
  const unavailable = (): { failure: ModelFailure } => ({
    failure: { kind: 'unavailable', dependency: 'local-model-test', diagnostic: 'not-supplied' },
  })
  const memory = createTestModelDependencies<typeof principal>({
    start: '2026-10-23T00:00:00.000Z',
    maxWaiters: 32,
    maxQueued: 8,
    sends: [],
    owners: [{ consumerOwner: CONSUMER, work: { kind: 'exempt' }, evidence: TEST_ADOPTION }],
    limits: {
      scanPageCalls: 8,
      resultPageParts: 8,
      resultPageTargetBytes: 4096,
      readIdleMs: 1000,
      capacity: CALL_CAPACITY,
    },
    authority: {
      authorize: ({ access, action }) =>
        access.principal === principal && tenantEquals(access.tenant, scope)
          ? { ok: { owner: 'local-model-identity', subject: principal.subject, revision: '1' } }
          : { failure: { kind: 'denied', action } },
      execution: given =>
        given.instance === instance && tenantEquals(given.tenant, scope)
          ? { ok: { owner: 'local-model-host', subject: 'local-channel', revision: '1' } }
          : { failure: { kind: 'denied', action: 'execution-channel' } },
    },
    evidence: [
      {
        adoption: TEST_ADOPTION,
        continuity: given =>
          given.source.owner === 'local-model-host' && given.source.record === call
            ? { ok: given.source }
            : unavailable(),
        materialization: given => ({ ok: evidence(`${given.call}/${given.dispatch}`) }),
        receive: given => ({
          ok: {
            window: given.window,
            batchDigest: given.batchDigest,
            paused: true,
            noPrefetch: true,
          },
        }),
        lateFact: unavailable,
        retry: unavailable,
        handoff: unavailable,
      },
    ],
    sending: {
      maxRetainedAttempts: 1,
      credentials: {
        present: () => ({ kind: 'unavailable' }),
        resolve: () => ({ kind: 'unavailable' }),
      },
      sources: request.suppliers.map(supplier => ({
        profile: request.profile,
        supplier: supplier.adoption,
        recipient: supplier.recipient,
        model: supplier.model,
        credential: {
          kind: 'factory',
          official: true,
          queryId: decoded(decodeCredentialId('local-model-query')),
        },
        current: () => ({ ok: { authorized: true, noTenantBinding: true } }),
      })),
    },
  })
  return { scope, principal, call, instance, operation, evidence, memory }
}
type Scene = ReturnType<typeof sceneOf>

/** The commands of the scene as the service the plugin injects. */
function commandsServiceOver(commands: ModelCommands<unknown>) {
  return class extends ModelCommandsService<unknown> {
    declare readonly admit: ModelCommands<unknown>['admit']
    declare readonly recall: ModelCommands<unknown>['recall']
    declare readonly scanPending: ModelCommands<unknown>['scanPending']
    declare readonly loadRecovery: ModelCommands<unknown>['loadRecovery']
    declare readonly claim: ModelCommands<unknown>['claim']
    declare readonly prepareDispatch: ModelCommands<unknown>['prepareDispatch']
    declare readonly recordMaterialization: ModelCommands<unknown>['recordMaterialization']
    declare readonly recordSend: ModelCommands<unknown>['recordSend']
    declare readonly openReceiveWindow: ModelCommands<unknown>['openReceiveWindow']
    declare readonly preserve: ModelCommands<unknown>['preserve']
    declare readonly recordLateFact: ModelCommands<unknown>['recordLateFact']
    declare readonly prepareRetry: ModelCommands<unknown>['prepareRetry']
    declare readonly decideRetry: ModelCommands<unknown>['decideRetry']
    declare readonly settle: ModelCommands<unknown>['settle']
    declare readonly control: ModelCommands<unknown>['control']
    declare readonly acquireRead: ModelCommands<unknown>['acquireRead']
    declare readonly nextRead: ModelCommands<unknown>['nextRead']
    declare readonly endRead: ModelCommands<unknown>['endRead']
    declare readonly handoff: ModelCommands<unknown>['handoff']
    declare readonly advanceCleanup: ModelCommands<unknown>['advanceCleanup']
    declare readonly query: ModelCommands<unknown>['query']
    declare readonly dispatches: ModelCommands<unknown>['dispatches']
    constructor(ctx: Context) {
      super(ctx)
      Object.assign(this, commands)
    }
  }
}

/** A credential service that answers the factory secret and counts what it was asked. */
class SpyCredential extends ModelCredentialService {
  static resolves = 0
  readonly present: CredentialPort['present'] = () => ({ kind: 'unavailable' })
  readonly resolve: CredentialPort['resolve'] = () => {
    SpyCredential.resolves += 1
    return { kind: 'value', scope: 'factory', value: PLACEHOLDER }
  }
}

// --- the observing transport of the fast tests ---------------------------------------------------

type Observed = { config: PiTransportConfig; reads: (string | undefined)[] }

const NO_FACTS: AsyncIterable<TransportFact> = {
  [Symbol.asyncIterator]: () => ({ next: async () => ({ done: true, value: undefined }) }),
}

function observing() {
  const transports: Observed[] = []
  const events: string[] = []
  let closeGate: Promise<void> = Promise.resolve()
  const networks: NetworkResources[] = []
  function createTransport(config: PiTransportConfig): PiTransport {
    const observed: Observed = { config, reads: [] }
    transports.push(observed)
    return {
      transport: {
        async prepare(request, supplier) {
          return {
            ok: {
              async materialize() {
                return {
                  ok: {
                    receipt: {
                      supplier: supplier.adoption,
                      representation: request.representation,
                      payloadDigest: 'a'.repeat(64),
                    },
                    start() {
                      observed.reads.push(config.credential.read())
                      return NO_FACTS
                    },
                    close: async () => {},
                  },
                }
              },
              close: async () => {},
            },
          }
        },
      },
      async close() {},
    }
  }
  const factories: AssemblyFactories<unknown, NetworkResources> = {
    createNetwork(config) {
      events.push('network')
      const network = createNetworkResources(config)
      networks.push(network)
      return network
    },
    createSendResources(config): PiSendResources<unknown> {
      events.push('resources')
      const resources = sendResourcesOver<unknown>({ config, createTransport })
      return {
        acquire: input => resources.acquire(input),
        async close() {
          events.push('resources-close')
          await closeGate
          await resources.close()
          events.push('resources-closed')
        },
      }
    },
  }
  return {
    factories,
    events,
    /** Every transport that was made; the first is the configuration probe. */
    transports,
    /** The transports of acquired resources. */
    acquired: () => transports.slice(1),
    /** The next close of the send resources waits for `release`. */
    hold() {
      const gate = Promise.withResolvers<void>()
      closeGate = gate.promise
      return gate.resolve
    },
    async dispose() {
      await Promise.all(networks.map(network => network.close()))
    },
  }
}

const ROUTES = {
  openrouter: { url: 'https://gateway.invalid/api/v1/chat/completions', endMarker: '[DONE]' },
}
const REQUEST = firstRoundRequest(RECORD_CASES['openai-reasoning'])

function optionsOf(scene: Scene, over: Partial<ModelSendStagePluginOptions> = {}) {
  return {
    families: FAMILIES,
    coordinator: scene.memory.controls.send.coordinator,
    network: { maxConnections: 2, idleConnectionTimeoutMs: 1_000 },
    routes: ROUTES,
    transportLimits: TRANSPORT_LIMITS,
    preparation: { maxCitedCalls: 8, supplierOf: factorySupplier<unknown>() },
    ...over,
  } satisfies ModelSendStagePluginOptions
}

// Cordis fibers are thenables that Vitest's matchers probe as injected values, so wrap the await.
async function loadError(fiber: PromiseLike<unknown>): Promise<unknown> {
  try {
    await fiber
    return undefined
  } catch (error) {
    return error
  }
}

/** The runtime over the scene, sending through `send`, with every send result and fact kept. */
function runtimeOver(scene: Scene, send: ModelSendBoundary<Principal>) {
  const results: SendResult[] = []
  const facts: TransportFact[] = []
  const kept: ModelSendBoundary<Principal> = {
    async send(input, signal) {
      const result = await send.send(input, signal)
      results.push(result)
      if (result.kind !== 'started') return result
      const source = result.facts
      return {
        ...result,
        facts: {
          async *[Symbol.asyncIterator]() {
            for await (const fact of source) {
              facts.push(structuredClone(fact))
              yield fact
            }
          },
        },
      }
    },
  }
  const provider = createModelRuntime({ ...scene.memory.dependencies, send: kept }, CONFIGURATION)
  const access = { principal: scene.principal, tenant: scene.scope }
  return {
    provider,
    results,
    facts,
    async drive(request: FixedModelRequest) {
      decoded(
        await provider.runtime.calls.admit({
          ...access,
          call: scene.call,
          operation: scene.operation('admit'),
          request,
          consumer: {
            owner: CONSUMER,
            work: 'work',
            position: 'answer',
            purpose: 'local-model-test',
          },
          capacity: CALL_CAPACITY,
        }),
      )
      return provider.driver.drive(
        {
          ...access,
          call: scene.call,
          instance: scene.instance,
          operation: scene.operation('claim'),
          continuity: scene.evidence(scene.call),
        },
        new AbortController().signal,
      )
    },
  }
}

/** The plugin tree: credential, commands and the stage over the observing send path. */
async function treeOf(
  label: string,
  wrap: (commands: ModelCommands<unknown>) => ModelCommands<unknown> = commands => commands,
) {
  const scene = sceneOf(REQUEST, label)
  const watch = observing()
  const ctx = new Context()
  const Stage = stageOver(optionsOf(scene), watch.factories)
  await ctx.plugin(SpyCredential)
  const Commands = commandsServiceOver(wrap(scene.memory.dependencies.commands))
  await ctx.plugin(Commands)
  return { ctx, scene, watch, Stage }
}

const SETTINGS = { maxRetainedAttempts: 4 }

/** The stage class over the observing send path. */
function stageOver(
  options: ModelSendStagePluginOptions,
  factories: AssemblyFactories<unknown, NetworkResources>,
) {
  return sendStagePluginOver({ options, assemble: config => assembleOver({ config, factories }) })
}

afterEach(() => {
  SpyCredential.resolves = 0
})

describe('the plugin and its dependencies', () => {
  it('serves modelSendBoundary while it lives and withdraws it with the fiber', async () => {
    const { ctx, Stage, watch } = await treeOf('serve')
    const fiber = await ctx.plugin(Stage, SETTINGS)
    expect(ctx.modelSendBoundary).toBeInstanceOf(ModelSendBoundaryService)
    // Besides the two members of every Cordis service, the instance exposes the one operation.
    expect(
      Object.keys(ctx.modelSendBoundary).filter(key => key !== 'ctx' && key !== 'name'),
    ).toEqual(['send'])
    expect(watch.events).toEqual(['network', 'resources'])

    await fiber.dispose()
    expect(ctx.modelSendBoundary).toBeUndefined()
    expect(watch.events).toEqual(['network', 'resources', 'resources-close', 'resources-closed'])
    await watch.dispose()
  })

  it('waits for the credential service, and is unloaded with it', async () => {
    const scene = sceneOf(REQUEST, 'dependency')
    const watch = observing()
    const ctx = new Context()
    await ctx.plugin(commandsServiceOver(scene.memory.dependencies.commands))
    const Stage = stageOver(optionsOf(scene), watch.factories)
    const waiting = ctx.plugin(Stage, SETTINGS)
    await new Promise(resolve => setTimeout(resolve, 20))
    // No credential service: nothing is built, nothing is served.
    expect(ctx.modelSendBoundary).toBeUndefined()
    expect(watch.events).toEqual([])

    const credential = await ctx.plugin(SpyCredential)
    await waiting
    expect(ctx.modelSendBoundary).toBeInstanceOf(ModelSendBoundaryService)

    await credential.dispose()
    expect(ctx.modelSendBoundary).toBeUndefined()
    expect(watch.events).toContain('resources-closed')
    await watch.dispose()
  })

  it('waits for modelCommands, and loads nothing without it', async () => {
    const scene = sceneOf(REQUEST, 'commands')
    const watch = observing()
    const ctx = new Context()
    await ctx.plugin(SpyCredential)
    const Stage = stageOver(optionsOf(scene), watch.factories)
    const waiting = ctx.plugin(Stage, SETTINGS)
    await new Promise(resolve => setTimeout(resolve, 20))
    // The credential service is there, modelCommands is not: nothing is built, nothing is served.
    expect(ctx.modelSendBoundary).toBeUndefined()
    expect(watch.events).toEqual([])

    const commands = await ctx.plugin(commandsServiceOver(scene.memory.dependencies.commands))
    await waiting
    expect(ctx.modelSendBoundary).toBeInstanceOf(ModelSendBoundaryService)
    expect(watch.events).toEqual(['network', 'resources'])

    await commands.dispose()
    expect(ctx.modelSendBoundary).toBeUndefined()
    expect(watch.events).toContain('resources-closed')
    await watch.dispose()
  })

  it('fails to load for a retained-attempt bound that is not a positive integer, and builds nothing', async () => {
    const { ctx, Stage, watch } = await treeOf('settings')
    for (const bad of [undefined, 0, 1.5, -1, '4', Number.NaN]) {
      const invalid = { maxRetainedAttempts: bad } as unknown as typeof SETTINGS
      expect(await loadError(ctx.plugin(Stage, invalid)), String(bad)).toBeInstanceOf(Error)
      expect(ctx.modelSendBoundary, String(bad)).toBeUndefined()
    }
    expect(watch.events).toEqual([])
  })

  it('loads no send path when the assembly refuses its configuration, and leaves nothing open', async () => {
    const scene = sceneOf(REQUEST, 'refused')
    const watch = observing()
    const ctx = new Context()
    await ctx.plugin(SpyCredential)
    await ctx.plugin(commandsServiceOver(scene.memory.dependencies.commands))
    const refused = optionsOf(scene, {
      preparation: { maxCitedCalls: 0, supplierOf: factorySupplier<unknown>() },
    })
    const Stage = stageOver(refused, watch.factories)
    expect(await loadError(ctx.plugin(Stage, SETTINGS))).toBeInstanceOf(RangeError)
    expect(ctx.modelSendBoundary).toBeUndefined()
    expect(watch.events).toEqual([])
  })
})

describe('a send through the plugin', () => {
  it('fills the credential slot only while start runs, and the slot is empty after the plugin is gone', async () => {
    const { ctx, scene, watch, Stage } = await treeOf('slot')
    const fiber = await ctx.plugin(Stage, SETTINGS)
    const run = runtimeOver(scene, {
      send: (input, signal) => ctx.modelSendBoundary.send(input, signal),
    })
    await run.drive(REQUEST)
    expect(run.results.map(result => result.kind)).toEqual(['started'])
    // One acquire: the probe is the first transport, the send's own transport the second.
    const [sent] = watch.acquired()
    expect(sent?.reads).toEqual([PLACEHOLDER])
    expect(sent?.config.credential.read()).toBeUndefined()
    expect(SpyCredential.resolves).toBe(1)

    await fiber.dispose()
    expect(sent?.config.credential.read()).toBeUndefined()
    expect(watch.acquired().every(item => item.config.credential.read() === undefined)).toBe(true)
    await watch.dispose()
  })

  it('after the plugin is gone, a held reference sends nothing: the new dispatch is not started', async () => {
    const { ctx, scene, watch, Stage } = await treeOf('after-exit')
    const fiber = await ctx.plugin(Stage, SETTINGS)
    const held = ctx.modelSendBoundary
    await fiber.dispose()
    const run = runtimeOver(scene, { send: (input, signal) => held.send(input, signal) })
    await run.drive(REQUEST)
    expect(run.results).toEqual([
      {
        kind: 'not-started',
        failure: {
          kind: 'unavailable',
          dependency: 'pi-send-resources',
          diagnostic: 'send-resources-closed',
        },
      },
    ])
    expect(watch.acquired()).toEqual([])
    expect(SpyCredential.resolves).toBe(0)
    await watch.dispose()
  })

  it('a send that is in flight at exit never starts, and never reads the credential after the exit', async () => {
    const entered = Promise.withResolvers<void>()
    const proceed = Promise.withResolvers<void>()
    const { ctx, scene, watch, Stage } = await treeOf('in-flight', commands => ({
      ...commands,
      async recordMaterialization(input) {
        entered.resolve()
        await proceed.promise
        return commands.recordMaterialization(input)
      },
    }))
    const fiber = await ctx.plugin(Stage, SETTINGS)
    const run = runtimeOver(scene, {
      send: (input, signal) => ctx.modelSendBoundary.send(input, signal),
    })
    const driving = run.drive(REQUEST)
    await entered.promise
    // The send is between its materialization and its start. The plugin exits now.
    await fiber.dispose()
    proceed.resolve()
    await driving
    expect(run.results).toEqual([
      {
        kind: 'not-started',
        failure: {
          kind: 'unavailable',
          dependency: 'model-credential',
          diagnostic: 'credential-unavailable',
        },
      },
    ])
    expect(SpyCredential.resolves).toBe(0)
    expect(watch.acquired().flatMap(item => item.reads)).toEqual([])
    await watch.dispose()
  })

  it('a send that reaches its credential while the close still runs never reads it, and is not started', async () => {
    const entered = Promise.withResolvers<void>()
    const proceed = Promise.withResolvers<void>()
    const { ctx, scene, watch, Stage } = await treeOf('close-window', commands => ({
      ...commands,
      async recordMaterialization(input) {
        entered.resolve()
        await proceed.promise
        return commands.recordMaterialization(input)
      },
    }))
    const fiber = await ctx.plugin(Stage, SETTINGS)
    const run = runtimeOver(scene, {
      send: (input, signal) => ctx.modelSendBoundary.send(input, signal),
    })
    const driving = run.drive(REQUEST)
    await entered.promise
    // The exit begins and its close of the send path is held open.
    const release = watch.hold()
    const disposing = fiber.dispose()
    await vi.waitFor(() => expect(watch.events.at(-1)).toBe('resources-close'))
    // The send continues inside the closing window: the credential is already withdrawn.
    proceed.resolve()
    await driving
    release()
    await disposing
    expect(run.results.map(result => result.kind)).toEqual(['not-started'])
    expect(SpyCredential.resolves).toBe(0)
    expect(watch.acquired().flatMap(item => item.reads)).toEqual([])
    await watch.dispose()
  })

  it('a send path that fails to close does not fail the exit, and the warning names no cause', async () => {
    const { ctx, scene, watch } = await treeOf('close-fails')
    const warnings: string[] = []
    const errors: unknown[][] = []
    // Cordis drops what ranks above the exporter level, so the level is raised to see the warning.
    ctx.logger.exporter({
      colors: 0,
      levels: { default: 3 },
      export: message => {
        if (message.type === 'error') errors.push(message.args)
        if (message.type === 'warn') warnings.push(message.args.map(String).join(' '))
      },
    })
    const cause = 'ENOENT /home/me/secret/vault.json https://gateway.invalid/key-9f3'
    const failing: AssemblyFactories<unknown, NetworkResources> = {
      ...watch.factories,
      createSendResources(config) {
        const resources = watch.factories.createSendResources(config)
        return {
          acquire: input => resources.acquire(input),
          async close() {
            await resources.close()
            throw new Error(cause)
          },
        }
      },
    }
    const Stage = stageOver(optionsOf(scene), failing)
    const fiber = await ctx.plugin(Stage, SETTINGS)
    await fiber.dispose()
    expect(ctx.modelSendBoundary).toBeUndefined()
    expect(errors).toEqual([])
    expect(warnings).toHaveLength(1)
    expect(warnings[0]).toContain('model send stage')
    for (const secret of ['ENOENT', 'secret', 'vault.json', 'gateway.invalid', 'key-9f3']) {
      expect(warnings[0]).not.toContain(secret)
    }
    await watch.dispose()
  })

  it('makes the unload wait until the send path is closed', async () => {
    const { ctx, Stage, watch } = await treeOf('unload-wait')
    const fiber = await ctx.plugin(Stage, SETTINGS)
    const release = watch.hold()
    let disposed = false
    const disposing = fiber.dispose().then(() => {
      disposed = true
    })
    await new Promise(resolve => setTimeout(resolve, 30))
    expect(watch.events.at(-1)).toBe('resources-close')
    expect(disposed).toBe(false)
    release()
    await disposing
    expect(watch.events.at(-1)).toBe('resources-closed')
    await watch.dispose()
  })
})

// --- the slow tests: the real pi transport, the real families, the real vault -------------------

describe('the recordings through modelSendBoundary', () => {
  it.each(RECORD_CASE_NAMES)(
    '%s: the plugin boundary gives the same facts, dispatch and request as the assembled path',
    { tags: ['slow'] },
    async name => {
      const request = await recordedRequest(name)
      const label = replayLabel('stage', name)
      const direct = await openReplay({ request, name, label })
      try {
        expect(direct.driven).toEqual({ ok: undefined })
        const viaPlugin = await replayThroughPlugin(name, request, label)
        expect(viaPlugin.driven).toEqual({ ok: undefined })
        expect(viaPlugin.facts).toEqual(direct.local.facts)
        // Both servers are local, so only the port in `host` differs between the two requests.
        expect(viaPlugin.requests.map(wireOf)).toEqual(direct.requests.map(wireOf))
        expect(viaPlugin.requests).toHaveLength(1)
        expect(viaPlugin.requests[0]?.headers.authorization).toBe(`Bearer ${PLACEHOLDER}`)
        const record = await onlyDispatch(direct.local)
        expect(viaPlugin.record.terminal).toEqual(record.terminal)
        expect(viaPlugin.record.materialization?.receipt).toEqual(record.materialization?.receipt)
        expect(viaPlugin.record.account).toEqual(record.account)
        expect(JSON.stringify(viaPlugin.facts)).not.toContain(PLACEHOLDER)
      } finally {
        await direct.close()
      }
    },
  )
})

function wireOf(received: ReceivedRequest) {
  const { host: _port, ...headers } = received.headers
  return { path: received.path, headers, body: received.body }
}

async function replayThroughPlugin(
  name: (typeof RECORD_CASE_NAMES)[number],
  request: FixedModelRequest,
  label: string,
) {
  const recording = readFileSync(
    new URL(`../../pi-ai-transport/tests/fixtures/recordings/${name}/stream.sse`, import.meta.url),
  )
  const closers: (() => unknown)[] = []
  try {
    const vault = realpathSync(mkdtempSync(join(tmpdir(), 'model-host-local-stage-')))
    closers.push(() => rmSync(vault, { recursive: true, force: true }))
    const certificate = createCertificate()
    closers.push(() => certificate.dispose())
    const server = await startHttpsServer(certificate, (res, received) => {
      if (received.path !== ROUTE_PATH) {
        res.writeHead(404).end()
        return
      }
      res.writeHead(200, { 'content-type': 'text/event-stream' })
      res.end(recording)
    })
    closers.push(() => server.close())
    const scene = sceneOf(request, label)
    const ctx = new Context()
    await ctx.plugin(LocalCredentialPlugin, {
      path: join(vault, `${label}.vault.json`),
      factorySecret: PLACEHOLDER,
    })
    await ctx.plugin(commandsServiceOver(scene.memory.dependencies.commands))
    const Stage = createModelSendStagePlugin(
      optionsOf(scene, {
        network: {
          maxConnections: 2,
          idleConnectionTimeoutMs: 60_000,
          tls: { ca: certificate.cert },
        },
        routes: {
          openrouter: {
            url: new URL(ROUTE_PATH, server.url).href,
            endMarker: GATEWAY_END_MARKER,
          },
        },
      }),
    )
    const fiber = await ctx.plugin(Stage, { maxRetainedAttempts: 4 })
    closers.push(() => fiber.dispose())
    const run = runtimeOver(scene, {
      send: (input, signal) => ctx.modelSendBoundary.send(input, signal),
    })
    const driven = await run.drive(request)
    const records = decoded(
      await scene.memory.dependencies.commands.dispatches({
        principal: scene.principal,
        tenant: scene.scope,
        call: scene.call,
      }),
    )
    const [record, ...others] = records
    if (record === undefined || others.length > 0) throw new Error('not exactly one dispatch')
    return { driven, facts: run.facts, requests: server.requests, record }
  } finally {
    for (const closer of closers.toReversed()) await closer()
  }
}
