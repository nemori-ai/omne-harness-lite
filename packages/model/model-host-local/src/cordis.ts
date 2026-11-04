import { existsSync } from 'node:fs'
import type { Context } from '@deepseek-ai/cordis'
import type { CredentialPort } from '@omne-harness/model-contract/provider'
import { ModelCredentialService } from '@omne-harness/model-cordis-contract/cordis'
import { fieldOf, isIntegerAtLeast, isRecord, rejected, type Parsed } from './fields.ts'
import {
  createLocalCustodian,
  openLocalCustodian,
  type CustodianOptions,
  type LocalCustodian,
  type LockOptions,
} from './store.ts'

export { deliverInjected } from './deliver-injected.ts'

/**
 * The vault path and the store options. `factorySecret` builds a vault when the path holds no file.
 * It is optional, so that a host whose vault a setup command built keeps no secret in its
 * serializable configuration. On an existing vault it is never used.
 */
type PluginConfig = CustodianOptions & Readonly<{ factorySecret?: string }>

function parseCount(value: unknown, name: string, minimum: number): Parsed<number | undefined> {
  if (value === undefined) return { value: undefined }
  return isIntegerAtLeast(value, minimum)
    ? { value }
    : rejected(`${name} must be an integer of at least ${minimum}`)
}

function parseLock(value: unknown): Parsed<LockOptions | undefined> {
  if (value === undefined) return { value: undefined }
  if (!isRecord(value)) return rejected('lock must be an object')
  const waitMs = parseCount(fieldOf(value, 'waitMs'), 'lock.waitMs', 0)
  if ('issues' in waitMs) return waitMs
  const backoffMs = parseCount(fieldOf(value, 'backoffMs'), 'lock.backoffMs', 0)
  if ('issues' in backoffMs) return backoffMs
  return {
    value: {
      ...(waitMs.value !== undefined && { waitMs: waitMs.value }),
      ...(backoffMs.value !== undefined && { backoffMs: backoffMs.value }),
    },
  }
}

function parseConfig(value: unknown): Parsed<PluginConfig> {
  const path = fieldOf(value, 'path')
  if (typeof path !== 'string' || path === '') return rejected('path must be a non-empty string')
  const factorySecret = fieldOf(value, 'factorySecret')
  if (factorySecret !== undefined && typeof factorySecret !== 'string')
    return rejected('factorySecret must be a string when it is given')
  const lock = parseLock(fieldOf(value, 'lock'))
  if ('issues' in lock) return lock
  const capacity = parseCount(fieldOf(value, 'diagnosticsCapacity'), 'diagnosticsCapacity', 1)
  if ('issues' in capacity) return capacity
  return {
    value: {
      path,
      ...(factorySecret !== undefined && { factorySecret }),
      ...(lock.value !== undefined && { lock: lock.value }),
      ...(capacity.value !== undefined && { diagnosticsCapacity: capacity.value }),
    },
  }
}

const configSchema = {
  '~standard': {
    version: 1 as const,
    vendor: 'model-host-local',
    validate: parseConfig,
  },
}

const unavailablePort: CredentialPort = {
  present() {
    return { kind: 'unavailable' }
  },
  resolve() {
    return { kind: 'unavailable' }
  },
  presentFor() {
    return { kind: 'unavailable' }
  },
  resolveFor() {
    return { kind: 'unavailable' }
  },
}

function openPort(config: PluginConfig): {
  readonly port: CredentialPort
  readonly custodian?: LocalCustodian
} {
  if (!existsSync(config.path)) {
    // Without a factory secret there is nothing to build: the port answers as for a missing file.
    if (config.factorySecret === undefined) return { port: unavailablePort }
    const custodian = createLocalCustodian({ ...config, factorySecret: config.factorySecret })
    return { port: custodian, custodian }
  }
  const opened = openLocalCustodian(config)
  if (opened.kind === 'unavailable') return { port: unavailablePort }
  return { port: opened.custodian, custodian: opened.custodian }
}

/** Receives the custodian of one plugin life, or `undefined` when the store could not be opened. */
type Attach = (custodian: LocalCustodian | undefined) => () => void

type PortMembers = Pick<CredentialPort, 'present' | 'resolve'> &
  Required<Pick<CredentialPort, 'presentFor' | 'resolveFor'>>

/**
 * The shared body of the two plugin classes: opens the store, keeps the port in closures, and ends
 * the custodian with the fiber. Both classes extend `ModelCredentialService` directly.
 */
function mount(ctx: Context, config: PluginConfig, attach: Attach | undefined): PortMembers {
  // The port lives only in these closures. Cordis hands consumers a proxy of the instance, and
  // `#private` fields fail through it, so a closure is the only place that stays out of reach.
  const { port, custodian } = openPort(config)
  const detach = attach?.(custodian)
  if (custodian !== undefined || detach !== undefined)
    ctx.fiber.effect(() => () => {
      // The management handle lets go first, so no bind reaches a closed custodian.
      detach?.()
      custodian?.close()
    })
  return {
    present: reference => port.present(reference),
    resolve: (reference, face) => port.resolve(reference, face),
    presentFor: input => port.presentFor?.(input) ?? { kind: 'unavailable' },
    resolveFor: input => port.resolveFor?.(input) ?? { kind: 'unavailable' },
  }
}

