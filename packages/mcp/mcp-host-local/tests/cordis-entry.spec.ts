// The MCP plugin on a real Cordis `Context`, without a process. The adoption, eligibility and
// credential ports are the memory doubles of `@omne-harness/mcp-contract/testing`, each provided as
// a Service subclass. The landing records each launch it is asked for and answers
// `facility-missing`, so no transport is opened: a refresh that reaches it answers
// `landing-unavailable` (mcp-contract R6). The cases that start a scripted peer are in
// `cordis-journey.spec.ts`.
import { Context, ValidationError, type Fiber, type Message } from '@deepseek-ai/cordis'
import { afterEach, describe, expect, it } from 'vitest'
import { access, accountCodec, organizationCodec, tenant } from '@omne-harness/legal-identity'
import { digestDefinition, type StdioLaunch } from '@omne-harness/mcp-contract'
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
  generationOf,
  jsonOf,
  millisOf,
  taskIdOf,
  type MemoryAdoptionView,
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
import { fail } from '@omne-harness/operation-result'

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

const fibers: Fiber[] = []

afterEach(async () => {
  await Promise.all(fibers.splice(0).map(fiber => fiber.dispose()))
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

/** A landing that records each launch it is asked for and starts nothing. */
function recordingLanding() {
  const launches: StdioLaunch[] = []
  const port: ProcessLanding<unknown> = {
    async start(_access, launch) {
      launches.push(launch)
      return fail('facility-missing')
    },
  }
  return { port, launches }
}

type Endpoint = Readonly<{ args: readonly string[]; credential?: boolean }>

/** Adopts `FILES` for alice in `SCOPE`: a stdio endpoint whose launch has `args`. */
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
        args: endpoint.args,
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
  const credentials = createMemoryCredentialUse<unknown>()
  const landing = recordingLanding()
  adoptFiles(adoption, endpoint)
  eligibility.grant(ALICE, FILES)
  if (endpoint.credential === true)
    credentials.store({ tenant: ALICE.tenant, holding: FILES.holding, binding: MAIN, secret: 's' })
  return {
    adoption: adoptionService(adoption),
    eligibility: eligibilityService(eligibility),
    credentials: credentialService(credentials),
    landing: landingService(landing.port),
    launches: landing.launches,
  }
}

type PortName = 'adoption' | 'eligibility' | 'credentials' | 'landing'
const PORT_NAMES: readonly PortName[] = ['adoption', 'eligibility', 'credentials', 'landing']
const ARGS = ['peer'] as const

/** Loads the ports except `absent`, then the plugin. */
async function assembled(endpoint: Endpoint, absent?: PortName) {
  const ctx = new Context()
  const provided = ports(endpoint)
  for (const name of PORT_NAMES) if (name !== absent) await load(ctx, provided[name], undefined)
  const fiber = await load(ctx, plugin, CONFIG)
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

const LANDING_UNAVAILABLE = { failure: { kind: 'landing-unavailable' } }
const UNKNOWN = { failure: { kind: 'unknown' } }
const NOT_SENT = { kind: 'not-sent', reason: { kind: 'action-unavailable' } }

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

describe('the MCP plugin on a Cordis context, without a process', () => {
  it('provides the three services on load with a complete lawful configuration and removes them when the plugin unloads', async () => {
    const { ctx, fiber } = await assembled({ args: ARGS })
    expect(ctx.get(mcpActionDiscoveryKey)).toBeDefined()
    expect(ctx.get(mcpActionInvokerKey)).toBeDefined()
    expect(ctx.get(mcpEndpointStatusKey)).toBeDefined()
    await fiber.dispose()
    expect(ctx.get(mcpActionDiscoveryKey)).toBeUndefined()
    expect(ctx.get(mcpActionInvokerKey)).toBeUndefined()
    expect(ctx.get(mcpEndpointStatusKey)).toBeUndefined()
  })

  it('answers each operation of the three services while there is no connection', async () => {
    const { ctx, provided } = await assembled({ args: ARGS })
    const discovery = service(ctx, mcpActionDiscoveryKey)
    const invoker = service(ctx, mcpActionInvokerKey)
    const status = service(ctx, mcpEndpointStatusKey)
    const signal = new AbortController().signal
    const call = { ref: FILES, action: actionNameOf('echo'), args: jsonOf({}), signal }
    const task = { ref: FILES, taskId: taskIdOf('t1'), issuedAt: generationOf(0) }

    expect(await discovery.current(ALICE, FILES)).toEqual({ ok: { kind: 'not-acquired' } })
    expect(await discovery.peer(ALICE, FILES)).toEqual({ failure: { kind: 'not-connected' } })
    expect(await discovery.refresh(ALICE, { ref: FILES })).toEqual(LANDING_UNAVAILABLE)
    expect(
      await invoker.invoke(ALICE, {
        ...call,
        expectedDefinition: digestDefinition({
          name: actionNameOf('echo'),
          definition: jsonOf({}),
        }),
        correlationKey: correlationKeyOf('call-1'),
      }),
    ).toEqual(NOT_SENT)
    expect(
      await invoker.continueWithInput(ALICE, {
        ...call,
        inputResponses: jsonOf({}),
        issuedAt: generationOf(0),
        correlationKey: correlationKeyOf('call-2'),
      }),
    ).toEqual(NOT_SENT)
    expect(await invoker.cancel(ALICE, correlationKeyOf('call-1'))).toBe('unknown')
    expect(await invoker.queryTask(ALICE, task)).toEqual(UNKNOWN)
    expect(await invoker.taskResult(ALICE, task)).toEqual(UNKNOWN)
    expect(await invoker.provideTaskInput(ALICE, task, jsonOf({}))).toEqual(UNKNOWN)
    expect(await invoker.cancelTask(ALICE, task)).toEqual(UNKNOWN)
    expect(await status.inspect(ALICE, FILES)).toMatchObject({
      ok: {
        ref: FILES,
        connection: { kind: 'lost', reason: 'preparation-failed' },
        use: { kind: 'usable' },
      },
    })
    expect(await status.list(ALICE, SCOPE)).toMatchObject({
      ok: [{ ref: FILES, connection: { kind: 'lost', reason: 'preparation-failed' } }],
    })
    expect(provided.launches).toHaveLength(1)
  })

  it('answers unknown, and asks no landing, while the adoption view is absent, and reads the view once it is provided', async () => {
    const { ctx, provided } = await assembled({ args: ARGS }, 'adoption')
    expect(await refreshed(ctx)).toEqual({ failure: { kind: 'unknown' } })
    expect(await service(ctx, mcpEndpointStatusKey).list(ALICE, SCOPE)).toEqual({
      failure: 'unknown',
    })
    expect(provided.launches).toHaveLength(0)
    await load(ctx, provided.adoption, undefined)
    expect(await refreshed(ctx)).toEqual(LANDING_UNAVAILABLE)
    expect(provided.launches).toHaveLength(1)
  })

  it('answers unknown, and asks no landing, while the use eligibility is absent, and checks it once it is provided', async () => {
    const { ctx, provided } = await assembled({ args: ARGS }, 'eligibility')
    expect(await refreshed(ctx)).toEqual({ failure: { kind: 'unknown' } })
    expect(await service(ctx, mcpEndpointStatusKey).inspect(ALICE, FILES)).toEqual({
      failure: { kind: 'unknown' },
    })
    expect(provided.launches).toHaveLength(0)
    await load(ctx, provided.eligibility, undefined)
    expect(await refreshed(ctx)).toEqual(LANDING_UNAVAILABLE)
    expect(provided.launches).toHaveLength(1)
  })

  it('answers an unknown credential, and asks no landing, while the credential use is absent, and acquires once it is provided', async () => {
    const { ctx, provided } = await assembled({ args: ARGS, credential: true }, 'credentials')
    expect(await refreshed(ctx)).toEqual({
      failure: { kind: 'credential-unavailable', cause: 'unknown' },
    })
    expect(provided.launches).toHaveLength(0)
    await load(ctx, provided.credentials, undefined)
    expect(await refreshed(ctx)).toEqual(LANDING_UNAVAILABLE)
    expect(provided.launches).toHaveLength(1)
  })

  it('answers landing-unavailable while the process landing is absent, and asks the landing once it is provided', async () => {
    const { ctx, provided } = await assembled({ args: ARGS }, 'landing')
    expect(await refreshed(ctx)).toEqual(LANDING_UNAVAILABLE)
    expect(provided.launches).toHaveLength(0)
    await load(ctx, provided.landing, undefined)
    expect(await refreshed(ctx)).toEqual(LANDING_UNAVAILABLE)
    expect(provided.launches).toHaveLength(1)
  })

  it('uses the replacement eligibility at the next port call after a swap', async () => {
    const { ctx, provided } = await assembled({ args: ARGS }, 'eligibility')
    const granting = createMemoryUseEligibility<unknown>({ principalKey })
    granting.grant(ALICE, FILES)
    const first = await load(ctx, eligibilityService(granting), undefined)
    expect(await service(ctx, mcpEndpointStatusKey).inspect(ALICE, FILES)).toMatchObject({
      ok: { use: { kind: 'usable' } },
    })
    expect(await refreshed(ctx)).toEqual(LANDING_UNAVAILABLE)
    expect(provided.launches).toHaveLength(1)

    await first.dispose()
    const refusing = createMemoryUseEligibility<unknown>({ principalKey })
    await load(ctx, eligibilityService(refusing), undefined)
    expect(await service(ctx, mcpEndpointStatusKey).inspect(ALICE, FILES)).toEqual({
      failure: { kind: 'not-available-to-you' },
    })
    expect(await refreshed(ctx)).toEqual({ failure: { kind: 'not-available-to-you' } })
    expect(provided.launches).toHaveLength(1)
  })

  it('reads the replacement adoption view at the next refresh after a swap', async () => {
    const { ctx, provided } = await assembled({ args: ARGS }, 'adoption')
    const first = await load(ctx, provided.adoption, undefined)
    expect(await refreshed(ctx)).toEqual(LANDING_UNAVAILABLE)

    await first.dispose()
    const replacement = createMemoryAdoptionView<unknown, unknown>({ scopeKey: String })
    adoptFiles(replacement, { args: ['replacement'] })
    await load(ctx, adoptionService(replacement), undefined)
    expect(await refreshed(ctx)).toEqual(LANDING_UNAVAILABLE)
    expect(provided.launches.map(launch => launch.args)).toEqual([ARGS, ['replacement']])
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

  describe('checks the shape of the configuration', () => {
    const { maxActions: _dropped, ...withoutMaxActions } = CONFIG
    const validate = (value: unknown) => plugin.Config['~standard'].validate(value)

    it('accepts a complete lawful configuration as a copy', () => {
      const checked = validate(CONFIG)
      expect(checked).toEqual({ value: CONFIG })
      if (!('value' in checked)) throw new Error('the lawful configuration was refused')
      expect(checked.value).not.toBe(CONFIG)
      expect(checked.value.clientInfo).not.toBe(CONFIG.clientInfo)
    })

    it('accepts a configuration without a prototype', () => {
      const bare: unknown = Object.assign(Object.create(null), CONFIG)
      expect(validate(bare)).toEqual({ value: CONFIG })
    })

    /**
     * Each row: what the configuration is, the configuration, the issue, and whether the load
     * still fails when the schema is removed, and why.
     */
    const refused: readonly (readonly [string, unknown, string, string])[] = [
      [
        'that is not an object',
        'config',
        'configuration must be an object',
        'yes: TypeError, the transport factory reads clientInfo of a text',
      ],
      [
        'that is a Date',
        new Date(0),
        'configuration must be an object',
        'yes: TypeError, the transport factory reads clientInfo of a Date',
      ],
      [
        'that inherits every field',
        Object.create(CONFIG),
        'configuration must be an object',
        'no: the inherited fields satisfy createMcp and the transport factory',
      ],
      [
        'that lacks a field',
        withoutMaxActions,
        'configuration needs the field maxActions',
        'yes: RangeError of createMcp',
      ],
      [
        'that has an extra field',
        { ...CONFIG, retries: 3 },
        'configuration has no field retries',
        'no: nothing else reads retries',
      ],
      [
        'that has a symbol key',
        { ...CONFIG, [Symbol('retries')]: 3 },
        'configuration has no field Symbol(retries)',
        'no: nothing else reads a symbol key',
      ],
      [
        'whose bound is not a number',
        { ...CONFIG, maxListingPages: '5' },
        'maxListingPages must be a number',
        'yes: RangeError of createMcp',
      ],
      [
        'whose probeTimeoutMs is not a number',
        { ...CONFIG, probeTimeoutMs: '5' },
        'probeTimeoutMs must be a number',
        'yes: RangeError of the transport factory',
      ],
      [
        'whose clientInfo is not an object',
        { ...CONFIG, clientInfo: 'n' },
        'clientInfo must be an object',
        'yes: RangeError of the transport factory',
      ],
      [
        'whose clientInfo lacks a field',
        { ...CONFIG, clientInfo: { name: 'n' } },
        'clientInfo needs the field version',
        'yes: RangeError of the transport factory',
      ],
      [
        'whose clientInfo has an extra field',
        { ...CONFIG, clientInfo: { name: 'n', version: '0', title: 't' } },
        'clientInfo has no field title',
        'no: the transport factory reads name and version only',
      ],
      [
        'whose clientInfo.name is not a text',
        { ...CONFIG, clientInfo: { name: 1, version: '0' } },
        'clientInfo.name must be a text',
        'yes: RangeError of the transport factory',
      ],
      [
        'whose clientInfo.version is not a text',
        { ...CONFIG, clientInfo: { name: 'n', version: 0 } },
        'clientInfo.version must be a text',
        'yes: RangeError of the transport factory',
      ],
    ]
    for (const [what, config, message] of refused) {
      it(`refuses a configuration ${what}`, () => {
        expect(validate(config)).toEqual({ issues: [{ message }] })
      })
      it(`fails to load with a configuration ${what}, with the ValidationError of Cordis`, async () => {
        const ctx = new Context()
        await expect(loadUntyped(ctx, config)).rejects.toThrow(ValidationError)
        await expect(loadUntyped(new Context(), config)).rejects.toThrow(
          `invalid config:\n  - ${message}`,
        )
        expect(ctx.get(mcpActionDiscoveryKey)).toBeUndefined()
      })
    }

    it('fails to load when maxActions is 0, with the RangeError of createMcp', async () => {
      const ctx = new Context()
      await expect(ctx.plugin(plugin, { ...CONFIG, maxActions: 0 })).rejects.toThrow(RangeError)
      expect(ctx.get(mcpActionDiscoveryKey)).toBeUndefined()
    })

    it('fails to load when probeTimeoutMs is 0, with the RangeError of the transport factory', async () => {
      const ctx = new Context()
      await expect(ctx.plugin(plugin, { ...CONFIG, probeTimeoutMs: 0 })).rejects.toThrow(RangeError)
      expect(ctx.get(mcpActionDiscoveryKey)).toBeUndefined()
    })
  })
})
