import { canonical, fields, integer, object, same, string } from '../integration/parse.ts'
import {
  nonempty,
  parseAssignment,
  parseContinuation,
  parseTask,
  parseWave,
  uuid,
} from './collaboration-values.ts'
import { successor } from './collaboration-state-values.ts'
import type { Assignment, Continuation, WaveIdentity } from './collaboration-records.ts'
import type { EventRecord } from './events.ts'
import { waitForEvent } from './events-wait.ts'
import { InputError } from './protocol.ts'
import { readDisposition, type DispositionTarget } from './reduce-watch-disposition.ts'
import { loadWatchJournal, lockWatchJournal, saveWatchJournal } from './reduce-watch-journal.ts'
import {
  initialAssignment,
  watchAuthority,
  type ReduceWatchPorts,
} from './reduce-watch-materials.ts'
import { readReleasedWave } from './reduce-watch-release.ts'

export type ReduceWatchInput = {
  repo: string
  lineParent: number
  operationId: string
  journal: string
  file: string
  watchReduceIssue?: number
  nextReduceIssue?: number
  recoverLock?: boolean
  timeoutMs?: number
  signal?: AbortSignal
  purpose: { kind: 'wave' } | ({ kind: 'disposition' } & DispositionTarget)
}

type Position = {
  context: WaveIdentity
  assignment: Assignment | Continuation
  terminal: boolean
  consumedWave: number
}
type WaveResult = {
  status: 'released' | 'terminal'
  continuation: Continuation
  currentAction: 'prepare' | 'rearm' | 'final-handoff' | 'recover-next'
  taskAuthorization: 'current' | 'historical' | 'not-applicable'
  facts: NonNullable<ReturnType<typeof readReleasedWave>>
}
type DispositionResult = {
  status: 'disposition'
  currentAction: 'prepare' | 'rearm'
  taskAuthorization: 'current' | 'not-applicable'
  facts: NonNullable<ReturnType<typeof readDisposition>>
}
export type ReduceWatchResult = (WaveResult | DispositionResult) & {
  schemaVersion: 1
  operation: 'watch'
  operationId: string
  repo: string
  reduceIssue: number
  wave: number
  finalHead: string | null
  next: WaveIdentity | null
  instructions: string
}

type Operation = {
  id: string
  purpose: ReduceWatchInput['purpose']
  position: Position
  result: unknown
}
type Journal = {
  schemaVersion: 1
  repo: string
  lineParent: number
  current: Position
  operations: Operation[]
}

function position(value: unknown): Position {
  const v = fields(value, ['context', 'assignment', 'terminal', 'consumedWave'], 'watch position')
  if (
    typeof v.terminal !== 'boolean' ||
    typeof v.consumedWave !== 'number' ||
    !Number.isSafeInteger(v.consumedWave) ||
    v.consumedWave < 0
  )
    throw new InputError('watch-journal-position-invalid')
  return {
    context: parseWave(v.context),
    assignment:
      'kind' in object(v.assignment, 'watch assignment')
        ? parseContinuation(v.assignment)
        : parseAssignment(v.assignment),
    terminal: v.terminal,
    consumedWave: v.consumedWave,
  }
}

function load(input: ReduceWatchInput, ports: ReduceWatchPorts): Journal {
  const raw = loadWatchJournal(input.journal)
  if (raw === undefined) {
    const assignment = initialAssignment(ports, input.repo, input.lineParent)
    return {
      schemaVersion: 1,
      repo: input.repo,
      lineParent: input.lineParent,
      current: {
        context: assignment.context,
        assignment,
        terminal: false,
        consumedWave: assignment.context.wave - 1,
      },
      operations: [],
    }
  }
  same([raw.repo, raw.lineParent], [input.repo, input.lineParent], 'watch-journal-owner-mismatch')
  if (!Array.isArray(raw.operations)) throw new InputError('watch-journal-operations-invalid')
  const operations = raw.operations.map(value => {
    const v = fields(value, ['id', 'purpose', 'position', 'result'], 'watch operation')
    const p = fields(v.purpose, ['kind', 'requestId', 'tasks'], 'watch purpose')
    // Exact request/task parsing is performed by the registered-request reader before use.
    if (p.kind !== 'wave' && p.kind !== 'disposition')
      throw new InputError('watch-journal-purpose-invalid')
    const purpose = p.kind === 'wave' ? { kind: 'wave' as const } : parseDispositionTarget(p)
    return {
      id: uuid(v.id, 'operation.id'),
      purpose,
      position: position(v.position),
      result: v.result,
    }
  })
  // Stored results are never authority: recompute from the saved target before returning a replay.
  return {
    schemaVersion: 1,
    repo: input.repo,
    lineParent: input.lineParent,
    current: position(raw.current),
    operations,
  }
}

