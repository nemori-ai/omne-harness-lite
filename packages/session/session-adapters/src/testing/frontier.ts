import { randomUUID } from 'node:crypto'
import type { AgentExecutionId } from '@omne-harness/agent-contract'
import type {
  SessionCommand,
  SessionInputScope,
  SessionOperationId,
  WorkSnapshot,
  SessionFailure,
} from '@omne-harness/session-contract'
import type { Outcome } from '@omne-harness/operation-result'
import { canonical } from './canonical.ts'
import { executionKey, HistoryFailure, unavailable } from './history.ts'
import type { JournalCell, CommonRoot } from './root.ts'

export type ReadBudget = Readonly<{ entries: number; bytes: number; capacityBytes: number }>
export type FrontierMetrics = { entries: number; bytes: number; yields: number; passes: number }
export const defaultBudget: ReadBudget = {
  entries: 128,
  bytes: 256 * 1024,
  capacityBytes: 8 * 1024 * 1024,
}
export function commandScope(
  command: SessionCommand,
  snapshot: WorkSnapshot,
): SessionInputScope | null {
  if (command.kind === 'startRun') return { kind: 'selected', inputs: snapshot.pending.slice(0, 1) }
  if (
    command.kind === 'receive' &&
    command.input.fact.kind === 'input-handover' &&
    command.input.fact.result.kind === 'accepted'
  )
    return { kind: 'selected', inputs: [command.input.fact.input] }
  if (command.kind === 'freeze' && snapshot.run.kind !== 'active' && snapshot.frozen === null)
    return { kind: 'pending', inputs: snapshot.pending }
  if (snapshot.frozen === null || snapshot.run.kind !== 'active') return null
  if (command.kind === 'finishRun') return { kind: 'pending', inputs: snapshot.pending }
  if (
    command.kind === 'control' &&
    (command.input.intent.kind === 'cancel-run' || command.input.intent.kind === 'archive')
  )
    return { kind: 'pending', inputs: snapshot.pending }
  return null
}
function cursor(root: CommonRoot, execution: string): number {
  return Number(root.sources.cursors.get(execution)?.through ?? 0)
}
async function captured(
  root: CommonRoot,
  scope: SessionInputScope,
  extra: readonly string[],
  charge: (value: unknown) => Promise<void>,
  capacity: number,
) {
  const ids = new Set<string>(),
    directories: unknown[] = [],
    inputs = new Set<import('@omne-harness/session-contract').InputId>()
  let retained = 0
  const remember = async (value: unknown) => {
    const size = Buffer.byteLength(canonical(value))
    retained += size
    if (retained > capacity) unavailable('captured frontier exceeds capacity')
    await charge(value)
  }
  const addExecution = async (id: string) => {
    if (!ids.has(id)) {
      await remember(id)
      ids.add(id)
    }
  }
  const addInput = async (id: import('@omne-harness/session-contract').InputId) => {
    if (!inputs.has(id)) {
      await remember(id)
      inputs.add(id)
    }
  }
  for (const id of extra) await addExecution(id)
  for (const id of scope.inputs) await addInput(id)
  for (const input of inputs) {
    const records = root.agent.admissions.get(input) ?? [],
      directory = [input, records.length]
    await remember(directory)
    directories.push(directory)
    for (const record of records) {
      await charge(record)
      await addExecution(record.execution)
    }
    for (const batch of root.agent.inputBatches.get(input) ?? [])
      for (const member of batch.batch.ordered) await addInput(member)
  }
  const executions = []
  for (const id of ids) {
    const execution = root.agent.executions.get(executionKey(root, id))
    if (!execution) unavailable('captured execution')
    const ended = root.agent.ended.get(id),
      item = {
        execution,
        after: cursor(root, id),
        upper: ended ? Number(ended.sequence) - 1 : execution.events.length,
      }
    await remember([id, item.after, item.upper])
    executions.push(item)
  }
  return {
    executions,
    signature: canonical([
      scope.kind,
      directories,
      executions.map(item => [item.execution.id, item.after, item.upper]),
    ]),
  }
}

/** Read cursors are disposable. Only the interpreter publishes consequences and durable progress. */
export function createFrontier<P>(
  budget: ReadBudget,
  interpret: (
    cell: JournalCell<P>,
    execution: AgentExecutionId,
    sequence: string,
    operation: SessionOperationId,
    verify?: () => SessionFailure | null,
  ) => Promise<Outcome<unknown, SessionFailure>>,
) {
  for (const [key, value] of Object.entries(budget))
    if (!Number.isSafeInteger(value) || value <= 0) throw new TypeError(`invalid ${key} budget`)
  const operations = new Map<string, SessionOperationId>()
  const metrics: FrontierMetrics = { entries: 0, bytes: 0, yields: 0, passes: 0 }
  return {
    metrics: () => ({ ...metrics }),
    async prepare(
      cell: JournalCell<P>,
      select: (snapshot: WorkSnapshot) => SessionInputScope | null,
      extra: readonly string[] = [],
      verify: () => SessionFailure | null = () => null,
    ): Promise<CommonRoot> {
      let entries = 0,
        bytes = 0
      const charge = async (value: unknown) => {
        const size = Buffer.byteLength(canonical(value))
        if (size > budget.capacityBytes) unavailable('required original material exceeds capacity')
        if (entries > 0 && (entries >= budget.entries || bytes + size > budget.bytes)) {
          metrics.yields++
          await new Promise<void>(resolve => setImmediate(resolve))
          entries = 0
          bytes = 0
        }
        entries++
        bytes += size
        metrics.entries++
        metrics.bytes += size
      }
      for (;;) {
        const root = cell.current(),
          snapshot = root.session?.snapshot
        if (!snapshot) return root
        if (cell.gate() !== null)
          throw new HistoryFailure({ kind: 'quarantined', diagnostic: cell.gate()! })
        const scope = select(snapshot)
        if (!scope) return root
        const work = await captured(root, scope, extra, charge, budget.capacityBytes)
        metrics.passes++
        // Finish the captured executions even when an earlier taken fact removes every Q member.
        for (const item of work.executions) {
          for (let index = item.after; index < item.upper; index++) {
            const event = item.execution.events[index]
            if (!event || event.sequence !== String(index + 1))
              throw new HistoryFailure({ kind: 'quarantined', diagnostic: 'original event gap' })
            await charge(event)
            const key = canonical([cell.namespace, item.execution.id, event.sequence])
            let operation = operations.get(key)
            if (!operation) {
              operation = `sop_${randomUUID()}` as SessionOperationId
              operations.set(key, operation)
            }
            const result = await interpret(
              cell,
              item.execution.id,
              event.sequence,
              operation,
              verify,
            )
            if ('failure' in result) {
              if (result.failure.kind === 'commit-unknown') {
                const held = cell.current().session?.operations.get(operation)
                if (
                  held?.projection?.execution === item.execution.id &&
                  held.projection.sequence === event.sequence
                )
                  continue
              }
              throw new HistoryFailure(result.failure)
            }
          }
        }
        const current = cell.current(),
          currentSnapshot = current.session?.snapshot
        if (!currentSnapshot) return current
        const nextScope = select(currentSnapshot)
        if (!nextScope) return current
        if (
          (await captured(current, nextScope, extra, charge, budget.capacityBytes)).signature ===
          work.signature
        )
          return current
      }
    },
  }
}
