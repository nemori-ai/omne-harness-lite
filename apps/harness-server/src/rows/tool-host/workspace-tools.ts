import type { Context } from '@deepseek-ai/cordis'
import type { Candidate, JsonValue } from '@omne-harness/assets'
import { tenantCodec, type TenantId } from '@omne-harness/legal-identity'

/** The most versions of workspace tools kept in mind at once; the oldest is forgotten first and read again when a turn names it. */
const KEPT = 512

const seen = new WeakMap<object, Map<string, JsonValue>>()

function textOf(tenant: TenantId, held: Pick<Candidate, 'asset' | 'version'>): string | undefined {
  const encoded = tenantCodec.encode(tenant)
  return encoded.ok ? `${encoded.value}\n${held.asset}\n${held.version}` : undefined
}

/** A turn of this tenant adopted this version of a tool of its workspace: what the checks that cannot wait go by. */
export function rememberWorkspaceTool(
  ctx: Context,
  tenant: TenantId,
  held: Pick<Candidate, 'asset' | 'version'>,
  body: JsonValue,
): void {
  const text = textOf(tenant, held)
  if (text === undefined) return
  const known = seen.get(ctx.root) ?? new Map<string, JsonValue>()
  seen.set(ctx.root, known)
  known.delete(text)
  known.set(text, body)
  for (const oldest of known.keys()) {
    if (known.size <= KEPT) break
    known.delete(oldest)
  }
}

/** The body of a workspace tool as a turn of this tenant adopted it; undefined when no turn here has. */
export function workspaceToolBody(
  ctx: Context,
  tenant: TenantId,
  held: Pick<Candidate, 'asset' | 'version'>,
): JsonValue | undefined {
  const text = textOf(tenant, held)
  return text === undefined ? undefined : seen.get(ctx.root)?.get(text)
}