function parseDispositionTarget(value: Record<string, unknown>): ReduceWatchInput['purpose'] {
  if (!Array.isArray(value.tasks)) throw new InputError('watch-disposition-tasks-missing')
  return {
    kind: 'disposition',
    requestId: uuid(value.requestId, 'requestId'),
    tasks: nonempty(value.tasks.map(parseTask), 'tasks'),
  }
}

function outcome(
  input: ReduceWatchInput,
  ports: ReduceWatchPorts,
  op: Operation,
): ReduceWatchResult | undefined {
  const context = op.position.context
  const common = {
    schemaVersion: 1 as const,
    operation: 'watch' as const,
    operationId: op.id,
    repo: input.repo,
    reduceIssue: context.reduceIssue,
    wave: context.wave,
  }
  if (op.purpose.kind === 'disposition') {
    const facts = readDisposition(ports, context, input.lineParent, op.purpose)
    if (facts === undefined) return undefined
    const redispatch = facts.disposition.action === 'redispatch'
    return {
      ...common,
      status: 'disposition',
      facts,
      currentAction: redispatch ? 'prepare' : 'rearm',
      taskAuthorization: redispatch ? 'current' : 'not-applicable',
      finalHead:
        facts.disposition.action === 'redispatch' ? facts.disposition.assignment.finalHead : null,
      next: context,
      instructions: redispatch
        ? 'Read the new delta and assignment. Enter PREPARE in the same wave with the new attempt and requestId. The old execution stays stopped. Re-arm the current actual reduce before work.'
        : 'Save the disposition and remaining owner. Re-arm the current actual reduce with purpose=wave. This disposition does not release the wave.',
    }
  }
  const facts = readReleasedWave(ports, context, input.lineParent)
  if (facts === undefined) return undefined
  const continuation = facts.continuation
  return {
    ...common,
    status: continuation.kind === 'terminal' ? 'terminal' : 'released',
    facts,
    continuation,
    currentAction: facts.historical
      ? 'recover-next'
      : continuation.kind === 'active'
        ? 'prepare'
        : continuation.kind === 'idle'
          ? 'rearm'
          : 'final-handoff',
    taskAuthorization: facts.historical
      ? 'historical'
      : continuation.kind === 'active'
        ? 'current'
        : 'not-applicable',
    finalHead: facts.release.finalHead,
    next: continuation.kind === 'terminal' ? null : facts.release.next,
    instructions: facts.historical
      ? 'Historical input verified only; no current write permission. Consume this one release and invoke watch for its saved direct successor with a new operationId.'
      : continuation.kind === 'active'
        ? 'Read the new delta and assignment, verify the baseline and task, and enter PREPARE. Invoke watch for the saved direct successor through the original host shell tool before starting work.'
        : continuation.kind === 'idle'
          ? 'Read the delta and idle reason. Immediately invoke watch for the saved direct successor with a new operationId. Do not create a task branch or empty PR.'
          : 'Stop re-arming waits. Complete the final handoff and read back the required acceptance; this result alone is not final handoff completion.',
  }
}

