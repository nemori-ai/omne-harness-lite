import { resolveModelInvocationRef } from '@omne-harness/model-contract'
import type {
  CallContact,
  DurableEvidence,
  ModelCallId,
  ModelReferenceAccess,
  Reply,
} from '@omne-harness/model-contract'
import type { ModelCommands } from '@omne-harness/model-contract/provider'
import type { TenantId } from '@omne-harness/legal-identity'
import { referenceFailure } from './reference.ts'

export type ModelLiveness = Readonly<{
  holds(target: Readonly<{ tenant: TenantId; call: ModelCallId }>): 'drive' | 'push' | null
  lostContact(call: ModelCallId): DurableEvidence | null
}>

export async function contactOf<P>(
  commands: ModelCommands<P>,
  liveness: ModelLiveness | undefined,
  { principal, tenant, reference }: ModelReferenceAccess<P>,
): Reply<CallContact> {
  const resolved = resolveModelInvocationRef(reference, tenant)
  if ('failure' in resolved) return referenceFailure(resolved.failure)
  const found = await commands.recall({ principal, ...resolved.ok })
  if ('failure' in found) return found
  if (found.ok.kind === 'not-accepted') return { ok: { kind: 'not-accepted' } }
  const { state } = found.ok
  const settled = state.phase === 'settled'
  if (settled && state.custody.kind === 'acknowledged') return { ok: { kind: 'settled' } }
  const holder = liveness?.holds(resolved.ok) ?? null
  if (holder === 'drive') return { ok: { kind: 'holding' } }
  if (settled && holder === 'push') return { ok: { kind: 'settled' } }
  const evidence = liveness?.lostContact(resolved.ok.call) ?? null
  return { ok: evidence === null ? { kind: 'unknown' } : { kind: 'lost', evidence } }
}