export class LocalCredentialPlugin extends ModelCredentialService {
  static readonly Config = configSchema

  readonly present: CredentialPort['present']
  readonly resolve: CredentialPort['resolve']
  override readonly presentFor: NonNullable<CredentialPort['presentFor']>
  override readonly resolveFor: NonNullable<CredentialPort['resolveFor']>

  constructor(ctx: Context, config: PluginConfig) {
    super(ctx)
    const members = mount(ctx, config, undefined)
    this.present = members.present
    this.resolve = members.resolve
    this.presentFor = members.presentFor
    this.resolveFor = members.resolveFor
  }
}

/**
 * The binding management of the live credential plugin, seen from outside the plugin tree: bind,
 * unbind and describe of `LocalCustodian`. Before the plugin is loaded, after it is unloaded, and
 * while its store could not be opened, a write answers `not-written` and a read `unavailable`.
 * The handle checks no caller: the assembly that holds it decides who may use it.
 */
export type LocalCredentialCustody = Pick<LocalCustodian, 'bind' | 'unbind' | 'describe'>

export type LocalCredentialPluginClass = {
  new (ctx: Context, config: PluginConfig): ModelCredentialService
  readonly Config: typeof configSchema
}

export type LocalCredentialPluginHandle = Readonly<{
  /** The plugin class. It provides `modelCredential` exactly as `LocalCredentialPlugin` does. */
  plugin: LocalCredentialPluginClass
  custody: LocalCredentialCustody
}>

/**
 * A credential plugin class whose binding management stays reachable to the assembly that created
 * it. The service on `modelCredential` still has no management member.
 */
export function createLocalCredentialPlugin(): LocalCredentialPluginHandle {
  const live: { custodian: LocalCustodian | undefined } = { custodian: undefined }
  const attach: Attach = custodian => {
    live.custodian = custodian
    return () => {
      // Only this life's custodian ends here: a successor that loaded first keeps its own.
      if (live.custodian === custodian) live.custodian = undefined
    }
  }
  class LocalCredentialManagedPlugin extends ModelCredentialService {
    static readonly Config = configSchema

    readonly present: CredentialPort['present']
    readonly resolve: CredentialPort['resolve']
    override readonly presentFor: NonNullable<CredentialPort['presentFor']>
    override readonly resolveFor: NonNullable<CredentialPort['resolveFor']>

    constructor(ctx: Context, config: PluginConfig) {
      super(ctx)
      const members = mount(ctx, config, attach)
      this.present = members.present
      this.resolve = members.resolve
      this.presentFor = members.presentFor
      this.resolveFor = members.resolveFor
    }
  }
  const custody: LocalCredentialCustody = {
    bind: input => live.custodian?.bind(input) ?? { kind: 'not-written' },
    unbind: input => live.custodian?.unbind(input) ?? { kind: 'not-written' },
    describe: input => live.custodian?.describe(input) ?? { kind: 'unavailable' },
  }
  return Object.freeze({ plugin: LocalCredentialManagedPlugin, custody: Object.freeze(custody) })
}

export { ModelInstancesLocalPlugin } from './plugins/instances.ts'
export { ModelConvertersLocalPlugin } from './plugins/converters.ts'
export { createModelRequestPreparationPlugin } from './plugins/preparation.ts'
export type {
  ModelPreparationPlugin,
  ModelPreparationPluginOptions,
  ModelRequestPreparationPluginClass,
} from './plugins/preparation.ts'
export { createModelRuntimeLocalPlugin } from './plugins/host.ts'
export { createModelStreamLocalPlugin } from './plugins/stream-observation.ts'
export { createConfiguredModelRuntimeLocalPlugin } from './plugins/configured-host.ts'
export type { ConfiguredModelHostSettings } from './plugins/configured-host-config.ts'
export type {
  ConfiguredModelHostOptions,
  ConfiguredModelRuntimeLocalPluginClass,
} from './plugins/configured-host.ts'
export type {
  HostEvent,
  ModelHostPluginOptions,
  ModelRuntimeLocalPluginClass,
  ModelRuntimeLocalPluginInstance,
} from './plugins/host.ts'
export { createMemoryResultPushLedger } from './plugins/runtime.ts'
export type {
  DeliveryFailure,
  DeliveryStanding,
  HeldAccount,
  HeldDelivery,
  ResultPushLedger,
  ResultPushLimits,
  ResultPushOptions,
  ResultPushRecord,
  ResultPushRecovery,
  RuntimeEvent,
} from './plugins/runtime.ts'
export { ModelProfilesLocalPlugin } from './plugins/profiles.ts'
export { createModelSendStagePlugin } from './plugins/send-stage.ts'
export type {
  ModelSendStagePluginClass,
  ModelSendStagePluginOptions,
  ModelSendStageSettings,
} from './plugins/send-stage.ts'
