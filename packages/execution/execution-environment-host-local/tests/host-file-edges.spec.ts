// Edge results of the host files facility on the real file system: refusals before any open,
// unmapped and permission errors, multi-chunk reads, end-of-file at the limit, and versions that
// agree across operations.
import { chmod, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it } from 'vitest'
import { tenantCodec } from '@omne-harness/legal-identity'
import {
  originRef,
  type EnvironmentBinding,
  type FileRequest,
  type ObjectToken,
} from '@omne-harness/execution-environment-contract'
import { createHostFiles, hostObjectToken } from '@omne-harness/execution-environment-host-local'

const roots: string[] = []

afterEach(async () => {
  for (const root of roots.splice(0)) {
    await chmod(root, 0o700).catch(() => undefined)
    await rm(root, { recursive: true, force: true })
  }
})

async function tree() {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'omne-exec-env-')))
  roots.push(root)
  return root
}

const tenant = (() => {
  const parsed = tenantCodec.parse(
    JSON.stringify({
      organization: 'org_0123456789abcdefghjkmnpqrs',
      account: 'acc_0123456789abcdefghjkmnpqrs',
    }),
  )
  if (!parsed.ok) throw new Error('tenant fixture did not parse')
  return parsed.value
})()

const sandbox: EnvironmentBinding = { kind: 'tenant_sandbox', tenant }

function request(path: string, named: ObjectToken | null, requestId: string): FileRequest<string> {
  return {
    requestId,
    access: { principal: 'subject-a', tenant },
    origin: originRef('call-1'),
    binding: { kind: 'host_machine' },
    path,
    named,
  }
}

const text = (value: string) => new TextEncoder().encode(value)
const refused = (requestId: string, reason: string) => ({ kind: 'rejected', requestId, reason })

async function namedFile(contents: string | Uint8Array) {
  const root = await tree()
  const path = join(root, 'notes.txt')
  await writeFile(path, contents)
  return { root, path, named: await hostObjectToken(path) }
}

it('refuses stat, write and close without a named object as notAuthorized', async () => {
  const { path, named } = await namedFile('kept')
  const files = createHostFiles()
  expect(await files.stat(request(path, null, 's'))).toEqual(refused('s', 'notAuthorized'))
  expect(
    await files.write({ ...request(path, null, 'w'), bytes: text('x'), mode: 'replace' }),
  ).toEqual(refused('w', 'notAuthorized'))
  expect(
    await files.close({ ...request(path, null, 'c'), handle: { object: named, generation: '1' } }),
  ).toEqual(refused('c', 'notAuthorized'))
  expect(await readFile(path, 'utf8')).toBe('kept')
})

it('refuses a create on a sandbox binding, without a name, with a version or a trailing slash, before creating anything', async () => {
  const root = await tree()
  const parent = await hostObjectToken(root)
  const target = join(root, 'new.txt')
  const files = createHostFiles()
  const create = (id: string, extra: Partial<FileRequest<string>> & { expectedVersion?: string }) =>
    files.write({ ...request(target, parent, id), bytes: text('x'), mode: 'create', ...extra })
  expect(await create('sandboxed', { binding: sandbox })).toEqual(
    refused('sandboxed', 'unsupported'),
  )
  expect(await create('unnamed', { named: null })).toEqual(refused('unnamed', 'notAuthorized'))
  expect(await create('versioned', { expectedVersion: '1:1' })).toEqual(
    refused('versioned', 'invalidInput'),
  )
  expect(await create('nul', { path: `${target}\0` })).toEqual(refused('nul', 'invalidInput'))
  expect(await create('slash', { path: `${target}/` })).toEqual(refused('slash', 'invalidInput'))
  await expect(readFile(target)).rejects.toMatchObject({ code: 'ENOENT' })
})

it('answers notFound when the parent directory of a create does not exist', async () => {
  const root = await tree()
  const files = createHostFiles()
  const result = await files.write({
    ...request(join(root, 'missing', 'new.txt'), await hostObjectToken(root), 'orphan'),
    bytes: text('x'),
    mode: 'create',
  })
  expect(result).toEqual(refused('orphan', 'notFound'))
})

it('answers notAuthorized when the host denies access, for read and for create', async () => {
  const { root, path, named } = await namedFile('secret')
  await chmod(path, 0o000)
  const files = createHostFiles()
  expect(await files.read(request(path, named, 'denied'))).toEqual(
    refused('denied', 'notAuthorized'),
  )
  const locked = join(root, 'locked')
  await mkdir(locked)
  const lockedToken = await hostObjectToken(locked)
  await chmod(locked, 0o500)
  expect(
    await files.write({
      ...request(join(locked, 'new.txt'), lockedToken, 'no-write'),
      bytes: text('x'),
      mode: 'create',
    }),
  ).toEqual(refused('no-write', 'notAuthorized'))
  await chmod(locked, 0o700)
})

