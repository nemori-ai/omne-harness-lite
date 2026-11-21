import { expect, it } from 'vitest'
import type { HistoryEntry, ModelViewRow } from '@omne-harness/session-contract'
import { forkPointRead } from '../src/testing/session-values.ts'

// The memory session answers the fork point as the storage does: before its latest assistant message.

const row = (seq: number, role: string) =>
  ({ seq: String(seq), entry: String(seq * 10), message: { role } }) as unknown as ModelViewRow
const held = (roles: readonly string[]) => ({
  ok: {
    modelView: { epoch: 'epoch:0', rows: roles.map((role, index) => row(index + 1, role)) },
    entries: roles.map((_, index) => ({ id: String((index + 1) * 10) }) as HistoryEntry),
  },
})
const key = { ok: 'view/t/s' }

it('names the rows before the latest assistant message, at the last entry of the session', () => {
  expect(forkPointRead(held(['user', 'assistant', 'tool', 'assistant']), key)).toEqual({
    ok: { kind: 'point', point: { epoch: 'view/t/s/epoch:0', upper: '3', position: '40' } },
  })
})

it('has no point while the session wrote no assistant message, or nothing before the first one', () => {
  expect(forkPointRead(held(['user', 'user']), key)).toEqual({ ok: { kind: 'none' } })
  expect(forkPointRead(held(['assistant']), key)).toEqual({ ok: { kind: 'none' } })
  expect(forkPointRead(held([]), key)).toEqual({ ok: { kind: 'none' } })
})

it('hands on the failure of the store or of the key', () => {
  const gone = { failure: { kind: 'not-found' } } as never
  expect(forkPointRead(gone, key)).toEqual(gone)
  expect(forkPointRead(held(['user']), gone)).toEqual(gone)
})
