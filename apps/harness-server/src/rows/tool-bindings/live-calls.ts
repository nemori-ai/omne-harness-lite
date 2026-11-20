import type { Context } from '@deepseek-ai/cordis'
import { standingPrincipalRef } from '@omne-harness/identity'
import { tenantCodec, type TenantId } from '@omne-harness/legal-identity'
import type { ToolCallId } from '@omne-harness/tool-contract'
import type { ToolExecutionScope } from '@omne-harness/tool-contract/provider'
import { sessionWorkOf } from '../tool-runtime/session-work.ts'

/** The access of a tool call while its scope is open; a handle for naming where it runs, not a fact. */
export type LiveCall = Readonly<{ principal: unknown; tenant: TenantId; call: ToolCallId }>

export type CallOrigin = Readonly<{ actorRef: string; session: string; call: string }>

const registries = new WeakMap<Context, Map<string, LiveCall>>()

/** The key of a call in the registry: the tenant with the call, so calls of two tenants never meet. */
export const liveCallKey = (tenant: string, call: string) => JSON.stringify([tenant, call])

export function liveCalls(ctx: Context): Map<string, LiveCall> {
  const root = ctx.root
  const found = registries.get(root)
  if (found !== undefined) return found
  const created = new Map<string, LiveCall>()
  registries.set(root, created)
  return created
}

export function liveCallOrigin(ctx: Context) {
  return (tenantRef: string, call: string): CallOrigin | undefined => {
    const live = liveCalls(ctx).get(liveCallKey(tenantRef, call))
    if (live === undefined) return undefined
    const work = sessionWorkOf(live.principal, live.tenant)
    if (work === undefined) return undefined
    return {
      actorRef: standingPrincipalRef(work.principal),
      session: work.session,
      call: live.call,
    }
  }
}

/** Keeps the access of a call registered while its scope is open, so a domain it writes to can name
 * the session and the call that wrote. */
export function holdLiveCall(
  ctx: Context,
  access: LiveCall,
  scope: ToolExecutionScope,
): ToolExecutionScope {
  const tenant = tenantCodec.encode(access.tenant)
  const live = liveCalls(ctx)
  const key = liveCallKey(tenant.ok ? tenant.value : '', access.call)
  const entry = { principal: access.principal, tenant: access.tenant, call: access.call }
  live.set(key, entry)
  return {
    ...scope,
    finish(exit) {
      if (live.get(key) === entry) live.delete(key)
      return scope.finish(exit)
    },
  }
}
