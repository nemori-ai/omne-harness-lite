// @module-tag slow — every case starts a scripted peer process on real pipes.
// The MCP plugin on a real Cordis `Context`, with processes. The adoption, eligibility and
// credential ports are the memory doubles of `@omne-harness/mcp-contract/testing`, each provided as
// a Service subclass; the landing starts the scripted stdio peer of `fixtures/scripted/` as a child
// process. The cases without a process are in `cordis-entry.spec.ts`.
import { fileURLToPath } from 'node:url'
import { Context, type Fiber, type Message } from '@deepseek-ai/cordis'
import { afterEach, describe, expect, it } from 'vitest'
import { access, accountCodec, organizationCodec, tenant } from '@omne-harness/legal-identity'
import type { CorrelationKey, InvokeResult, StopScope } from '@omne-harness/mcp-contract'
import type {
  AdoptionView,
  CredentialFailure,
  CredentialPurpose,
  CredentialUse,
  HttpCredentialHandle,
  HttpPurpose,
  ProcessCredentialHandle,
  ProcessLanding,
  ProcessPurpose,
  UseEligibility,
} from '@omne-harness/mcp-contract/provider'
import {
  actionNameOf,
  correlationKeyOf,
  createMemoryAdoptionView,
  createMemoryCredentialUse,
  createMemoryUseEligibility,
  credentialBindingOf,
  endpointRefOf,
  jsonOf,
  millisOf,
  taskIdOf,
  type MemoryAdoptionView,
  type PeerReply,
  type PeerScript,
} from '@omne-harness/mcp-contract/testing'
import {
  AdoptionViewService,
  CredentialUseService,
  ProcessLandingService,
  UseEligibilityService,
  mcpActionDiscoveryKey,
  mcpActionInvokerKey,
  mcpEndpointStatusKey,
} from '@omne-harness/mcp-cordis-contract/cordis'
import { createMcpPlugin, type McpPluginConfig } from '@omne-harness/mcp-host-local/cordis'
import type { Outcome } from '@omne-harness/operation-result'
import { spawnHandle } from './fixtures/process.ts'
import { leftover } from './fixtures/scripted/children.ts'

const PEER = fileURLToPath(new URL('./fixtures/scripted/stdio-peer.mjs', import.meta.url))
const RECORD = '@omne '

const organization = organizationCodec.parse('org_0123456789abcdefghjkmnpqrs')
const account = accountCodec.parse('acc_0123456789abcdefghjkmnpqrs')
if (!organization.ok || !account.ok) throw new Error('the test tenant texts are not legal')
const ALICE = access('alice', tenant(organization.value, account.value))
const SCOPE = 'ws'
const FILES = endpointRefOf('files')
const MAIN = credentialBindingOf('main')

const principalKey = (principal: unknown) => String(principal)

const CONFIG: McpPluginConfig = {
  maxListingPages: 5,
  maxActions: 100,
  instructionsByteLimit: 4096,
  probeTimeoutMs: 10_000,
  clientInfo: { name: 'omne-harness-cordis-entry', version: '0' },
}

type Plugin = ReturnType<typeof createMcpPlugin>
const checkOutput = (): { kind: 'conforms' } => ({ kind: 'conforms' })
const plugin = createMcpPlugin({ principalKey, checkOutput })

function text(value: string): PeerReply {
  return { kind: 'result', result: { content: [{ type: 'text', text: value }] } }
}

function listingOf(...names: readonly string[]): NonNullable<PeerScript['listing']> {
  return {
    '': {
      kind: 'result',
      result: { tools: names.map(name => ({ name, inputSchema: { type: 'object' } })) },
    },
  }
}

