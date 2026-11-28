import assert from 'node:assert/strict'
import type { MediaIndex, MediaRow, NewRow, Staging } from '../ports.ts'
import { representationHolder, type Representation } from '../representation.ts'
import type { Holder, Provenance } from '../values.ts'

export type IndexConformanceCase = Readonly<{
  name: string
  run(create: () => Promise<MediaIndex>): Promise<void>
}>

const T1 = 'tenant-one'
const T2 = 'tenant-two'
const LATER = '2026-10-19T01:00:00.000Z'
const NOW = '2026-10-19T00:30:00.000Z'
const EARLIER = '2026-10-19T00:10:00.000Z'
const key = (letter: string): string => letter.repeat(32)
const holder = (work: string): Holder => ({
  owner: 'session',
  work,
  position: '1',
  purpose: 'input',
})

function ok<T>(reply: { ok: T } | { failure: unknown }): T {
  if ('failure' in reply) assert.fail(`expected ok, got ${JSON.stringify(reply.failure)}`)
  return reply.ok
}
function failure(reply: { ok: unknown } | { failure: { kind: string } }): string {
  if ('ok' in reply) assert.fail('expected a failure')
  return reply.failure.kind
}
const uploading = (
  letter: string,
  tenant = T1,
  upload: string | null = `up-${letter}`,
  expiresAt = LATER,
): NewRow => ({
  key: key(letter),
  tenant,
  storage: 'memory',
  mediaType: 'image/png',
  bytes: 10,
  upload,
  expiresAt,
})
const staging = (letter: string, tenant = T1, extra: Partial<Staging> = {}): Staging => ({
  key: key(letter),
  tenant,
  mediaType: 'image/png',
  bytes: 10,
  digest: 'sha256:same',
  facts: { kind: 'image', widthPixels: 2, heightPixels: 3 },
  expiresAt: LATER,
  holder: null,
  ...extra,
})
async function staged(
  index: MediaIndex,
  letter: string,
  tenant = T1,
  extra: Partial<Staging> = {},
) {
  ok(await index.insertUploading(uploading(letter, tenant)))
  return ok(await index.stageOrMerge(staging(letter, tenant, extra)))
}
const definition = (revision: string): Provenance => ({ name: 'voice', revision })
const ENGINE: Provenance = { name: 'fixture.engine', revision: '1' }
const converted = (revision: string, text: string): Representation => ({
  definition: definition(revision),
  engine: ENGINE,
  outcome: 'converted',
  text,
  others: [],
})
const states = async (index: MediaIndex, tenant = T1): Promise<string[]> =>
  ok(await index.listDeleting(tenant, 10)).map((row: MediaRow) => row.key)

