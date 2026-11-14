import { mintIdentity } from './mint.ts'
import { MODEL_IDENTITY_PREFIXES } from './identity-values.ts'
import type { ModelCallId, ModelOperationId } from './root.ts'

// The body after "mop_" starts with "--", which no other minter may produce,
// so a derived operation never collides with a minted one.
export function deriveGuardControlOperation(call: ModelCallId): ModelOperationId {
  const body = call.slice(MODEL_IDENTITY_PREFIXES.ModelCallId.length)
  return mintIdentity<'ModelOperationId'>(`${MODEL_IDENTITY_PREFIXES.ModelOperationId}--${body}`)
}
