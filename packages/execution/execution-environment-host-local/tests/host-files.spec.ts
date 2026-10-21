import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it } from 'vitest'
import { tenantCodec } from '@omne-harness/legal-identity'
import {
  originRef,
  type FileRequest,
  type ObjectToken,
} from '@omne-harness/execution-environment-contract'
import { createHostFiles, hostObjectToken } from '@omne-harness/execution-environment-host-local'

const roots: string[] = []

afterEach(async () => {
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })))
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

it('reads a named file outside the workspace directory', async () => {
  const root = await tree()
  const workspace = join(root, 'workspace')
  const outside = join(root, 'outside', 'notes.txt')
  await mkdir(workspace)
  await mkdir(join(root, 'outside'))
  await writeFile(outside, 'outside-bytes')
  const files = createHostFiles()
  const named = await hostObjectToken(outside)
  const result = await files.read(request(outside, named, 'r-outside'))
  expect(result).toEqual({
    kind: 'done',
    requestId: 'r-outside',
    value: {
      object: named,
      handle: { object: named, generation: '1' },
      version: expect.any(String),
      bytes: text('outside-bytes'),
      nextOffsetBytes: text('outside-bytes').byteLength,
      eof: true,
    },
  })
})

it('reads a bounded byte range and reports where the next read starts', async () => {
  const root = await tree()
  const path = join(root, 'notes.txt')
  await writeFile(path, '0123456789')
  const named = await hostObjectToken(path)
  const files = createHostFiles()
  const head = await files.read({ ...request(path, named, 'head'), offsetBytes: 2, limitBytes: 3 })
  expect(head).toMatchObject({
    kind: 'done',
    value: { bytes: text('234'), nextOffsetBytes: 5, eof: false },
  })
  const tail = await files.read({ ...request(path, named, 'tail'), offsetBytes: 7, limitBytes: 10 })
  expect(tail).toMatchObject({
    kind: 'done',
    value: { bytes: text('789'), nextOffsetBytes: 10, eof: true },
  })
  const negative = await files.read({ ...request(path, named, 'negative'), offsetBytes: -1 })
  expect(negative).toEqual({ kind: 'rejected', requestId: 'negative', reason: 'invalidInput' })
})

it('reports the object type, size and version on stat', async () => {
  const root = await tree()
  const path = join(root, 'notes.txt')
  await writeFile(path, 'stat-bytes')
  const named = await hostObjectToken(path)
  const files = createHostFiles()
  const stat = await files.stat(request(path, named, 'stat'))
  const read = await files.read(request(path, named, 'read'))
  if (stat.kind !== 'done' || read.kind !== 'done') throw new Error('expected both to complete')
  expect(stat.value).toMatchObject({ type: 'file', sizeBytes: 10 })
  expect(stat.value.version).toBe(read.value.version)
})

it('creates a new file under the named parent and refuses to replace one that exists', async () => {
  const root = await tree()
  const path = join(root, 'new.txt')
  const parent = await hostObjectToken(root)
  const files = createHostFiles()
  const created = await files.write({
    ...request(path, parent, 'create'),
    bytes: text('fresh'),
    mode: 'create',
  })
  expect(created).toMatchObject({ kind: 'done', value: { object: await hostObjectToken(path) } })
  expect(await readFile(path, 'utf8')).toBe('fresh')

  const again = await files.write({
    ...request(path, parent, 'create-again'),
    bytes: text('other'),
    mode: 'create',
  })
  expect(again).toEqual({ kind: 'rejected', requestId: 'create-again', reason: 'conflict' })
  expect(await readFile(path, 'utf8')).toBe('fresh')
})

it('refuses to create when the named parent is a different directory', async () => {
  const root = await tree()
  const elsewhere = join(root, 'elsewhere')
  await mkdir(elsewhere)
  const files = createHostFiles()
  const result = await files.write({
    ...request(join(root, 'new.txt'), await hostObjectToken(elsewhere), 'wrong-parent'),
    bytes: text('fresh'),
    mode: 'create',
  })
  expect(result).toEqual({ kind: 'rejected', requestId: 'wrong-parent', reason: 'conflict' })
  await expect(readFile(join(root, 'new.txt'))).rejects.toMatchObject({ code: 'ENOENT' })
})

it('refuses a replace whose expected version no longer matches and leaves the file unchanged', async () => {
  const root = await tree()
  const path = join(root, 'notes.txt')
  await writeFile(path, 'first')
  const named = await hostObjectToken(path)
  const files = createHostFiles()
  const stat = await files.stat(request(path, named, 'stat'))
  if (stat.kind !== 'done') throw new Error('expected stat to complete')
  await writeFile(path, 'changed-by-someone-else')
  const result = await files.write({
    ...request(path, named, 'stale'),
    bytes: text('mine'),
    mode: 'replace',
    expectedVersion: stat.value.version,
  })
  expect(result).toEqual({ kind: 'rejected', requestId: 'stale', reason: 'conflict' })
  expect(await readFile(path, 'utf8')).toBe('changed-by-someone-else')
})
