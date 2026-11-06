// @module-tag slow — the journey and the removal cases start a scripted peer process on real pipes.
// The MCP plugin on a real Cordis `Context`. The adoption, eligibility and credential ports are the
// memory doubles of `@omne-harness/mcp-contract/testing`, each provided as a Service subclass; the
// landing starts the scripted stdio peer of `fixtures/scripted/` as a child process.
import { fileURLToPath } from 'node:url'
import { Context, type Fiber, type Message } from '@deepseek-ai/cordis'
import { afterEach, describe, expect, it } from 'vitest'
import { access, accountCodec, organizationCodec, tenant } from '@omne-harness/legal-identity'
import type { EndpointRef } from '@omne-harness/mcp-contract'
import type {
  AdoptionView,
  CredentialUse,
  ProcessLanding,
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

const plugin = createMcpPlugin({ principalKey, checkOutput: () => ({ kind: 'conforms' }) })

const ECHO_LISTING: PeerScript['listing'] = {
  '': {
    kind: 'result',
    result: { tools: [{ name: 'echo', inputSchema: { type: 'object' } }] },
  },
}
const ANSWERING: PeerScript = {
  listing: ECHO_LISTING,
  calls: { echo: { kind: 'result', result: { content: [{ type: 'text', text: 'hello' }] } } },
}
const SILENT: PeerScript = { listing: ECHO_LISTING, calls: { echo: { kind: 'silent' } } }

const fibers: Fiber[] = []

afterEach(async () => {
  await Promise.all(fibers.splice(0).map(fiber => fiber.dispose()))
  expect(await leftover()).toEqual([])
})

/** Loads `plugin` on `ctx` with `config`; the fiber is disposed after the case. */
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

/** A landing that starts the scripted peer for every `start`, and what it started. */
function scriptedLanding() {
  const landed: Landed[] = []
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
      landed.push({ exited: () => exited, called })
      return { ok: spawned.handle }
    },
  }
  return { port, landed }
}

type Endpoint = Readonly<{ script: PeerScript; credential?: boolean }>

/** The four ports, with `FILES` adopted for alice in `SCOPE` and alice granted its use. */
function ports(endpoint: Endpoint) {
  const adoption = createMemoryAdoptionView<unknown, unknown>({ scopeKey: String })
  const eligibility = createMemoryUseEligibility<unknown>({ principalKey })
  const credentials = createMemoryCredentialUse<unknown>()
  const landing = scriptedLanding()
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
  eligibility.grant(ALICE, FILES)
  if (credential)
    credentials.store({ tenant: ALICE.tenant, holding: FILES.holding, binding: MAIN, secret: 's' })
  return {
    adoption: adoptionService(adoption),
    eligibility: eligibilityService(eligibility),
    credentials: credentialService(credentials),
    landing: landingService(landing.port),
    landed: landing.landed,
  }
}

type PortName = 'adoption' | 'eligibility' | 'credentials' | 'landing'
const PORT_NAMES: readonly PortName[] = ['adoption', 'eligibility', 'credentials', 'landing']

/** Loads the ports except `absent`, then the plugin. */
async function assembled(endpoint: Endpoint, absent?: PortName) {
  const ctx = new Context()
  const provided = ports(endpoint)
  for (const name of PORT_NAMES) if (name !== absent) await load(ctx, provided[name], undefined)
  const fiber = await load(ctx, plugin, CONFIG)
  return { ctx, fiber, provided }
}

function service<K extends 'mcpActionDiscovery' | 'mcpActionInvoker' | 'mcpEndpointStatus'>(
  ctx: Context,
  key: K,
) {
  const found = ctx.get(key)
  if (found === undefined) throw new Error(`${key} is not provided`)
  return found
}

async function refreshed(ctx: Context, ref: EndpointRef = FILES) {
  return service(ctx, mcpActionDiscoveryKey).refresh(ALICE, { ref })
}