function nextPosition(current: Position, result: ReduceWatchResult): Position {
  if (result.status === 'disposition')
    return result.facts.disposition.action === 'redispatch'
      ? { ...current, assignment: result.facts.disposition.assignment }
      : current
  if (result.continuation.kind === 'terminal')
    return {
      ...current,
      assignment: result.continuation,
      terminal: true,
      consumedWave: result.wave,
    }
  const context = result.next
  if (context === null) throw new InputError('watch-nonterminal-missing-next')
  successor(current.context, context)
  return {
    context,
    assignment:
      result.continuation.kind === 'active' ? result.continuation.assignment : result.continuation,
    terminal: false,
    consumedWave: result.wave,
  }
}

function wakeEvent(context: WaveIdentity): EventRecord {
  return {
    delivery: null,
    event: 'issues',
    action: 'closed',
    number: context.reduceIssue,
    state: 'closed',
    draft: null,
    base: null,
    head: null,
    marker: null,
    html_url: `https://github.com/${context.repo}/issues/${context.reduceIssue}`,
    receivedAt: new Date().toISOString(),
  }
}

/** One invocation consumes one actual reduce or one request disposition, never a future participation plan. */
export async function runReduceWatch(
  input: ReduceWatchInput,
  ports: ReduceWatchPorts,
): Promise<ReduceWatchResult> {
  uuid(input.operationId, 'operationId')
  integer(input.lineParent, 'lineParent')
  string(input.repo, 'repo')
  const unlock = lockWatchJournal(input.journal, input.recoverLock)
  try {
    const journal = load(input, ports)
    const existing = journal.operations.find(op => op.id === input.operationId)
    const op: Operation = existing ?? {
      id: input.operationId,
      purpose: input.purpose,
      position: journal.current,
      result: null,
    }
    same(op.purpose, input.purpose, 'watch-operation-purpose-conflict')
    if (existing === undefined && op.position.terminal) throw new InputError('watch-line-terminal')
    const context = op.position.context
    if (input.watchReduceIssue !== undefined && input.watchReduceIssue !== context.reduceIssue)
      throw new InputError('watch-explicit-parent-conflict')
    same(
      watchAuthority(ports, input.repo, context.reduceIssue).scope.context,
      context,
      'watch-current-context-stale',
    )
    if (input.nextReduceIssue !== undefined)
      successor(context, watchAuthority(ports, input.repo, input.nextReduceIssue).scope.context)
    if (existing === undefined) journal.operations.push(op)
    saveWatchJournal(input.journal, journal)
    let result: ReduceWatchResult | undefined
    let since = new Date(Date.now() - 1).toISOString()
    const deadline = input.timeoutMs === undefined ? undefined : Date.now() + input.timeoutMs
    while (result === undefined) {
      const hit = await waitForEvent({
        file: input.file,
        repository: input.repo,
        predicate: {
          kind: 'any',
          of: [
            { kind: 'issue-closed', issue: context.reduceIssue },
            {
              kind: 'comment',
              issue: context.reduceIssue,
              marker: op.purpose.kind === 'wave' ? 'reduce-release' : 'integration-state',
            },
          ],
        },
        since,
        ...(input.signal === undefined ? {} : { signal: input.signal }),
        ...(deadline === undefined ? {} : { timeoutMs: Math.max(1, deadline - Date.now()) }),
        reconcile: () => {
          result = outcome(input, ports, op)
          return result === undefined ? undefined : wakeEvent(context)
        },
      })
      // Legacy events are also only hints. Read authority after every event-return path.
      if (result === undefined) result = outcome(input, ports, op)
      since = hit.delivery ?? hit.receivedAt
    }
    if (input.signal?.aborted === true) throw input.signal.reason
    if (
      input.nextReduceIssue !== undefined &&
      result.status !== 'disposition' &&
      result.next?.reduceIssue !== input.nextReduceIssue
    )
      throw new InputError('watch-next-hint-conflicts-with-release')
    if (op.result !== null) same(op.result, result, 'watch-replayed-result-no-longer-current')
    op.result = result
    if (existing === undefined || canonical(journal.current) === canonical(op.position))
      journal.current = nextPosition(op.position, result)
    saveWatchJournal(input.journal, journal)
    return result
  } finally {
    unlock()
  }
}
