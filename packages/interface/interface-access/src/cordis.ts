import type { Context, Plugin } from '@deepseek-ai/cordis'
import { accessRegistryKey, defineAccessPlugin } from '@omne-harness/access-cordis-contract/cordis'
import { interfaceProtocol } from '@omne-harness/interface-protocol'
import type { TimeSource } from '@omne-harness/time-source'
import { createInterfaceContribution } from './contribution.ts'
import { createInspections, type Inspections } from './inspections.ts'
import type { LedgerPolicy } from './ledger.ts'
import type { InterfacePrincipals } from './ports.ts'

export const INTERFACE_INSPECTIONS = 'interface.inspections'

declare module '@deepseek-ai/cordis' {
  interface Context {
    [INTERFACE_INSPECTIONS]: Inspections
  }
}

export type InterfaceAccessPluginInput = Readonly<{
  principals: (ctx: Context) => InterfacePrincipals
  time: TimeSource
  policy: LedgerPolicy
}>

/** Mounts interface/v1 on the access registry and provides the inspections a tool asks through. */
export function createInterfaceAccessPlugin(input: InterfaceAccessPluginInput): Plugin.Object {
  return {
    name: 'interface-access',
    inject: [accessRegistryKey],
    apply(ctx: Context) {
      const inspections = createInspections({ time: input.time, policy: input.policy })
      ctx.reflect.provide(INTERFACE_INSPECTIONS, inspections)
      ctx.plugin(
        defineAccessPlugin({
          name: 'interface-access.contribution',
          protocol: interfaceProtocol,
          handlers: () =>
            createInterfaceContribution({ principals: input.principals(ctx), inspections }),
        }),
      )
    },
  }
}
