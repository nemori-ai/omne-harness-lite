import { describe, expect, it } from 'vitest'
import {
  decide,
  reduce,
  type Decision,
  type HistoryEntry,
  type SessionCommand,
  type WorkSnapshot,
} from '@omne-harness/session-contract'
import { evidence, operationId, succeeded } from '@omne-harness/session-contract/testing'
import { encodeEntry } from '../src/entries.ts'
import { open } from './scene.ts'

function batch(snapshot: WorkSnapshot, decision: Decision) {
  if (decision.kind !== 'entries') throw new Error(JSON.stringify(decision))
  const revision = String(BigInt(snapshot.revision) + 1n) as WorkSnapshot['revision']
  return {
    revision,
    entries: decision.entries.map((row, index) => ({
      ...row,
      revision,
      id: `release-${revision}-${index}` as HistoryEntry['id'],
    })),
  }
}

describe('every frozen terminal release gate', () => {
  it.each(['cancel', 'finish', 'archive'] as const)(
    '%s needs complete original material and one complete final release',
    async kind => {
      const s = await open()
      await s.accept('second')
      succeeded(
        await s.commit({
          kind: 'freeze',
          input: {
            ...s.base,
            operation: operationId('freeze'),
            verdict: { cause: 'tool-shape-lost', evidence: evidence('freeze') },
          },
        }),
        'freeze',
      )
      const { snapshot, run } = await s.active()
      const command: SessionCommand =
        kind === 'finish'
          ? {
              kind: 'finishRun',
              input: {
                ...s.base,
                operation: operationId(kind),
                run: run.run,
                expected: snapshot.revision,
                bounded: { kind: 'uninterpretable', evidence: evidence('bounded') },
              },
            }
          : {
              kind: 'control',
              input: {
                ...s.base,
                operation: operationId(kind),
                intent:
                  kind === 'cancel'
                    ? { kind: 'cancel-run', run: run.run, urgency: 'force' }
                    : { kind: 'archive' },
              },
            }
      const { historyIndex: _history, ...missing } = snapshot
      expect(decide(missing, command, [], null, { compaction: null })).toMatchObject({
        kind: 'rejected',
        failure: { kind: 'unavailable' },
      })
      const original = batch(snapshot, decide(snapshot, command, [], null, { compaction: null }))
      expect(reduce(snapshot, original)).toMatchObject({
        kind: 'reduced',
        snapshot: { pending: [] },
      })
      expect(
        reduce(snapshot, {
          ...original,
          entries: original.entries.filter(row => row.kind !== 'intake.released'),
        }),
      ).toMatchObject({ kind: 'quarantined' })
      const partial = original.entries.map(row =>
        row.kind === 'intake.released'
          ? { ...row, ...encodeEntry({ kind: 'intake.released', inputs: [run.first] }, row.origin) }
          : row,
      )
      expect(reduce(snapshot, { ...original, entries: partial })).toMatchObject({
        kind: 'quarantined',
      })
      expect(snapshot.pending).toEqual(['first', 'second'])
    },
  )
  it('active freeze and ordinary cancellation do not acquire an SE38 preparation requirement', async () => {
    const s = await open()
    const { snapshot, run } = await s.active()
    const { historyIndex: _history, ...withoutHistory } = snapshot
    const freeze: SessionCommand = {
      kind: 'freeze',
      input: {
        ...s.base,
        operation: operationId('freeze'),
        verdict: { cause: 'tool-shape-lost', evidence: evidence('freeze') },
      },
    }
    const cancel: SessionCommand = {
      kind: 'control',
      input: {
        ...s.base,
        operation: operationId('cancel'),
        intent: { kind: 'cancel-run', run: run.run, urgency: 'force' },
      },
    }
    for (const command of [freeze, cancel]) {
      const original = batch(
        withoutHistory,
        decide(withoutHistory, command, [], null, { compaction: null }),
      )
      expect(original.entries.some(row => row.kind === 'intake.released')).toBe(false)
      expect(reduce(withoutHistory, original).kind).toBe('reduced')
    }
  })
})
