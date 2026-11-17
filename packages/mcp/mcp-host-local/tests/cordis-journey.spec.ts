// @module-tag slow — every case starts a scripted peer on a local HTTP server.
import { Context, type Fiber } from '@deepseek-ai/cordis'
import { afterEach, describe, expect, it } from 'vitest'
import { access, accountCodec, organizationCodec, tenant } from '@omne-harness/legal-identity'
import type { CorrelationKey, InvokeResult } from '@omne-harness/mcp-contract'
import type {
  AdoptionView,
  CredentialUse,
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
  UseEligibilityService,
  mcpActionDiscoveryKey,
  mcpActionInvokerKey,
  mcpEndpointStatusKey,
} from '@omne-harness/mcp-cordis-contract/cordis'
import { createMcpPlugin, type McpPluginConfig } from '@omne-harness/mcp-host-local/cordis'
import { httpPeer, leftoverServers, type HttpPeer } from './fixtures/scripted/http.ts'

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
const peers: HttpPeer[] = []

afterEach(async () => {
  await Promise.all(fibers.splice(0).map(fiber => fiber.dispose()))
  await Promise.all(peers.splice(0).map(peer => peer.close()))
  expect(await leftoverServers()).toEqual([])
})

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

function recordingCredentials(inner: CredentialUse<unknown>) {
  const released: string[] = []
  const port: CredentialUse<unknown> = {
    async acquire(access, holding, purpose, binding) {
      const acquired = await inner.acquire(access, holding, purpose, binding)
      if (!('ok' in acquired)) return acquired
      const handle = acquired.ok
      return {
        ok: {
          ...handle,
          async release() {
            released.push(binding)
            await handle.release()
          },
        },
      }
    },
  }
  return { port, released }
}

type Endpoint = Readonly<{ script: PeerScript; credential?: boolean }>

async function peerOf(script: PeerScript, onRequest?: (method: string) => void): Promise<HttpPeer> {
  const peer = await httpPeer(
    script,
    {},
    ['2026-07-28'],
    { clientInfo: CONFIG.clientInfo },
    onRequest === undefined ? {} : { beforeRecord: async method => onRequest(method) },
  )
  peers.push(peer)
  return peer
}

function adoptFiles(
  adoption: MemoryAdoptionView<unknown, unknown>,
  peer: HttpPeer,
  credential = false,
): void {
  adoption.adopt({
    tenant: ALICE.tenant,
    scope: SCOPE,
    ref: FILES,
    body: jsonOf({
      name: FILES.name,
      transport: 'streamable-http',
      auth: credential ? 'static' : 'none',
    }),
    settings: {
      target: { kind: 'value', value: peer.material.target },
      credential: credential ? { kind: 'value', value: MAIN } : { kind: 'absent' },
      connectTimeout: { kind: 'value', value: millisOf(10_000) },
    },
  })
}

async function ports(endpoint: Endpoint) {
  let markCalled = (): void => undefined
  const called = new Promise<void>(resolve => {
    markCalled = resolve
  })
  const peer = await peerOf(endpoint.script, method => {
    if (method === 'tools/call') markCalled()
  })
  const adoption = createMemoryAdoptionView<unknown, unknown>({ scopeKey: String })
  const eligibility = createMemoryUseEligibility<unknown>({ principalKey })
  const memory = createMemoryCredentialUse<unknown>()
  const credentials = recordingCredentials(memory)
  adoptFiles(adoption, peer, endpoint.credential)
  eligibility.grant(ALICE, FILES)
  if (endpoint.credential === true)
    memory.store({ tenant: ALICE.tenant, holding: FILES.holding, binding: MAIN, secret: 's' })
  return {
    adoption: adoptionService(adoption),
    eligibility: eligibilityService(eligibility),
    credentials: credentialService(credentials.port),
    peer,
    called,
    released: credentials.released,
  }
}

type PortName = 'adoption' | 'eligibility' | 'credentials'
const PORT_NAMES: readonly PortName[] = ['adoption', 'eligibility', 'credentials']

