import type { TenantId } from '@omne-harness/legal-identity'
import type * as T from '@omne-harness/tool-contract'
import type {
  CancellationBlock,
  CancellationDecision,
  CancellationJudgmentInput,
  CancellationPolicy,
  CancellationPolicyInstallation,
  CancellationUnknown,
  ObligationCategory,
  ToolIntentKey,
} from './finishing.ts'
import { obligationCategoryOf } from './finishing.ts'
import type { ExtensionInvocationMode, ExtensionInvocationResult } from './extensions.ts'
import type {
  Adoption,
  AgentExecutionId,
  AgentOperationId,
  CardRoundId,
  DurableEvidence,
  PassageId,
} from './identity.ts'

const evidence = (record: string): DurableEvidence =>
  Object.freeze({ owner: 'suite', record, revision: '1', digest: `suite:${record}` })
const adoption = (name: string): Adoption =>
  Object.freeze({ owner: 'suite', name, revision: '1', digest: `suite:${name}` })

export const TEST_CANCELLATION_POLICY: Adoption = adoption('cancellation-policy')
export const TEST_CANCELLATION_INPUT_SCHEMA: Adoption = adoption('cancellation-input')
export const TEST_CANCELLATION_IMPLEMENTATION: Adoption = adoption('cancellation-judge')

export const testCancellationPolicyInstallation: CancellationPolicyInstallation = Object.freeze({
  record: evidence('cancellation/installation'),
  decision: evidence('cancellation/decision'),
  policy: TEST_CANCELLATION_POLICY,
  inputSchema: TEST_CANCELLATION_INPUT_SCHEMA,
  implementation: TEST_CANCELLATION_IMPLEMENTATION,
  legacyProtocols: [],
  admission: evidence('cancellation/admission'),
})

const ORDER: readonly ObligationCategory[] = [
  'inputs',
  'controls',
  'operations',
  'passages',
  'custody',
]

export function createTestCancellationPolicy(): CancellationPolicy {
  return Object.freeze({
    policy: TEST_CANCELLATION_POLICY,
    implementation: TEST_CANCELLATION_IMPLEMENTATION,
    judge(input: CancellationJudgmentInput): CancellationDecision {
      const blocks: CancellationBlock[] = []
      const questions: CancellationUnknown[] = []
      const intent = input.control.stages['intent-established']
      if (
        input.control.command.kind !== 'cancel' ||
        input.route.control !== input.control.operation ||
        input.candidate.candidate !== input.route.candidate ||
        input.candidate.conclusion.kind !== 'cancelled' ||
        intent?.state !== 'reached'
      ) {
        blocks.push({
          category: 'controls',
          key: input.control.operation,
          reason: 'cancel-intent',
          source: intent?.source ?? input.control.stages.accepted.source,
          required: {
            kind: 'original-operation-query',
            request: {
              kind: 'parameters',
              value: { execution: input.execution, operation: input.control.operation },
            },
            owner: 'journal',
            custodian: null,
            purpose: 'query',
          },
        })
      }
      const revoked = input.control.stages['qualification-revoked']
      if (revoked?.state === 'unresolved') {
        blocks.push({
          category: 'controls',
          key: input.control.operation,
          reason: 'qualification-revocation',
          source: revoked.source,
          required: {
            kind: 'original-operation-query',
            request: {
              kind: 'parameters',
              value: { execution: input.execution, operation: input.control.operation },
            },
            owner: 'journal',
            custodian: null,
            purpose: 'query',
          },
        })
      }
      for (const item of input.items) {
        const disposition = item.disposition
        if (disposition.kind === 'pending') {
          blocks.push({
            category: obligationCategoryOf(item.kind),
            key: item.key,
            reason: disposition.reason,
            source: item.source,
            required: disposition.required,
          })
        } else if (disposition.kind === 'unknown') {
          questions.push(disposition.question)
        }
      }
      if (input.participants.kind === 'coordinated') {
        for (const participant of input.participants.participants) {
          const condition = participant.condition
          if (condition.kind === 'unknown') {
            questions.push({
              owner: participant.owner,
              key: participant.source.record,
              position: participant.source,
              reason: 'source-unavailable',
            })
          } else if (condition.kind === 'blocked' || condition.kind === 'changed') {
            blocks.push({
              category: condition.kind === 'blocked' ? condition.category : 'inputs',
              key: participant.source.record,
              reason: 'input-disposition',
              source: condition.kind === 'blocked' ? condition.source : participant.source,
              required: {
                kind: 'restore-source',
                request: { kind: 'parameters', value: { source: participant.source } },
                owner: participant.owner,
                custodian: null,
                purpose: 'load',
              },
            })
          }
        }
      }
      blocks.sort((a, b) => ORDER.indexOf(a.category) - ORDER.indexOf(b.category))
      const [firstQuestion, ...moreQuestions] = questions
      if (firstQuestion !== undefined) {
        return {
          kind: 'unknown',
          questions: [firstQuestion, ...moreQuestions],
          knownBlocked: blocks,
        }
      }
      const [firstBlock, ...moreBlocks] = blocks
      if (firstBlock !== undefined) return { kind: 'blocked', reasons: [firstBlock, ...moreBlocks] }
      return {
        kind: 'allowed',
        basis: [input.route.record, ...input.items.map(item => item.source)],
      }
    },
  })
}

export type TestHostRecord =
  | Readonly<{
      kind: 'legacy-return'
      tenant: TenantId
      execution: AgentExecutionId
      passage: PassageId
      input: DurableEvidence
      mode: ExtensionInvocationMode
      implementation: Adoption
      started: DurableEvidence
      result: ExtensionInvocationResult
      received: DurableEvidence
      custody: DurableEvidence
    }>
  | Readonly<{
      kind: 'tool-return'
      intent: ToolIntentKey
      request: DurableEvidence
      returned:
        | Readonly<{ kind: 'commit-unknown'; reference: T.ToolInvocationRef }>
        | Readonly<{ kind: 'accepted'; reference: T.ToolInvocationRef; receipt: DurableEvidence }>
      received: DurableEvidence
      custody: DurableEvidence
    }>
  | Readonly<{
      kind: 'card-reconciliation'
      tenant: TenantId
      execution: AgentExecutionId
      passage: PassageId
      round: CardRoundId
      result:
        | Readonly<{
            kind: 'known'
            present: DurableEvidence | null
            lookups: readonly AgentOperationId[]
            invalidate: Readonly<{ operation: AgentOperationId; reason: DurableEvidence }> | null
          }>
        | Readonly<{ kind: 'unknown'; reason: CancellationUnknown['reason'] }>
    }>
