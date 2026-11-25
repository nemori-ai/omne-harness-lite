import readEntryMessage from '../src/worker/read-entry-message.ts'
import { expect, it } from 'vitest'
import { readJsonText } from '@omne-harness/json-text'
import type { HistoryEntry } from '@omne-harness/session-contract'
import { evidence } from '@omne-harness/session-contract/testing'
import { maintainModelView } from '../src/worker/commit-write.ts'
import { readCompactionWindow } from '../src/worker/compaction-window.ts'
import checkCompactionInput from '../src/worker/check-compaction-input.ts'
import { blobDigest, canonicalText, encodeValue } from '../src/codec.ts'
import { modelViewPrefix } from '../src/model-view-identity.ts'
import { rowsOf } from '../src/worker/support.ts'
import { migratedPort } from './fixtures/sqlite-storage.ts'

function entry(id: string, kind: HistoryEntry['kind'], value: unknown): HistoryEntry {
  const payload = readJsonText(JSON.stringify(value), {
    maxBytes: 1000000,
    maxDepth: 100,
    maxItems: 10000,
    maxMembers: 10000,
    maxStringLength: 100000,
    maxNumberLength: 100,
  })
  if (payload.kind !== 'ok') throw new Error('invalid fixture payload')
  return {
    id: id as HistoryEntry['id'],
    revision: '1' as HistoryEntry['revision'],
    kind,
    payload: payload.value,
    origin: { owner: 'session', via: 'direct', source: evidence('fixture') },
    schema: { owner: 'session-contract', name: 'fixture', revision: '1', digest: 'fixture' },
  }
}

it('native SQLite projection and compaction input proof agree while the old epoch retains the original', () => {
  const { port, db } = migratedPort()
  try {
    const a = {
      kind: 'text',
      id: 'block_a',
      text: 'withdrawn A',
      visibility: { toModel: true, toHuman: true },
    }
    const b = { ...a, id: 'block_b', text: 'legal B' }
    const message = { id: 'msg_abcdefghijklmnopqrstuv', role: 'system_reminder', blocks: [a, b] }
    const oldEpoch = 'epoch:0'
    port.execute(
      'INSERT INTO sl_journal (tenant, session, tail, commit_seq, epoch) VALUES (?, ?, ?, ?, ?)',
      ['t', 's', 2n, 1n, oldEpoch],
    )
    port.execute('INSERT INTO sl_compaction_head VALUES (?, ?, ?, ?, ?, ?)', [
      't',
      's',
      2n,
      '1',
      '[]',
      null,
    ])
    maintainModelView(port, 't', 's', oldEpoch, [
      entry('1', 'message.user', { message: { ...message, role: 'user', blocks: [b] } }),
      entry('2', 'message.system_reminder', {
        message,
        provenance: [
          { owner: 'author', key: 'A', blocks: ['block_a'] },
          { owner: 'author', key: 'B', blocks: ['block_b'] },
        ],
      }),
    ])
    const next = maintainModelView(port, 't', 's', oldEpoch, [
      entry('3', 'session.model-projected', {
        epoch: modelViewPrefix('t', 's') + oldEpoch,
        blocks: ['block_a'],
        source: evidence('narrowing'),
      }),
    ])
    expect(next).toBe('epoch:3')
    port.execute('UPDATE sl_journal SET tail = 3, epoch = ? WHERE tenant = ? AND session = ?', [
      next,
      't',
      's',
    ])
    port.execute('UPDATE sl_compaction_head SET covered = 3 WHERE tenant = ? AND session = ?', [
      't',
      's',
    ])
    const rows = rowsOf(
      port,
      'SELECT seq,entry,bytes,prefix_digest,message FROM sl_model_view WHERE tenant = ? AND session = ? AND epoch = ? ORDER BY seq',
      ['t', 's', next],
    )
    expect(JSON.stringify(rows.map(row => row.message))).not.toContain('withdrawn A')
    expect(JSON.stringify(rows.map(row => row.message))).toContain('legal B')
    const frozen = (epoch: string) =>
      readEntryMessage.read(
        encodeValue({
          tenant: 't',
          session: 's',
          entry: '2',
          epoch: null,
          frozenEpoch: modelViewPrefix('t', 's') + epoch,
        }),
        port,
      )
    expect(frozen(next!)).toMatchObject({
      kind: 'read',
      output: { kind: 'message', message: { blocks: [b] } },
    })
    expect(frozen(oldEpoch)).toMatchObject({
      kind: 'read',
      output: { kind: 'message', message: { blocks: [a, b] } },
    })
    const old = port.execute('SELECT message FROM sl_model_view WHERE epoch = ? ORDER BY seq', [
      oldEpoch,
    ]).rows
    expect(JSON.stringify(old)).toContain('withdrawn A')
    const window = readCompactionWindow(port, {
      tenant: 't',
      session: 's',
      epoch: next!,
      upper: null,
      coverTo: null,
    })
    if (window.kind !== 'context') throw new Error(JSON.stringify(window))
    expect(JSON.stringify(window)).not.toContain('withdrawn A')
    const viewMessages = new Map(
      [...window.value.covered, ...window.value.after]
        .filter(row => row.message !== null)
        .map(row => [String(row.ref), row.message]),
    )
    const history = {
      epoch: modelViewPrefix('t', 's') + next,
      origin: window.value.origin,
      upper: window.value.covered.at(-1)!.ref,
      base: window.value.base,
      logOrder: [...window.value.covered, ...window.value.after].map(row => row.ref),
      barriers: [],
      protected: [],
      entries: rows.map(row => ({
        ref: String(row.entry),
        sequence: String(BigInt(String(row.seq)) - 1n),
        message: blobDigest(canonicalText(viewMessages.get(String(row.entry)))),
      })),
    }
    const input = encodeValue({ tenant: 't', session: 's', history })
    expect(checkCompactionInput.read(input, port)).toEqual({
      kind: 'read',
      output: { kind: 'verified' },
    })
    history.entries[1]!.message = blobDigest(canonicalText(message))
    const wrong = encodeValue({ tenant: 't', session: 's', history })
    expect(checkCompactionInput.read(wrong, port)).toMatchObject({
      kind: 'read',
      output: { kind: 'invalid' },
    })
    const summary = {
      ...message,
      id: 'msg_bcdefghijklmnopqrstuvw',
      role: 'compaction',
      covers: { from: '1', to: '2' },
      retained: [],
      derivation: evidence('summary'),
      blocks: [{ ...b, id: 'summary', text: 'legal B summary' }],
    }
    const summaryEpoch = maintainModelView(port, 't', 's', next!, [
      entry('4', 'message.compaction', { message: summary }),
    ])
    const inherited = rowsOf(
      port,
      'SELECT provenance FROM sl_model_provenance WHERE tenant = ? AND session = ? AND epoch = ? AND entry = ?',
      ['t', 's', summaryEpoch, '4'],
    )
    expect(JSON.parse(String(inherited[0]?.provenance))).toEqual([
      { owner: 'author', key: 'B', blocks: ['summary'] },
    ])
  } finally {
    db.close()
  }
})
