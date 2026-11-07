import { randomUUID } from 'node:crypto'
import { afterEach, expect, it } from 'vitest'
import type { JsonValue } from '@omne-harness/sql-contract'
import { openApp, TENANT_A, domainNameOf, textOf, type App } from './fixtures/app.ts'

const opened: App[] = []
afterEach(() => {
  for (const app of opened.splice(0)) app.close()
})
async function app() {
  const a = await openApp()
  opened.push(a)
  return a
}
const address = { tenant: textOf(TENANT_A), call: 'call-1', material: 'material-generation-1' }
const begin = {
  ...address,
  intent: 'material-begin',
  operation: 'write-1',
  digest: 'input-1',
  bytes: 3,
  chunkBytes: 2,
  sha256: 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
  seal: { evidence: 'sealed' },
}
async function commit(a: App, facts: Readonly<Record<string, JsonValue>>) {
  return a.options.storage.commit({
    ...a.options.combination,
    identity: {
      scope: { kind: 'tenant', tenant: textOf(TENANT_A) },
      transactionDomain: domainNameOf(TENANT_A),
      operation: 'material-test',
      protocolVersion: '2',
      operationKey: randomUUID(),
    },
    commands: [{ participant: 'tool', facts }],
  })
}
it('fixes one input before any chunk, recalls it and rejects another input', async () => {
  const a = await app()
  expect(await commit(a, begin)).toMatchObject({ kind: 'committed' })
  expect(await commit(a, begin)).toMatchObject({ kind: 'committed' })
  expect(await commit(a, { ...begin, digest: 'other-input' })).toMatchObject({
    kind: 'rolled_back',
  })
  expect(
    a.sqlite.inspect(
      domainNameOf(TENANT_A),
      'SELECT state, digest FROM tl_material WHERE tenant = ? AND call = ? AND material = ?',
      [address.tenant, address.call, address.material],
    ),
  ).toEqual([{ state: 'preparing', digest: 'input-1' }])
})
const chunk = (index: number, data: string) => ({
  ...address,
  intent: 'material-chunk',
  operation: 'write-1',
  digest: 'input-1',
  index,
  data,
})
const seal = { ...address, intent: 'material-seal', operation: 'write-1', digest: 'input-1' }
it('seals only complete immutable chunks and recalls the sealed answer', async () => {
  const a = await app()
  await commit(a, begin)
  expect(await commit(a, chunk(0, 'YWI='))).toMatchObject({ kind: 'committed' })
  expect(await commit(a, chunk(0, 'YWI='))).toMatchObject({ kind: 'committed' })
  expect(await commit(a, chunk(0, 'eno='))).toMatchObject({ kind: 'rolled_back' })
  expect(await commit(a, seal)).toMatchObject({ kind: 'rolled_back' })
  expect(await commit(a, chunk(1, 'Yw=='))).toMatchObject({ kind: 'committed' })
  for (let retry = 0; retry < 2; retry += 1)
    expect(await commit(a, seal)).toMatchObject({
      kind: 'committed',
      responses: [{ reply: { response: { kind: 'sealed', answer: { evidence: 'sealed' } } } }],
    })
  expect(await commit(a, chunk(1, 'ZA=='))).toMatchObject({ kind: 'rolled_back' })
})
it('rejects malformed chunks, wrong bounds and a complete stream with a wrong hash', async () => {
  const a = await app()
  await commit(a, { ...begin, sha256: '0'.repeat(64) })
  for (const value of [chunk(0, 'YWI'), chunk(0, 'YQ=='), chunk(2, 'Yw==')])
    expect(await commit(a, value)).toMatchObject({ kind: 'rolled_back' })
  expect(await commit(a, chunk(0, 'YWI='))).toMatchObject({ kind: 'committed' })
  expect(await commit(a, chunk(1, 'Yw=='))).toMatchObject({ kind: 'committed' })
  expect(await commit(a, seal)).toMatchObject({ kind: 'rolled_back' })
})
const fence = {
  ...address,
  intent: 'material-fence',
  operation: 'delete-1',
  digest: 'authorization-1',
  receipt: { record: 'delete-1' },
}
const prune = {
  ...address,
  intent: 'material-prune',
  operation: 'delete-1',
  digest: 'authorization-1',
}
it('a delete fence excludes a late initial write, chunk and seal', async () => {
  const a = await app()
  expect(await commit(a, fence)).toMatchObject({ kind: 'committed' })
  for (const value of [begin, chunk(0, 'YWI='), seal])
    expect(await commit(a, value)).toMatchObject({ kind: 'rolled_back' })
  expect(await commit(a, prune)).toMatchObject({ kind: 'committed' })
  expect(await commit(a, begin)).toMatchObject({ kind: 'rolled_back' })
  expect(await commit(a, { ...fence, operation: 'delete-2' })).toMatchObject({
    kind: 'rolled_back',
  })
})
it('deletes in bounded batches and resumes the original fence after restart', async () => {
  const a = await app()
  const bytes = Buffer.alloc(130, 120)
  const { createHash } = await import('node:crypto')
  expect(
    await commit(a, {
      ...begin,
      bytes: 130,
      chunkBytes: 1,
      sha256: createHash('sha256').update(bytes).digest('hex'),
    }),
  ).toMatchObject({ kind: 'committed' })
  for (let index = 0; index < 130; index += 1)
    expect(await commit(a, chunk(index, 'eA=='))).toMatchObject({ kind: 'committed' })
  expect(await commit(a, seal)).toMatchObject({ kind: 'committed' })
  expect(await commit(a, fence)).toMatchObject({ kind: 'committed' })
  expect(await commit(a, prune)).toMatchObject({ kind: 'committed' })
  expect(
    a.sqlite.inspect(domainNameOf(TENANT_A), 'SELECT COUNT(*) AS n FROM tl_material_chunk'),
  ).toEqual([{ n: 2n }])
  a.sqlite.close()
  const restarted = await openApp({ directory: a.directory, keep: true })
  try {
    expect(await commit(restarted, chunk(129, 'eA=='))).toMatchObject({ kind: 'rolled_back' })
    expect(await commit(restarted, prune)).toMatchObject({
      kind: 'committed',
      responses: [{ reply: { response: { kind: 'deleted', receipt: { record: 'delete-1' } } } }],
    })
    expect(await commit(restarted, prune)).toMatchObject({ kind: 'committed' })
    expect(
      restarted.sqlite.inspect(domainNameOf(TENANT_A), 'SELECT state, descriptor FROM tl_material'),
    ).toEqual([{ state: 'deleted', descriptor: null }])
    expect(
      restarted.sqlite.inspect(
        domainNameOf(TENANT_A),
        'SELECT COUNT(*) AS n FROM tl_material_chunk',
      ),
    ).toEqual([{ n: 0n }])
  } finally {
    restarted.close()
  }
})
it('excludes a queued chunk that arrives after the delete fence', async () => {
  const a = await app()
  await commit(a, begin)
  a.faults.armCommit('delayed')
  expect(await commit(a, chunk(0, 'YWI='))).toMatchObject({ kind: 'unknown' })
  await commit(a, fence)
  await a.faults.land()
  expect(
    a.sqlite.inspect(domainNameOf(TENANT_A), 'SELECT COUNT(*) AS n FROM tl_material_chunk'),
  ).toEqual([{ n: 0n }])
  expect(await commit(a, seal)).toMatchObject({ kind: 'rolled_back' })
})
it('recalls an unknown applied fence without reviving the write', async () => {
  const a = await app()
  await commit(a, begin)
  a.faults.armCommit('unknown-applied')
  expect(await commit(a, fence)).toMatchObject({ kind: 'unknown' })
  expect(await commit(a, fence)).toMatchObject({ kind: 'committed' })
  expect(await commit(a, begin)).toMatchObject({ kind: 'rolled_back' })
})
it('rolls a failed prune back and keeps the fence effective', async () => {
  const a = await app()
  await commit(a, begin)
  await commit(a, chunk(0, 'YWI='))
  await commit(a, fence)
  a.sqlite.failStatement(3)
  expect(await commit(a, prune)).toMatchObject({ kind: 'rolled_back' })
  expect(
    a.sqlite.inspect(domainNameOf(TENANT_A), 'SELECT COUNT(*) AS n FROM tl_material_chunk'),
  ).toEqual([{ n: 1n }])
  expect(await commit(a, chunk(1, 'Yw=='))).toMatchObject({ kind: 'rolled_back' })
  expect(await commit(a, prune)).toMatchObject({ kind: 'committed' })
})
async function read(a: App, input: Readonly<Record<string, JsonValue>>) {
  return a.options.storage.read({
    domain: {
      scope: { kind: 'tenant', tenant: textOf(TENANT_A) },
      transactionDomain: domainNameOf(TENANT_A),
    },
    handler: 'tool.material.read',
    protocol: '1',
    requestKey: randomUUID(),
    input,
  })
}
it('reads sealed bytes in bounded pieces and discloses none after the fence', async () => {
  const a = await app()
  await commit(a, begin)
  await commit(a, chunk(0, 'YWI='))
  expect(await read(a, { ...address, mode: 'bytes', offset: 0, maxBytes: 3 })).toMatchObject({
    kind: 'read',
    output: { kind: 'pending' },
  })
  await commit(a, chunk(1, 'Yw=='))
  await commit(a, seal)
  expect(await read(a, { ...address, mode: 'bytes', offset: 0, maxBytes: 3 })).toMatchObject({
    kind: 'read',
    output: { kind: 'bytes', data: 'YWI=', next: '2' },
  })
  expect(await read(a, { ...address, mode: 'bytes', offset: 2, maxBytes: 3 })).toMatchObject({
    kind: 'read',
    output: { kind: 'bytes', data: 'Yw==', next: null },
  })
  expect(await read(a, { ...address, mode: 'inspect' })).toMatchObject({
    kind: 'read',
    output: {
      kind: 'sealed',
      operation: 'write-1',
      digest: 'input-1',
      seal: { evidence: 'sealed' },
    },
  })
  await commit(a, fence)
  expect(await read(a, { ...address, mode: 'bytes', offset: 0, maxBytes: 3 })).toMatchObject({
    kind: 'read',
    output: { kind: 'excluded' },
  })
})
it('limits a page to 64 KiB even when one chunk and the request are larger', async () => {
  const a = await app()
  const bytes = Buffer.alloc(70_000, 120)
  const { createHash } = await import('node:crypto')
  await commit(a, {
    ...begin,
    bytes: bytes.length,
    chunkBytes: bytes.length,
    sha256: createHash('sha256').update(bytes).digest('hex'),
  })
  await commit(a, chunk(0, bytes.toString('base64')))
  expect(await commit(a, seal)).toMatchObject({ kind: 'committed' })
  expect(await read(a, { ...address, mode: 'bytes', offset: 0, maxBytes: 100_000 })).toMatchObject({
    kind: 'read',
    output: {
      kind: 'bytes',
      data: bytes.subarray(0, 65_536).toString('base64'),
      next: '65536',
    },
  })
})
it('does not recreate a missing chunk after sealing', async () => {
  const a = await app()
  await commit(a, begin)
  await commit(a, chunk(0, 'YWI='))
  await commit(a, chunk(1, 'Yw=='))
  await commit(a, seal)
  a.sqlite.inspect(domainNameOf(TENANT_A), 'DELETE FROM tl_material_chunk WHERE idx = 0')
  expect(await read(a, { ...address, mode: 'bytes', offset: 0, maxBytes: 3 })).toMatchObject({
    kind: 'read',
    output: { kind: 'corrupt' },
  })
  expect(await commit(a, chunk(0, 'YWI='))).toMatchObject({ kind: 'rolled_back' })
})
it('keeps object identity independent of the call and generation', async () => {
  const a = await app()
  await commit(a, begin)
  for (const other of [
    { ...begin, call: 'call-2' },
    { ...begin, material: 'material-generation-2' },
  ])
    expect(await commit(a, other)).toMatchObject({ kind: 'committed' })
  await commit(a, fence)
  for (const other of [
    { ...address, call: 'call-2' },
    { ...address, material: 'material-generation-2' },
  ])
    expect(await read(a, { ...other, mode: 'inspect' })).toMatchObject({
      kind: 'read',
      output: { kind: 'pending' },
    })
  expect(await read(a, { ...address, tenant: 'another-tenant', mode: 'inspect' })).toMatchObject({
    kind: 'read',
    output: { kind: 'unknown' },
  })
})

