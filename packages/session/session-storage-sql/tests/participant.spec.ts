// The participant module's own judgments that the port cannot reach through a commit: an answer
// it cannot build is a reported failure, never a throw.
import { describe, expect, it } from 'vitest'
import {
  type CommitReceipt,
  type HistoryEntry,
  type SessionCommand,
  type WorkSnapshot,
} from '@omne-harness/session-contract'
import { encodeValue } from '../src/codec.ts'
import { readHistory } from '../src/worker/history-index.ts'
import { initializationReceipts, maintainModelView, resultOf } from '../src/worker/participant.ts'
import { migratedPort } from './fixtures/sqlite-storage.ts'

const receipt = {
  operation: 'op',
  revision: '2',
  first: '3',
  last: '3',
} as unknown as CommitReceipt
const withoutControls = { controls: [] } as unknown as WorkSnapshot

describe('the result of a committed control command', () => {
  for (const kind of ['cancelRun', 'stopCall'] as const)
    it(`${kind} without a control progress item answers no result instead of throwing`, () => {
      const command = { kind, input: { operation: 'op' } } as unknown as SessionCommand
      let result: unknown
      expect(() => {
        result = resultOf(command, withoutControls, receipt)
      }).not.toThrow()
      expect(result).toBeNull()
    })
})

/** The json-text tree that the Session entries store their payloads as (read back by plainOf). */
function tree(value: unknown): unknown {
  if (value === null) return { kind: 'null' }
  if (typeof value === 'string') return { kind: 'string', value }
  if (typeof value === 'boolean') return { kind: 'boolean', value }
  if (typeof value === 'number') return { kind: 'number', lexeme: String(value) }
  if (Array.isArray(value)) return { kind: 'array', items: value.map(tree) }
  return {
    kind: 'object',
    entries: Object.entries(value as object).map(([key, member]) => ({ key, value: tree(member) })),
  }
}

// N2: a bounded read inside the commit that reaches its bound answers unavailable; it never goes on
// with the rows it happened to read. The bound is lowered per call here; production keeps its own.
describe('a bounded read inside the commit', () => {
  const LIMIT = 2

  function routed(rows: number) {
    const { port } = migratedPort()
    for (let i = 1; i <= rows; i += 1) {
      const entry = {
        id: String(i),
        revision: '1',
        kind: 'intake.routed',
        payload: tree({ input: `in-${i}` }),
      }
      port.execute(
        'INSERT INTO sl_entry (tenant, session, position, revision, kind, entry, bytes) VALUES (?, ?, ?, ?, ?, ?, ?)',
        ['t', 's', BigInt(i), 1n, 'intake.routed', JSON.stringify(encodeValue(entry)), 1n],
      )
    }
    return port
  }
  const snapshot = { tenant: 't', session: 's', revision: '1' } as unknown as WorkSnapshot
  const scope = { kind: 'pending', inputs: [] } as const

  it('the history index with exactly the bound of rows lists every routed input', () => {
    const history = readHistory(routed(LIMIT), 't', 's', snapshot, scope, LIMIT)
    expect(history).not.toBe('too-many')
    expect(history === 'too-many' ? [] : history.index.inputs.map(item => item.input)).toEqual([
      'in-1',
      'in-2',
    ])
  })

  it('the history index over the bound is too-many, not the first rows', () => {
    expect(readHistory(routed(LIMIT + 1), 't', 's', snapshot, scope, LIMIT)).toBe('too-many')
  })

  function receipts(rows: number) {
    const { port } = migratedPort()
    for (let i = 1; i <= rows; i += 1)
      port.execute(
        'INSERT INTO sl_operation (tenant, session, operation, input_digest, form, revision, receipt, result) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [
          't',
          's',
          `op-${i}`,
          'd',
          'batch',
          BigInt(i),
          JSON.stringify({ operation: `op-${i}` }),
          '{}',
        ],
      )
    return port
  }

  it('the operation receipts with exactly the bound of rows are all read', () => {
    expect(initializationReceipts(receipts(LIMIT), 't', 's', LIMIT)?.length).toBe(LIMIT)
  })

  it('the operation receipts over the bound are null (unavailable), not the first receipts', () => {
    expect(initializationReceipts(receipts(LIMIT + 1), 't', 's', LIMIT)).toBeNull()
  })

  function view(rows: number) {
    const { port } = migratedPort()
    for (let i = 1; i <= rows; i += 1)
      port.execute(
        'INSERT INTO sl_model_view (tenant, session, epoch, seq, entry, bytes, prefix_digest, message) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        ['t', 's', 'epoch:0', BigInt(i), String(i), 1n, 'p', JSON.stringify({ role: 'user' })],
      )
    return port
  }
  const compaction = {
    id: String(LIMIT + 2),
    revision: '2',
    kind: 'message.compaction',
    payload: tree({
      message: {
        role: 'compaction',
        blocks: [{ visibility: { toModel: true } }],
        covers: { to: '0' },
        retained: [],
      },
    }),
  } as unknown as HistoryEntry
  const epochRows = (port: ReturnType<typeof view>, epoch: string): number =>
    port.execute('SELECT seq FROM sl_model_view WHERE epoch = ? LIMIT 100', [epoch]).rows.length

  it('a compaction over exactly the bound of view rows carries every row into the new epoch', () => {
    const port = view(LIMIT)
    const epoch = maintainModelView(port as never, 't', 's', 'epoch:0', [compaction], LIMIT)
    expect(epoch).toBe(`epoch:${compaction.id}`)
    expect(epochRows(port, `epoch:${compaction.id}`)).toBe(LIMIT + 1)
  })

  it('a compaction over more view rows than the bound is null (unavailable), not a shorter epoch', () => {
    expect(
      maintainModelView(view(LIMIT + 1) as never, 't', 's', 'epoch:0', [compaction], LIMIT),
    ).toBeNull()
  })
})
