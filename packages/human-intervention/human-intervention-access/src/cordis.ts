import type { Context, Plugin } from '@deepseek-ai/cordis'
import { accessRegistryKey, defineAccessPlugin } from '@omne-harness/access-cordis-contract/cordis'
import { humanInterventionProtocol } from '@omne-harness/human-intervention-protocol'
import { createHitlContribution } from './contribution.ts'
import type { HitlAccessSettings, HitlEntryPrincipals, HitlFaces, LoginTenants } from './ports.ts'

export type HitlAccessPluginInput = Readonly<{
  faces: (ctx: Context) => HitlFaces | undefined
  entryPrincipals: (ctx: Context) => HitlEntryPrincipals
  logins: (ctx: Context) => LoginTenants
}>

const HITL_ACCESS_PLUGIN = 'human-intervention-access'

export function createHitlAccessPlugin(input: HitlAccessPluginInput): Plugin.Object {
  return {
    name: HITL_ACCESS_PLUGIN,
    inject: [accessRegistryKey],
    apply(ctx: Context, settings: HitlAccessSettings) {
      ctx.plugin(
        defineAccessPlugin({
          name: `${HITL_ACCESS_PLUGIN}.contribution`,
          protocol: humanInterventionProtocol,
          handlers: () =>
            createHitlContribution({
              faces: () => input.faces(ctx),
              entryPrincipals: input.entryPrincipals(ctx),
              logins: input.logins(ctx),
              settings: { locationRef: settings.locationRef },
            }),
        }),
      )
    },
  }
}
