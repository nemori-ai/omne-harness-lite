import assert from 'node:assert/strict'
import type { ByteStore } from '../ports.ts'

export type StoreWorld = Readonly<{
  store: ByteStore
  /** A new provider over the same medium: what a restart of the process sees. */
  reopen(): Promise<ByteStore>
}>
export type StoreConformanceCase = Readonly<{
  name: string
  run(create: () => Promise<StoreWorld>): Promise<void>
}>

const KEY_A = 'a'.repeat(32)
const KEY_B = 'b'.repeat(32)
const bytes = (text: string): Uint8Array => new TextEncoder().encode(text)

function ok<T>(reply: { ok: T } | { failure: unknown }): T {
  if ('failure' in reply) assert.fail(`expected ok, got ${JSON.stringify(reply.failure)}`)
  return reply.ok
}
function failure(reply: { ok: unknown } | { failure: { kind: string } }): string {
  if ('ok' in reply) assert.fail('expected a failure')
  return reply.failure.kind
}
async function text(store: ByteStore, key: string, range?: { offset: number; length: number }) {
  const chunks: Uint8Array[] = []
  for await (const chunk of ok(await store.open(key, range))) chunks.push(chunk)
  return Buffer.concat(chunks).toString('utf8')
}
async function sealed(store: ByteStore, key: string, parts: readonly string[]): Promise<number> {
  const { write } = ok(await store.begin(key))
  for (const [sequence, part] of parts.entries())
    ok(await store.append(write, sequence, bytes(part)))
  return ok(await store.seal(write, parts.length)).bytes
}

