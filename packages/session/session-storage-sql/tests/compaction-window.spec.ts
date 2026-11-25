import { expect, it } from 'vitest'
import { readCompactionWindow } from '../src/worker/compaction-window.ts'
import { migratedPort } from './fixtures/sqlite-storage.ts'

const text = (role: string, content: string) => ({
  id: 'msg_abcdefghijklmnopqrstuv',
  role,
  blocks: [
    { kind: 'text', id: 'text', text: content, visibility: { toModel: true, toHuman: true } },
  ],
})
function scene() {
  const { port, db } = migratedPort()
  port.execute(
    'INSERT INTO sl_journal (tenant, session, tail, commit_seq, epoch) VALUES (?, ?, ?, ?, ?)',
    ['t', 's', 10n, 1n, 'epoch:8'],
  )
  port.execute('INSERT INTO sl_compaction_head VALUES (?, ?, ?, ?, ?, ?)', [
    't',
    's',
    10n,
    '1',
    '["7"]',
    null,
  ])
  const summary = {
    ...text('compaction', 'summary'),
    covers: { from: '1', to: '5' },
    retained: [],
    derivation: { owner: 'provider', record: 'one', revision: '1', digest: 'proof' },
  }
  const messages = [
    [1n, '8', summary],
    [2n, '6', text('user', 'earlier tail')],
    [
      3n,
      '10',
      {
        ...text('tool', 'result'),
        blocks: [
          {
            kind: 'tool_result',
            id: 'result',
            callId: 'k',
            visibility: { toModel: true, toHuman: true },
          },
          ...text('tool', 'result').blocks,
        ],
      },
    ],
  ] as const
  for (const [seq, entry, message] of messages)
    port.execute(
      'INSERT INTO sl_model_view (tenant, session, epoch, seq, entry, bytes, prefix_digest, message) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      ['t', 's', 'epoch:8', seq, entry, 1n, 'digest', JSON.stringify(message)],
    )
  port.execute('INSERT INTO sl_message_pairing VALUES (?, ?, ?, ?)', ['t', 's', '10', '2'])
  return {
    port,
    db,
    input: { tenant: 't', session: 's', epoch: 'epoch:8', upper: '3', coverTo: '8' },
  }
}

it('uses log order and original pairings while preserving invisible current work as a barrier', () => {
  const s = scene()
  try {
    const read = readCompactionWindow(s.port, s.input)
    expect(read).toMatchObject({
      kind: 'context',
      value: {
        origin: '1',
        base: { kind: 'previous', record: '8', pairings: [{ result: '10', call: '2' }] },
        covered: [{ ref: '6' }, { ref: '7', message: null }, { ref: '8' }],
        after: [{ ref: '10' }],
        open: ['7'],
      },
    })
  } finally {
    s.db.close()
  }
})

it('refuses missing pairing evidence or an index behind the authoritative log', () => {
  const s = scene()
  try {
    s.port.execute('DELETE FROM sl_message_pairing', [])
    expect(readCompactionWindow(s.port, s.input)).toEqual({ kind: 'behind' })
    s.port.execute('UPDATE sl_compaction_head SET covered = 9', [])
    expect(readCompactionWindow(s.port, s.input)).toEqual({ kind: 'behind' })
  } finally {
    s.db.close()
  }
})

it('lets the history owner select the last log position, independently of model presentation order', () => {
  const s = scene()
  try {
    const answer = readCompactionWindow(s.port, { ...s.input, upper: '2', coverTo: null })
    expect(answer).toMatchObject({
      kind: 'context',
      value: {
        covered: [{ ref: '6' }, { ref: '7', message: null }, { ref: '8' }],
        after: [],
      },
    })
  } finally {
    s.db.close()
  }
})

it('accepts an own journal fact as a commit boundary without disclosing hidden messages', () => {
  const s = scene()
  try {
    const commit = { ...s.input, upper: null, coverTo: '9' }
    const add = (owner: string, kind: string) =>
      s.port.execute('INSERT INTO sl_entry VALUES (?, ?, ?, ?, ?, ?, ?)', [
        't',
        owner,
        9n,
        1n,
        kind,
        new Uint8Array(),
        0n,
      ])
    add('another-session', 'call.result-processed')
    expect(readCompactionWindow(s.port, commit)).toEqual({ kind: 'invalid-bounds' })
    add('s', 'message.system_reminder')
    expect(readCompactionWindow(s.port, commit)).toEqual({ kind: 'invalid-bounds' })
    s.port.execute("UPDATE sl_entry SET kind = 'call.result-processed' WHERE session = 's'", [])
    expect(readCompactionWindow(s.port, commit)).toMatchObject({
      kind: 'context',
      value: {
        covered: [{ ref: '6' }, { ref: '7' }, { ref: '8' }, { ref: '9', message: null }],
        after: [{ ref: '10' }],
      },
    })
    expect(readCompactionWindow(s.port, { ...commit, upper: '2' })).toEqual({
      kind: 'invalid-bounds',
    })
  } finally {
    s.db.close()
  }
})
