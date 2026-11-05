// The cancellation policy installation of the release (R2-D35): the immutable governance record and
// the pure judgment it names. The assembly entry hands it to the `agent-journal` row; the row gives it
// to the session-log Journal of every session. A caller never supplies or names an implementation:
// a cancel request only refers to the record (Agent SPEC "取消判断与路线" / "安装记录与资格").
//
// This is not a Cordis service and not a configuration member: the judgment is a function holder.
// The record is fixed here by name, revision and a digest of that identity. Changing the criteria
// below means a new revision, a new digest and so a new installation record.
//
// The judgment is pure. It reads only the input the Journal built from its own authoritative read
// of the Run (control, candidate, obligations, coverage, participants), in the order of SPEC
// "判断输入、判据与记录". It never allows by default: it answers `allowed` only when the cancel is
// effective, every obligation is settled or held, and every participant condition is ready.
import { createHash } from 'node:crypto'
import type {
  Adoption,
  CancellationBlock,
  CancellationDecision,
  CancellationJudgmentInput,
  CancellationPolicy,
  CancellationPolicyInstallation,
  CancellationUnknown,
  DurableEvidence,
  ObligationCategory,
} from '@omne-harness/agent-contract'
import { obligationCategoryOf } from '@omne-harness/agent-contract'

const OWNER = 'harness-server-release'
const REVISION = '1'

const digestOf = (text: string): string =>
  `sha256:${createHash('sha256').update(`${OWNER}/${text}/${REVISION}`).digest('hex')}`
const evidence = (record: string): DurableEvidence =>
  Object.freeze({ owner: OWNER, record, revision: REVISION, digest: digestOf(record) })
const adoption = (name: string): Adoption =>
  Object.freeze({ owner: OWNER, name, revision: REVISION, digest: digestOf(name) })

/** The exact adoption of the cancellation protocol the release runs; `judge` is the implementation. */
export const RELEASE_CANCELLATION_POLICY: Adoption = adoption('cancellation-policy')
/** The exact adoption of the judgment input and criteria. */
export const RELEASE_CANCELLATION_INPUT_SCHEMA: Adoption = adoption('cancellation-input')
/** The exact adoption of the implementation of `judge` below. */
export const RELEASE_CANCELLATION_IMPLEMENTATION: Adoption = adoption('cancellation-judge')

/** The installation record of the release: all seven fields present, no legacy protocol to map. */
export const releaseCancellationPolicyInstallation: CancellationPolicyInstallation = Object.freeze({
  record: evidence('cancellation/installation'),
  decision: evidence('cancellation/decision'),
  policy: RELEASE_CANCELLATION_POLICY,
  inputSchema: RELEASE_CANCELLATION_INPUT_SCHEMA,
  implementation: RELEASE_CANCELLATION_IMPLEMENTATION,
  legacyProtocols: [],
  admission: evidence('cancellation/admission'),
})

const CATEGORY_ORDER: readonly ObligationCategory[] = [
  'inputs',
  'controls',
  'operations',
  'passages',
  'custody',
]

function queryControl(input: CancellationJudgmentInput): CancellationBlock['required'] {
  return {
    kind: 'original-operation-query',
    request: {
      kind: 'parameters',
      value: { execution: input.execution, operation: input.control.operation },
    },
    owner: 'journal',
    custodian: null,
    purpose: 'query',
  }
}

/**
 * The judgment of the release. `unknown` when any obligation or participant condition is unknown or
 * the coverage was read at another revision; `blocked` when the cancel is not effective, a
 * revocation is unresolved, an obligation is pending, or a participant is blocked or changed;
 * `allowed` otherwise. The Journal checks tenant, execution and qualification before it calls this.
 */
export function createReleaseCancellationPolicy(): CancellationPolicy {
  return Object.freeze({
    policy: RELEASE_CANCELLATION_POLICY,
    implementation: RELEASE_CANCELLATION_IMPLEMENTATION,
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
          required: queryControl(input),
        })
      }
      const revoked = input.control.stages['qualification-revoked']
      if (revoked?.state === 'unresolved') {
        blocks.push({
          category: 'controls',
          key: input.control.operation,
          reason: 'qualification-revocation',
          source: revoked.source,
          required: queryControl(input),
        })
      }
      if (input.coverage.readRevision !== input.readRevision) {
        questions.push({
          owner: 'journal',
          key: input.execution,
          position: input.coverage.inputWatermark,
          reason: 'coverage-incomplete',
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
      blocks.sort((a, b) => CATEGORY_ORDER.indexOf(a.category) - CATEGORY_ORDER.indexOf(b.category))
      const [firstQuestion, ...moreQuestions] = questions
      if (firstQuestion !== undefined)
        return {
          kind: 'unknown',
          questions: [firstQuestion, ...moreQuestions],
          knownBlocked: blocks,
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

/** What the `agent-journal` row of the release hands to `createSessionAgentJournalPlugin`. */
export const releaseCancellation = Object.freeze({
  installation: releaseCancellationPolicyInstallation,
  policy: createReleaseCancellationPolicy(),
})
