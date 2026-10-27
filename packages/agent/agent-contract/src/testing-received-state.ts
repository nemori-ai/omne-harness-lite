import { judgeCallAccount } from '@omne-harness/call-account'
import type { ContentBlock } from '@omne-harness/content-block'
import { tenantCodec } from '@omne-harness/legal-identity'
import { resolveModelInvocationRef } from '@omne-harness/model-contract'
import { resolveToolInvocationRef } from '@omne-harness/tool-contract'
import type { Outcome } from '@omne-harness/operation-result'
import { z } from 'zod'
import { materialShape } from './testing-received-material.ts'
import type { Failure } from './evaluation.ts'
import type { CommandReceipt, ExecutionMutation } from './execution.ts'
import {
  decodeAgentExecutionId,
  decodeAgentOperationId,
  decodeConsumptionId,
  decodeExecutionRevision,
  type Authority,
  type AgentExecutionId,
  type DurableEvidence,
} from './identity.ts'
import type { Material } from './passages.ts'
import type {
  AgentJournalEntry,
  ReceivedCommitInput,
  ReceivedCommitValue,
  ReceivedEntry,
} from './receiving.ts'
import { canonicalText, doubleEvidence, tenantText } from './testing-case.ts'

export type KeptOperation =
  | { kind: 'record'; text: string; receipt: CommandReceipt; entry: AgentJournalEntry }
  | { kind: 'received'; text: string; value: ReceivedCommitValue }
  | { kind: 'excluded'; text: string; evidence: DurableEvidence }
export type KeptDelivery = {
  entry: ReceivedEntry
  receipt: CommandReceipt
  saved: DurableEvidence | null
}
export type MemoryExecution = {
  authority: Authority
  ended: boolean
  revision: number
  entries: AgentJournalEntry[]
  operations: Map<string, KeptOperation>
  qualifications: Map<unknown, 'allowed' | 'denied' | 'unavailable'>
}
export type KeptMaterial<B extends ContentBlock> = {
  tenant: string
  execution: AgentExecutionId
  value: Material<B>
}
export const executionKey = <P>(input: Pick<ExecutionMutation<P>, 'tenant' | 'execution'>) =>
  canonicalText([tenantText(input.tenant), input.execution])
export const operationKey = <P>(input: ExecutionMutation<P>) =>
  canonicalText([executionKey(input), input.operation])
export const deliveryKey = (entry: Omit<ReceivedEntry, 'material'>) =>
  canonicalText([entry.delivery.producer, entry.delivery.key])
export const semanticText = <P, B extends ContentBlock>(input: ReceivedCommitInput<P, B>) =>
  canonicalText({ entry: input.entry, material: input.material })
export const recordText = (entry: AgentJournalEntry, authority: Authority | null) =>
  canonicalText({ entry, authority })
export const conflict = <P>(input: ExecutionMutation<P>): Failure => ({
  kind: 'conflict',
  operation: input.operation,
})
export const unavailable = (diagnostic: string): Failure => ({
  kind: 'unavailable',
  owner: 'memoryReceivedCommits',
  diagnostic,
})
export const denied = (): Failure => ({ kind: 'denied', action: 'received-custody' })
export function identity<T>(result: Outcome<T, unknown>): T {
  if (!('ok' in result)) throw new TypeError('invalid reference fixture identity')
  return result.ok
}
export function receiptOf<P>(state: MemoryExecution, input: ExecutionMutation<P>): CommandReceipt {
  const revision = String(state.revision + 1)
  return {
    execution: input.execution,
    operation: input.operation,
    revision: identity(decodeExecutionRevision(revision)),
    state: 'applied',
    evidence: doubleEvidence('memoryReceivedCommand', operationKey(input), revision),
  }
}
export function sourceOf<P, B extends ContentBlock>(
  input: ReceivedCommitInput<P, B>,
): DurableEvidence {
  return doubleEvidence(
    'memoryReceivedMaterial',
    canonicalText([
      executionKey(input),
      deliveryKey(input.entry),
      input.entry.consumer,
      input.entry.consumption,
    ]),
    '1',
  )
}
export function mutationFailure<P>(input: ExecutionMutation<P>): Failure | null {
  if (!tenantCodec.encode(input.tenant).ok)
    return { kind: 'invalid', field: 'tenant', reason: 'invalid tenant' }
  if (!('ok' in decodeAgentExecutionId(input.execution)))
    return { kind: 'invalid', field: 'execution', reason: 'invalid identity' }
  if (!('ok' in decodeAgentOperationId(input.operation)))
    return { kind: 'invalid', field: 'operation', reason: 'invalid identity' }
  return null
}
const text = z.string().min(1)
const accountShape = z.unknown().refine(value => 'ok' in judgeCallAccount(value), 'invalid account')
const resultKey = z.object({ kind: z.literal('result'), reference: text, result: text })
const modelAccountKey = z.object({
  kind: z.literal('account'),
  reference: text,
  dispatch: text,
  revision: text,
})
const toolAccountKey = z.object({
  kind: z.literal('account'),
  producer: z.literal('tool'),
  reference: text,
  event: text,
  revision: text,
})
const deliveryShape = z.union([
  z.object({
    producer: z.literal('model'),
    key: resultKey,
    accounts: z.array(z.object({ dispatch: text, account: accountShape.nullable() })),
  }),
  z.object({ producer: z.literal('model'), key: modelAccountKey, account: accountShape }),
  z.object({
    producer: z.literal('tool'),
    key: resultKey.extend({ producer: z.literal('tool') }),
    account: accountShape.nullable(),
  }),
  z.object({ producer: z.literal('tool'), key: toolAccountKey, account: accountShape }),
])
const inputShape = z.object({
  entry: z.object({
    kind: z.literal('received'),
    delivery: deliveryShape,
    consumer: z.object({ owner: text, work: text, position: text, purpose: text }),
    consumption: text,
  }),
  material: materialShape,
})
export function receivedFailure<P, B extends ContentBlock>(
  input: ReceivedCommitInput<P, B>,
): Failure | null {
  const parsed = inputShape.safeParse(input)
  if (!parsed.success) {
    const issue = parsed.error.issues[0]
    return {
      kind: 'invalid',
      field: issue?.path.join('.') || 'entry',
      reason: issue?.message || 'invalid input',
    }
  }
  if (!('ok' in decodeConsumptionId(input.entry.consumption))) {
    return { kind: 'invalid', field: 'entry.consumption', reason: 'invalid identity' }
  }
  const delivery = input.entry.delivery
  const resolved =
    delivery.producer === 'model'
      ? resolveModelInvocationRef(delivery.key.reference, input.tenant)
      : resolveToolInvocationRef(delivery.key.reference, input.tenant)
  if ('failure' in resolved)
    return resolved.failure.kind === 'foreign-tenant'
      ? denied()
      : { kind: 'invalid', field: 'entry.delivery.key.reference', reason: 'invalid reference' }
  return null
}
