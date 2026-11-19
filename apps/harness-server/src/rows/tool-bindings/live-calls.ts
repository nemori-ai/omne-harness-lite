import type { Context } from '@deepseek-ai/cordis'
import { tenantCodec, type TenantId } from '@omne-harness/legal-identity'
import type { ToolCallId } from '@omne-harness/tool-contract'
import type { ToolExecutionScope } from '@omne-harness/tool-contract/provider'

/** The access of a tool call while its scope is open; a handle for reading its release, not a fact. */
export type LiveCall = Readonly<{ principal: unknown; tenant: TenantId; call: ToolCallId }>

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

/** Keeps the access of a call registered while its scope is open, so a domain it writes to can read
 * what the call was released on. */
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
