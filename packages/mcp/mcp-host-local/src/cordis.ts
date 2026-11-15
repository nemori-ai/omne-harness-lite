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

export type McpPluginParts = Readonly<
  Pick<McpConfig<unknown>, 'principalKey'> &
    Pick<McpPorts<unknown, unknown>, 'checkOutput' | 'clock'> &
    Pick<LocalTransportOptions, 'fetch'>
>

export type McpPluginConfig = Readonly<
  Omit<McpConfig<unknown>, 'principalKey'> & Omit<LocalTransportOptions, 'fetch'>
>

type ClientInfo = McpPluginConfig['clientInfo']
type Bounds = Omit<McpPluginConfig, 'clientInfo'>
type ConfigResult = SchemaSuccess<McpPluginConfig> | SchemaFailure

const CONFIG_FIELDS: Readonly<Record<keyof McpPluginConfig, true>> = {
  maxListingPages: true,
  maxActions: true,
  instructionsByteLimit: true,
  probeTimeoutMs: true,
  clientInfo: true,
}
const CLIENT_INFO_FIELDS: Readonly<Record<keyof ClientInfo, true>> = { name: true, version: true }

function isPlainRecord(value: unknown): value is Readonly<Record<PropertyKey, unknown>> {
  if (typeof value !== 'object' || value === null) return false
  const prototype: unknown = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

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

function boundsOf(record: Readonly<Record<PropertyKey, unknown>>): Bounds | keyof Bounds {
  const { maxListingPages, maxActions, instructionsByteLimit, probeTimeoutMs } = record
  if (typeof maxListingPages !== 'number') return 'maxListingPages'
  if (typeof maxActions !== 'number') return 'maxActions'
  if (typeof instructionsByteLimit !== 'number') return 'instructionsByteLimit'
  if (typeof probeTimeoutMs !== 'number') return 'probeTimeoutMs'
  return { maxListingPages, maxActions, instructionsByteLimit, probeTimeoutMs }
}

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

function eligibilityOf(ctx: Context): UseEligibility<unknown> {
  return {
    async check(...args) {
      const port = ctx.get(mcpUseEligibilityKey)
      if (port === undefined) return { kind: 'unknown' }
      return port.check(...args)
    },
  }
}

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
    if (purpose.kind === 'process-env') return port.acquire(access, holding, purpose, binding)
    return port.acquire(access, holding, purpose, binding)
  }
  return { acquire }
}

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
      const logger = ctx.logger('mcp')
      ctx.effect(
        () => async () => {
          const report = await services.connections.closeAll()
          for (const closed of report)
            if (closed.process === 'root-only' || closed.process === 'unconfirmed')
              logger.warn('the stop of the process was not confirmed', closed.ref, closed.process)
        },
        'mcp.closeAll',
      )
      new HostActionDiscovery(ctx, services.discovery)
      new HostActionInvoker(ctx, services.invoker)
      new HostEndpointStatus(ctx, services.status)
    },
  })
}
