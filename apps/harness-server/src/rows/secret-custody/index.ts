// The `secret-custody` row (application assembly, settings-local secret vault): the file custody of
// secret bindings of this host, opened at the vault path the operator layer names (the same file
// the model credential plugin reads). It provides the trusted key `settingsSecretCustody`: the
// management face and the use face of `@omne-harness/settings` in one service. Only rows the
// assembly page lists as seeing the key can inject it; the use face therefore reaches only the
// consumers the assembly trusts (I-6). It injects nothing and has no shutdown phase: the vault
// handle holds no resource beyond the path, and closing it only marks this process's handle.
//
// Why the key is defined here: like `modelCredentialCustody`, the provider and its consumers are
// rows of this application, and settings has no Cordis entry. When a member outside this
// application needs the key, it moves to the `./cordis` entry of the member that then owns it.
import { Service, type Context, type Plugin } from '@deepseek-ai/cordis'
import type { SecretCustodyManagement, SecretCustodyUse } from '@omne-harness/settings'
import { openSecretVault, type SecretVault } from '@omne-harness/settings-local/secrets'
import { defineRow } from '../../row.ts'

/** @owner apps/harness-server/src/rows/secret-custody */
export abstract class SettingsSecretCustodyService
  extends Service
  implements SecretCustodyManagement, SecretCustodyUse
{
  static readonly provide = 'settingsSecretCustody'
  constructor(ctx: Context) {
    super(ctx, SettingsSecretCustodyService.provide)
  }
  abstract readonly bind: SecretCustodyManagement['bind']
  abstract readonly unbind: SecretCustodyManagement['unbind']
  abstract readonly describe: SecretCustodyManagement['describe']
  abstract readonly list: SecretCustodyManagement['list']
  abstract readonly use: SecretCustodyUse['use']
}
export const settingsSecretCustodyKey = SettingsSecretCustodyService.provide

declare module '@deepseek-ai/cordis' {
  interface Context {
    settingsSecretCustody: SettingsSecretCustodyService
  }
}

/** The lock wait of a service process: short, so a held lock cannot stall the event loop for long. */
export const SERVICE_LOCK_WAIT_MS = 2000

export type SecretCustodyConfig = Readonly<{
  /** The vault file. The operator layer takes it from the location resolution. */
  path: string
  /** How long a write waits for the file lock. Default: 2000. */
  lockWaitMs?: number
}>

type Issue = { message: string }
type Parsed = Readonly<{ value: SecretCustodyConfig }> | Readonly<{ issues: Issue[] }>

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function parseConfig(value: unknown): Parsed {
  if (!isRecord(value)) return { issues: [{ message: 'path must be a non-empty string' }] }
  const { path, lockWaitMs } = value
  if (typeof path !== 'string' || path === '')
    return { issues: [{ message: 'path must be a non-empty string' }] }
  if (
    lockWaitMs !== undefined &&
    !(typeof lockWaitMs === 'number' && Number.isSafeInteger(lockWaitMs) && lockWaitMs >= 0)
  )
    return { issues: [{ message: 'lockWaitMs must be an integer of at least 0' }] }
  return { value: { path, ...(lockWaitMs === undefined ? {} : { lockWaitMs }) } }
}

/** The configuration schema of the row, in the Standard Schema shape the loader validates with. */
export const secretCustodyConfig = {
  '~standard': { version: 1 as const, vendor: 'harness-server', validate: parseConfig },
}

/** The faces of a vault that could not be opened: nothing is written, nothing is read. */
const unavailable: SecretCustodyManagement & SecretCustodyUse = {
  bind: () => 'not-written',
  unbind: () => 'not-written',
  describe: () => 'unavailable',
  list: () => 'unavailable',
  use: () => 'unavailable',
}

// The service keeps closures only: a method reached through a caller proxy has a `this` that is
// not the instance (docs/real-mode.md). The vault handle itself stays in the closure, so the
// snapshot and the locked revision it offers trusted adapters are not on the service.
class SettingsSecretCustodyImpl extends SettingsSecretCustodyService {
  readonly bind: SecretCustodyManagement['bind']
  readonly unbind: SecretCustodyManagement['unbind']
  readonly describe: SecretCustodyManagement['describe']
  readonly list: SecretCustodyManagement['list']
  readonly use: SecretCustodyUse['use']
  constructor(ctx: Context, faces: SecretCustodyManagement & SecretCustodyUse) {
    super(ctx)
    this.bind = (key, secret, configuredAt) => faces.bind(key, secret, configuredAt)
    this.unbind = key => faces.unbind(key)
    this.describe = key => faces.describe(key)
    this.list = (scope, after, limit) => faces.list(scope, after, limit)
    this.use = key => faces.use(key)
  }
}

const plugin: Plugin.Object = {
  name: 'secret-custody',
  Config: secretCustodyConfig,
  apply(ctx: Context, config: SecretCustodyConfig) {
    const opened = openSecretVault({
      path: config.path,
      lockWaitMs: config.lockWaitMs ?? SERVICE_LOCK_WAIT_MS,
    })
    // A file that cannot be read registers the service all the same: every read answers
    // `unavailable` and every write `not-written`, and the file is not changed. The cause is not
    // reported through the service; `serve` refuses to start on such a file before any row loads.
    const vault: SecretVault | undefined = opened.kind === 'open' ? opened.vault : undefined
    if (vault !== undefined) ctx.effect(() => () => vault.close(), 'secret-custody.vault')
    new SettingsSecretCustodyImpl(ctx, vault ?? unavailable)
  },
}

export const secretCustodyRow = defineRow({
  row: 'secret-custody',
  implementation: 'real',
  manifest: { provides: [settingsSecretCustodyKey], injects: [], sameProviderGroup: null },
  lifecycle: { kind: 'none' },
  plugin,
})
