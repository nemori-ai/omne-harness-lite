import type { JsonValue } from '@omne-harness/json-text'
import type { CallOutcome, TaskArrival } from '@omne-harness/mcp-contract'
import type { ToolSourceResume } from '@omne-harness/tool-contract/provider'
import { encodeKept, type Kept, type KeptTask } from './continuation.ts'
import { allAnswered, formOf } from './form.ts'
import { failureText, settle } from './outcome.ts'
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
import { mcpTaskWait, taskRefOf, taskWaitRequest, type TaskWait } from './task-wait.ts'

type TaskOutcome = Extract<CallOutcome, { kind: 'task' }>

const waitOf = (kept: Kept, task: KeptTask): TaskWait => ({ ref: kept.ref, ...task })

function closedText(endpoint: string): string {
  return `The call to the MCP endpoint ${endpoint} was waiting for its task, and the wait was closed before the task got anywhere.`
}

/** The call waits for its task: the row of the task was kept before the peer's answer came here. */
export function onTask(kept: Kept, task: KeptTask): Answer {
  const next: Kept = { ...kept, on: 'task', task, requests: [] }
  return {
    effect: 'suspended',
    suspension: {
      kind: 'suspended',
      state: encodeKept(next),
      wait: {
        kind: 'ask',
        key: 'task',
        contract: mcpTaskWait,
        request: taskWaitRequest(waitOf(next, task)),
      },
      closedResult: closedText(kept.ref.name),
    },
  }
}

export const firstRound = (outcome: TaskOutcome): KeptTask => ({
  taskId: outcome.taskId,
  issuedAt: outcome.issuedAt,
  round: 1,
})

const taskOf = (kept: Kept): KeptTask => {
  if (kept.task === undefined) throw new Error('the checkpoint waits for a task it does not name')
  return kept.task
}

async function finished<P>(deps: AskingDeps<P>, call: Facts<P>, kept: Kept): Promise<Answer> {
  const ref = taskRefOf(waitOf(kept, taskOf(kept)), deps.connectBound)
  const read = await deps.invoker.taskResult(accessOf(call), ref)
  if ('failure' in read)
    return unknownOf(
      call,
      kept,
      `the result of its task could not be read: ${failureText(read.failure)}`,
    )
  switch (read.ok) {
    case 'not-finished':
      return unknownOf(call, kept, 'the endpoint said its task ended, then that it had not')
    case 'expired':
      return unknownOf(call, kept, 'its task expired at the endpoint before the result was read')
    case 'cancelled':
      return unknownOf(call, kept, 'the endpoint cancelled its task')
    default:
      return settle(call.name, kept.action, { kind: 'sent', outcome: read.ok }, deps.resultMaxBytes)
  }
}

/** The person's answers go to the task by `tasks/update`; then the call waits for the task again, in the next round. */
export async function taskInput<P>(
  deps: AskingDeps<P>,
  call: Facts<P>,
  kept: Kept,
  responses: JsonValue,
): Promise<Answer> {
  const task = taskOf(kept)
  const ref = taskRefOf(waitOf(kept, task), deps.connectBound)
  const sent = await deps.invoker.provideTaskInput(accessOf(call), ref, responses)
  if ('failure' in sent)
    return unknownOf(
      call,
      kept,
      `the input for its task may not have arrived: ${failureText(sent.failure)}`,
    )
  return onTask({ ...kept, round: kept.round + 1 }, { ...task, round: task.round + 1 })
}

async function inputAsked<P>(
  deps: AskingDeps<P>,
  call: ToolSourceResume<P>,
  kept: Kept,
  arrival: Extract<TaskArrival, { kind: 'input' }>,
): Promise<Answer> {
  const bounded = tooManyRounds(deps, call, kept)
  if (bounded !== undefined) return bounded
  const read = formOf(arrival.inputRequests?.untrusted)
  if (read.kind === 'breach') return unknownOf(call, kept, BREACH)
  if (read.kind === 'form' && read.requests.length > 0) {
    const asked = onPerson(deps, kept, read.requests)
    if (asked !== undefined) return asked
  }
  const keys = read.kind === 'form' ? read.requests.map(request => request.key) : read.keys
  const gate = await markedOnce(deps, call, kept)
  return gate ?? taskInput(deps, call, kept, allAnswered(keys, 'cancel'))
}

/** Where the task of the call got to, as the watcher said: the result, a question, or that it is not known. */
export function arrived<P>(
  deps: AskingDeps<P>,
  call: ToolSourceResume<P>,
  kept: Kept,
  arrival: TaskArrival,
): Promise<Answer> {
  switch (arrival.kind) {
    case 'terminal':
      return finished(deps, call, kept)
    case 'input':
      return inputAsked(deps, call, kept, arrival)
    case 'expired':
      return Promise.resolve(
        unknownOf(call, kept, 'its task expired at the endpoint before it finished'),
      )
    case 'unknown':
      return Promise.resolve(unknownOf(call, kept, 'the endpoint no longer knows its task'))
    default: {
      const exhaustive: never = arrival
      return exhaustive
    }
  }
}
