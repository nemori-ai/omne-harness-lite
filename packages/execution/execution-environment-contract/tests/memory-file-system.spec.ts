import { expect, it } from 'vitest'
import { tenantCodec } from '@omne-harness/legal-identity'
import { originRef, type EnvironmentBinding } from '@omne-harness/execution-environment-contract'
import { createMemoryFileSystem } from '@omne-harness/execution-environment-contract/testing'

const tenant = (() => {
  const t = tenantCodec.parse(
    JSON.stringify({
      organization: 'org_0123456789abcdefghjkmnpqrs',
      account: 'acc_0123456789abcdefghjkmnpqrs',
    }),
  )
  if (!t.ok) throw new Error('tenant fixture')
  return t.value
})()
const binding: EnvironmentBinding = { kind: 'host_machine' }
let sequence = 0
function request() {
  return {
    requestId: `r${++sequence}`,
    access: { principal: 'test', tenant },
    origin: originRef('origin'),
    binding,
  }
}
const text = new TextEncoder()
const bytes = (value: string) => text.encode(value)

it('reads back the bytes and version that a create write produced', async () => {
  const fs = createMemoryFileSystem()
  const named = fs.objectToken('')
  const written = await fs.facility.write({
    ...request(),
    path: 'notes.txt',
    named: named ?? null,
    bytes: bytes('hello'),
    mode: 'create',
  })
  expect(written.kind).toBe('done')
  if (written.kind !== 'done') return
  const read = await fs.facility.read({
    ...request(),
    path: 'notes.txt',
    named: fs.objectToken('notes.txt') ?? null,
  })
  expect(read).toMatchObject({
    kind: 'done',
    value: { bytes: bytes('hello'), eof: true, nextOffsetBytes: 5, version: written.value.version },
  })
  expect(fs.peek('notes.txt')).toEqual(bytes('hello'))
})

async function readVersion(fs: ReturnType<typeof createMemoryFileSystem>, path: string) {
  const read = await fs.facility.read({ ...request(), path, named: fs.objectToken(path) ?? null })
  if (read.kind !== 'done') throw new Error(`read ${path}: ${read.kind}`)
  return read.value.version
}

it('replaces a file when expectedVersion is the version it read, and the version moves on', async () => {
  const fs = createMemoryFileSystem({ files: { 'notes.txt': 'hello' } })
  const before = await readVersion(fs, 'notes.txt')
  const written = await fs.facility.write({
    ...request(),
    path: 'notes.txt',
    named: fs.objectToken('notes.txt') ?? null,
    bytes: bytes('hello world'),
    mode: 'replace',
    expectedVersion: before,
  })
  expect(written.kind).toBe('done')
  if (written.kind !== 'done') return
  expect(written.value.version).not.toBe(before)
  expect(written.value.object).toEqual(fs.objectToken('notes.txt'))
  expect(await readVersion(fs, 'notes.txt')).toBe(written.value.version)
  expect(fs.peek('notes.txt')).toEqual(bytes('hello world'))
})

it('refuses a replace with a stale expectedVersion as conflict and keeps the bytes', async () => {
  const fs = createMemoryFileSystem({ files: { 'notes.txt': 'hello' } })
  const stale = await readVersion(fs, 'notes.txt')
  const named = fs.objectToken('notes.txt') ?? null
  const first = await fs.facility.write({
    ...request(),
    path: 'notes.txt',
    named,
    bytes: bytes('first'),
    mode: 'replace',
  })
  expect(first.kind).toBe('done')
  const id = request()
  expect(
    await fs.facility.write({
      ...id,
      path: 'notes.txt',
      named,
      bytes: bytes('second'),
      mode: 'replace',
      expectedVersion: stale,
    }),
  ).toEqual({ kind: 'rejected', requestId: id.requestId, reason: 'conflict' })
  expect(fs.peek('notes.txt')).toEqual(bytes('first'))
})

