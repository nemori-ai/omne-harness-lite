import { createHash } from 'node:crypto'
import type {
  AgentExecutionId,
  AgentJournal,
  AgentOperationId,
  Failure,
} from '@omne-harness/agent-contract'
import type { Outcome } from '@omne-harness/operation-result'
import type {
  Reply,
  RunExecution,
  SessionAccess,
  WorkSnapshot,
} from '@omne-harness/session-contract'
import { canonical } from '../testing/canonical.ts'

export type ReceivedAllPorts<P> = Readonly<{
  readWork(access: SessionAccess<P>): Reply<WorkSnapshot>
  load: AgentJournal<P>['load']
  acknowledge: AgentJournal<P>['acknowledge']
  warn(line: string): void
}>

export type ReceivedAllTarget = Readonly<{ tenantText: string; execution: AgentExecutionId }>

export function receivedAll(snapshot: WorkSnapshot, execution: string): RunExecution | null {
  if (snapshot.run.kind === 'active' && snapshot.run.execution.execution === execution) return null
  const held = snapshot.executions?.find(item => item.execution.execution === execution)
  if (held === undefined || held.terminal === null) return null
  if (snapshot.consumptions.some(item => item.binding.consumer.work === execution)) return null
  return held
}

function acknowledgementOf(tenantText: string, execution: string, through: string) {
  const digest = createHash('sha256')
    .update(canonical(['session-received-all/1', tenantText, execution, through]))
    .digest('hex')
  return `received_${digest}` as AgentOperationId
}

const settled = (answer: Outcome<unknown, Failure>): boolean =>
  'failure' in answer && (answer.failure.kind === 'terminal' || answer.failure.kind === 'denied')

export async function acknowledgeReceived<P>(
  ports: ReceivedAllPorts<P>,
  access: SessionAccess<P>,
  target: ReceivedAllTarget,
): Promise<void> {
  const { execution } = target
  const work = await ports.readWork(access)
  if ('failure' in work) return
  const held = receivedAll(work.ok, execution)
  if (held === null) return
  const through = held.execution.readThrough
  const reading = { principal: access.principal, tenant: access.tenant, execution }
  const loaded = await ports.load(reading)
  if (settled(loaded)) return
  if ('failure' in loaded) {
    ports.warn(`reading ${execution} before its acknowledgement answered ${loaded.failure.kind}`)
    return
  }
  const { output } = loaded.ok
  if (output.emittedThrough !== through || output.acknowledgedThrough === through) return
  const answer = await ports.acknowledge({
    ...reading,
    operation: acknowledgementOf(target.tenantText, execution, through),
    through,
    receipt: held.execution.evidence,
  })
  if ('failure' in answer && !settled(answer))
    ports.warn(`acknowledging ${execution} through ${through} answered ${answer.failure.kind}`)
}