it('reads within a chunk and rejects invalid byte ranges', async () => {
  const a = await app()
  await commit(a, begin)
  await commit(a, chunk(0, 'YWI='))
  await commit(a, chunk(1, 'Yw=='))
  await commit(a, seal)
  expect(await read(a, { ...address, mode: 'bytes', offset: 1, maxBytes: 1 })).toMatchObject({
    kind: 'read',
    output: { kind: 'bytes', data: 'Yg==', next: '2' },
  })
  for (const range of [
    { offset: -1, maxBytes: 1 },
    { offset: 4, maxBytes: 1 },
    { offset: 0.5, maxBytes: 1 },
    { offset: 0, maxBytes: 0 },
  ])
    expect(await read(a, { ...address, mode: 'bytes', ...range })).toMatchObject({
      kind: 'read',
      output: { kind: 'invalid' },
    })
})
it('seals an empty material without chunks and reads its exact end', async () => {
  const a = await app()
  await commit(a, {
    ...begin,
    bytes: 0,
    sha256: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
  })
  expect(await commit(a, seal)).toMatchObject({ kind: 'committed' })
  expect(await read(a, { ...address, mode: 'bytes', offset: 0, maxBytes: 1 })).toMatchObject({
    kind: 'read',
    output: { kind: 'bytes', data: '', next: null },
  })
  expect(await commit(a, chunk(0, 'YQ=='))).toMatchObject({ kind: 'rolled_back' })
})
