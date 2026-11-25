import { expect, it } from 'vitest'
import { readJsonText } from '@omne-harness/json-text'
import type { HistoryEntry } from '../src/faces.ts'
import { originalModelRows } from '../src/model-originals.ts'
import { evidence } from '../src/testing.ts'

function entry(id: number, kind: string, fields: object): HistoryEntry {
  const payload = readJsonText(JSON.stringify(fields), {
    maxBytes: 8192,
    maxStringLength: 2048,
    maxMembers: 128,
    maxItems: 128,
    maxDepth: 16,
    maxNumberLength: 32,
  })
  if (payload.kind !== 'ok') throw new Error('invalid fixture')
  return {
    id: String(id) as HistoryEntry['id'],
    revision: '1' as HistoryEntry['revision'],
    kind,
    payload: payload.value,
    schema: { owner: 'fixture', name: 'entry', revision: '1', digest: 'fixture' },
    origin: { owner: 'session', via: 'direct', source: evidence('fixture') },
  }
}
function message(id: number, role: string, text: string) {
  return entry(id, 'message.' + role, {
    message: {
      id: 'msg_' + id,
      role,
      blocks: [{ id: text, kind: 'text', text, visibility: { toModel: true, toHuman: true } }],
    },
  })
}

it('recovers model-visible originals in log order across summaries and withdrawals, preserving same-named user content', () => {
  const log = [
    message(1, 'user', 'intake copy'),
    entry(2, 'intake.routed', {}),
    message(4, 'user', 'public task'),
    entry(7, 'intake.routed', {}),
    message(8, 'system_reminder', 'privateA'),
    message(9, 'assistant', 'public result'),
    message(10, 'compaction', 'mixed summary'),
    entry(11, 'session.model-projected', { blocks: ['privateA'] }),
    message(12, 'system_reminder', 'privateA'),
    message(13, 'user', 'privateA'),
    message(14, 'tool_internal', 'hidden'),
    message(15, 'compaction', 'mixed again'),
  ]
  expect(originalModelRows([], log, new Set(['privateA'])).map(row => row.entry)).toEqual([
    '4',
    '9',
    '13',
  ])
  expect(originalModelRows([], log, new Set()).map(row => row.entry)).toEqual([
    '4',
    '9',
    '12',
    '13',
  ])
})
