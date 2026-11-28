import type { DecisionsEndpoint, RouteAccounting } from '../config.ts'
import { isDecisionResponse, prepareDecision, type PreparedDecision } from './codec.ts'
import type { DecisionLimits, DecisionRequest, DecisionResponse } from './contract.ts'
import { prepareDecisionV1, readDecisionV1 } from './v1.ts'

/** How one decisions interface takes an ask and gives its answer; every interface takes the same ask and gives the same answers. */
export type DecisionWire = Readonly<{
  prepare(request: DecisionRequest, limits: DecisionLimits): PreparedDecision | null
  /** The answer, when it answers every question as asked; null otherwise. */
  read(value: unknown, questions: DecisionRequest['questions']): DecisionResponse | null
  /** Where the account says the answer was made. */
  place(response: DecisionResponse, accounting: RouteAccounting): string
}>

export const DECISION_WIRES: Readonly<Record<DecisionsEndpoint, DecisionWire>> = {
  decisions: {
    prepare: prepareDecision,
    read: (value, questions) => (isDecisionResponse(value, questions) ? value : null),
    // A gateway names the upstream that answered.
    place: (response, accounting) => `${accounting.place}/${response.provider ?? 'unknown'}`,
  },
  'decisions-v1': {
    prepare: prepareDecisionV1,
    read: readDecisionV1,
    // The provider answers itself.
    place: (_response, accounting) => accounting.place,
  },
}