it('answers unresolved for a replace where no object is, and unsupported for a directory', async () => {
  const fs = createMemoryFileSystem({ directories: ['docs'] })
  const missing = await fs.facility.write({
    ...request(),
    path: 'docs/absent.txt',
    named: fs.objectToken('docs') ?? null,
    bytes: bytes('x'),
    mode: 'replace',
  })
  expect(missing.kind).toBe('unresolved')
  expect(fs.peek('docs/absent.txt')).toBeUndefined()
  const directory = await fs.facility.write({
    ...request(),
    path: 'docs',
    named: fs.objectToken('docs') ?? null,
    bytes: bytes('x'),
    mode: 'replace',
  })
  expect(directory).toMatchObject({ kind: 'rejected', reason: 'unsupported' })
})

it('refuses a path that climbs above the grant root as notAuthorized, and writes nothing', async () => {
  const fs = createMemoryFileSystem({ files: { 'notes.txt': 'hello' } })
  const root = fs.objectToken('') ?? null
  for (const path of ['../outside.txt', 'a/../../outside.txt', '..']) {
    const write = await fs.facility.write({
      ...request(),
      path,
      named: root,
      bytes: bytes('x'),
      mode: 'create',
    })
    expect(write).toMatchObject({ kind: 'rejected', reason: 'notAuthorized' })
    const read = await fs.facility.read({ ...request(), path, named: root })
    expect(read).toMatchObject({ kind: 'rejected', reason: 'notAuthorized' })
  }
  expect(fs.objectToken('outside.txt')).toBeUndefined()
  expect(fs.peek('notes.txt')).toEqual(bytes('hello'))
})

it('refuses an absolute path or a path with a NUL byte as invalidInput', async () => {
  const fs = createMemoryFileSystem({ files: { 'notes.txt': 'hello' } })
  const named = fs.objectToken('notes.txt') ?? null
  for (const path of ['/notes.txt', 'notes\0.txt']) {
    expect(await fs.facility.read({ ...request(), path, named })).toMatchObject({
      kind: 'rejected',
      reason: 'invalidInput',
    })
    expect(
      await fs.facility.write({ ...request(), path, named, bytes: bytes('x'), mode: 'replace' }),
    ).toMatchObject({ kind: 'rejected', reason: 'invalidInput' })
  }
  expect(fs.peek('notes.txt')).toEqual(bytes('hello'))
})

it('refuses a null named object as notAuthorized and another object as conflict', async () => {
  const fs = createMemoryFileSystem({ files: { 'a.txt': 'a', 'b.txt': 'b' }, directories: ['d'] })
  expect(await fs.facility.read({ ...request(), path: 'a.txt', named: null })).toMatchObject({
    kind: 'rejected',
    reason: 'notAuthorized',
  })
  const other = fs.objectToken('b.txt') ?? null
  expect(await fs.facility.read({ ...request(), path: 'a.txt', named: other })).toMatchObject({
    kind: 'rejected',
    reason: 'conflict',
  })
  expect(
    await fs.facility.write({
      ...request(),
      path: 'a.txt',
      named: other,
      bytes: bytes('x'),
      mode: 'replace',
    }),
  ).toMatchObject({ kind: 'rejected', reason: 'conflict' })
  const create = await fs.facility.write({
    ...request(),
    path: 'd/new.txt',
    named: fs.objectToken('') ?? null,
    bytes: bytes('x'),
    mode: 'create',
  })
  expect(create).toMatchObject({ kind: 'rejected', reason: 'conflict' })
  expect(fs.peek('a.txt')).toEqual(bytes('a'))
  expect(fs.objectToken('d/new.txt')).toBeUndefined()
})

it('refuses a bad create: expectedVersion, trailing slash, missing parent, existing target', async () => {
  const fs = createMemoryFileSystem({ files: { 'notes.txt': 'hello' } })
  const root = fs.objectToken('') ?? null
  const create = (path: string, extra: { expectedVersion?: string } = {}) =>
    fs.facility.write({
      ...request(),
      path,
      named: root,
      bytes: bytes('x'),
      mode: 'create',
      ...extra,
    })
  expect(await create('new.txt', { expectedVersion: 'v1' })).toMatchObject({
    kind: 'rejected',
    reason: 'invalidInput',
  })
  expect(await create('new/')).toMatchObject({ kind: 'rejected', reason: 'invalidInput' })
  expect(await create('missing/new.txt')).toMatchObject({ kind: 'rejected', reason: 'notFound' })
  expect(await create('notes.txt')).toMatchObject({ kind: 'rejected', reason: 'conflict' })
  expect(fs.objectToken('new.txt')).toBeUndefined()
  expect(fs.objectToken('new')).toBeUndefined()
  expect(fs.peek('notes.txt')).toEqual(bytes('hello'))
})