async function assembled(endpoint: Endpoint, absent?: PortName, loaded: Plugin = plugin) {
  const ctx = new Context()
  const provided = await ports(endpoint)
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

async function actionNames(ctx: Context): Promise<readonly string[]> {
  const view = await service(ctx, mcpActionDiscoveryKey).current(ALICE, FILES)
  if (!('ok' in view) || view.ok.kind !== 'acquired') throw new Error('no catalog was acquired')
  return view.ok.actions.map(action => action.name)
}

async function availabilities(ctx: Context) {
  const view = await service(ctx, mcpActionDiscoveryKey).current(ALICE, FILES)
  if (!('ok' in view) || view.ok.kind !== 'acquired') throw new Error('no catalog was acquired')
  return view.ok.actions.map(action => [action.name, action.availability])
}

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

async function invokeEcho(ctx: Context) {
  expect(await refreshed(ctx)).toMatchObject({ ok: { kind: 'published' } })
  return invoke(ctx, 'echo', CALL_1)
}

describe('the MCP plugin on a Cordis context, with a scripted HTTP peer', () => {
  it('loads with a complete lawful configuration and walks refresh then invoke on a scripted HTTP peer', async () => {
    const { ctx } = await assembled({ script: ANSWERING })
    const invoked = await invokeEcho(ctx)
    expect(invoked).toMatchObject({
      kind: 'sent',
      outcome: {
        kind: 'complete',
        content: [{ kind: 'block', block: { kind: 'text', text: 'hello' } }],
      },
    })
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
    await provided.called
    const invoker = service(ctx, mcpActionInvokerKey)
    expect(await invoker.cancel(ALICE, CALL_1)).toBe('signalled')
    expect(await invoking).toEqual({
      kind: 'sent',
      outcome: { kind: 'unknown', cause: 'abandoned' },
    })
    expect(await invoker.cancel(ALICE, CALL_1)).toBe('no-call-in-flight')
  })

  it.each(PORT_NAMES)(
    'publishes the catalog of an HTTP peer once the absent %s port is provided',
    async name => {
      const { ctx, provided } = await assembled({ script: ANSWERING, credential: true }, name)
      expect(await refreshed(ctx)).toMatchObject({ failure: {} })
      expect(provided.peer.requestLines()).toEqual([])
      await load(ctx, provided[name], undefined)
      expect(await refreshed(ctx)).toMatchObject({ ok: { kind: 'published' } })
      expect(await actionNames(ctx)).toEqual(['echo'])
    },
  )

  it('reads the replacement adoption view at the next refresh after a swap', async () => {
    const { ctx, provided } = await assembled({ script: ANSWERING }, 'adoption')
    const first = await load(ctx, provided.adoption, undefined)
    expect(await refreshed(ctx)).toMatchObject({ ok: { kind: 'published' } })
    expect(await actionNames(ctx)).toEqual(['echo'])

    await first.dispose()
    const replacement = createMemoryAdoptionView<unknown, unknown>({ scopeKey: String })
    const other = await peerOf({ listing: listingOf('other') })
    adoptFiles(replacement, other)
    adoptFiles(replacement, other)
    await load(ctx, adoptionService(replacement), undefined)
    expect(await refreshed(ctx)).toMatchObject({ ok: { kind: 'published' } })
    expect(await availabilities(ctx)).toEqual([
      ['echo', { kind: 'unavailable', reason: 'no-longer-offered' }],
      ['other', { kind: 'available' }],
    ])
  })

  it('removes the three services and releases the credential handle when the plugin unloads', async () => {
    const { ctx, fiber, provided } = await assembled({ script: ANSWERING, credential: true })
    expect(await invokeEcho(ctx)).toMatchObject({ kind: 'sent' })
    expect(provided.released).toEqual([])

    await fiber.dispose()
    expect(provided.released).toEqual([MAIN])
    expect(ctx.get(mcpActionDiscoveryKey)).toBeUndefined()
    expect(ctx.get(mcpActionInvokerKey)).toBeUndefined()
    expect(ctx.get(mcpEndpointStatusKey)).toBeUndefined()
  })

  it('settles a call in flight with an unknown effect when the plugin unloads', async () => {
    const { ctx, fiber, provided } = await assembled({ script: SILENT })
    const invoking = invokeEcho(ctx)
    await provided.called

    await fiber.dispose()
    expect(await invoking).toEqual({
      kind: 'sent',
      outcome: { kind: 'unknown', cause: 'abandoned' },
    })
  })
})