it('answers unknown for an open error it does not map', async () => {
  const { root } = await namedFile('x')
  const files = createHostFiles()
  const tooLong = join(root, 'n'.repeat(300))
  expect(await files.read(request(tooLong, { token: '1:1' }, 'long'))).toEqual({
    kind: 'unknown',
    requestId: 'long',
  })
})

it('refuses a close on a sandbox binding and answers unknown when the handle names another object', async () => {
  const { root, path, named } = await namedFile('x')
  const other = await hostObjectToken(root)
  const files = createHostFiles()
  const read = await files.read(request(path, named, 'r'))
  if (read.kind !== 'done') throw new Error('expected a read')
  expect(
    await files.close({
      ...request(path, named, 'c1'),
      binding: sandbox,
      handle: read.value.handle,
    }),
  ).toEqual(refused('c1', 'unsupported'))
  expect(await files.close({ ...request(path, other, 'c2'), handle: read.value.handle })).toEqual({
    kind: 'unknown',
    requestId: 'c2',
  })
  expect(await files.close({ ...request(path, named, 'c3'), handle: read.value.handle })).toEqual({
    kind: 'done',
    requestId: 'c3',
    value: { handle: read.value.handle },
  })
})

it('reads more than one chunk, stops at the limit and reports end of file only at the end', async () => {
  const bytes = new Uint8Array(100_000).map((_, index) => index % 251)
  const { path, named } = await namedFile(bytes)
  const files = createHostFiles()
  const head = await files.read({
    ...request(path, named, 'head'),
    offsetBytes: 0,
    limitBytes: 70_000,
  })
  expect(head).toMatchObject({ kind: 'done', value: { nextOffsetBytes: 70_000, eof: false } })
  if (head.kind !== 'done') return
  expect(head.value.bytes).toEqual(bytes.subarray(0, 70_000))
  const rest = await files.read({
    ...request(path, named, 'rest'),
    offsetBytes: 70_000,
    limitBytes: 30_000,
  })
  expect(rest).toMatchObject({ kind: 'done', value: { nextOffsetBytes: 100_000, eof: true } })
  if (rest.kind !== 'done') return
  expect(rest.value.bytes).toEqual(bytes.subarray(70_000))
  const whole = await files.read(request(path, named, 'whole'))
  expect(whole).toMatchObject({ kind: 'done', value: { nextOffsetBytes: 100_000, eof: true } })
  if (whole.kind !== 'done') return
  expect(whole.value.bytes).toEqual(bytes)
})

it('gives one version for one state of the file across write, read, stat and a matching replace', async () => {
  const { path, named } = await namedFile('first')
  const files = createHostFiles()
  const written = await files.write({
    ...request(path, named, 'w1'),
    bytes: text('second'),
    mode: 'replace',
  })
  if (written.kind !== 'done') throw new Error('expected a write')
  const read = await files.read(request(path, named, 'r'))
  const stat = await files.stat(request(path, named, 's'))
  expect(read).toMatchObject({ kind: 'done', value: { version: written.value.version } })
  expect(stat).toMatchObject({ kind: 'done', value: { version: written.value.version } })
  const replaced = await files.write({
    ...request(path, named, 'w2'),
    bytes: text('third'),
    mode: 'replace',
    expectedVersion: written.value.version,
  })
  expect(replaced).toMatchObject({ kind: 'done', requestId: 'w2' })
  expect(await readFile(path, 'utf8')).toBe('third')
})

it('gives a created file the same version a later stat reports', async () => {
  const root = await tree()
  const target = join(root, 'new.txt')
  const files = createHostFiles()
  const created = await files.write({
    ...request(target, await hostObjectToken(root), 'create'),
    bytes: text('fresh'),
    mode: 'create',
  })
  if (created.kind !== 'done') throw new Error('expected a create')
  expect(await files.stat(request(target, created.value.object, 's'))).toMatchObject({
    kind: 'done',
    value: { version: created.value.version, type: 'file', sizeBytes: 5 },
  })
})

it('stats the root directory by its own path', async () => {
  const files = createHostFiles()
  const named = await hostObjectToken('/')
  expect(await files.stat(request('/', named, 'root'))).toMatchObject({
    kind: 'done',
    value: { object: named, type: 'directory' },
  })
})

it('accepts an explicit zero offset', async () => {
  const { path, named } = await namedFile('0123')
  const files = createHostFiles()
  expect(
    await files.read({ ...request(path, named, 'zero'), offsetBytes: 0, limitBytes: 0 }),
  ).toMatchObject({
    kind: 'done',
    value: { bytes: new Uint8Array(0), nextOffsetBytes: 0, eof: false },
  })
})