export const byteStoreConformanceCases: readonly StoreConformanceCase[] = [
  {
    name: 'a sealed object reads back whole and by range, and the store has a name',
    async run(create) {
      const { store } = await create()
      assert.notEqual(store.name, '')
      assert.equal(await sealed(store, KEY_A, ['hello ', 'world']), 11)
      assert.equal(await text(store, KEY_A), 'hello world')
      assert.equal(await text(store, KEY_A, { offset: 6, length: 5 }), 'world')
      assert.equal(await text(store, KEY_A, { offset: 6, length: 500 }), 'world')
      assert.equal(await text(store, KEY_A, { offset: 11, length: 5 }), '')
      assert.equal(await text(store, KEY_A, { offset: 2, length: 3 }), 'llo')
      assert.equal(await text(store, KEY_A, { offset: 4, length: 1 }), 'o')
      assert.equal(await text(store, KEY_A, { offset: 3, length: 0 }), '')
    },
  },
  {
    name: 'an object is not readable before its seal',
    async run(create) {
      const { store } = await create()
      const { write } = ok(await store.begin(KEY_A))
      ok(await store.append(write, 0, bytes('early')))
      assert.equal(failure(await store.open(KEY_A)), 'not-found')
      ok(await store.seal(write, 1))
      assert.equal(await text(store, KEY_A), 'early')
    },
  },
  {
    name: 'the same sequence again replaces the segment',
    async run(create) {
      const { store } = await create()
      const { write } = ok(await store.begin(KEY_A))
      ok(await store.append(write, 0, bytes('first')))
      ok(await store.append(write, 1, bytes('-tail')))
      ok(await store.append(write, 0, bytes('again')))
      ok(await store.seal(write, 2))
      assert.equal(await text(store, KEY_A), 'again-tail')
    },
  },
  {
    name: 'a seal with a missing segment answers gap and leaves nothing readable',
    async run(create) {
      const { store } = await create()
      const { write } = ok(await store.begin(KEY_A))
      ok(await store.append(write, 0, bytes('zero')))
      ok(await store.append(write, 2, bytes('two')))
      assert.equal(failure(await store.seal(write, 3)), 'gap')
      assert.equal(failure(await store.open(KEY_A)), 'not-found')
    },
  },
  {
    name: 'a sealed object never changes: a second seal answers the same size, an append is refused',
    async run(create) {
      const { store } = await create()
      const { write } = ok(await store.begin(KEY_A))
      ok(await store.append(write, 0, bytes('fixed')))
      assert.equal(ok(await store.seal(write, 1)).bytes, 5)
      assert.equal(ok(await store.seal(write, 1)).bytes, 5)
      assert.equal(failure(await store.append(write, 0, bytes('other'))), 'no-write')
      assert.equal(await text(store, KEY_A), 'fixed')
    },
  },
  {
    name: 'a second begin for an open write answers the same write and keeps its segments',
    async run(create) {
      const { store } = await create()
      const first = ok(await store.begin(KEY_A))
      ok(await store.append(first.write, 0, bytes('kept')))
      const second = ok(await store.begin(KEY_A))
      assert.equal(second.write, first.write)
      ok(await store.seal(second.write, 1))
      assert.equal(await text(store, KEY_A), 'kept')
    },
  },
  {
    name: 'remove takes a sealed object and an open write away, and removing nothing succeeds',
    async run(create) {
      const { store } = await create()
      await sealed(store, KEY_A, ['gone'])
      ok(await store.remove(KEY_A))
      ok(await store.remove(KEY_A))
      assert.equal(failure(await store.open(KEY_A)), 'not-found')
      const { write } = ok(await store.begin(KEY_B))
      ok(await store.append(write, 0, bytes('open')))
      ok(await store.remove(KEY_B))
      assert.equal(failure(await store.append(write, 1, bytes('late'))), 'no-write')
      assert.equal(failure(await store.seal(write, 1)), 'no-write')
    },
  },
  {
    name: 'abort drops an open write, and aborting nothing succeeds',
    async run(create) {
      const { store } = await create()
      const { write } = ok(await store.begin(KEY_A))
      ok(await store.append(write, 0, bytes('dropped')))
      ok(await store.abort(write))
      ok(await store.abort(write))
      assert.equal(failure(await store.append(write, 0, bytes('late'))), 'no-write')
      assert.equal(failure(await store.open(KEY_A)), 'not-found')
    },
  },
  {
    name: 'a sealed object is there after a restart; an unsealed one is still not readable',
    async run(create) {
      const { store, reopen } = await create()
      await sealed(store, KEY_A, ['durable ', 'bytes'])
      const { write } = ok(await store.begin(KEY_B))
      ok(await store.append(write, 0, bytes('pending')))
      const again = await reopen()
      assert.equal(again.name, store.name)
      assert.equal(await text(again, KEY_A), 'durable bytes')
      assert.equal(failure(await again.open(KEY_B)), 'not-found')
    },
  },
  {
    name: 'a key the core did not make is refused and reads as not found',
    async run(create) {
      const { store } = await create()
      for (const key of ['../escape', 'a/b', '', 'A'.repeat(32), `${KEY_A}.tmp`]) {
        assert.equal(failure(await store.begin(key)), 'invalid-key', key)
        assert.equal(failure(await store.open(key)), 'not-found', key)
      }
    },
  },
  {
    name: 'a write that was never begun is refused, and aborting it succeeds',
    async run(create) {
      const { store } = await create()
      for (const write of ['never-begun', '', `../${KEY_A}`]) {
        assert.equal(failure(await store.append(write, 0, bytes('x'))), 'no-write')
        assert.equal(failure(await store.seal(write, 1)), 'no-write')
        ok(await store.abort(write))
      }
    },
  },
  {
    name: 'two objects do not touch: removing one leaves the other',
    async run(create) {
      const { store } = await create()
      await sealed(store, KEY_A, ['one'])
      await sealed(store, KEY_B, ['two'])
      ok(await store.remove(KEY_A))
      assert.equal(await text(store, KEY_B), 'two')
    },
  },
  {
    name: 'an empty object seals and reads back empty',
    async run(create) {
      const { store } = await create()
      assert.equal(await sealed(store, KEY_A, []), 0)
      assert.equal(await text(store, KEY_A), '')
    },
  },
]