const ANSWERING: PeerScript = { listing: listingOf('echo'), calls: { echo: text('hello') } }
const SILENT: PeerScript = { listing: listingOf('echo'), calls: { echo: { kind: 'silent' } } }
/** `ask` asks for input first; `work` starts the task `t1`, which the peer reports twice. */
const OPERATIONS: PeerScript = {
  listing: listingOf('ask', 'work'),
  calls: {
    ask: [
      { kind: 'result', result: { resultType: 'input_required', requestState: 's1' } },
      text('answered'),
    ],
    work: { kind: 'result', result: { resultType: 'task', taskId: 't1', status: 'working' } },
  },
  tasks: {
    t1: {
      get: [
        { kind: 'result', result: { taskId: 't1', status: 'working' } },
        {
          kind: 'result',
          result: {
            taskId: 't1',
            status: 'completed',
            result: { content: [{ type: 'text', text: 'done' }] },
          },
        },
      ],
    },
  },
}

const fibers: Fiber[] = []

afterEach(async () => {
  await Promise.all(fibers.splice(0).map(fiber => fiber.dispose()))
  expect(await leftover()).toEqual([])
})

/** Loads `loaded` on `ctx` with `config`; the fiber is disposed after the case. */
async function load<C>(
  ctx: Context,
  loaded: { apply(ctx: Context, config: C): unknown },
  config: C,
): Promise<Fiber> {
  const fiber = await ctx.plugin(loaded, config)
  fibers.push(fiber)
  return fiber
}

function adoptionService(port: AdoptionView<unknown, unknown>) {
  return class extends AdoptionViewService<unknown, unknown> {
    endpoints(...args: Parameters<AdoptionView<unknown, unknown>['endpoints']>) {
      return port.endpoints(...args)
    }
    endpoint(...args: Parameters<AdoptionView<unknown, unknown>['endpoint']>) {
      return port.endpoint(...args)
    }
  }
}

function eligibilityService(port: UseEligibility<unknown>) {
  return class extends UseEligibilityService<unknown> {
    check(...args: Parameters<UseEligibility<unknown>['check']>) {
      return port.check(...args)
    }
  }
}

function credentialService(port: CredentialUse<unknown>) {
  return class extends CredentialUseService<unknown> {
    readonly acquire = port.acquire
  }
}

function landingService(port: ProcessLanding<unknown>) {
  return class extends ProcessLandingService<unknown> {
    start(...args: Parameters<ProcessLanding<unknown>['start']>) {
      return port.start(...args)
    }
  }
}

type Landed = Readonly<{
  /** True once the root process has exited. */
  exited: () => boolean
  /** Resolves when the peer received a `tools/call`. */
  called: Promise<void>
}>

/**
 * A landing that starts the scripted peer for every `start`, and what it started. The handle's
 * `stop()` stops the process and answers `stopAs` when it is given, else the fixture's own scope.
 */
function scriptedLanding(stopAs?: StopScope) {
  const landed: Landed[] = []
  const stops: StopScope[] = []
  let markStarted = (_landed: Landed): void => undefined
  const started = new Promise<Landed>(resolve => {
    markStarted = resolve
  })
  const port: ProcessLanding<unknown> = {
    async start(_access, launch) {
      let markCalled = (): void => undefined
      const called = new Promise<void>(resolve => {
        markCalled = resolve
      })
      const spawned = spawnHandle(launch.args, {
        onStderrLine: line => {
          if (!line.startsWith(RECORD)) return false
          const entry: unknown = JSON.parse(line.slice(RECORD.length))
          if (
            typeof entry === 'object' &&
            entry !== null &&
            'method' in entry &&
            entry.method === 'tools/call'
          )
            markCalled()
          return true
        },
      })
      let exited = false
      void spawned.exited.then(() => {
        exited = true
      })
      const one: Landed = { exited: () => exited, called }
      landed.push(one)
      markStarted(one)
      const { handle } = spawned
      return {
        ok: {
          stdin: handle.stdin,
          stdout: handle.stdout,
          stderr: handle.stderr,
          exited: handle.exited,
          async stop() {
            const scope = await handle.stop()
            stops.push(stopAs ?? scope)
            return stopAs ?? scope
          },
        },
      }
    },
  }
  return { port, landed, stops, started }
}