it('reads in segments with the same version, the next offset and the end flag', async () => {
  const fs = createMemoryFileSystem({ files: { 'big.txt': 'abcdefghij' } })
  const named = fs.objectToken('big.txt') ?? null
  const segment = (offsetBytes: number, limitBytes: number) =>
    fs.facility.read({ ...request(), path: 'big.txt', named, offsetBytes, limitBytes })
  const first = await segment(0, 4)
  const second = await segment(4, 4)
  const third = await segment(8, 4)
  expect(first).toMatchObject({
    kind: 'done',
    value: { bytes: bytes('abcd'), nextOffsetBytes: 4, eof: false },
  })
  expect(second).toMatchObject({
    kind: 'done',
    value: { bytes: bytes('efgh'), nextOffsetBytes: 8, eof: false },
  })
  expect(third).toMatchObject({
    kind: 'done',
    value: { bytes: bytes('ij'), nextOffsetBytes: 10, eof: true },
  })
  const versions = [first, second, third].map(r => (r.kind === 'done' ? r.value.version : r.kind))
  expect(new Set(versions).size).toBe(1)
  const handles = [first, second, third].map(r =>
    r.kind === 'done' ? r.value.handle.generation : r.kind,
  )
  expect(new Set(handles).size).toBe(3)
})

it('refuses a read offset or limit that is not a non-negative safe integer', async () => {
  const fs = createMemoryFileSystem({ files: { 'big.txt': 'abcdefghij' } })
  const named = fs.objectToken('big.txt') ?? null
  for (const bad of [-1, 1.5, Number.NaN, Number.MAX_SAFE_INTEGER + 1]) {
    expect(
      await fs.facility.read({ ...request(), path: 'big.txt', named, offsetBytes: bad }),
    ).toMatchObject({ kind: 'rejected', reason: 'invalidInput' })
    expect(
      await fs.facility.read({ ...request(), path: 'big.txt', named, limitBytes: bad }),
    ).toMatchObject({ kind: 'rejected', reason: 'invalidInput' })
  }
})

it('answers unresolved for a read where no object is, and unsupported for a directory', async () => {
  const fs = createMemoryFileSystem({ directories: ['docs'] })
  const named = fs.objectToken('docs') ?? null
  expect(await fs.facility.read({ ...request(), path: 'docs/none.txt', named })).toMatchObject({
    kind: 'unresolved',
  })
  expect(await fs.facility.read({ ...request(), path: 'docs', named })).toMatchObject({
    kind: 'rejected',
    reason: 'unsupported',
  })
})

it('reports file and directory information through stat', async () => {
  const fs = createMemoryFileSystem({ files: { 'docs/a.txt': 'abc' } })
  const file = await fs.facility.stat({
    ...request(),
    path: 'docs/a.txt',
    named: fs.objectToken('docs/a.txt') ?? null,
  })
  expect(file).toMatchObject({
    kind: 'done',
    value: { type: 'file', sizeBytes: 3, object: fs.objectToken('docs/a.txt') },
  })
  const directory = await fs.facility.stat({
    ...request(),
    path: 'docs',
    named: fs.objectToken('docs') ?? null,
  })
  expect(directory).toMatchObject({ kind: 'done', value: { type: 'directory' } })
  expect(
    await fs.facility.stat({ ...request(), path: 'none', named: fs.objectToken('') ?? null }),
  ).toMatchObject({ kind: 'unresolved' })
})