/** Refreshes, then invokes `echo` with the digest the catalog holds. */
async function invokeEcho(ctx: Context) {
  expect(await refreshed(ctx)).toMatchObject({ ok: { kind: 'published' } })
  const view = await service(ctx, mcpActionDiscoveryKey).current(ALICE, FILES)
  if (!('ok' in view) || view.ok.kind !== 'acquired') throw new Error('no catalog was acquired')
  const echo = view.ok.actions.find(action => action.name === 'echo')
  if (echo === undefined) throw new Error('the catalog has no echo action')
  return service(ctx, mcpActionInvokerKey).invoke(ALICE, {
    ref: FILES,
    action: actionNameOf('echo'),
    args: jsonOf({}),
    expectedDefinition: echo.definitionDigest,
    correlationKey: correlationKeyOf('call-1'),
    signal: new AbortController().signal,
  })
}

function recordErrors(ctx: Context): unknown[] {
  const errors: unknown[] = []
  ctx.logger.exporter({
    export(message: Message) {
      if (message.type === 'error') errors.push(...message.args)
    },
  })
  return errors
}

/** Loads the plugin with a configuration the typed overload would refuse. */
async function loadUntyped(ctx: Context, config: unknown) {
  // The typed overload forbids the bad configuration; an assembly reading a plugin tree does not.
  const loading: unknown = Reflect.apply(ctx.plugin, ctx, [plugin, config])
  return Promise.resolve(loading)
}

