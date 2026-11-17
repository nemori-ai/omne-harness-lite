import { expect, it } from 'vitest'
import { blobDigest, canonicalText } from '../src/codec.ts'
import { readEntryText } from '../src/entry-codec.ts'
import { maintainModelView } from '../src/worker/commit-write.ts'
import { readSharedEntry, sharedEntryText } from '../src/worker/shared-messages.ts'
import { storeSharedBlob } from '../src/worker/shared-blobs.ts'
import { migratedPort } from './fixtures/sqlite-storage.ts'

const message = {
  role: 'compaction',
  id: 'msg_abcdefghijklmnopqrstuv',
  blocks: [
    {
      kind: 'text',
      id: 'summary',
      text: 'one retained body',
      visibility: { toModel: true, toHuman: true },
    },
  ],
  covers: { from: '1', to: '2' },
  retained: [],
  derivation: { owner: 'service', record: 'task', revision: '1', digest: 'result' },
}
const entry = readEntryText(
  JSON.stringify({
    id: '4',
    revision: '3',
    kind: 'message.compaction',
    body: { message: JSON.parse(canonicalText(message)) },
  }),
)

it('uses the same custody body in the adopted log entry and current model view', () => {
  const { port } = migratedPort()
  const payload = canonicalText({ outcome: { kind: 'completed', message } })
  storeSharedBlob(port, 'tenant', {
    digest: blobDigest(payload),
    media: 'application/json',
    payload,
  })
  const stored = sharedEntryText(port, 'tenant', entry)
  expect(stored).not.toContain('one retained body')
  expect(readSharedEntry(port, 'tenant', stored)).toEqual(entry)
  expect(maintainModelView(port, 'tenant', 'session', 'initial', [entry])).toBe('epoch:4')
  const rows = port.execute('SELECT message FROM sl_model_view').rows
  expect(rows).toEqual([[blobDigest(canonicalText(message))]])
  expect(port.execute('SELECT COUNT(*) FROM sl_blob').rows).toEqual([[2n]])
})

it('refuses adoption when the complete received body has not been retained', () => {
  const { port } = migratedPort()
  expect(() => sharedEntryText(port, 'tenant', entry)).toThrow('durable custody')
})
