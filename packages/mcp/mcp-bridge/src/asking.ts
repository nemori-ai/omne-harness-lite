import type { JsonValue } from '@omne-harness/json-text'
import type { Access } from '@omne-harness/legal-identity'
import {
  isCorrelationKey,
  isRequestState,
  type ActionInvoker,
  type ActionName,
  type CallOutcome,
  type DefinitionDigest,
  type InvokeResult,
  type Millis,
} from '@omne-harness/mcp-contract'
import type { ContinuationRecords } from '@omne-harness/mcp-contract/provider'
import type { ToolDecision } from '@omne-harness/tool-contract'
import type {
  ToolSourceCall,
  ToolSourceResume,
  ToolSourceSuspension,
} from '@omne-harness/tool-contract/provider'
import { checkpointDigest, decodeKept, encodeKept, type Kept } from './continuation.ts'
import { allAnswered, formOf, questionsOf, responsesOf, type McpPersonAsk } from './form.ts'
import { notStarted, settle, unknownText, type Settlement } from './outcome.ts'

/** Given to the bridge, a peer that asks for input suspends the call on a person; without it that call's effect is not known. */
export type McpAsking = Readonly<{
  person: McpPersonAsk
  continuations(): ContinuationRecords | undefined
  /** How many times one call may come back asking for input; the next one is a fault of the peer. */
  maxInputRounds: number
}>

type Facts<P> = Omit<ToolSourceCall<P>, 'arguments'>
type Asked = Extract<CallOutcome, { kind: 'inputRequired' }>

export type AskingDeps<P> = Readonly<{
  asking: McpAsking
  invoker: Pick<ActionInvoker<P>, 'continueWithInput'>
  resultMaxBytes: number
  connectBound: Millis
}>

export type Answer =
  | Settlement
  | Readonly<{ effect: 'suspended'; suspension: ToolSourceSuspension }>

const accessOf = <P>(call: Facts<P>): Access<P> => ({
  principal: call.principal,
  tenant: call.tenant,
})

function closedText(endpoint: string): string {
  return `The MCP endpoint ${endpoint} asked a person for more input, and the question was closed before anyone answered. Nothing more was sent to the endpoint.`
}

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
  return answered(deps, call, kept, result)
}

async function answered<P>(
  deps: AskingDeps<P>,
  call: Facts<P>,
  kept: Kept,
  result: InvokeResult,
): Promise<Answer> {
  if (result.kind !== 'sent' || result.outcome.kind !== 'inputRequired')
    return settle(call.name, kept.action, result, deps.resultMaxBytes)
  return asked(deps, call, { ...kept, round: kept.round + 1 }, result.outcome)
}

/** The peer asks for input: put the questions to a person, or answer at once when no person can be asked. */
export async function asked<P>(
  deps: AskingDeps<P>,
  call: Facts<P>,
  kept: Kept,
  outcome: Asked,
): Promise<Answer> {
  const tool = call.name
  if (kept.round > deps.asking.maxInputRounds)
    return {
      effect: 'unknown',
      message: unknownText(
        tool,
        kept.action,
        `the endpoint asked for input more than ${String(deps.asking.maxInputRounds)} times`,
      ),
    }
  const read = formOf(outcome.inputRequests?.untrusted)
  if (read.kind === 'breach')
    return {
      effect: 'unknown',
      message: unknownText(
        tool,
        kept.action,
        'the endpoint asked for a kind of input this version did not offer',
      ),
    }
  const next: Kept = {
    ...kept,
    ...(outcome.requestState === undefined ? {} : { requestState: outcome.requestState }),
    requests: read.kind === 'form' ? read.requests : [],
  }
  if (read.kind === 'unaskable')
    return continued(deps, call, next, allAnswered(read.keys, 'cancel'))
  if (read.requests.length === 0) return continued(deps, call, next, undefined)
  const { person } = deps.asking
  const request = person.request(questionsOf(kept.ref.name, read.requests))
  if (request === undefined)
    return continued(
      deps,
      call,
      next,
      allAnswered(
        next.requests.map(item => item.key),
        'cancel',
      ),
    )
  return {
    effect: 'suspended',
    suspension: {
      kind: 'suspended',
      state: encodeKept(next),
      wait: {
        kind: 'ask',
        key: 'input',
        contract: person.contract,
        request,
      },
      closedResult: closedText(kept.ref.name),
    },
  }
}

/** Takes a suspended call up again: the continuation is marked before it is sent, so a second run sends nothing. */
export async function resumed<P>(deps: AskingDeps<P>, call: ToolSourceResume<P>): Promise<Answer> {
  const kept = decodeKept(call.checkpoint)
  const reply = deps.asking.person.reply(call.response as ToolDecision<unknown>)
  if (kept === undefined || reply === undefined)
    throw new Error('the checkpoint or the answer is not one this bridge gave out')
  const records = deps.asking.continuations()
  const why = 'the record that keeps a continuation from being sent twice could not be written'
  if (records === undefined) return notStarted(call.name, kept.action, why)
  const marked = await records.mark({
    tenant: call.tenant,
    checkpoint: checkpointDigest(call.checkpoint),
  })
  if ('failure' in marked) return notStarted(call.name, kept.action, why)
  if (marked.ok === 'already')
    return {
      effect: 'unknown',
      message: unknownText(
        call.name,
        kept.action,
        'the answer of the person was already sent once before the service stopped',
      ),
    }
  return continued(deps, call, kept, responsesOf(kept.requests, reply))
}
