import { afterEach, expect, it } from 'vitest'
import { createHash } from 'node:crypto'
import { decodeToolCallId, decodeToolOperationId } from '@omne-harness/tool-contract'
import {
  decodeToolMaterialId,
  decodeToolMaterialGeneration,
} from '@omne-harness/tool-contract/provider'
import { createSqlToolMaterialStore } from '@omne-harness/tool-storage-sql'
import { openApp, TENANT_A, type App } from './fixtures/app.ts'

const opened: App[] = []
afterEach(() => {
  for (const app of opened.splice(0)) app.close()
})
function ok<T>(value: { ok: T } | { failure: unknown }): T {
  if ('failure' in value) throw new Error(JSON.stringify(value.failure))
  return value.ok
}
const provider = { owner: 'tool-sql', name: 'materials', revision: '1', digest: 'sha256:provider' }
const codec = { owner: 'tool', name: 'bytes', revision: '1', digest: 'sha256:codec' }
const source = { owner: 'tool', record: 'source', revision: '1', digest: 'sha256:source' }
const material = {
  id: ok(decodeToolMaterialId('body-1')),
  generation: ok(decodeToolMaterialGeneration('generation-1')),
  provider,
}
const access = { principal: 'tool-runtime', tenant: TENANT_A, call: ok(decodeToolCallId('call-1')) }
const operation = ok(decodeToolOperationId('write-1'))
const input = { ...access, operation, material, codec, source }
async function setup(maxChunkBytes = 2) {
  const app = await openApp()
  opened.push(app)
  return {
    app,
    store: createSqlToolMaterialStore<string>({
      ...app.custodyOptions({ maxChunkBytes }),
      provider,
    }),
  }
}
it('stores exact bytes, recalls the original seal and reads bounded contiguous ranges', async () => {
  const { store } = await setup()
  const bytes = new TextEncoder().encode('abcde')
  const seal = ok(await store.write({ ...input, bytes }))
  expect(seal).toMatchObject({
    material,
    codec,
    bytes: '5',
    sha256: createHash('sha256').update(bytes).digest('hex'),
  })
  expect(ok(await store.write({ ...input, bytes }))).toEqual(seal)
  expect(ok(await store.inspect(input))).toEqual({ kind: 'sealed', seal })
  expect(ok(await store.read({ ...access, material, offset: '0', maxBytes: 10 }))).toEqual({
    bytes: new TextEncoder().encode('ab'),
    next: '2',
  })
  expect(ok(await store.read({ ...access, material, offset: '2', maxBytes: 1 }))).toEqual({
    bytes: new TextEncoder().encode('c'),
    next: '3',
  })
  expect(await store.write({ ...input, bytes: new TextEncoder().encode('other') })).toEqual({
    failure: { kind: 'conflict', operation },
  })
})
const deletion = {
  ...access,
  material,
  operation: ok(decodeToolOperationId('delete-1')),
  authorization: source,
}
it.each([
  { ...material, label: 'caller metadata' },
  { ...material, provider: { ...provider, label: 'caller metadata' } },
])('returns a usable reference for a material identity with extra fields: %j', async extended => {
  const { store } = await setup()
  const bytes = new TextEncoder().encode('ab')
  const seal = ok(await store.write({ ...input, material: extended, bytes }))
  expect(ok(await store.inspect({ ...input, material: seal.material }))).toEqual({
    kind: 'sealed',
    seal,
  })
  expect(
    ok(await store.read({ ...access, material: seal.material, offset: '0', maxBytes: 2 })),
  ).toEqual({ bytes, next: null })
})
it.each([
  { ...material, label: 'caller metadata' },
  { ...material, provider: { ...provider, label: 'caller metadata' } },
])('keeps the deletion fence for a material identity with extra fields: %j', async extended => {
  const { store } = await setup()
  ok(await store.erase(deletion))
  expect(await store.write({ ...input, material: extended, bytes: new Uint8Array([1]) })).toEqual({
    failure: { kind: 'conflict', operation },
  })
})
it('recalls deletion and excludes late writes without conflating unknown with deleted', async () => {
  const { app, store } = await setup()
  await store.write({ ...input, bytes: new TextEncoder().encode('abcde') })
  expect(ok(await store.inspectErase(deletion))).toEqual({ kind: 'unknown' })
  app.faults.armCommit('unknown-applied')
  expect(await store.erase(deletion)).toEqual({
    failure: { kind: 'commit-unknown', operation: deletion.operation },
  })
  expect(ok(await store.inspectErase(deletion))).toEqual({ kind: 'pending' })
  const receipt = ok(await store.erase(deletion))
  expect(ok(await store.inspectErase(deletion))).toEqual({ kind: 'deleted', receipt })
  expect(ok(await store.erase(deletion))).toEqual(receipt)
  expect(ok(await store.inspect(input))).toEqual({ kind: 'excluded', evidence: receipt })
  expect(await store.write({ ...input, bytes: new TextEncoder().encode('abcde') })).toEqual({
    failure: { kind: 'conflict', operation },
  })
  expect(await store.read({ ...access, material, offset: '0', maxBytes: 1 })).toMatchObject({
    failure: { kind: 'unavailable' },
  })
  expect(
    await store.erase({ ...deletion, authorization: { ...source, digest: 'another' } }),
  ).toEqual({ failure: { kind: 'conflict', operation: deletion.operation } })
})
it('can fence a not-yet-written object and reject another delete operation', async () => {
  const { store } = await setup()
  const receipt = ok(await store.erase(deletion))
  expect(ok(await store.inspect(input))).toEqual({ kind: 'excluded', evidence: receipt })
  const other = ok(decodeToolOperationId('delete-2'))
  expect(await store.inspectErase({ ...deletion, operation: other })).toEqual({
    failure: { kind: 'conflict', operation: other },
  })
  expect(await store.write({ ...input, bytes: new Uint8Array() })).toEqual({
    failure: { kind: 'conflict', operation },
  })
})
it('resumes the original chunk layout after an unknown write with changed configuration', async () => {
  const { app, store } = await setup(2)
  const bytes = new TextEncoder().encode('abcde')
  app.faults.armCommitAt('unknown-applied', 2)
  expect(await store.write({ ...input, bytes })).toEqual({
    failure: { kind: 'commit-unknown', operation },
  })
  expect(ok(await store.inspect(input))).toEqual({ kind: 'pending' })
  const changed = createSqlToolMaterialStore<string>({
    ...app.custodyOptions({ maxChunkBytes: 3 }),
    provider,
  })
  const seal = ok(await changed.write({ ...input, bytes }))
  expect(seal.bytes).toBe('5')
  expect(ok(await changed.read({ ...access, material, offset: '0', maxBytes: 10 })).next).toBe('2')
})
it('recognizes an unknown seal without writing any chunks again', async () => {
  const { app, store } = await setup(2)
  const bytes = new TextEncoder().encode('abcde')
  app.faults.armCommitAt('unknown-applied', 5)
  expect(await store.write({ ...input, bytes })).toEqual({
    failure: { kind: 'commit-unknown', operation },
  })
  expect(ok(await store.inspect(input)).kind).toBe('sealed')
  const before = app.faults.commits()
  ok(await store.write({ ...input, bytes }))
  expect(app.faults.commits() - before).toBe(1)
})
it('copies the bytes and metadata before the first asynchronous lookup', async () => {
  const { store } = await setup()
  const bytes = new TextEncoder().encode('abcde')
  const mutable = {
    ...input,
    bytes,
    codec: { ...codec },
    source: { ...source },
    material: { ...material, provider: { ...provider } },
  }
  const pending = store.write(mutable)
  bytes.fill(0)
  mutable.codec.name = 'changed'
  mutable.source.record = 'changed'
  mutable.material.provider.revision = 'changed'
  const seal = ok(await pending)
  expect(seal.material).toEqual(material)
  expect(seal.codec).toEqual(codec)
  expect(ok(await store.read({ ...access, material, offset: '0', maxBytes: 2 })).bytes).toEqual(
    new TextEncoder().encode('ab'),
  )
})
it('refuses a different provider adoption before any SQL access', async () => {
  const { app, store } = await setup()
  const foreign = { ...material, provider: { ...provider, revision: '2' } }
  for (const response of [
    await store.write({ ...input, material: foreign, bytes: new Uint8Array() }),
    await store.inspect({ ...input, material: foreign }),
    await store.read({ ...access, material: foreign, offset: '0', maxBytes: 1 }),
    await store.erase({ ...deletion, material: foreign }),
    await store.inspectErase({ ...deletion, material: foreign }),
  ])
    expect(response).toMatchObject({ failure: { kind: 'unavailable' } })
  expect(app.faults.commits()).toBe(0)
})
it('distinguishes another write operation, call and generation', async () => {
  const { store } = await setup()
  ok(await store.write({ ...input, bytes: new TextEncoder().encode('abc') }))
  const other = ok(decodeToolOperationId('write-2'))
  expect(await store.inspect({ ...input, operation: other })).toEqual({
    failure: { kind: 'conflict', operation: other },
  })
  expect(ok(await store.inspect({ ...input, call: ok(decodeToolCallId('call-2')) }))).toEqual({
    kind: 'unknown',
  })
  expect(
    ok(
      await store.inspect({
        ...input,
        material: { ...material, generation: ok(decodeToolMaterialGeneration('generation-2')) },
      }),
    ),
  ).toEqual({ kind: 'unknown' })
})
it('does not turn malformed provider observations into a conflict or a known absence', async () => {
  const { app } = await setup()
  for (const output of [
    { kind: 'garbage' },
    { kind: 'sealed' },
    { kind: 'excluded', operation: 'delete-1', digest: 'x', deleted: false },
  ]) {
    const store = createSqlToolMaterialStore<string>({
      ...app.custodyOptions(),
      provider,
      storage: {
        ...app.options.storage,
        read: async request => ({ kind: 'read', requestKey: request.requestKey, output }),
      },
    })
    expect(await store.inspect(input)).toMatchObject({ failure: { kind: 'unavailable' } })
    expect(await store.inspectErase(deletion)).toMatchObject({ failure: { kind: 'unavailable' } })
  }
})
it('rejects invalid ranges and malformed or oversized byte pages', async () => {
  const { app, store } = await setup()
  for (const offset of ['-1', '01', '1.5', '9007199254740992'])
    expect(await store.read({ ...access, material, offset, maxBytes: 1 })).toMatchObject({
      failure: { kind: 'invalid', field: 'offset' },
    })
  for (const maxBytes of [0, -1, 0.5, Number.NaN])
    expect(await store.read({ ...access, material, offset: '0', maxBytes })).toMatchObject({
      failure: { kind: 'invalid', field: 'maxBytes' },
    })
  for (const output of [
    { kind: 'bytes', data: 'YQ', next: null },
    { kind: 'bytes', data: 'YWI=', next: null },
    { kind: 'bytes', data: 'YQ==', next: '99' },
    { kind: 'bytes', data: '', next: '0' },
  ]) {
    const broken = createSqlToolMaterialStore<string>({
      ...app.custodyOptions(),
      provider,
      storage: {
        ...app.options.storage,
        read: async request => ({ kind: 'read', requestKey: request.requestKey, output }),
      },
    })
    expect(await broken.read({ ...access, material, offset: '0', maxBytes: 1 })).toMatchObject({
      failure: { kind: 'unavailable' },
    })
  }
})
it('keeps a thrown applied write unknown and recovers it through the original operation', async () => {
  const { app, store } = await setup()
  const bytes = new TextEncoder().encode('abc')
  app.faults.armCommit('throw-applied')
  expect(await store.write({ ...input, bytes })).toEqual({
    failure: { kind: 'commit-unknown', operation },
  })
  expect(ok(await store.inspect(input))).toEqual({ kind: 'pending' })
  ok(await store.write({ ...input, bytes }))
  app.faults.failNextRead()
  expect(await store.inspect(input)).toMatchObject({ failure: { kind: 'unavailable' } })
  expect(ok(await store.inspect(input)).kind).toBe('sealed')
})
it('checks the actual command envelope before sending oversized metadata', async () => {
  const { app } = await setup()
  const large = { ...provider, digest: 'x'.repeat(10_000) }
  const store = createSqlToolMaterialStore<string>({
    ...app.custodyOptions({ maxCommandBytes: 4096, maxChunkBytes: 32 }),
    provider: large,
  })
  expect(
    await store.write({
      ...input,
      material: { ...material, provider: large },
      bytes: new Uint8Array(1),
    }),
  ).toMatchObject({ failure: { kind: 'unavailable' } })
  expect(app.faults.commits()).toBe(0)
})
