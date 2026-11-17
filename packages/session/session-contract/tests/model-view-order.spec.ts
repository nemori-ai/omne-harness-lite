import { expect, it } from 'vitest'
import { judgeMessage, type Message } from '@omne-harness/message'
import { encodeEntry } from '../src/entries.ts'
import { materializeModelView } from '../src/model-view.ts'
import { evidence } from '../src/testing.ts'
import type { EntryId, SessionRevision } from '../src/identity.ts'
import type { HistoryEntry } from '../src/faces.ts'

const message = (value: unknown): Message => {
  const result = judgeMessage(value)
  if (!('ok' in result)) throw new Error('invalid fixture message')
  return result.ok
}
const blocks = (text: string) => [
  { kind: 'text', id: 'text', text, visibility: { toHuman: true, toModel: true } },
]
function entry(id: string, value: Message): HistoryEntry {
  return {
    ...encodeEntry(
      {
        kind: `message.${value.role}`,
        message: value,
        source: evidence(id),
        admission: evidence(id),
        consumption: null,
        participation: null,
      },
      { owner: 'session', via: null, source: evidence(id) },
    ),
    id: id as EntryId,
    revision: id as SessionRevision,
  }
}

it('retains legal log order when the prior summary precedes an older tail in model order', () => {
  const original = entry(
    '1',
    message({ id: 'msg_abcdefghijklmnopqrstuv', role: 'user', blocks: blocks('first') }),
  )
  const tail = entry(
    '2',
    message({ id: 'msg_abcdefghijklmnopqrstuv', role: 'user', blocks: blocks('late tail') }),
  )
  const first = entry(
    '3',
    message({
      id: 'msg_abcdefghijklmnopqrstuv',
      role: 'compaction',
      blocks: blocks('summary'),
      covers: { from: '1', to: '1' },
      retained: [],
      derivation: evidence('first'),
    }),
  )
  const history = [original, tail, first]
  const view = materializeModelView({ epoch: 'initial', rows: [] }, history, history)
  expect(view.rows.map(row => row.entry)).toEqual(['3', '2'])
  const second = entry(
    '4',
    message({
      id: 'msg_abcdefghijklmnopqrstuv',
      role: 'compaction',
      blocks: blocks('next'),
      covers: { from: '1', to: '3' },
      retained: ['2', '3'],
      derivation: evidence('second'),
    }),
  )
  expect(
    materializeModelView(view, [second], [...history, second]).rows.map(row => row.entry),
  ).toEqual(['2', '3', '4'])
})