it('moves the modified time and the directory version when a create adds an entry', async () => {
  const fs = createMemoryFileSystem({ directories: ['docs'] })
  const docs = fs.objectToken('docs') ?? null
  const stat = async () => {
    const answer = await fs.facility.stat({ ...request(), path: 'docs', named: docs })
    if (answer.kind !== 'done') throw new Error(answer.kind)
    return answer.value
  }
  const before = await stat()
  const created = await fs.facility.write({
    ...request(),
    path: 'docs/new.txt',
    named: docs,
    bytes: bytes('x'),
    mode: 'create',
  })
  expect(created.kind).toBe('done')
  const after = await stat()
  expect(after.version).not.toBe(before.version)
  expect(after.modifiedMs).toBeGreaterThan(before.modifiedMs)
})

it('lists a directory sorted by name, page by page', async () => {
  const fs = createMemoryFileSystem({
    files: { 'd/c.txt': 'c', 'd/a.txt': 'a' },
    directories: ['d/b'],
  })
  const named = fs.objectToken('d') ?? null
  const first = await fs.facility.list({ ...request(), path: 'd', named, limit: 2 })
  expect(first.kind).toBe('done')
  if (first.kind !== 'done') return
  expect(first.value.directory.object).toEqual(fs.objectToken('d'))
  expect(first.value.entries.map(e => e.object)).toEqual([
    fs.objectToken('d/a.txt'),
    fs.objectToken('d/b'),
  ])
  expect(first.value.entries.map(e => e.type)).toEqual(['file', 'directory'])
  expect(first.value.nextOffset).toBe(2)
  const second = await fs.facility.list({ ...request(), path: 'd', named, offset: 2, limit: 2 })
  expect(second.kind).toBe('done')
  if (second.kind !== 'done') return
  expect(second.value.entries.map(e => e.object)).toEqual([fs.objectToken('d/c.txt')])
  expect(second.value.nextOffset).toBeUndefined()
})

it('refuses a list of a file as unsupported and answers unresolved where no object is', async () => {
  const fs = createMemoryFileSystem({ files: { 'a.txt': 'a' } })
  expect(
    await fs.facility.list({ ...request(), path: 'a.txt', named: fs.objectToken('a.txt') ?? null }),
  ).toMatchObject({ kind: 'rejected', reason: 'unsupported' })
  expect(
    await fs.facility.list({ ...request(), path: 'none', named: fs.objectToken('') ?? null }),
  ).toMatchObject({ kind: 'unresolved' })
})

it('closes a handle generation it issued for the named object, and refuses any other', async () => {
  const fs = createMemoryFileSystem({ files: { 'a.txt': 'a', 'b.txt': 'b' } })
  const a = fs.objectToken('a.txt') ?? null
  const read = await fs.facility.read({ ...request(), path: 'a.txt', named: a })
  if (read.kind !== 'done') throw new Error(read.kind)
  const handle = read.value.handle
  expect(await fs.facility.close({ ...request(), path: 'a.txt', named: a, handle })).toMatchObject({
    kind: 'done',
    value: { handle },
  })
  const b = fs.objectToken('b.txt') ?? null
  expect(await fs.facility.close({ ...request(), path: 'b.txt', named: b, handle })).toMatchObject({
    kind: 'rejected',
    reason: 'invalidInput',
  })
  const invented = { ...handle, generation: '999' }
  expect(
    await fs.facility.close({ ...request(), path: 'a.txt', named: a, handle: invented }),
  ).toMatchObject({ kind: 'rejected', reason: 'invalidInput' })
})