/** The memory credential use, with each `release()` of a process handle it gave recorded. */
function recordingCredentials(inner: CredentialUse<unknown>) {
  const released: string[] = []
  type Access = Parameters<CredentialUse<unknown>['acquire']>[0]
  type Holding = Parameters<CredentialUse<unknown>['acquire']>[1]
  type Binding = Parameters<CredentialUse<unknown>['acquire']>[3]
  function acquire(
    access: Access,
    holding: Holding,
    purpose: ProcessPurpose,
    binding: Binding,
  ): Promise<Outcome<ProcessCredentialHandle, CredentialFailure>>
  function acquire(
    access: Access,
    holding: Holding,
    purpose: HttpPurpose,
    binding: Binding,
  ): Promise<Outcome<HttpCredentialHandle, CredentialFailure>>
  async function acquire(
    access: Access,
    holding: Holding,
    purpose: CredentialPurpose,
    binding: Binding,
  ): Promise<Outcome<ProcessCredentialHandle | HttpCredentialHandle, CredentialFailure>> {
    if (purpose.kind !== 'process-env') return inner.acquire(access, holding, purpose, binding)
    const acquired = await inner.acquire(access, holding, purpose, binding)
    if (!('ok' in acquired)) return acquired
    const handle = acquired.ok
    return {
      ok: {
        purpose: 'process-env',
        async release() {
          released.push(binding)
          await handle.release()
        },
      },
    }
  }
  const port: CredentialUse<unknown> = { acquire }
  return { port, released }
}

type Endpoint = Readonly<{ script: PeerScript; credential?: boolean; stopAs?: StopScope }>

/** Adopts `FILES` for alice in `SCOPE`: a stdio endpoint that runs the scripted peer. */
function adoptFiles(adoption: MemoryAdoptionView<unknown, unknown>, endpoint: Endpoint): void {
  const credential = endpoint.credential === true
  adoption.adopt({
    tenant: ALICE.tenant,
    scope: SCOPE,
    ref: FILES,
    body: jsonOf({
      name: FILES.name,
      transport: 'stdio',
      auth: credential ? 'static' : 'none',
      launch: {
        command: process.execPath,
        args: [PEER, JSON.stringify(endpoint.script)],
        env: credential ? [{ name: 'TOKEN', source: 'credential' }] : [],
        facilities: [],
      },
    }),
    settings: {
      target: { kind: 'absent' },
      credential: credential ? { kind: 'value', value: MAIN } : { kind: 'absent' },
      connectTimeout: { kind: 'value', value: millisOf(10_000) },
    },
  })
}

/** The four ports as Service classes, with `FILES` adopted and alice granted its use. */
function ports(endpoint: Endpoint) {
  const adoption = createMemoryAdoptionView<unknown, unknown>({ scopeKey: String })
  const eligibility = createMemoryUseEligibility<unknown>({ principalKey })
  const memory = createMemoryCredentialUse<unknown>()
  const credentials = recordingCredentials(memory)
  const landing = scriptedLanding(endpoint.stopAs)
  adoptFiles(adoption, endpoint)
  eligibility.grant(ALICE, FILES)
  if (endpoint.credential === true)
    memory.store({ tenant: ALICE.tenant, holding: FILES.holding, binding: MAIN, secret: 's' })
  return {
    adoption: adoptionService(adoption),
    eligibility: eligibilityService(eligibility),
    credentials: credentialService(credentials.port),
    landing: landingService(landing.port),
    landed: landing.landed,
    started: landing.started,
    stops: landing.stops,
    released: credentials.released,
  }
}

type PortName = 'adoption' | 'eligibility' | 'credentials' | 'landing'
const PORT_NAMES: readonly PortName[] = ['adoption', 'eligibility', 'credentials', 'landing']

