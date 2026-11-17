import type { AdvanceRef, WorkSnapshot } from '@omne-harness/session-contract'
import { decodeValue } from '../codec.ts'
import { decodeSessionCurrentAdvance, type SessionCurrentAdvance } from '../current-advance.ts'
import { readMember } from './state-rows.ts'
import { big, oneRow, text, type Executor, type Scope } from './support.ts'

type AdvanceState =
  | Readonly<{ kind: 'absent' | 'behind' | 'none' }>
  | Readonly<{ kind: 'advance'; value: SessionCurrentAdvance; current: AdvanceRef }>

export function readAdvanceState(port: Executor, scope: Scope): AdvanceState {
  const key = [scope.tenant, scope.session]
  const state = oneRow(
    port,
    `SELECT s.snapshot, s.covered, j.tail FROM sl_journal j LEFT JOIN sl_state s
      ON s.tenant = j.tenant AND s.session = j.session
      WHERE j.tenant = ? AND j.session = ? LIMIT 1`,
    key,
  )
  if (state === undefined) return { kind: 'absent' }
  if (state['snapshot'] === null || big(state['covered']) !== big(state['tail']))
    return { kind: 'behind' }
  const held = readMember(port, scope.tenant, scope.session, text(state['snapshot']), 'run')
  if (held === undefined) throw new Error('missing current Run')
  const run = decodeValue(held) as WorkSnapshot['run']
  if (run.kind === 'none' || run.kind === 'terminal') return { kind: 'none' }
  if (run.kind !== 'active') throw new Error('invalid current Run')
  if (run.advance === null) return { kind: 'none' }
  const row = oneRow(
    port,
    'SELECT grant FROM sl_attempt_grant WHERE tenant = ? AND session = ? AND attempt = ? LIMIT 1',
    [...key, run.advance.attempt],
  )
  if (row === undefined) throw new Error('missing original grant of the current advance')
  const value = decodeSessionCurrentAdvance({
    kind: 'advance',
    value: {
      execution: run.execution.execution,
      attempt: run.advance.attempt,
      grant: JSON.parse(text(row['grant'])),
    },
  })
  if (value.kind !== 'advance') throw new Error('current advance expected')
  return { ...value, current: run.advance }
}
