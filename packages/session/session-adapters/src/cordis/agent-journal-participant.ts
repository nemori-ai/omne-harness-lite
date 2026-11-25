import type { AgentExecutionId } from '@omne-harness/agent-contract'
import {
  cancellationDriveOf,
  judgeCompletion,
  type SessionId,
  type WorkSnapshot,
} from '@omne-harness/session-contract'

const OWNER = 'session-log-journal'

export function terminalParticipant(
  book: Readonly<{
    tenantText: string
    session: SessionId
    scratch?: Readonly<{ snapshot: WorkSnapshot | null }> | null
  }>,
  cell: Readonly<{ namespace: string }>,
  execution: AgentExecutionId,
  control: string,
) {
  const unread = {
    owner: OWNER,
    record: `${book.tenantText}/${book.session}/participant/unread`,
    revision: '0',
    digest: 'unread',
  }
  const fact = (source: typeof unread, condition: { kind: 'ready' | 'changed' | 'unknown' }) => ({
    owner: 'session',
    protocol: {
      owner: '@omne-harness/session-contract',
      name: 'pa-02-terminal-participation',
      revision: '1',
      digest: 'session-log:pa-02',
    },
    source,
    version: source,
    condition,
    purpose: {
      owner: OWNER,
      record: `${cell.namespace}/participant/judge-cancellation`,
      revision: '0',
      digest: 'purpose',
    },
  })
  const snapshot = book.scratch?.snapshot ?? null
  if (snapshot === null) return fact(unread, { kind: 'unknown' })
  const judged = judgeCompletion(snapshot, execution)
  switch (judged.kind) {
    case 'allowed':
      return fact(unread, { kind: 'ready' })
    case 'blocked':
      return fact(unread, { kind: 'unknown' })
    case 'terminal':
      return fact(judged.terminal.evidence, { kind: 'changed' })
    case 'cancelled': {
      const matches = cancellationDriveOf(judged.terminal, execution) === control
      return fact(judged.terminal.evidence, { kind: matches ? 'ready' : 'changed' })
    }
  }
}
