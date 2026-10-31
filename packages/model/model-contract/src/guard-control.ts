// The runtime value of the chapter "消费者 owner 的装配声明".
import { mintIdentity } from './mint.ts'
import { MODEL_IDENTITY_PREFIXES } from './identity-values.ts'
import type { ModelCallId, ModelOperationId } from './root.ts'

// The body after "mop_" starts with "--", which no other minter may produce, so a derived value
// never collides with an operation that a caller or a provider minted. Prefixes of equal length
// keep the derived value as long as the call.
export function deriveGuardControlOperation(call: ModelCallId): ModelOperationId {
  const body = call.slice(MODEL_IDENTITY_PREFIXES.ModelCallId.length)
  return mintIdentity<'ModelOperationId'>(`${MODEL_IDENTITY_PREFIXES.ModelOperationId}--${body}`)
}
