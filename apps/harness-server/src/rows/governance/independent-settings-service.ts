import { Service, type Context } from '@deepseek-ai/cordis'
import type {
  SettingDefinitions,
  SettingsBasis,
  SettingsDefinitionRef,
  SettingsFailure,
  SettingsTarget,
  SettingsViewRequest,
} from '@omne-harness/settings'
import { independentDefinitionRef, independentTarget } from './independent-settings.ts'
import type { TenantGovernanceHost } from './tenant-host.ts'

export type IndependentBinding = Readonly<{
  request: SettingsViewRequest
  target: SettingsTarget
  definitionRef: SettingsDefinitionRef
}>

/**
 * Reads a tenant's independent targets as the tenant's catalog reader, for the rows that decide with
 * their own independent settings (calendar environment, schedule consent). The read opens the group
 * first; it grants no write and no read to a person.
 * @owner apps/harness-server/src/rows/governance
 */
export abstract class TenantIndependentSettingsService extends Service {
  static readonly provide = 'tenantIndependentSettings'
  constructor(ctx: Context) {
    super(ctx, TenantIndependentSettingsService.provide)
  }
  abstract readonly bindingOf: (
    tenantRef: string,
    definition: SettingDefinitions,
  ) => IndependentBinding
  abstract readonly read: (
    tenantRef: string,
    request: SettingsViewRequest,
  ) => Promise<SettingsBasis | SettingsFailure | undefined>
}
export const tenantIndependentSettingsKey = TenantIndependentSettingsService.provide

declare module '@deepseek-ai/cordis' {
  interface Context {
    tenantIndependentSettings: TenantIndependentSettingsService
  }
}

class TenantIndependentSettingsImpl extends TenantIndependentSettingsService {
  readonly bindingOf: TenantIndependentSettingsService['bindingOf']
  readonly read: TenantIndependentSettingsService['read']
  constructor(
    ctx: Context,
    options: Readonly<{ host: Pick<TenantGovernanceHost, 'settings'>; deploymentRef: string }>,
  ) {
    super(ctx)
    this.bindingOf = (tenantRef, definition) => {
      const target = independentTarget(definition, tenantRef)
      return {
        target,
        definitionRef: independentDefinitionRef(definition),
        request: {
          deploymentRef: options.deploymentRef,
          mode: 'management',
          targets: [target],
          selectionRef: null,
        },
      }
    }
    this.read = async (tenantRef, request) =>
      (await options.host.settings(tenantRef))?.read(request)
  }
}

export function provideTenantIndependentSettings(
  ctx: Context,
  options: Readonly<{ host: Pick<TenantGovernanceHost, 'settings'>; deploymentRef: string }>,
) {
  return new TenantIndependentSettingsImpl(ctx, options)
}