/** Loads the ports except `absent`, then the plugin. */
async function assembled(endpoint: Endpoint, absent?: PortName, loaded: Plugin = plugin) {
  const ctx = new Context()
  const provided = ports(endpoint)
  for (const name of PORT_NAMES) if (name !== absent) await load(ctx, provided[name], undefined)
  const fiber = await load(ctx, loaded, CONFIG)
  return { ctx, fiber, provided }
}

type ServiceKey =
  | typeof mcpActionDiscoveryKey
  | typeof mcpActionInvokerKey
  | typeof mcpEndpointStatusKey

function service<K extends ServiceKey>(ctx: Context, key: K) {
  const found = ctx.get(key)
  if (found === undefined) throw new Error(`${key} is not provided`)
  return found
}

async function refreshed(ctx: Context) {
  return service(ctx, mcpActionDiscoveryKey).refresh(ALICE, { ref: FILES })
}

/** The names of the known actions in the stored catalog. */
async function actionNames(ctx: Context): Promise<readonly string[]> {
  const view = await service(ctx, mcpActionDiscoveryKey).current(ALICE, FILES)
  if (!('ok' in view) || view.ok.kind !== 'acquired') throw new Error('no catalog was acquired')
  return view.ok.actions.map(action => action.name)
}

/** The name and availability of each known action in the stored catalog. */
async function availabilities(ctx: Context) {
  const view = await service(ctx, mcpActionDiscoveryKey).current(ALICE, FILES)
  if (!('ok' in view) || view.ok.kind !== 'acquired') throw new Error('no catalog was acquired')
  return view.ok.actions.map(action => [action.name, action.availability])
}

/** Invokes `tool` with the digest the stored catalog holds. */
async function invoke(ctx: Context, tool: string, key: CorrelationKey): Promise<InvokeResult> {
  const view = await service(ctx, mcpActionDiscoveryKey).current(ALICE, FILES)
  if (!('ok' in view) || view.ok.kind !== 'acquired') throw new Error('no catalog was acquired')
  const known = view.ok.actions.find(action => action.name === tool)
  if (known === undefined) throw new Error(`the catalog has no action ${tool}`)
  return service(ctx, mcpActionInvokerKey).invoke(ALICE, {
    ref: FILES,
    action: actionNameOf(tool),
    args: jsonOf({}),
    expectedDefinition: known.definitionDigest,
    correlationKey: key,
    signal: new AbortController().signal,
  })
}

const CALL_1 = correlationKeyOf('call-1')

/** Refreshes, then invokes `echo`. */
async function invokeEcho(ctx: Context) {
  expect(await refreshed(ctx)).toMatchObject({ ok: { kind: 'published' } })
  return invoke(ctx, 'echo', CALL_1)
}

/** The warnings of the `mcp` logger. The exporter enables level 2, which Cordis drops by default. */
function recordWarnings(ctx: Context): unknown[][] {
  const warnings: unknown[][] = []
  ctx.logger.exporter({
    levels: { default: 2 },
    export(message: Message) {
      if (message.type === 'warn' && message.name === 'mcp') warnings.push(message.args)
    },
  })
  return warnings
}

