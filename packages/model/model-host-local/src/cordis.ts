import { existsSync } from 'node:fs'
import type { Context } from '@deepseek-ai/cordis'
import type { CredentialPort } from '@omne-harness/model-contract/provider'
import { ModelCredentialService } from '@omne-harness/model-cordis-contract/cordis'
import { fieldOf, isIntegerAtLeast, isRecord } from './fields.ts'
import {
  createLocalCustodian,
  openLocalCustodian,
  type CreateOptions,
  type LocalCustodian,
  type LockOptions,
} from './store.ts'

export { deliverInjected } from './deliver-injected.ts'

type PluginConfig = CreateOptions

type Issue = { message: string }
type Parsed<T> = Readonly<{ value: T }> | Readonly<{ issues: Issue[] }>

function rejected(message: string): Parsed<never> {
  return { issues: [{ message }] }
}

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
  if (typeof factorySecret !== 'string') return rejected('factorySecret must be a string')
  const lock = parseLock(fieldOf(value, 'lock'))
  if ('issues' in lock) return lock
  const capacity = parseCount(fieldOf(value, 'diagnosticsCapacity'), 'diagnosticsCapacity', 1)
  if ('issues' in capacity) return capacity
  return {
    value: {
      path,
      factorySecret,
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
}

function openPort(config: PluginConfig): {
  readonly port: CredentialPort
  readonly custodian?: LocalCustodian
} {
  if (!existsSync(config.path)) {
    const custodian = createLocalCustodian(config)
    return { port: custodian, custodian }
  }
  const opened = openLocalCustodian(config)
  if (opened.kind === 'unavailable') return { port: unavailablePort }
  return { port: opened.custodian, custodian: opened.custodian }
}

export class LocalCredentialPlugin extends ModelCredentialService {
  static readonly Config = configSchema

  readonly present: CredentialPort['present']
  readonly resolve: CredentialPort['resolve']

  constructor(ctx: Context, config: PluginConfig) {
    super(ctx)
    // The port lives only in these closures. Cordis hands consumers a proxy of the instance, and
    // `#private` fields fail through it, so a closure is the only place that stays out of reach.
    const { port, custodian } = openPort(config)
    this.present = reference => port.present(reference)
    this.resolve = (reference, face) => port.resolve(reference, face)
    if (!custodian) return
    ctx.fiber.effect(() => () => {
      custodian.close()
    })
  }
}

export { ModelInstancesLocalPlugin } from './plugins/instances.ts'
export { ModelConvertersLocalPlugin } from './plugins/converters.ts'
