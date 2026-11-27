import type { JsonValue } from '@omne-harness/json-text'
import {
  isCorrelationKey,
  isRequestState,
  type ActionName,
  type CallOutcome,
  type DefinitionDigest,
  type InvokeResult,
} from '@omne-harness/mcp-contract'
import type { ToolDecision } from '@omne-harness/tool-contract'
import type { ToolSourceResume } from '@omne-harness/tool-contract/provider'
import { decodeKept, type Kept } from './continuation.ts'
import { allAnswered, formOf, responsesOf } from './form.ts'
import { settle } from './outcome.ts'
import {
  accessOf,
  BREACH,
  markedOnce,
  onPerson,
  tooManyRounds,
  unknownOf,
  type Answer,
  type AskingDeps,
  type Facts,
} from './steps.ts'
import { arrived, firstRound, onTask, taskInput } from './tasks.ts'
import { readTaskWaitAnswer } from './task-wait.ts'

export type { Answer, AskingDeps, McpAsking } from './steps.ts'

type Asked = Extract<CallOutcome, { kind: 'inputRequired' }>

async function continued<P>(
  deps: AskingDeps<P>,
  call: Facts<P>,
  kept: Kept,
  inputResponses: JsonValue | undefined,
): Promise<Answer> {
  if (!isCorrelationKey(call.invocation))
    throw new TypeError('the invocation of the call is not a correlation key')
  // The action and its digest come back from this bridge's own checkpoint.
  const result = await deps.invoker.continueWithInput(accessOf(call), {
    ref: kept.ref,
    action: kept.action as ActionName,
    args: kept.args,
    ...(kept.requestState !== undefined && isRequestState(kept.requestState)
      ? { requestState: kept.requestState }
      : {}),
    ...(inputResponses === undefined ? {} : { inputResponses }),
    expectedDefinition: kept.definition as DefinitionDigest,
    correlationKey: call.invocation,
    signal: call.signal,
    connectBound: deps.connectBound,
  })
  return answered(deps, call, { ...kept, round: kept.round + 1 }, result)
}

/** What the peer answered a call with: input asked for, a task to wait for, or how the call ended. */
export function answered<P>(
  deps: AskingDeps<P>,
  call: Facts<P>,
  kept: Kept,
  result: InvokeResult,
): Promise<Answer> | Answer {
  if (result.kind === 'sent' && result.outcome.kind === 'inputRequired')
    return asked(deps, call, kept, result.outcome)
  if (result.kind === 'sent' && result.outcome.kind === 'task' && deps.asking.followTasks)
    return onTask(kept, firstRound(result.outcome))
  return settle(call.name, kept.action, result, deps.resultMaxBytes)
}

/** The peer asks for input: put the questions to a person, or answer at once when no person can be asked. */
export async function asked<P>(
  deps: AskingDeps<P>,
  call: Facts<P>,
  kept: Kept,
  outcome: Asked,
): Promise<Answer> {
  const bounded = tooManyRounds(deps, call, kept)
  if (bounded !== undefined) return bounded
  const read = formOf(outcome.inputRequests?.untrusted)
  if (read.kind === 'breach') return unknownOf(call, kept, BREACH)
  const next: Kept = {
    ...kept,
    ...(outcome.requestState === undefined ? {} : { requestState: outcome.requestState }),
    requests: read.kind === 'form' ? read.requests : [],
  }
  if (read.kind === 'unaskable')
    return continued(deps, call, next, allAnswered(read.keys, 'cancel'))
  if (read.requests.length === 0) return continued(deps, call, next, undefined)
  const keys = read.requests.map(item => item.key)
  return (
    onPerson(deps, next, read.requests) ?? continued(deps, call, next, allAnswered(keys, 'cancel'))
  )
}

/** Takes a suspended call up again from what it waited on: a person, or its task. */
export async function resumed<P>(deps: AskingDeps<P>, call: ToolSourceResume<P>): Promise<Answer> {
  const kept = decodeKept(call.checkpoint)
  const response = call.response as ToolDecision<unknown>
  if (kept?.on === 'task') {
    const arrival = response.kind === 'answer' ? readTaskWaitAnswer(response.value) : undefined
    if (arrival === undefined)
      throw new Error('the answer of the task wait is not one this bridge gave out')
    return arrived(deps, call, kept, arrival)
  }
  const reply = deps.asking.person.reply(response)
  if (kept === undefined || reply === undefined)
    throw new Error('the checkpoint or the answer is not one this bridge gave out')
  const gate = await markedOnce(deps, call, kept)
  if (gate !== undefined) return gate
  const responses = responsesOf(kept.requests, reply)
  return kept.task === undefined
    ? continued(deps, call, kept, responses)
    : taskInput(deps, call, kept, responses)
}
