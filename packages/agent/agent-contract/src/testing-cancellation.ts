// The test cancellation policy of the `./testing` entry (SPEC "取消判断与路线"): the installation
// record a fixture hands its Journal double, the pure judgment that judges the obligations the
// Journal built, and the host records the custody variants of commitSettlement read through a
// double's trusted host adapter. None of it proves a real governance installation, a real policy
// or a real host; the doubles declare `durability: 'none'`.
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
import type { ExtensionInvocationMode, ExtensionInvocationResult } from './extensions.ts'
import type {
  Adoption,
  AgentOperationId,
  CardRoundId,
  DurableEvidence,
  PassageId,
} from './identity.ts'

const evidence = (record: string): DurableEvidence =>
  Object.freeze({ owner: 'suite', record, revision: '1', digest: `suite:${record}` })
const adoption = (name: string): Adoption =>
  Object.freeze({ owner: 'suite', name, revision: '1', digest: `suite:${name}` })

/** The exact adoption of the test policy; `judge` is the implementation. */
export const TEST_CANCELLATION_POLICY: Adoption = adoption('cancellation-policy')
/** The exact adoption of the judgment input and criteria the test policy reads. */
export const TEST_CANCELLATION_INPUT_SCHEMA: Adoption = adoption('cancellation-input')
/** The exact adoption of the test implementation of `judge`. */
export const TEST_CANCELLATION_IMPLEMENTATION: Adoption = adoption('cancellation-judge')

/**
 * The installation a fixture gives its Journal double (SPEC "安装记录与资格"). The seven fields are
 * all present, so a double that holds it can run the protocol; a double without one answers
 * `unavailable` to the candidate, migration and judgment variants.
 */
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

/**
 * The test policy: a pure judgment over the input the Journal built, in the order of SPEC
 * "判断输入、判据与记录". It is `unknown` when any obligation is unknown or a participant's condition
 * is unknown, `blocked` when the cancel is not effective or any obligation is pending or a
 * participant is blocked or changed, and `allowed` otherwise. It reads nothing but its input.
 */
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
            request: input.control.stages.accepted.source,
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
            request: revoked.source,
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
            category: item.category,
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
                kind: 'input-read',
                request: participant.source,
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

/**
 * One record of the trusted host reads that a double serves to the custody variants of
 * commitSettlement (SPEC "commitSettlement 的变体"). A fixture registers it under a source
 * evidence; the double resolves `source.record` (or `original.record`) to it. A source that no
 * record answers is unreadable: the variant returns `unavailable`.
 */
export type TestHostRecord =
  | Readonly<{
      /** The late return of an author invocation that started before the cancellation fence. */
      kind: 'legacy-return'
      passage: PassageId
      input: DurableEvidence
      mode: ExtensionInvocationMode
      implementation: Adoption
      /** The proof that the call started before the fence. */
      started: DurableEvidence
      result: ExtensionInvocationResult
      received: DurableEvidence
      custody: DurableEvidence
    }>
  | Readonly<{
      /** The immutable return of an original Tool invoke the host kept. */
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
      /** The result of an original lookup or invalidate of one card round, as the card owner kept it. */
      kind: 'card-reconciliation'
      passage: PassageId
      round: CardRoundId
      present: DurableEvidence | null
      lookups: readonly AgentOperationId[]
      invalidate: AgentOperationId | null
    }>
