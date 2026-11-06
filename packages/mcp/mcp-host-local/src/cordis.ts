// The MCP plugin: it builds the MCP services once, over the in-memory catalog store and the local
// transports, and provides the three MCP services on the loading fiber. The four demand ports
// (adoption, eligibility, credentials, landing) belong to other domains. The plugin reads each of
// them from its own load context on every call, and without one the answer is the port's
// `unknown`, never a pass. When the fiber unloads, one removal closes every connection.
import type { Context } from '@deepseek-ai/cordis'
import { createInMemoryCatalogStore, createMcp } from '@omne-harness/mcp'
import type {
  ActionDiscovery,
  ActionInvoker,
  EndpointStatus,
  McpConfig,
  McpPorts,
} from '@omne-harness/mcp-contract'
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
  ActionDiscoveryService,
  ActionInvokerService,
  EndpointStatusService,
  mcpAdoptionViewKey,
  mcpCredentialUseKey,
  mcpProcessLandingKey,
  mcpUseEligibilityKey,
} from '@omne-harness/mcp-cordis-contract/cordis'
import {
  definePlugin,
  type SchemaFailure,
  type SchemaSuccess,
  type StandardSchema,
} from '@omne-harness/kernel-basis/cordis'
import { fail, type Outcome } from '@omne-harness/operation-result'
import { createLocalTransportFactory } from './factory.ts'
import type { LocalTransportOptions } from './options.ts'

/**
 * The functions and local objects of the plugin, taken from the types that own them:
 * `principalKey` from `McpConfig`, `checkOutput` and `clock` from `McpPorts`, `fetch` from
 * `LocalTransportOptions`. They are not configuration: a plugin tree row holds only serializable
 * data. An absent optional part takes the default of `createMcp` or of
 * `createLocalTransportFactory`.
 */
export type McpPluginParts = Readonly<
  Pick<McpConfig<unknown>, 'principalKey'> &
    Pick<McpPorts<unknown, unknown>, 'checkOutput' | 'clock'> &
    Pick<LocalTransportOptions, 'fetch'>
>

/**
 * The configuration of the plugin: the three bounds of `McpConfig`, and `clientInfo` and
 * `probeTimeoutMs` of `LocalTransportOptions`. Every field is required and has no default. The
 * ranges are checked by `createMcp` and `createLocalTransportFactory`, not by the schema.
 */
export type McpPluginConfig = Readonly<
  Omit<McpConfig<unknown>, 'principalKey'> & Omit<LocalTransportOptions, 'fetch'>
>

type ClientInfo = McpPluginConfig['clientInfo']
type Bounds = Omit<McpPluginConfig, 'clientInfo'>
type ConfigResult = SchemaSuccess<McpPluginConfig> | SchemaFailure

// The field lists are the keys of these records, so a field added to or removed from the
// configuration type does not compile until the schema knows it.
const CONFIG_FIELDS: Readonly<Record<keyof McpPluginConfig, true>> = {
  maxListingPages: true,
  maxActions: true,
  instructionsByteLimit: true,
  probeTimeoutMs: true,
  clientInfo: true,
}
const CLIENT_INFO_FIELDS: Readonly<Record<keyof ClientInfo, true>> = { name: true, version: true }

