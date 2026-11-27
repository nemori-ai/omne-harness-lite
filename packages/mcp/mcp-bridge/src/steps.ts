import type { JsonValue } from '@omne-harness/json-text'
import type { Access } from '@omne-harness/legal-identity'
import type { ActionInvoker, Millis } from '@omne-harness/mcp-contract'
import type { ContinuationRecords } from '@omne-harness/mcp-contract/provider'
import type {
  ToolSourceCall,
  ToolSourceResume,
  ToolSourceSuspension,
} from '@omne-harness/tool-contract/provider'
import { checkpointDigest, encodeKept, type Kept } from './continuation.ts'
import { questionsOf, type FormRequest, type McpPersonAsk } from './form.ts'
import { notStarted, unknownText, type Settlement } from './outcome.ts'

/** Given to the bridge, a peer that asks for input suspends the call on a person; without it that call's effect is not known. */
export type McpAsking = Readonly<{
  person: McpPersonAsk
  continuations(): ContinuationRecords | undefined
  /** How many times one call may come back asking for input; the next one is a fault of the peer. */
  maxInputRounds: number
  /** Whether a task watcher answers the task wait here: without one, a task is asked to cancel as before. */
  followTasks: boolean
}>

export type Facts<P> = Omit<ToolSourceCall<P>, 'arguments'>

export type AskingDeps<P> = Readonly<{
  asking: McpAsking
  invoker: Pick<ActionInvoker<P>, 'continueWithInput' | 'taskResult' | 'provideTaskInput'>
  resultMaxBytes: number
  connectBound: Millis
}>

export type Answer =
  | Settlement
  | Readonly<{ effect: 'suspended'; suspension: ToolSourceSuspension }>

export const accessOf = <P>(call: Facts<P>): Access<P> => ({
  principal: call.principal,
  tenant: call.tenant,
})

export const unknownOf = <P>(call: Facts<P>, kept: Kept, what: string): Answer => ({
  effect: 'unknown',
  message: unknownText(call.name, kept.action, what),
})

export function personClosedText(endpoint: string): string {
  return `The MCP endpoint ${endpoint} asked a person for more input, and the question was closed before anyone answered. Nothing more was sent to the endpoint.`
}

/** The questions put to a person; `undefined` when they do not fit one request of the wait. */
export function onPerson<P>(
  deps: AskingDeps<P>,
  kept: Kept,
  requests: readonly FormRequest[],
): Answer | undefined {
  const { person } = deps.asking
  const request = person.request(questionsOf(kept.ref.name, requests))
  if (request === undefined) return undefined
  const next: Kept = { ...kept, on: 'person', requests }
  return {
    effect: 'suspended',
    suspension: {
      kind: 'suspended',
      state: encodeKept(next),
      wait: { kind: 'ask', key: 'input', contract: person.contract, request },
      closedResult: personClosedText(kept.ref.name),
    },
  }
}

export const tooManyRounds = <P>(deps: AskingDeps<P>, call: Facts<P>, kept: Kept) =>
  kept.round > deps.asking.maxInputRounds
    ? unknownOf(
        call,
        kept,
        `the endpoint asked for input more than ${String(deps.asking.maxInputRounds)} times`,
      )
    : undefined

export const BREACH = 'the endpoint asked for a kind of input this version did not offer'

export type Respond = (responses: JsonValue) => Promise<Answer>

/** Before anything carrying a person's answer is sent, this checkpoint is marked; a second run of it sends nothing. */
export async function markedOnce<P>(
  deps: AskingDeps<P>,
  call: ToolSourceResume<P>,
  kept: Kept,
): Promise<Answer | undefined> {
  const records = deps.asking.continuations()
  const why = 'the record that keeps a continuation from being sent twice could not be written'
  if (records === undefined) return notStarted(call.name, kept.action, why)
  const marked = await records.mark({
    tenant: call.tenant,
    checkpoint: checkpointDigest(call.checkpoint),
  })
  if ('failure' in marked) return notStarted(call.name, kept.action, why)
  return marked.ok === 'already'
    ? unknownOf(
        call,
        kept,
        'the answer of the person was already sent once before the service stopped',
      )
    : undefined
}
