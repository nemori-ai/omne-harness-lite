import { Service, type Context, type Plugin } from '@deepseek-ai/cordis'
import { accessRegistryKey, defineAccessPlugin } from '@omne-harness/access-cordis-contract/cordis'
import { interfaceProtocol } from '@omne-harness/interface-protocol'
import type { TimeSource } from '@omne-harness/time-source'
import { createInterfaceContribution } from './contribution.ts'
import { createInspections, type Inspections } from './inspections.ts'
import type { LedgerPolicy } from './ledger.ts'
import type { InterfacePrincipals } from './ports.ts'

/** Where a tool asks a client of a tenant how a page looks. @owner packages/interface/interface-access */
export abstract class InterfaceInspectionsService extends Service {
  static readonly provide = 'interfaceInspections'
  constructor(ctx: Context) {
    super(ctx, InterfaceInspectionsService.provide)
  }
  abstract readonly inspect: Inspections['inspect']
}
export const interfaceInspectionsKey = InterfaceInspectionsService.provide

declare module '@deepseek-ai/cordis' {
  interface Context {
    interfaceInspections: InterfaceInspectionsService
  }
}

class InspectionsService extends InterfaceInspectionsService {
  readonly inspect: Inspections['inspect']
  constructor(ctx: Context, inspections: Inspections) {
    super(ctx)
    this.inspect = (tenant, asked, signal) => inspections.inspect(tenant, asked, signal)
  }
}

export type InterfaceAccessPluginInput = Readonly<{
  principals: InterfacePrincipals
  time: TimeSource
  policy: LedgerPolicy
}>

/** Mounts interface/v1 on the access registry and provides the inspections, both over one ledger. */
export function createInterfaceAccessPlugin(input: InterfaceAccessPluginInput): Plugin.Object {
  return {
    name: 'interface-access',
    inject: [accessRegistryKey],
    apply(ctx: Context) {
      const inspections = createInspections({ time: input.time, policy: input.policy })
      ctx.plugin(InspectionsService, inspections)
      ctx.plugin(
        defineAccessPlugin({
          name: 'interface-access.contribution',
          protocol: interfaceProtocol,
          handlers: () =>
            createInterfaceContribution({ principals: input.principals, inspections }),
        }),
      )
    },
  }
}
