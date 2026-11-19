import type { Context } from '@deepseek-ai/cordis'
import type { TenantId } from '@omne-harness/legal-identity'
import type { ToolCallId } from '@omne-harness/tool-contract'

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
