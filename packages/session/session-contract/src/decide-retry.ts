import type { SessionCommand } from './ports.ts'
import type { WorkSnapshot } from './values.ts'
import type { Decision, DecideReads } from './judgments.ts'
import { judgeRetryRun } from './judgments.ts'
import { decideControl } from './decide-management.ts'
import { invalid, rejected } from './decision-support.ts'

export function decideRetryRun(
  snapshot: WorkSnapshot,
  command: Extract<SessionCommand, { kind: 'retryRun' }>,
  reads: DecideReads,
): Decision {
  const { run, operation } = command.input
  if (typeof run !== 'string' || run.length === 0)
    return invalid('run', 'empty or not a Run identity')
  const refusal = judgeRetryRun(snapshot, run)
  if (refusal === 'frozen') return rejected({ kind: 'frozen', verdict: snapshot.frozen })
  if (refusal !== null) return rejected({ kind: refusal })
  const intent = { kind: 'control', value: { kind: 'retry-run', run } } as const
  return decideControl(snapshot, intent, operation, reads)
}
