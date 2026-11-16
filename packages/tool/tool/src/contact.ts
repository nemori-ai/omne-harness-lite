import type { ContentBlock } from '@omne-harness/content-block'
import { succeed } from '@omne-harness/operation-result'
import type { Reply, ToolCallContact } from '@omne-harness/tool-contract'
import type { ToolCallLiveness, ToolDependencies } from './construction.ts'
import { invocationInput } from './invocation-access.ts'
import type { PendingCall } from './ledger-store.ts'

async function held(liveness: ToolCallLiveness | undefined, call: PendingCall): Promise<boolean> {
  if (liveness === undefined) return false
  try {
    return liveness.holds(call) || (await liveness.attach(call))
  } catch {
    return false
  }
}

export async function contactCall<P, B extends ContentBlock, E>(
  { reads, liveness }: Pick<ToolDependencies<P, B, E>, 'reads' | 'liveness'>,
  input: unknown,
): Reply<ToolCallContact> {
  const resolved = invocationInput<P>(input, 'lookup')
  if ('failure' in resolved) return resolved
  const found = await reads.lookup(resolved.ok)
  if ('failure' in found) return found
  if (found.ok.kind === 'not-accepted') return succeed({ kind: 'not-accepted' })
  const living = await held(liveness, { tenant: resolved.ok.tenant, call: resolved.ok.call })
  if (found.ok.state.phase === 'settled') return succeed({ kind: 'settled' })
  return succeed({ kind: living ? 'holding' : 'unknown' })
}
