import type { Context } from '@deepseek-ai/cordis'
import { createMcp } from '@omne-harness/mcp'
import type {
  ActionDiscovery,
  ActionInvoker,
  EndpointStatus,
  McpConfig,
  McpPorts,
  TaskWatch,
  TaskWatchConfig,
} from '@omne-harness/mcp-contract'
import type {
  AdoptionView,
  CatalogStore,
  CredentialFailure,
  CredentialUse,
  HttpCredentialHandle,
  HttpPurpose,
  TaskRecords,
  UseEligibility,
} from '@omne-harness/mcp-contract/provider'
import {
  ActionDiscoveryService,
  ActionInvokerService,
  EndpointStatusService,
  TaskWatchService,
  mcpAdoptionViewKey,
  mcpCatalogStoreKey,
  mcpTaskRecordsKey,
  mcpCredentialUseKey,
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
  Omit<McpConfig<unknown>, 'principalKey' | 'taskWatch'> &
    Omit<LocalTransportOptions, 'fetch'> & { taskWatch: TaskWatchConfig }
>

type ClientInfo = McpPluginConfig['clientInfo']
type Bounds = Omit<McpPluginConfig, 'clientInfo' | 'taskWatch'>
type ConfigResult = SchemaSuccess<McpPluginConfig> | SchemaFailure

const CONFIG_FIELDS: Readonly<Record<keyof McpPluginConfig, true>> = {
  maxListingPages: true,
  maxActions: true,
  instructionsByteLimit: true,
  maxLongRequests: true,
  clientInfo: true,
  taskWatch: true,
}
const TASK_WATCH_FIELDS: Readonly<Record<keyof TaskWatchConfig, true>> = {
  pollFloorMs: true,
  backoffCapMs: true,
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
  const { maxListingPages, maxActions, instructionsByteLimit, maxLongRequests } = record
  if (typeof maxListingPages !== 'number') return 'maxListingPages'
  if (typeof maxActions !== 'number') return 'maxActions'
  if (typeof instructionsByteLimit !== 'number') return 'instructionsByteLimit'
  if (typeof maxLongRequests !== 'number') return 'maxLongRequests'
  return { maxListingPages, maxActions, instructionsByteLimit, maxLongRequests }
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

function taskWatchOf(value: unknown): TaskWatchConfig | string {
  if (!isPlainRecord(value)) return 'taskWatch must be an object'
  const fields = fieldsIssue(value, TASK_WATCH_FIELDS, 'taskWatch')
  if (fields !== undefined) return fields
  const { pollFloorMs, backoffCapMs } = value
  if (typeof pollFloorMs !== 'number') return 'taskWatch.pollFloorMs must be a number'
  if (typeof backoffCapMs !== 'number') return 'taskWatch.backoffCapMs must be a number'
  return { pollFloorMs, backoffCapMs }
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
      const taskWatch = taskWatchOf(value['taskWatch'])
      if (typeof taskWatch === 'string') return issue(taskWatch)
      return { value: { ...bounds, clientInfo, taskWatch } }
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

// The catalog store is taken at each read and write; while it is away both answer unavailable.
function storeOf(ctx: Context): CatalogStore {
  return {
    read: key => ctx.get(mcpCatalogStoreKey)?.read(key) ?? Promise.resolve(fail('unavailable')),
    write: (key, record, expected) =>
      ctx.get(mcpCatalogStoreKey)?.write(key, record, expected) ??
      Promise.resolve(fail('unavailable')),
  }
}

function tasksOf(ctx: Context): TaskRecords {
  const unavailable = () => Promise.resolve(fail('unavailable' as const))
  return {
    record: (key, row) => ctx.get(mcpTaskRecordsKey)?.record(key, row) ?? unavailable(),
    read: key => ctx.get(mcpTaskRecordsKey)?.read(key) ?? unavailable(),
    move: (key, from, to) => ctx.get(mcpTaskRecordsKey)?.move(key, from, to) ?? unavailable(),
    following: tenant => ctx.get(mcpTaskRecordsKey)?.following(tenant) ?? unavailable(),
  }
}

function credentialsOf(ctx: Context): CredentialUse<unknown> {
  type Access = Parameters<CredentialUse<unknown>['acquire']>[0]
  type Holding = Parameters<CredentialUse<unknown>['acquire']>[1]
  type Binding = Parameters<CredentialUse<unknown>['acquire']>[3]
  async function acquire(
    access: Access,
    holding: Holding,
    purpose: HttpPurpose,
    binding: Binding,
  ): Promise<Outcome<HttpCredentialHandle, CredentialFailure>> {
    const port = ctx.get(mcpCredentialUseKey)
    if (port === undefined) return fail('unknown')
    return port.acquire(access, holding, purpose, binding)
  }
  return { acquire }
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

class HostTaskWatch extends TaskWatchService<unknown> {
  readonly follow: TaskWatch<unknown>['follow']
  readonly drop: TaskWatch<unknown>['drop']
  readonly following: TaskWatch<unknown>['following']
  readonly subscribe: TaskWatch<unknown>['subscribe']
  constructor(ctx: Context, watch: TaskWatch<unknown>) {
    super(ctx)
    this.follow = (...args) => watch.follow(...args)
    this.drop = (...args) => watch.drop(...args)
    this.following = (...args) => watch.following(...args)
    this.subscribe = (...args) => watch.subscribe(...args)
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
  subscribe(...args: Parameters<EndpointStatus<unknown, unknown>['subscribe']>) {
    return this.status.subscribe(...args)
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
        store: storeOf(ctx),
        tasks: tasksOf(ctx),
        transports: createLocalTransportFactory({
          clientInfo: config.clientInfo,
          maxLongRequests: config.maxLongRequests,
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
        taskWatch: config.taskWatch,
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
      if (services.tasks !== undefined) new HostTaskWatch(ctx, services.tasks)
    },
  })
}

export { mcpCategoryPlugin } from './category.ts'