describe('the MCP plugin on a Cordis context', () => {
  it('provides the three services and walks refresh then invoke on a scripted stdio peer', async () => {
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

  it('answers unknown, and connects to nothing, while the adoption view is absent', async () => {
    const { ctx, provided } = await assembled({ script: ANSWERING }, 'adoption')
    expect(await refreshed(ctx)).toEqual({ failure: { kind: 'unknown' } })
    expect(await service(ctx, mcpEndpointStatusKey).list(ALICE, SCOPE)).toEqual({
      failure: 'unknown',
    })
    expect(provided.landed).toHaveLength(0)
    await load(ctx, provided.adoption, undefined)
    expect(await service(ctx, mcpActionDiscoveryKey).current(ALICE, FILES)).toEqual({
      ok: { kind: 'not-acquired' },
    })
  })

  it('answers unknown, and connects to nothing, while the use eligibility is absent', async () => {
    const { ctx, provided } = await assembled({ script: ANSWERING }, 'eligibility')
    expect(await refreshed(ctx)).toEqual({ failure: { kind: 'unknown' } })
    expect(await service(ctx, mcpEndpointStatusKey).inspect(ALICE, FILES)).toEqual({
      failure: { kind: 'unknown' },
    })
    expect(provided.landed).toHaveLength(0)
    await load(ctx, provided.eligibility, undefined)
    expect(await service(ctx, mcpActionDiscoveryKey).current(ALICE, FILES)).toEqual({
      ok: { kind: 'not-acquired' },
    })
  })

  it('answers an unknown credential, and starts no process, while the credential use is absent', async () => {
    const { ctx, provided } = await assembled(
      { script: ANSWERING, credential: true },
      'credentials',
    )
    expect(await refreshed(ctx)).toEqual({
      failure: { kind: 'credential-unavailable', cause: 'unknown' },
    })
    expect(provided.landed).toHaveLength(0)
    await load(ctx, provided.credentials, undefined)
    expect(await service(ctx, mcpActionDiscoveryKey).current(ALICE, FILES)).toEqual({
      ok: { kind: 'not-acquired' },
    })
  })

  it('answers landing-unavailable, and starts no process, while the process landing is absent', async () => {
    const { ctx, provided } = await assembled({ script: ANSWERING }, 'landing')
    expect(await refreshed(ctx)).toEqual({ failure: { kind: 'landing-unavailable' } })
    expect(provided.landed).toHaveLength(0)
    await load(ctx, provided.landing, undefined)
    expect(await service(ctx, mcpActionDiscoveryKey).current(ALICE, FILES)).toEqual({
      ok: { kind: 'not-acquired' },
    })
  })

  it('uses the replacement eligibility at the next operation after a swap', async () => {
    const { ctx } = await assembled({ script: ANSWERING }, 'eligibility')
    const granting = createMemoryUseEligibility<unknown>({ principalKey })
    granting.grant(ALICE, FILES)
    const first = await load(ctx, eligibilityService(granting), undefined)
    expect(await service(ctx, mcpEndpointStatusKey).inspect(ALICE, FILES)).toMatchObject({
      ok: { use: { kind: 'usable' } },
    })

    await first.dispose()
    const refusing = createMemoryUseEligibility<unknown>({ principalKey })
    await load(ctx, eligibilityService(refusing), undefined)
    expect(await service(ctx, mcpEndpointStatusKey).inspect(ALICE, FILES)).toEqual({
      failure: { kind: 'not-available-to-you' },
    })
  })

  it('removes the three services and stops the peer process when the plugin unloads', async () => {
    const { ctx, fiber, provided } = await assembled({ script: ANSWERING })
    expect(await invokeEcho(ctx)).toMatchObject({ kind: 'sent' })
    const [peer] = provided.landed
    if (peer === undefined) throw new Error('no process was started')
    expect(peer.exited()).toBe(false)

    await fiber.dispose()
    expect(peer.exited()).toBe(true)
    expect(ctx.get(mcpActionDiscoveryKey)).toBeUndefined()
    expect(ctx.get(mcpActionInvokerKey)).toBeUndefined()
    expect(ctx.get(mcpEndpointStatusKey)).toBeUndefined()
  })

  it('settles a call in flight with an unknown effect when the plugin unloads', async () => {
    const { ctx, fiber, provided } = await assembled({ script: SILENT })
    const invoking = invokeEcho(ctx)
    const [peer] = await waitForLanding(provided.landed)
    await peer.called

    await fiber.dispose()
    expect(await invoking).toEqual({
      kind: 'sent',
      outcome: { kind: 'unknown', cause: 'abandoned' },
    })
    expect(peer.exited()).toBe(true)
  })

  it('Cordis mechanism probe: each error of an AggregateError a removal throws is logged and the unload completes', async () => {
    const ctx = new Context()
    const errors = recordErrors(ctx)
    // Cordis 4.0.4 `Logger` writes each error of an AggregateError, not the AggregateError itself.
    const defects = [new Error('a defect'), new Error('another defect')]
    const failure = new AggregateError(defects, 'closeAll failed')
    const probe = {
      name: 'aggregate-error-probe',
      apply(probed: Context) {
        probed.effect(
          () => async () => {
            throw failure
          },
          'probe.closeAll',
        )
      },
    }
    const fiber = await ctx.plugin(probe)
    await expect(fiber.dispose()).resolves.toBeUndefined()
    expect(errors).toEqual(defects)
  })

  describe('refuses to load with a configuration', () => {
    const { maxActions: _dropped, ...withoutMaxActions } = CONFIG
    const cases: readonly (readonly [string, unknown])[] = [
      ['that lacks a field', withoutMaxActions],
      ['that has an extra field', { ...CONFIG, retries: 3 }],
      ['whose clientInfo.name is not a text', { ...CONFIG, clientInfo: { name: 1, version: '0' } }],
    ]
    for (const [what, config] of cases)
      it(what, async () => {
        const ctx = new Context()
        await expect(loadUntyped(ctx, config)).rejects.toBeDefined()
        expect(ctx.get(mcpActionDiscoveryKey)).toBeUndefined()
      })

    it('whose maxActions is 0, with the RangeError of createMcp', async () => {
      const ctx = new Context()
      await expect(ctx.plugin(plugin, { ...CONFIG, maxActions: 0 })).rejects.toThrow(RangeError)
      expect(ctx.get(mcpActionDiscoveryKey)).toBeUndefined()
    })

    it('whose probeTimeoutMs is 0, with the RangeError of the transport factory', async () => {
      const ctx = new Context()
      await expect(ctx.plugin(plugin, { ...CONFIG, probeTimeoutMs: 0 })).rejects.toThrow(RangeError)
      expect(ctx.get(mcpActionDiscoveryKey)).toBeUndefined()
    })
  })
})

/** The landed processes once there is at least one. */
async function waitForLanding(landed: readonly Landed[]): Promise<readonly [Landed]> {
  for (;;) {
    const [first] = landed
    if (first !== undefined) return [first]
    await new Promise(resolve => setTimeout(resolve, 10))
  }
}
