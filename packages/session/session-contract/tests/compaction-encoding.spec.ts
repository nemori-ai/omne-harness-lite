import { expect, it } from 'vitest'
import { judgeMessage } from '@omne-harness/message'
import { encodeEntry, toJsonValue } from '../src/entries.ts'
import { canonicalText } from '../src/operations.ts'
import { evidence } from '../src/testing.ts'

it('gives adopted compaction messages one canonical envelope encoding without changing message values', () => {
  const judged = judgeMessage({
    id: 'msg_abcdefghijklmnopqrstuv',
    role: 'compaction',
    blocks: [
      {
        kind: 'text',
        id: 'summary',
        text: 'unchanged',
        visibility: { toHuman: true, toModel: true },
      },
    ],
    covers: { from: '1', to: '3' },
    retained: [],
    derivation: evidence('service'),
  })
  if (!('ok' in judged) || judged.ok.role !== 'compaction') throw new Error('invalid fixture')
  const encoded = encodeEntry(
    {
      kind: 'message.compaction',
      message: judged.ok,
      source: evidence('source'),
      admission: evidence('admission'),
      consumption: null,
      participation: null,
    },
    { owner: 'session', via: null, source: evidence('origin') },
  )
  if (encoded.payload.kind !== 'object') throw new Error('expected object')
  const stored = encoded.payload.entries.find(item => item.key === 'message')?.value
  expect(stored).toEqual(toJsonValue(JSON.parse(canonicalText(judged.ok))))
})
