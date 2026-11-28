import type { DecisionAsk } from './decision-call.ts'
import type { Reply } from './result.ts'
import type { Access, Adoption, DecisionsModelRequest } from './root.ts'

/** Forms the fixed request of one decision call. The call is then admitted, read and acknowledged as any model call is. */
export interface ModelDecisionPreparation<P> {
  prepare(
    input: Access<P> & Readonly<{ model: string; ask: DecisionAsk; source: Adoption }>,
  ): Reply<DecisionsModelRequest>
}
