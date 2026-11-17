import { Service, type Context } from '@deepseek-ai/cordis'
import type {
  SettingDefinitions,
  SettingsBasis,
  SettingsDefinitionRef,
  SettingsFailure,
  SettingsTarget,
  SettingsViewRequest,
} from '@omne-harness/settings'
import { preferenceDefinitionRef, preferenceTarget } from './preference-settings.ts'
import type { TenantGovernanceHost } from './tenant-host.ts'

export type PreferenceBinding = Readonly<{
  request: SettingsViewRequest
  target: SettingsTarget
  definitionRef: SettingsDefinitionRef
}>

/**
 * Reads a tenant's preference targets as the tenant's catalog reader. For the rows that decide with a
 * preference (calendar environment, schedule consent); it grants no write and no read to a person.
 * @owner apps/harness-server/src/rows/governance
 */
export abstract class PreferenceSettingsService extends Service {
  static readonly provide = 'preferenceSettings'
  constructor(ctx: Context) {
    super(ctx, PreferenceSettingsService.provide)
  }
  abstract readonly bindingOf: (
    tenantRef: string,
    definition: SettingDefinitions,
  ) => PreferenceBinding
  abstract readonly read: (
    tenantRef: string,
    request: SettingsViewRequest,
  ) => Promise<SettingsBasis | SettingsFailure | undefined>
}
export const preferenceSettingsKey = PreferenceSettingsService.provide

declare module '@deepseek-ai/cordis' {
  interface Context {
    preferenceSettings: PreferenceSettingsService
  }
}

class PreferenceSettingsImpl extends PreferenceSettingsService {
  readonly bindingOf: PreferenceSettingsService['bindingOf']
  readonly read: PreferenceSettingsService['read']
  constructor(
    ctx: Context,
    options: Readonly<{ host: Pick<TenantGovernanceHost, 'settings'>; deploymentRef: string }>,
  ) {
    super(ctx)
    this.bindingOf = (tenantRef, definition) => {
      const target = preferenceTarget(definition, tenantRef)
      return {
        target,
        definitionRef: preferenceDefinitionRef(definition),
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

export function providePreferenceSettings(
  ctx: Context,
  options: Readonly<{ host: Pick<TenantGovernanceHost, 'settings'>; deploymentRef: string }>,
) {
  return new PreferenceSettingsImpl(ctx, options)
}