describe('the MCP plugin on a Cordis context, with a scripted peer process', () => {
  it('loads with a complete lawful configuration and walks refresh then invoke on a scripted stdio peer', async () => {
    const { ctx, provided } = await assembled({ script: ANSWERING })
    const invoked = await invokeEcho(ctx)
    expect(invoked).toMatchObject({
      kind: 'sent',
      outcome: {
        kind: 'complete',
        content: [{ kind: 'block', block: { kind: 'text', text: 'hello' } }],
      },
    })
    expect(provided.landed).toHaveLength(1)
  })

  it('stamps the published catalog with the time of the clock in the plugin parts', async () => {
    const acquiredAt = new Date('2026-01-02T03:04:05.000Z')
    const clocked = createMcpPlugin({ principalKey, checkOutput, clock: { now: () => acquiredAt } })
    const { ctx } = await assembled({ script: ANSWERING }, undefined, clocked)
    expect(await refreshed(ctx)).toMatchObject({ ok: { kind: 'published' } })
    expect(await service(ctx, mcpActionDiscoveryKey).current(ALICE, FILES)).toMatchObject({
      ok: { kind: 'acquired', freshness: { acquiredAt: acquiredAt.toISOString() } },
    })
  })

  it('answers each operation of the three services through the plugin', async () => {
    const { ctx } = await assembled({ script: OPERATIONS })
    const discovery = service(ctx, mcpActionDiscoveryKey)
    const invoker = service(ctx, mcpActionInvokerKey)
    const status = service(ctx, mcpEndpointStatusKey)
    expect(await discovery.refresh(ALICE, { ref: FILES })).toMatchObject({
      ok: { kind: 'published' },
    })
    expect(await actionNames(ctx)).toEqual(['ask', 'work'])
    const peer = await discovery.peer(ALICE, FILES)
    if (!('ok' in peer)) throw new Error(`peer failed: ${JSON.stringify(peer)}`)
    expect(peer.ok.peer).toMatchObject({ protocolVersion: '2026-07-28' })

    const asked = await invoke(ctx, 'ask', CALL_1)
    if (asked.kind !== 'sent' || asked.outcome.kind !== 'inputRequired')
      throw new Error(`ask did not ask for input: ${JSON.stringify(asked)}`)
    const { requestState, issuedAt } = asked.outcome
    const continued = await invoker.continueWithInput(ALICE, {
      ref: FILES,
      action: actionNameOf('ask'),
      args: jsonOf({}),
      ...(requestState === undefined ? {} : { requestState }),
      inputResponses: jsonOf({}),
      issuedAt,
      correlationKey: correlationKeyOf('call-2'),
      signal: new AbortController().signal,
    })
    expect(continued).toMatchObject({
      kind: 'sent',
      outcome: { kind: 'complete', content: [{ block: { kind: 'text', text: 'answered' } }] },
    })

    const worked = await invoke(ctx, 'work', correlationKeyOf('call-3'))
    if (worked.kind !== 'sent' || worked.outcome.kind !== 'task')
      throw new Error(`work did not start a task: ${JSON.stringify(worked)}`)
    const task = { ref: FILES, taskId: taskIdOf('t1'), issuedAt: worked.outcome.issuedAt }
    expect(await invoker.queryTask(ALICE, task)).toMatchObject({ ok: { status: 'working' } })
    expect(await invoker.taskResult(ALICE, task)).toMatchObject({
      ok: { kind: 'complete', content: [{ block: { kind: 'text', text: 'done' } }] },
    })
    expect(await invoker.provideTaskInput(ALICE, task, jsonOf({}))).toEqual({ ok: 'accepted' })
    expect(await invoker.cancelTask(ALICE, task)).toEqual({ ok: 'requested' })

    expect(await status.inspect(ALICE, FILES)).toMatchObject({
      ok: { ref: FILES, connection: { kind: 'ready' }, use: { kind: 'usable' } },
    })
    expect(await status.list(ALICE, SCOPE)).toMatchObject({
      ok: [{ ref: FILES, connection: { kind: 'ready' } }],
    })
  })

  it('signals a call in flight that cancel names', async () => {
    const { ctx, provided } = await assembled({ script: SILENT })
    const invoking = invokeEcho(ctx)
    const peer = await provided.started
    await peer.called
    const invoker = service(ctx, mcpActionInvokerKey)
    expect(await invoker.cancel(ALICE, CALL_1)).toBe('signalled')
    expect(await invoking).toEqual({
      kind: 'sent',
      outcome: { kind: 'unknown', cause: 'abandoned' },
    })
    expect(await invoker.cancel(ALICE, CALL_1)).toBe('no-call-in-flight')
  })

  it.each(PORT_NAMES)(
    'publishes the catalog of a stdio peer once the absent %s port is provided',
    async name => {
      const { ctx, provided } = await assembled({ script: ANSWERING, credential: true }, name)
      expect(await refreshed(ctx)).toMatchObject({ failure: {} })
      expect(provided.landed).toHaveLength(0)
      await load(ctx, provided[name], undefined)
      expect(await refreshed(ctx)).toMatchObject({ ok: { kind: 'published' } })
      expect(await actionNames(ctx)).toEqual(['echo'])
      expect(provided.landed).toHaveLength(1)
    },
  )

  it('reads the replacement adoption view at the next refresh after a swap', async () => {
    const { ctx, provided } = await assembled({ script: ANSWERING }, 'adoption')
    const first = await load(ctx, provided.adoption, undefined)
    expect(await refreshed(ctx)).toMatchObject({ ok: { kind: 'published' } })
    expect(await actionNames(ctx)).toEqual(['echo'])

    await first.dispose()
    const replacement = createMemoryAdoptionView<unknown, unknown>({ scopeKey: String })
    const other: PeerScript = { listing: listingOf('other') }
    // Adopted twice, so that its revision differs from the first view's only revision.
    adoptFiles(replacement, { script: other })
    adoptFiles(replacement, { script: other })
    await load(ctx, adoptionService(replacement), undefined)
    expect(await refreshed(ctx)).toMatchObject({ ok: { kind: 'published' } })
    // The merge keeps the action the peer no longer lists, unavailable (mcp-contract R3).
    expect(await availabilities(ctx)).toEqual([
      ['echo', { kind: 'unavailable', reason: 'no-longer-offered' }],
      ['other', { kind: 'available' }],
    ])
    expect(provided.landed).toHaveLength(2)
  })

  it('removes the three services, stops the peer process and releases the credential handle when the plugin unloads', async () => {
    const { ctx, fiber, provided } = await assembled({ script: ANSWERING, credential: true })
    expect(await invokeEcho(ctx)).toMatchObject({ kind: 'sent' })
    const [peer] = provided.landed
    if (peer === undefined) throw new Error('no process was started')
    expect(peer.exited()).toBe(false)

    expect(provided.stops).toEqual([])
    expect(provided.released).toEqual([])

    await fiber.dispose()
    expect(peer.exited()).toBe(true)
    expect(provided.stops).toEqual(['root-only'])
    expect(provided.released).toEqual([MAIN])
    expect(ctx.get(mcpActionDiscoveryKey)).toBeUndefined()
    expect(ctx.get(mcpActionInvokerKey)).toBeUndefined()
    expect(ctx.get(mcpEndpointStatusKey)).toBeUndefined()
  })

  it('settles a call in flight with an unknown effect when the plugin unloads', async () => {
    const { ctx, fiber, provided } = await assembled({ script: SILENT })
    const invoking = invokeEcho(ctx)
    const peer = await provided.started
    await peer.called

    await fiber.dispose()
    expect(await invoking).toEqual({
      kind: 'sent',
      outcome: { kind: 'unknown', cause: 'abandoned' },
    })
    expect(peer.exited()).toBe(true)
  })

  it.each(['root-only', 'unconfirmed'] as const)(
    'warns of the endpoint and the scope when the stop of its process is %s at unload',
    async stopAs => {
      const { ctx, fiber } = await assembled({ script: ANSWERING, stopAs })
      const warnings = recordWarnings(ctx)
      expect(await invokeEcho(ctx)).toMatchObject({ kind: 'sent' })
      await fiber.dispose()
      expect(warnings).toEqual([['the stop of the process was not confirmed', FILES, stopAs]])
    },
  )

  it('does not warn when the stop of the process is tree-confirmed at unload', async () => {
    const { ctx, fiber, provided } = await assembled({
      script: ANSWERING,
      stopAs: 'tree-confirmed',
    })
    const warnings = recordWarnings(ctx)
    expect(await invokeEcho(ctx)).toMatchObject({ kind: 'sent' })
    await fiber.dispose()
    expect(provided.stops).toEqual(['tree-confirmed'])
    expect(warnings).toEqual([])
  })
})