/** True for an object whose prototype is `Object.prototype` or `null`. */
function isPlainRecord(value: unknown): value is Readonly<Record<PropertyKey, unknown>> {
  if (typeof value !== 'object' || value === null) return false
  const prototype: unknown = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

/**
 * The issue of a record that has an own key outside `fields` (a symbol key is outside too) or
 * lacks an own field of `fields`.
 */
function fieldsIssue(
  record: Readonly<Record<PropertyKey, unknown>>,
  fields: Readonly<Record<string, true>>,
  what: string,
): string | undefined {
  const extra = Reflect.ownKeys(record).find(
    key => typeof key !== 'string' || !Object.hasOwn(fields, key),
  )
  if (extra !== undefined) return `${what} has no field ${String(extra)}`
  const missing = Object.keys(fields).find(field => !Object.hasOwn(record, field))
  if (missing !== undefined) return `${what} needs the field ${missing}`
  return undefined
}

/** The four bounds read by name, or the name of the first one that is not a number. */
function boundsOf(record: Readonly<Record<PropertyKey, unknown>>): Bounds | keyof Bounds {
  const { maxListingPages, maxActions, instructionsByteLimit, probeTimeoutMs } = record
  if (typeof maxListingPages !== 'number') return 'maxListingPages'
  if (typeof maxActions !== 'number') return 'maxActions'
  if (typeof instructionsByteLimit !== 'number') return 'instructionsByteLimit'
  if (typeof probeTimeoutMs !== 'number') return 'probeTimeoutMs'
  return { maxListingPages, maxActions, instructionsByteLimit, probeTimeoutMs }
}

/** A new `clientInfo` of two texts, or the issue of the value. */
function clientInfoOf(value: unknown): ClientInfo | string {
  if (!isPlainRecord(value)) return 'clientInfo must be an object'
  const fields = fieldsIssue(value, CLIENT_INFO_FIELDS, 'clientInfo')
  if (fields !== undefined) return fields
  const { name, version } = value
  if (typeof name !== 'string') return 'clientInfo.name must be a text'
  if (typeof version !== 'string') return 'clientInfo.version must be a text'
  return { name, version }
}

function issue(message: string): ConfigResult {
  return { issues: [{ message }] }
}

/**
 * Checks the shape only: a plain object with exactly the five own fields, the four bounds
 * numbers, and `clientInfo` a plain object with exactly two own texts. It answers a new object,
 * so a later change to the input does not reach the plugin.
 */
const mcpPluginConfig: StandardSchema<McpPluginConfig> = {
  '~standard': {
    version: 1,
    vendor: 'omne-harness',
    validate(value: unknown): ConfigResult {
      if (!isPlainRecord(value)) return issue('configuration must be an object')
      const fields = fieldsIssue(value, CONFIG_FIELDS, 'configuration')
      if (fields !== undefined) return issue(fields)
      const bounds = boundsOf(value)
      if (typeof bounds === 'string') return issue(`${bounds} must be a number`)
      const clientInfo = clientInfoOf(value['clientInfo'])
      if (typeof clientInfo === 'string') return issue(clientInfo)
      return { value: { ...bounds, clientInfo } }
    },
  },
}

/** The adoption view that asks the `mcpAdoptionView` service on each call (IC-9). */
function adoptionOf(ctx: Context): AdoptionView<unknown, unknown> {
  return {
    async endpoints(...args) {
      const port = ctx.get(mcpAdoptionViewKey)
      if (port === undefined) return fail('unknown')
      return port.endpoints(...args)
    },
    async endpoint(...args) {
      const port = ctx.get(mcpAdoptionViewKey)
      if (port === undefined) return fail('unknown')
      return port.endpoint(...args)
    },
  }
}

/** The use eligibility that asks the `mcpUseEligibility` service on each call (IC-9). */
function eligibilityOf(ctx: Context): UseEligibility<unknown> {
  return {
    async check(...args) {
      const port = ctx.get(mcpUseEligibilityKey)
      if (port === undefined) return { kind: 'unknown' }
      return port.check(...args)
    },
  }
}

/** The credential use that asks the `mcpCredentialUse` service on each call (IC-9). */
function credentialsOf(ctx: Context): CredentialUse<unknown> {
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
    const port = ctx.get(mcpCredentialUseKey)
    if (port === undefined) return fail('unknown')
    // Each branch calls the overload of its purpose.
    if (purpose.kind === 'process-env') return port.acquire(access, holding, purpose, binding)
    return port.acquire(access, holding, purpose, binding)
  }
  return { acquire }
}

/** The process landing that asks the `mcpProcessLanding` service on each call (IC-9). */
function landingOf(ctx: Context): ProcessLanding<unknown> {
  return {
    async start(...args) {
      const port = ctx.get(mcpProcessLandingKey)
      if (port === undefined) return fail('unknown')
      return port.start(...args)
    },
  }
}