it('answers unsupported for the seven operations it does not implement, and changes nothing', async () => {
  const fs = createMemoryFileSystem({ files: { 'a.txt': 'a' } })
  const named = fs.objectToken('a.txt') ?? null
  const target = { path: 'b.txt', named: fs.objectToken('') ?? null }
  const answers = await Promise.all([
    fs.facility.search({
      ...request(),
      path: '',
      named: fs.objectToken('') ?? null,
      pattern: bytes('a'),
      match: 'content',
      recursive: true,
    }),
    fs.facility.mkdir({ ...request(), path: 'dir', named: target.named, parents: false }),
    fs.facility.remove({ ...request(), path: 'a.txt', named, recursive: false }),
    fs.facility.move({ ...request(), path: 'a.txt', named, target, replace: false }),
    fs.facility.copy({ ...request(), path: 'a.txt', named, target, replace: false }),
    fs.facility.commitBatch({
      ...request(),
      entries: [{ path: 'a.txt', named, bytes: bytes('x'), expectedVersion: null }],
    }),
    fs.facility.recoverBatch({ ...request(), batch: { id: 'b', generation: '1' } }),
    fs.facility.list({ ...request(), path: '', named: fs.objectToken('') ?? null }),
  ])
  expect(answers.slice(0, 7).map(a => (a.kind === 'rejected' ? a.reason : a.kind))).toEqual(
    Array(7).fill('unsupported'),
  )
  expect(answers[7]?.kind).toBe('done')
  expect(fs.peek('a.txt')).toEqual(bytes('a'))
  expect(fs.objectToken('b.txt')).toBeUndefined()
  expect(fs.objectToken('dir')).toBeUndefined()
})

it('answers closed for every operation after close() and changes nothing', async () => {
  const fs = createMemoryFileSystem({ files: { 'a.txt': 'a' } })
  const named = fs.objectToken('a.txt') ?? null
  const root = fs.objectToken('') ?? null
  const read = await fs.facility.read({ ...request(), path: 'a.txt', named })
  if (read.kind !== 'done') throw new Error(read.kind)
  const recorded = fs.calls.length
  fs.close()
  const answers = await Promise.all([
    fs.facility.read({ ...request(), path: 'a.txt', named }),
    fs.facility.stat({ ...request(), path: 'a.txt', named }),
    fs.facility.write({ ...request(), path: 'a.txt', named, bytes: bytes('x'), mode: 'replace' }),
    fs.facility.write({
      ...request(),
      path: 'n.txt',
      named: root,
      bytes: bytes('x'),
      mode: 'create',
    }),
    fs.facility.close({ ...request(), path: 'a.txt', named, handle: read.value.handle }),
    fs.facility.list({ ...request(), path: '', named: root }),
    fs.facility.mkdir({ ...request(), path: 'dir', named: root, parents: false }),
    fs.facility.commitBatch({ ...request(), entries: [] }),
  ])
  expect(answers.map(a => (a.kind === 'rejected' ? a.reason : a.kind))).toEqual(
    Array(answers.length).fill('closed'),
  )
  expect(fs.peek('a.txt')).toEqual(bytes('a'))
  expect(fs.objectToken('n.txt')).toBeUndefined()
  expect(fs.calls).toHaveLength(recorded)
})

it('records each accepted operation with its path', async () => {
  const fs = createMemoryFileSystem({ files: { 'a.txt': 'a' } })
  await fs.facility.stat({ ...request(), path: 'a.txt', named: fs.objectToken('a.txt') ?? null })
  await fs.facility.read({ ...request(), path: '../x', named: null })
  expect(fs.calls).toEqual([
    { operation: 'stat', path: 'a.txt' },
    { operation: 'read', path: '../x' },
  ])
})

it('keeps its own copy of written bytes and hands out copies', async () => {
  const source = bytes('hello')
  const fs = createMemoryFileSystem()
  await fs.facility.write({
    ...request(),
    path: 'a.txt',
    named: fs.objectToken('') ?? null,
    bytes: source,
    mode: 'create',
  })
  source[0] = 0
  const peeked = fs.peek('a.txt')
  if (peeked) peeked[1] = 0
  const read = await fs.facility.read({
    ...request(),
    path: 'a.txt',
    named: fs.objectToken('a.txt') ?? null,
  })
  if (read.kind === 'done') read.value.bytes[2] = 0
  expect(fs.peek('a.txt')).toEqual(bytes('hello'))
})

it('throws a TypeError for a seed path that is absolute, climbs above the root, or clashes', () => {
  expect(() => createMemoryFileSystem({ files: { '/a.txt': 'a' } })).toThrow(TypeError)
  expect(() => createMemoryFileSystem({ directories: ['../d'] })).toThrow(TypeError)
  expect(() => createMemoryFileSystem({ files: { a: 'a', 'a/b': 'b' } })).toThrow(TypeError)
})
