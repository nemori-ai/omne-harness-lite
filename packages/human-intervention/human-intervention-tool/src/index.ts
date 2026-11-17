import { createHash } from 'node:crypto'
import {
  decisionRequestDocument,
  decisionResponseDocument,
  type DecisionRequest,
  type DecisionResponse,
} from '@omne-harness/human-intervention'
import { defineSchema, jsonSchemaDefinition } from '@omne-harness/schema-provider'
import {
  defineToolWaitContract,
  describedAdoption,
  type ToolValueSchema,
  type ToolWaitContract,
} from '@omne-harness/tool-contract/provider'

export type {
  DecisionAnswer,
  DecisionQuestion,
  DecisionRequest,
  DecisionResponse,
} from '@omne-harness/human-intervention'

const OWNER = '@omne-harness/human-intervention-tool'
/** Leaves room for the registration around the cards within one human-intervention command. */
export const DECISION_REQUEST_MAX_BYTES = 196_608
export const DECISION_RESPONSE_MAX_BYTES = 393_216

function valueSchema<T>(
  name: string,
  document: Readonly<Record<string, unknown>>,
  maxBytes: number,
): ToolValueSchema<T> {
  const id = `${OWNER}/decision-${name}`
  const digest = `sha256:${createHash('sha256').update(JSON.stringify(document)).digest('hex')}`
  return {
    identity: { id, revision: '1', digest },
    maxBytes,
    ref: defineSchema<T>({
      id,
      load: async () => jsonSchemaDefinition<T>({ document, numbers: 'exact-or-reject' }),
    }),
  }
}

const defined = defineToolWaitContract<DecisionResponse, 'ask'>({
  kind: 'ask',
  adoption: describedAdoption({
    owner: OWNER,
    name: 'decision-wait',
    revision: '1',
    changes:
      'A tool waits for one batch of human-intervention inquiry or approval cards and reads one answer per card.',
  }),
  expiry: 'forbidden',
  request: valueSchema<DecisionRequest>(
    'request',
    decisionRequestDocument,
    DECISION_REQUEST_MAX_BYTES,
  ),
  response: valueSchema<DecisionResponse>(
    'response',
    decisionResponseDocument,
    DECISION_RESPONSE_MAX_BYTES,
  ),
})
if ('failure' in defined) throw new TypeError(defined.failure.reason)

/** The one wait contract by which a tool hands a decision to a person and reads the answer back. */
export const hitlDecisionWait: ToolWaitContract<DecisionResponse, 'ask'> = defined.ok
