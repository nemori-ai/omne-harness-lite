import { lstat, mkdir, mkdtemp, rename, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it } from 'vitest'
import { createHostFiles, hostObjectToken, type FileRequest } from '@omne-harness/execution-environment'

const roots: string[] = []

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

async function tree() {
  const root = await mkdtemp(join(tmpdir(), 'omne-exec-env-'))
  roots.push(root)
  return root
}

function request(path: string, named: FileRequest['named'], requestId: string): FileRequest {
  return {
    requestId,
    originalCallId: 'call-1',
    subjectId: 'subject-a',
    binding: { kind: 'host_machine' },
    path,
    named,
  }
}

const text = (value: string) => new TextEncoder().encode(value)

it('refuses an unnamed file and does not return its bytes', async () => {
  const root = await tree()
  const path = join(root, 'secret.txt')
  await writeFile(path, 'secret-bytes')
  const result = await createHostFiles().read(request(path, null, 'unnamed'))
  expect(result).toEqual({ kind: 'rejected', requestId: 'unnamed', reason: 'notAuthorized' })
})

it('refuses a path that contains a NUL byte', async () => {
  const root = await tree()
  const result = await createHostFiles().read(request(`${root}/notes.txt\0`, { token: 'unused' }, 'nul'))
  expect(result).toEqual({ kind: 'rejected', requestId: 'nul', reason: 'invalidInput' })
})

it('leaves a missing path unresolved', async () => {
  const root = await tree()
  const result = await createHostFiles().read(request(join(root, 'missing.txt'), { token: '1:2' }, 'missing'))
  expect(result).toEqual({ kind: 'unresolved', requestId: 'missing' })
})

it('refuses a final symlink and does not return the target bytes', async () => {
  const root = await tree()
  const target = join(root, 'target.txt')
  const link = join(root, 'link.txt')
  await writeFile(target, 'secret-bytes')
  await symlink(target, link)
  const named = await hostObjectToken(link)
  const result = await createHostFiles().read(request(link, named, 'symlink'))
  expect(result).toEqual({ kind: 'rejected', requestId: 'symlink', reason: 'unsupported' })
  expect(JSON.stringify(result)).not.toContain('secret-bytes')
})

it('refuses when an intermediate directory is replaced by a link to another object', async () => {
  const root = await tree()
  const box = join(root, 'box')
  const other = join(root, 'other')
  await mkdir(box)
  await mkdir(other)
  const boxed = join(box, 'notes.txt')
  const swapped = join(other, 'notes.txt')
  await writeFile(boxed, 'boxed-bytes')
  await writeFile(swapped, 'other-bytes')
  const named = await hostObjectToken(boxed)
  await rename(box, join(root, 'box-real'))
  await symlink(other, box)
  const result = await createHostFiles().read(request(join(box, 'notes.txt'), named, 'swap'))
  expect(result).toEqual({ kind: 'rejected', requestId: 'swap', reason: 'conflict' })
  expect(JSON.stringify(result)).not.toContain('other-bytes')
})

it('reads through an ancestor symlink when the final object is the named one', async () => {
  const root = await tree()
  const real = join(root, 'real')
  await mkdir(real)
  const file = join(real, 'notes.txt')
  await writeFile(file, 'real-bytes')
  await symlink(real, join(root, 'via'))
  const named = await hostObjectToken(file)
  const stat = await lstat(file)
  expect(named.token).toBe(`${stat.dev}:${stat.ino}`)
  const result = await createHostFiles().read(request(join(root, 'via', 'notes.txt'), named, 'ancestor'))
  expect(result).toEqual({
    kind: 'done',
    requestId: 'ancestor',
    value: {
      object: named,
      handle: { object: named, generation: '1' },
      bytes: text('real-bytes'),
    },
  })
})

it('confirms identity on stat and does not return file bytes', async () => {
  const root = await tree()
  const path = join(root, 'notes.txt')
  await writeFile(path, 'stat-bytes')
  const named = await hostObjectToken(path)
  const result = await createHostFiles().stat(request(path, named, 'stat'))
  expect(result).toEqual({
    kind: 'done',
    requestId: 'stat',
    value: {
      object: named,
      handle: { object: named, generation: '1' },
    },
  })
})

it('confirms identity on write and a later read returns the written bytes', async () => {
  const root = await tree()
  const path = join(root, 'notes.txt')
  await writeFile(path, 'old-bytes')
  const named = await hostObjectToken(path)
  const files = createHostFiles()
  const written = new TextEncoder().encode('new-bytes')
  const result = await files.write({ ...request(path, named, 'write'), bytes: written })
  expect(result).toEqual({
    kind: 'done',
    requestId: 'write',
    value: {
      object: named,
      handle: { object: named, generation: '1' },
    },
  })
  const again = await files.read(request(path, named, 'reread'))
  expect(again).toEqual({
    kind: 'done',
    requestId: 'reread',
    value: {
      object: named,
      handle: { object: named, generation: '1' },
      bytes: written,
    },
  })
})

it('returns only the handle when close succeeds', async () => {
  const root = await tree()
  const path = join(root, 'notes.txt')
  await writeFile(path, 'close-bytes')
  const named = await hostObjectToken(path)
  const files = createHostFiles()
  const opened = await files.read(request(path, named, 'before-close'))
  expect(opened.kind).toBe('done')
  if (opened.kind !== 'done') return
  const result = await files.close({ ...request(path, named, 'close'), handle: opened.value.handle })
  expect(result).toEqual({
    kind: 'done',
    requestId: 'close',
    value: { handle: opened.value.handle },
  })
  expect(opened.value.bytes).toEqual(text('close-bytes'))
})

it('keeps the earlier bytes when the next use is revoked', async () => {
  const root = await tree()
  const path = join(root, 'notes.txt')
  await writeFile(path, 'kept-bytes')
  const named = await hostObjectToken(path)
  const files = createHostFiles()
  const first = await files.read(request(path, named, 'kept'))
  const revoked = await files.read(request(path, null, 'revoked'))
  expect(revoked).toEqual({ kind: 'rejected', requestId: 'revoked', reason: 'notAuthorized' })
  expect(first).toEqual({
    kind: 'done',
    requestId: 'kept',
    value: {
      object: named,
      handle: { object: named, generation: '1' },
      bytes: text('kept-bytes'),
    },
  })
})

it('does not reuse the first completion after the path names a new object', async () => {
  const root = await tree()
  const path = join(root, 'notes.txt')
  const other = join(root, 'other.txt')
  await writeFile(path, 'first-bytes')
  await writeFile(other, 'second-bytes')
  const firstNamed = await hostObjectToken(path)
  const files = createHostFiles()
  const first = await files.read(request(path, firstNamed, 'first'))
  await rm(path)
  await rename(other, path)
  const secondNamed = await hostObjectToken(path)
  expect(secondNamed).not.toEqual(firstNamed)
  const reused = await files.read(request(path, firstNamed, 'reused'))
  const renamed = await files.read(request(path, secondNamed, 'renamed'))
  expect(reused).toEqual({ kind: 'rejected', requestId: 'reused', reason: 'conflict' })
  expect(renamed).toEqual({
    kind: 'done',
    requestId: 'renamed',
    value: {
      object: secondNamed,
      handle: { object: secondNamed, generation: '1' },
      bytes: text('second-bytes'),
    },
  })
  expect(first).toEqual({
    kind: 'done',
    requestId: 'first',
    value: {
      object: firstNamed,
      handle: { object: firstNamed, generation: '1' },
      bytes: text('first-bytes'),
    },
  })
})
