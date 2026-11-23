import { expect, it } from 'vitest'
import type { HistoryEntry, ModelViewRow } from '@omne-harness/session-contract'
import { forkPointRead } from '../src/testing/session-values.ts'

// The memory session answers the fork point as the storage does: before the asking message.

const id = (seq: number) => `msg_row_${seq}`
const row = (seq: number, role: string) =>
  ({
    seq: String(seq),
    entry: String(seq * 10),
    message: { id: id(seq), role },
  }) as unknown as ModelViewRow
const held = (roles: readonly string[]) => ({
  ok: {
    modelView: { epoch: 'epoch:0', rows: roles.map((role, index) => row(index + 1, role)) },
    entries: roles.map((_, index) => ({ id: String((index + 1) * 10) }) as HistoryEntry),
  },
})
const key = { ok: 'view/t/s' }

it('names the rows before the asking message, at the last entry of the session, whatever came after it', () => {
  const roles = ['user', 'assistant', 'tool', 'assistant']
  expect(forkPointRead(held(roles), key, id(4))).toEqual({
    ok: { kind: 'point', point: { epoch: 'view/t/s/epoch:0', upper: '3', position: '40' } },
  })
  expect(forkPointRead(held(roles), key, id(2))).toEqual({
    ok: { kind: 'point', point: { epoch: 'view/t/s/epoch:0', upper: '1', position: '40' } },
  })
})

it('has no point where the asking message is no assistant message of the session, or opens it', () => {
  expect(forkPointRead(held(['user', 'user']), key, id(2))).toEqual({ ok: { kind: 'none' } })
  expect(forkPointRead(held(['assistant']), key, id(1))).toEqual({ ok: { kind: 'none' } })
  expect(forkPointRead(held(['user', 'assistant']), key, 'msg_never')).toEqual({
    ok: { kind: 'none' },
  })
  expect(forkPointRead(held([]), key, id(1))).toEqual({ ok: { kind: 'none' } })
})

it('hands on the failure of the store or of the key', () => {
  const gone = { failure: { kind: 'not-found' } } as never
  expect(forkPointRead(gone, key, id(1))).toEqual(gone)
  expect(forkPointRead(held(['user']), gone, id(1))).toEqual(gone)
})
