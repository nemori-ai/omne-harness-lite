import type { Context } from '@deepseek-ai/cordis'
import type { ActingForTenantPrincipal, StandingReservations } from '@omne-harness/identity'
import type { TenantId } from '@omne-harness/legal-identity'
import type { HitlAudience } from '../../entry/hitl-entry-principals.ts'
import type { ToolDecisionBridge } from '@omne-harness/tool-contract/provider'
import type { ToolHitlBridge } from './bridge.ts'
import type { ToolHitlHost } from './host.ts'

export type { HitlAudience }

export type ToolHitlHolder = {
  reservations: () => StandingReservations | undefined
  registrar: (tenant: TenantId) => ActingForTenantPrincipal | undefined
  audience: HitlAudience | undefined
  host: ToolHitlHost | null
  bridge: ToolDecisionBridge<unknown> | null
  /** The decided cards of a call's waits, from the bridge this tree mounted. */
  decidedCards: ToolHitlBridge['decidedCards'] | null
}

const holders = new WeakMap<Context, ToolHitlHolder>()

export function toolHitlHolder(ctx: Context): ToolHitlHolder {
  const root = ctx.root
  const found = holders.get(root)
  if (found !== undefined) return found
  const created: ToolHitlHolder = {
    reservations: () => undefined,
    registrar: () => undefined,
    audience: undefined,
    host: null,
    bridge: null,
    decidedCards: null,
  }
  holders.set(root, created)
  return created
}