class HostActionDiscovery extends ActionDiscoveryService<unknown> {
  private readonly discovery: ActionDiscovery<unknown>
  constructor(ctx: Context, discovery: ActionDiscovery<unknown>) {
    super(ctx)
    this.discovery = discovery
  }
  current(...args: Parameters<ActionDiscovery<unknown>['current']>) {
    return this.discovery.current(...args)
  }
  refresh(...args: Parameters<ActionDiscovery<unknown>['refresh']>) {
    return this.discovery.refresh(...args)
  }
  peer(...args: Parameters<ActionDiscovery<unknown>['peer']>) {
    return this.discovery.peer(...args)
  }
}

class HostActionInvoker extends ActionInvokerService<unknown> {
  private readonly invoker: ActionInvoker<unknown>
  constructor(ctx: Context, invoker: ActionInvoker<unknown>) {
    super(ctx)
    this.invoker = invoker
  }
  invoke(...args: Parameters<ActionInvoker<unknown>['invoke']>) {
    return this.invoker.invoke(...args)
  }
  continueWithInput(...args: Parameters<ActionInvoker<unknown>['continueWithInput']>) {
    return this.invoker.continueWithInput(...args)
  }
  cancel(...args: Parameters<ActionInvoker<unknown>['cancel']>) {
    return this.invoker.cancel(...args)
  }
  queryTask(...args: Parameters<ActionInvoker<unknown>['queryTask']>) {
    return this.invoker.queryTask(...args)
  }
  taskResult(...args: Parameters<ActionInvoker<unknown>['taskResult']>) {
    return this.invoker.taskResult(...args)
  }
  provideTaskInput(...args: Parameters<ActionInvoker<unknown>['provideTaskInput']>) {
    return this.invoker.provideTaskInput(...args)
  }
  cancelTask(...args: Parameters<ActionInvoker<unknown>['cancelTask']>) {
    return this.invoker.cancelTask(...args)
  }
}

class HostEndpointStatus extends EndpointStatusService<unknown, unknown> {
  private readonly status: EndpointStatus<unknown, unknown>
  constructor(ctx: Context, status: EndpointStatus<unknown, unknown>) {
    super(ctx)
    this.status = status
  }
  inspect(...args: Parameters<EndpointStatus<unknown, unknown>['inspect']>) {
    return this.status.inspect(...args)
  }
  list(...args: Parameters<EndpointStatus<unknown, unknown>['list']>) {
    return this.status.list(...args)
  }
}

/**
 * Makes the MCP plugin. On load it builds the services with one `createMcp` and provides
 * `mcpActionDiscovery`, `mcpActionInvoker` and `mcpEndpointStatus` on the loading fiber; the three
 * share one connection table, one in-flight table and one task table. A configuration that is not
 * of the shape fails the load; a value out of range fails it with the `RangeError` of
 * `createLocalTransportFactory` or `createMcp`. When the fiber unloads, one removal awaits
 * `connections.closeAll()`; an `AggregateError` from it is not caught, and Cordis writes it to
 * `ctx.logger`.
 */
export function createMcpPlugin(parts: McpPluginParts) {
  return definePlugin<McpPluginConfig>({
    name: 'mcp',
    Config: mcpPluginConfig,
    apply(ctx, config) {
      const ports: McpPorts<unknown, unknown> = {
        adoption: adoptionOf(ctx),
        eligibility: eligibilityOf(ctx),
        credentials: credentialsOf(ctx),
        landing: landingOf(ctx),
        store: createInMemoryCatalogStore(),
        transports: createLocalTransportFactory({
          clientInfo: config.clientInfo,
          probeTimeoutMs: config.probeTimeoutMs,
          ...(parts.fetch === undefined ? {} : { fetch: parts.fetch }),
        }),
        checkOutput: parts.checkOutput,
        ...(parts.clock === undefined ? {} : { clock: parts.clock }),
      }
      const services = createMcp(ports, {
        principalKey: parts.principalKey,
        maxListingPages: config.maxListingPages,
        maxActions: config.maxActions,
        instructionsByteLimit: config.instructionsByteLimit,
      })
      ctx.effect(
        () => async () => {
          await services.connections.closeAll()
        },
        'mcp.closeAll',
      )
      new HostActionDiscovery(ctx, services.discovery)
      new HostActionInvoker(ctx, services.invoker)
      new HostEndpointStatus(ctx, services.status)
    },
  })
}
