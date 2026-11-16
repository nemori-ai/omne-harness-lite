import { Service, type Context, type Plugin } from '@deepseek-ai/cordis'
import type { SecretCustodyManagement, SecretCustodyUse } from '@omne-harness/settings'
import { openSecretVault, type SecretVault } from '@omne-harness/settings-local/secrets'
import { z } from 'zod'
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

export const SERVICE_LOCK_WAIT_MS = 2000

export const secretCustodyConfig = z.strictObject({
  path: z.string().min(1),
  lockWaitMs: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER).optional(),
})
export type SecretCustodyConfig = z.output<typeof secretCustodyConfig>

const unavailable: SecretCustodyManagement & SecretCustodyUse = {
  bind: () => 'not-written',
  unbind: () => 'not-written',
  describe: () => 'unavailable',
  list: () => 'unavailable',
  use: () => 'unavailable',
}

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
