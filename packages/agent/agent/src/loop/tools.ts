import {
  decodeActionId,
  decodeConsumptionId,
  decodePassageId,
  type Access,
  type Action,
  type AgentExecutionId,
  type Authority,
  type ConsumerRef,
  type Failure,
  type PendingCall,
  type StepId,
} from '@omne-harness/agent-contract'
import type { ContentBlock } from '@omne-harness/content-block'
import { judgeToolInvokeRequest } from '@omne-harness/tool-contract/provider'
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import type { AgentDependencies } from '../construction.ts'
import { canonical } from '../canonical.ts'
import { json } from '../receiving-values.ts'

type Ports<P> = Pick<AgentDependencies<P, ContentBlock>, 'admission' | 'toolRequests' | 'materials'>

export const fixedToolRequestSchema = {
  owner: 'agent',
  name: 'fixed-tool-request',
  revision: '1',
  digest: 'agent:fixed-tool-request/1',
} as const

function minted<T>(result: Outcome<T, unknown>): T {
  if ('failure' in result) throw new Error('invalid derived Tool action identity')
  return result.ok
}

function argumentsText(value: Action['original']['arguments']): string {
  switch (value.kind) {
    case 'null':
      return 'null'
    case 'string':
      return JSON.stringify(value.value)
    case 'boolean':
      return String(value.value)
    case 'number':
      return value.lexeme
    case 'array':
      return `[${value.items.map(argumentsText).join(',')}]`
    case 'object':
      return `{${value.entries.map(entry => `${JSON.stringify(entry.key)}:${argumentsText(entry.value)}`).join(',')}}`
  }
}

export function actionOf(step: StepId, original: Action['original'], ordinal: number): Action {
  const id = minted(decodeActionId(`${step}/tool/${ordinal}`))
  return {
    id,
    original,
    effectiveArguments: argumentsText(original.arguments),
    call: null,
    judgment: { kind: 'pending', passage: minted(decodePassageId(`${id}/admission`)) },
  }
}

export function toolConsumer(execution: AgentExecutionId, action: Action): ConsumerRef {
  return { owner: '@omne-harness/agent', work: execution, position: action.id, purpose: 'action' }
}

export async function admitToolAction<P>(
  ports: Ports<P>,
  access: Access<P>,
  execution: AgentExecutionId,
  advance: Authority,
  action: Action,
): Promise<Outcome<Action, Failure>> {
  if (action.judgment.kind !== 'pending') return succeed(action)
  if (ports.toolRequests === undefined)
    return fail({
      kind: 'unavailable',
      owner: 'agentToolRequests',
      diagnostic: 'trusted Tool request source is unavailable',
    })
  const input = {
    ...access,
    execution,
    action: action.id,
    original: action.original,
    effectiveArguments: action.effectiveArguments,
    consumer: toolConsumer(execution, action),
  }
  const described = await ports.toolRequests.describe(input)
  if ('failure' in described) return described
  const admitted = await ports.admission.admit({
    ...input,
    advance,
    passage: action.judgment.passage,
    definition: described.ok,
    permissions: [],
    decision: null,
  })
  if ('failure' in admitted) return admitted
  if (admitted.ok.kind === 'deny')
    return succeed({ ...action, judgment: { kind: 'denied', evidence: admitted.ok.evidence } })
  if (admitted.ok.kind === 'unavailable')
    return fail({
      kind: 'unavailable',
      owner: 'agentActionAdmission',
      diagnostic: admitted.ok.diagnostic,
    })
  if (admitted.ok.kind === 'need-decision') return fail({ kind: 'unsupported' })
  const prepared = await ports.toolRequests.prepare({
    ...input,
    definition: described.ok,
    admission: admitted.ok.evidence,
  })
  if ('failure' in prepared) return prepared
  const checked = judgeToolInvokeRequest(prepared.ok)
  if ('failure' in checked)
    return fail({
      kind: 'invalid',
      field: `toolRequests.${checked.failure.field}`,
      reason: checked.failure.reason,
    })
  const request = checked.ok
  if (
    canonical(request.availability.definition.adoption) !== canonical(described.ok) ||
    canonical(request.consumer) !== canonical(input.consumer) ||
    request.arguments.original !== argumentsText(action.original.arguments) ||
    request.arguments.effective !== action.effectiveArguments
  )
    return fail({
      kind: 'invalid',
      field: 'toolRequests',
      reason: 'request does not match the admitted action',
    })
  return succeed({
    ...action,
    judgment: { kind: 'allowed', evidence: admitted.ok.evidence, request },
  })
}

export async function preserveToolIntent<P>(
  ports: Ports<P>,
  access: Access<P>,
  execution: AgentExecutionId,
  action: Action,
): Promise<Outcome<PendingCall, Failure>> {
  if (action.judgment.kind !== 'allowed')
    return fail({ kind: 'invalid', field: 'action', reason: 'not allowed' })
  const input = {
    ...access,
    execution,
    identity: `${execution}/${action.id}/request`,
    consumer: action.judgment.request.consumer,
    value: {
      kind: 'facts' as const,
      schema: fixedToolRequestSchema,
      value: json(action.judgment.request),
    },
  }
  const stored = await ports.materials.preserve(input)
  if ('failure' in stored) return stored
  return succeed({
    kind: 'tool',
    purpose: 'action',
    association: 'intent',
    action: action.id,
    consumption: minted(decodeConsumptionId(`${action.id}/result`)),
    position: input.consumer,
    fixed: stored.ok,
  })
}