export const mediaIndexConformanceCases: readonly IndexConformanceCase[] = [
  {
    name: 'an inserted row is read by its upload, uploading and with no progress',
    async run(create) {
      const index = await create()
      ok(await index.insertUploading(uploading('a')))
      assert.deepEqual(ok(await index.readUpload(T1, 'up-a')), {
        key: key('a'),
        tenant: T1,
        storage: 'memory',
        state: 'uploading',
        mediaType: 'image/png',
        bytes: 10,
        digest: null,
        facts: null,
        write: null,
        nextSequence: 0,
        received: 0,
        parts: [],
        expiresAt: LATER,
        holderCount: 0,
      })
      assert.equal(failure(await index.readUpload(T2, 'up-a')), 'not-found')
      assert.equal(failure(await index.readLive(key('a'), T1)), 'not-found')
    },
  },
  {
    name: 'the same upload again answers the row it points at; products without an upload do not collide',
    async run(create) {
      const index = await create()
      ok(await index.insertUploading(uploading('a')))
      const again = await index.insertUploading({ ...uploading('b'), upload: 'up-a' })
      assert.equal(failure(again), 'exists')
      assert.equal('failure' in again && 'row' in again.failure && again.failure.row.key, key('a'))
      ok(await index.insertUploading(uploading('c', T2, 'up-a')))
      ok(await index.insertUploading(uploading('d', T1, null)))
      ok(await index.insertUploading(uploading('e', T1, null)))
    },
  },
  {
    name: 'the name an upload is begun with is kept on its row; an upload without one has none',
    async run(create) {
      const index = await create()
      ok(await index.insertUploading({ ...uploading('a'), name: '季度报告.pdf' }))
      ok(await index.insertUploading(uploading('b')))
      assert.equal(ok(await index.readUpload(T1, 'up-a')).name, '季度报告.pdf')
      assert.equal('name' in ok(await index.readUpload(T1, 'up-b')), false)
    },
  },
  {
    name: 'a key that is taken is not inserted again, and the refused insert leaves no upload behind',
    async run(create) {
      const index = await create()
      ok(await index.insertUploading(uploading('a')))
      const again = await index.insertUploading({ ...uploading('a'), upload: 'up-other' })
      assert.equal(failure(again), 'unavailable')
      assert.equal(failure(await index.readUpload(T1, 'up-other')), 'not-found')
      assert.equal(ok(await index.readUpload(T1, 'up-a')).key, key('a'))
    },
  },
  {
    name: 'a write is attached and parts advance only in order and only while uploading',
    async run(create) {
      const index = await create()
      ok(await index.insertUploading(uploading('a')))
      ok(await index.attachWrite(T1, key('a'), 'write-a'))
      assert.equal(
        failure(
          await index.advance({ tenant: T1, key: key('a'), sequence: 1, digest: 'd1', bytes: 4 }),
        ),
        'stale',
      )
      assert.deepEqual(
        ok(await index.advance({ tenant: T1, key: key('a'), sequence: 0, digest: 'd0', bytes: 6 })),
        {
          nextSequence: 1,
        },
      )
      assert.equal(
        failure(
          await index.advance({ tenant: T1, key: key('a'), sequence: 0, digest: 'd0', bytes: 6 }),
        ),
        'stale',
      )
      ok(await index.advance({ tenant: T1, key: key('a'), sequence: 1, digest: 'd1', bytes: 4 }))
      const row = ok(await index.readUpload(T1, 'up-a'))
      assert.deepEqual(
        [row.write, row.nextSequence, row.received, row.parts],
        ['write-a', 2, 10, ['d0', 'd1']],
      )
      ok(await index.stageOrMerge(staging('a')))
      assert.equal(
        failure(
          await index.advance({ tenant: T1, key: key('a'), sequence: 2, digest: 'd2', bytes: 1 }),
        ),
        'stale',
      )
      assert.equal(failure(await index.attachWrite(T1, key('a'), 'other')), 'not-uploading')
    },
  },
  {
    name: 'a staged row is live for its tenant only, with its digest, facts and expiry',
    async run(create) {
      const index = await create()
      const answer = await staged(index, 'a', T1, { mediaType: 'image/webp', bytes: 77 })
      assert.equal(answer.kind, 'staged')
      const row = ok(await index.readLive(key('a'), T1))
      assert.deepEqual(
        [
          row.state,
          row.mediaType,
          row.bytes,
          row.digest,
          row.facts,
          row.expiresAt,
          row.holderCount,
        ],
        ['staged', 'image/webp', 77, 'sha256:same', staging('a').facts, LATER, 0],
      )
      assert.equal(failure(await index.readLive(key('a'), T2)), 'not-found')
      assert.equal(ok(await index.readUpload(T1, 'up-a')).state, 'staged')
      assert.equal(failure(await index.stageOrMerge(staging('a'))), 'not-uploading')
      assert.equal(failure(await index.stageOrMerge(staging('z'))), 'not-uploading')
    },
  },
  {
    name: 'a second row of the same tenant and digest merges into the live one and its upload follows',
    async run(create) {
      const index = await create()
      await staged(index, 'a')
      const merged = await staged(index, 'b')
      assert.equal(merged.kind, 'merged')
      assert.equal(merged.row.key, key('a'))
      assert.deepEqual(await states(index), [key('b')])
      assert.equal(ok(await index.readUpload(T1, 'up-b')).key, key('a'))
      assert.equal(failure(await index.readLive(key('b'), T1)), 'not-found')
    },
  },
  {
    name: 'the same digest of another tenant does not merge',
    async run(create) {
      const index = await create()
      await staged(index, 'a', T1)
      const other = await staged(index, 'b', T2)
      assert.equal(other.kind, 'staged')
      assert.equal(ok(await index.readLive(key('b'), T2)).tenant, T2)
      assert.equal(failure(await index.readLive(key('a'), T2)), 'not-found')
      assert.deepEqual(await states(index), [])
    },
  },
  {
    name: 'a tenant does not reach the row of another through any write',
    async run(create) {
      const index = await create()
      ok(await index.insertUploading(uploading('a', T1)))
      assert.equal(failure(await index.attachWrite(T2, key('a'), 'w')), 'not-uploading')
      assert.equal(
        failure(
          await index.advance({ tenant: T2, key: key('a'), sequence: 0, digest: 'd', bytes: 1 }),
        ),
        'stale',
      )
      assert.deepEqual(ok(await index.markDeleting(T2, key('a'))), { marked: false })
      ok(await index.markDeleting(T1, key('a')))
      assert.deepEqual(await states(index, T2), [])
      ok(await index.dropRow(T2, key('a')))
      assert.deepEqual(await states(index, T1), [key('a')])
      await staged(index, 'b', T1, { expiresAt: EARLIER })
      assert.deepEqual(
        ok(await index.markDeletingIfExpired({ tenant: T2, now: NOW, limit: 10 })),
        [],
      )
      assert.equal(ok(await index.readLive(key('b'), T1)).state, 'staged')
    },
  },
  {
    name: 'a row staged for a tenant other than its own is refused',
    async run(create) {
      const index = await create()
      ok(await index.insertUploading(uploading('a', T1)))
      assert.equal(failure(await index.stageOrMerge(staging('a', T2))), 'not-uploading')
    },
  },
  {
    name: 'staging with a holder holds at once; merging with a holder holds the row that stays',
    async run(create) {
      const index = await create()
      const put = await staged(index, 'a', T1, { holder: holder('w1'), digest: 'sha256:one' })
      assert.deepEqual([put.row.state, put.row.expiresAt, put.row.holderCount], ['held', null, 1])
      await staged(index, 'b', T1, { digest: 'sha256:two' })
      const merged = await staged(index, 'c', T1, { digest: 'sha256:two', holder: holder('w2') })
      assert.deepEqual(
        [
          merged.kind,
          merged.row.key,
          merged.row.state,
          merged.row.expiresAt,
          merged.row.holderCount,
        ],
        ['merged', key('b'), 'held', null, 1],
      )
    },
  },
  {
    name: 'hold takes a staged or held row of the tenant, once per holder, and nothing else',
    async run(create) {
      const index = await create()
      await staged(index, 'a')
      const first = ok(await index.holdIfLive({ key: key('a'), tenant: T1, holder: holder('w1') }))
      assert.deepEqual([first.state, first.expiresAt, first.holderCount], ['held', null, 1])
      const again = ok(await index.holdIfLive({ key: key('a'), tenant: T1, holder: holder('w1') }))
      assert.equal(again.holderCount, 1)
      const second = ok(await index.holdIfLive({ key: key('a'), tenant: T1, holder: holder('w2') }))
      assert.equal(second.holderCount, 2)
      assert.equal(ok(await index.readLive(key('a'), T1)).holderCount, 2)
      assert.equal(
        failure(await index.holdIfLive({ key: key('a'), tenant: T2, holder: holder('x') })),
        'not-live',
      )
      ok(await index.insertUploading(uploading('b')))
      assert.equal(
        failure(await index.holdIfLive({ key: key('b'), tenant: T1, holder: holder('x') })),
        'not-live',
      )
      assert.equal(
        failure(await index.holdIfLive({ key: key('z'), tenant: T1, holder: holder('x') })),
        'not-live',
      )
    },
  },
  {
    name: 'the expiry sweep marks uploading and staged rows whose time is over, up to its limit, and never a held one',
    async run(create) {
      const index = await create()
      ok(await index.insertUploading(uploading('a', T1, 'up-a', EARLIER)))
      await staged(index, 'b', T1, { digest: 'sha256:b', expiresAt: EARLIER })
      await staged(index, 'c', T1, { digest: 'sha256:c', expiresAt: LATER })
      await staged(index, 'd', T1, { digest: 'sha256:d', expiresAt: EARLIER })
      ok(await index.holdIfLive({ key: key('d'), tenant: T1, holder: holder('w') }))
      const one = ok(await index.markDeletingIfExpired({ tenant: T1, now: NOW, limit: 1 }))
      assert.deepEqual(
        one.map(row => row.state),
        ['deleting'],
      )
      const rest = ok(await index.markDeletingIfExpired({ tenant: T1, now: NOW, limit: 10 }))
      assert.deepEqual([...one, ...rest].map(row => row.key).sort(), [key('a'), key('b')])
      assert.deepEqual(
        ok(await index.markDeletingIfExpired({ tenant: T1, now: NOW, limit: 10 })),
        [],
      )
      assert.equal(ok(await index.readLive(key('c'), T1)).state, 'staged')
      assert.equal(ok(await index.readLive(key('d'), T1)).state, 'held')
      assert.equal(failure(await index.readLive(key('b'), T1)), 'not-found')
      assert.equal(
        failure(await index.holdIfLive({ key: key('b'), tenant: T1, holder: holder('late') })),
        'not-live',
      )
    },
  },
  {
    name: 'mark deleting takes an uploading row only',
    async run(create) {
      const index = await create()
      ok(await index.insertUploading(uploading('a')))
      await staged(index, 'b', T1, { digest: 'sha256:b' })
      assert.deepEqual(ok(await index.markDeleting(T1, key('a'))), { marked: true })
      assert.deepEqual(ok(await index.markDeleting(T1, key('a'))), { marked: false })
      assert.deepEqual(ok(await index.markDeleting(T1, key('b'))), { marked: false })
      assert.deepEqual(ok(await index.markDeleting(T1, key('z'))), { marked: false })
      assert.equal(failure(await index.readUpload(T1, 'up-a')), 'not-found')
      assert.equal(ok(await index.readLive(key('b'), T1)).state, 'staged')
    },
  },
  {
    name: 'a row is dropped only while deleting, with the uploads that point at it',
    async run(create) {
      const index = await create()
      await staged(index, 'a')
      ok(await index.dropRow(T1, key('a')))
      assert.equal(ok(await index.readLive(key('a'), T1)).state, 'staged')
      ok(await index.insertUploading(uploading('b')))
      ok(await index.markDeleting(T1, key('b')))
      assert.deepEqual(await states(index), [key('b')])
      ok(await index.dropRow(T1, key('b')))
      ok(await index.dropRow(T1, key('b')))
      assert.deepEqual(await states(index), [])
      assert.equal(failure(await index.readUpload(T1, 'up-b')), 'not-found')
    },
  },
  {
    name: 'an upload whose row is being deleted starts over as a new row',
    async run(create) {
      const index = await create()
      ok(await index.insertUploading(uploading('a')))
      ok(await index.markDeleting(T1, key('a')))
      ok(await index.insertUploading({ ...uploading('b'), upload: 'up-a' }))
      assert.equal(ok(await index.readUpload(T1, 'up-a')).key, key('b'))
      ok(await index.dropRow(T1, key('a')))
      assert.equal(ok(await index.readUpload(T1, 'up-a')).key, key('b'))
    },
  },
  {
    name: 'a representation is kept for a live row once for each version of a definition, and read back by it',
    async run(create) {
      const index = await create()
      await staged(index, 'a')
      const first = converted('1', 'the first words')
      const record = (representation: Representation, tenant = T1, letter = 'a') =>
        index.recordRepresentation({ tenant, key: key(letter), representation })
      assert.deepEqual(ok(await record(first)), first)
      assert.deepEqual(ok(await record(converted('1', 'other words'))), first)
      const cannot: Representation = {
        definition: definition('2'),
        engine: ENGINE,
        outcome: 'inconvertible',
      }
      assert.deepEqual(ok(await record(cannot)), cannot)
      const encrypted: Representation = {
        ...cannot,
        definition: definition('4'),
        reason: 'encrypted',
      }
      assert.deepEqual(ok(await record(encrypted)), encrypted)
      const read = (revision: string, tenant = T1, letter = 'a') =>
        index.readRepresentation({ tenant, key: key(letter), definition: definition(revision) })
      assert.deepEqual(ok(await read('1')), first)
      assert.deepEqual(ok(await read('2')), cannot)
      assert.deepEqual(ok(await read('4')), encrypted)
      assert.equal(ok(await read('3')), null)
      assert.equal(ok(await read('1', T2)), null)
      assert.equal(ok(await read('1', T1, 'z')), null)
      assert.equal(failure(await record(first, T2)), 'not-live')
      assert.equal(failure(await record(first, T1, 'z')), 'not-live')
      ok(await index.insertUploading(uploading('u')))
      assert.equal(failure(await record(first, T1, 'u')), 'not-live')
    },
  },
  {
    name: 'the expiry sweep takes with a row what was kept for its representations, and leaves what others hold',
    async run(create) {
      const index = await create()
      const made = representationHolder(key('a'), definition('1'))
      await staged(index, 'a', T1, { digest: 'sha256:a', expiresAt: EARLIER })
      await staged(index, 'b', T1, { digest: 'sha256:b', holder: made })
      await staged(index, 'c', T1, { digest: 'sha256:c', holder: made })
      ok(await index.holdIfLive({ key: key('c'), tenant: T1, holder: holder('someone') }))
      await staged(index, 'd', T1, {
        digest: 'sha256:d',
        holder: representationHolder(key('e'), definition('1')),
      })
      const kept = converted('1', 'words')
      ok(await index.recordRepresentation({ tenant: T1, key: key('a'), representation: kept }))
      const marked = ok(await index.markDeletingIfExpired({ tenant: T1, now: NOW, limit: 10 }))
      assert.deepEqual(marked.map(row => row.key).sort(), [key('a'), key('b')])
      assert.deepEqual((await states(index)).sort(), [key('a'), key('b')])
      assert.equal(ok(await index.readLive(key('c'), T1)).holderCount, 1)
      assert.equal(ok(await index.readLive(key('d'), T1)).holderCount, 1)
      await staged(index, 'f', T1, { digest: 'sha256:a' })
      const again = { tenant: T1, key: key('a'), definition: definition('1') }
      assert.equal(ok(await index.readRepresentation(again)), null)
    },
  },
  {
    name: 'a digest is free again once its row is being deleted',
    async run(create) {
      const index = await create()
      await staged(index, 'a', T1, { expiresAt: EARLIER })
      ok(await index.markDeletingIfExpired({ tenant: T1, now: NOW, limit: 10 }))
      const again = await staged(index, 'b')
      assert.equal(again.kind, 'staged')
      assert.equal(again.row.key, key('b'))
    },
  },
]
