import { describe, expect, it } from 'vitest'
import {
  cancellationDriveOf,
  deriveDriveOperation,
  runCancelledBy,
  type RunTerminal,
} from '@omne-harness/session-contract'
import { operationId, succeeded } from '@omne-harness/session-contract/testing'
import { open } from './scene.ts'

async function cancelledBy(control: 'cancel-run' | 'archive') {
  const s = await open()
  const { run } = await s.active()
  const operation = operationId(`the-${control}`)
  succeeded(
    await s.commit({
      kind: 'control',
      input: {
        ...s.base,
        operation,
        intent:
          control === 'archive'
            ? { kind: 'archive' }
            : { kind: 'cancel-run', run: run.run, urgency: 'force' },
      },
    }),
    control,
  )
  const snapshot = await s.read()
  if (snapshot.run.kind !== 'terminal') throw new Error(`the Run is ${snapshot.run.kind}`)
  return { snapshot, terminal: snapshot.run.terminal, operation, run: run.run }
}

describe('the control behind a cancelled Run', () => {
  it.each(['cancel-run', 'archive'] as const)(
    'a Run that %s ended names that control, and no other',
    async control => {
      const { snapshot, terminal, operation, run } = await cancelledBy(control)
      expect(terminal.outcome).toBe('cancelled')
      expect(cancellationDriveOf(terminal, 'execution-1')).toBe(
        deriveDriveOperation({ kind: 'control', execution: 'execution-1', control: operation }),
      )
      expect(runCancelledBy(snapshot, operation)).toBe(run)
      expect(runCancelledBy(snapshot, operationId('another'))).toBeNull()
    },
  )

  it('a terminal no control wrote names none', async () => {
    const { terminal } = await cancelledBy('cancel-run')
    const cases: Record<string, RunTerminal> = {
      'a Run that completed': { ...terminal, outcome: 'completed' },
      'a Run that failed': { ...terminal, outcome: 'failed' },
      'evidence of another kind of command': {
        ...terminal,
        evidence: {
          ...terminal.evidence,
          record: terminal.evidence.record.replace(/control$/u, 'freeze'),
        },
      },
      'evidence whose digest is not the one of that control': {
        ...terminal,
        evidence: { ...terminal.evidence, digest: 'sha256:other' },
      },
      'evidence of another owner': {
        ...terminal,
        evidence: { ...terminal.evidence, owner: 'another' },
      },
      'evidence of another revision': {
        ...terminal,
        evidence: { ...terminal.evidence, revision: '2' },
      },
    }
    for (const [name, value] of Object.entries(cases))
      expect(cancellationDriveOf(value, 'execution-1'), name).toBeNull()
  })
})
