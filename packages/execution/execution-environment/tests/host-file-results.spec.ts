import {
  lstat,
  mkdir,
  mkdtemp,
  open,
  readFile,
  rename,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it, vi } from 'vitest'
import {
  createHostFiles,
  hostObjectToken,
  type FileRequest,
} from '@omne-harness/execution-environment'
import {
  createHostFiles as createHostFilesSource,
  __unsafeHostFilesState,
} from '../src/host-files.ts'

let injectCloseFailure = false
vi.mock('node:fs/promises', async importOriginal => {
  const actual = await importOriginal<typeof import('node:fs/promises')>()
  return {
    ...actual,
    open: async (...args: Parameters<typeof actual.open>) => {
      const handle = await actual.open(...args)
      const originalClose = handle.close.bind(handle)
      handle.close = async () => {
        if (injectCloseFailure) {
          throw new Error('injected close failure')
        }
        return originalClose()
      }
      return handle
    },
  }
})

const roots: string[] = []

afterEach(async () => {
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })))
})

async function tree() {
  const root = await mkdtemp(join(tmpdir(), 'omne-exec-env-'))
  roots.push(root)
  return root
}

type MutableFileRequest = {
  -readonly [K in keyof FileRequest]: FileRequest[K]
}

function request(path: string, named: FileRequest['named'], requestId: string): MutableFileRequest {
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

function withCloseFailure<T>(action: () => Promise<T>): Promise<T> {
  injectCloseFailure = true
  return action().finally(() => {
    injectCloseFailure = false
  })
}

it('refuses an unnamed file and does not return its bytes', async () => {
  const root = await tree()
  const path = join(root, 'secret.txt')
  await writeFile(path, 'secret-bytes')
  const result = await createHostFiles().read(request(path, null, 'unnamed'))
  expect(result).toEqual({ kind: 'rejected', requestId: 'unnamed', reason: 'notAuthorized' })
})

it('refuses a path that contains a NUL byte', async () => {
  const root = await tree()
  const result = await createHostFiles().read(
    request(`${root}/notes.txt\0`, { token: 'unused' }, 'nul'),
  )
  expect(result).toEqual({ kind: 'rejected', requestId: 'nul', reason: 'invalidInput' })
})

it('leaves a missing path unresolved', async () => {
  const root = await tree()
  const result = await createHostFiles().read(
    request(join(root, 'missing.txt'), { token: '1:2' }, 'missing'),
  )
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
  const stat = await lstat(file, { bigint: true })
  expect(named.token).toBe(`${stat.dev}:${stat.ino}`)
  const result = await createHostFiles().read(
    request(join(root, 'via', 'notes.txt'), named, 'ancestor'),
  )
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
      handle: { object: named, generation: '2' },
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
  const result = await files.close({
    ...request(path, named, 'close'),
    handle: opened.value.handle,
  })
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
      handle: { object: secondNamed, generation: '2' },
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

it('returns unknown when close has no issued handle and keeps the earlier bytes', async () => {
  const root = await tree()
  const path = join(root, 'notes.txt')
  await writeFile(path, 'kept-bytes')
  const named = await hostObjectToken(path)
  const files = createHostFiles()
  const first = await files.read(request(path, named, 'kept'))
  const closed = await files.close({
    ...request(path, named, 'missing-receipt'),
    handle: { object: named, generation: 'not-issued' },
  })
  expect(closed).toEqual({ kind: 'unknown', requestId: 'missing-receipt' })
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

it('refuses to read a directory as file bytes', async () => {
  const root = await tree()
  const named = await hostObjectToken(root)
  const result = await createHostFiles().read(request(root, named, 'directory'))
  expect(result).toEqual({ kind: 'rejected', requestId: 'directory', reason: 'unsupported' })
})

it('reads a directory through a symlink dot path when the directory is named', async () => {
  const root = await tree()
  const dir = join(root, 'dir')
  await mkdir(dir)
  await writeFile(join(dir, 'secret.txt'), 'secret-bytes')
  const link = join(root, 'link')
  await symlink(dir, link)
  const named = await hostObjectToken(dir)
  const result = await createHostFiles().stat(request(`${link}/.`, named, 'dot'))
  expect(result).toEqual({
    kind: 'done',
    requestId: 'dot',
    value: {
      object: named,
      handle: { object: named, generation: '1' },
    },
  })
})

it('refuses dotdot when it names a different object', async () => {
  const root = await tree()
  const dir = join(root, 'dir')
  await mkdir(dir)
  const inside = join(dir, 'inside.txt')
  const outside = join(root, 'outside.txt')
  await writeFile(inside, 'inside-bytes')
  await writeFile(outside, 'outside-bytes')
  const named = await hostObjectToken(inside)
  const result = await createHostFiles().read(
    request(join(dir, '..', 'outside.txt'), named, 'dotdot'),
  )
  expect(result).toEqual({ kind: 'rejected', requestId: 'dotdot', reason: 'conflict' })
  expect(JSON.stringify(result)).not.toContain('outside-bytes')
})

it('refuses a sandbox binding and does not return the host file bytes', async () => {
  const root = await tree()
  const path = join(root, 'notes.txt')
  await writeFile(path, 'host-bytes')
  const named = await hostObjectToken(path)
  const result = await createHostFiles().read({
    ...request(path, named, 'sandbox'),
    binding: { kind: 'stateless_sandbox', callId: 'call-1' },
  })
  expect(result).toEqual({ kind: 'rejected', requestId: 'sandbox', reason: 'unsupported' })
  expect(JSON.stringify(result)).not.toContain('host-bytes')
})

it('refuses a directory symlink when the path ends with a slash', async () => {
  const root = await tree()
  const dir = join(root, 'dir')
  await mkdir(dir)
  await writeFile(join(dir, 'secret.txt'), 'secret-bytes')
  const link = join(root, 'link')
  await symlink(dir, link)
  const named = await hostObjectToken(dir)
  const result = await createHostFiles().stat(request(`${link}/`, named, 'slash'))
  expect(result).toEqual({ kind: 'rejected', requestId: 'slash', reason: 'unsupported' })
  expect(JSON.stringify(result)).not.toContain('secret-bytes')
})

it('leaves a path through a non-directory unresolved', async () => {
  const root = await tree()
  const path = join(root, 'notes.txt')
  await writeFile(path, 'file-bytes')
  const named = await hostObjectToken(path)
  const result = await createHostFiles().read(request(`${path}/child`, named, 'notdir'))
  expect(result).toEqual({ kind: 'unresolved', requestId: 'notdir' })
})

it('refuses a NUL path on close and keeps the earlier bytes', async () => {
  const root = await tree()
  const path = join(root, 'notes.txt')
  await writeFile(path, 'kept-bytes')
  const named = await hostObjectToken(path)
  const files = createHostFiles()
  const first = await files.read(request(path, named, 'kept-nul'))
  expect(first.kind).toBe('done')
  if (first.kind !== 'done') return
  const closed = await files.close({
    ...request(`${path}\0`, named, 'nul-close'),
    handle: first.value.handle,
  })
  expect(closed).toEqual({ kind: 'rejected', requestId: 'nul-close', reason: 'invalidInput' })
  expect(first.value.bytes).toEqual(text('kept-bytes'))
})

it('issues a new handle generation for the second read', async () => {
  const root = await tree()
  const path = join(root, 'notes.txt')
  await writeFile(path, 'twice')
  const named = await hostObjectToken(path)
  const files = createHostFiles()
  const first = await files.read(request(path, named, 'gen-1'))
  const second = await files.read(request(path, named, 'gen-2'))
  expect(first).toMatchObject({ kind: 'done', value: { handle: { generation: '1' } } })
  expect(second).toMatchObject({ kind: 'done', value: { handle: { generation: '2' } } })
})

it('returns unknown on close when the read-time close failed', async () => {
  const root = await tree()
  const path = join(root, 'notes.txt')
  await writeFile(path, 'close-fail-bytes')
  const named = await hostObjectToken(path)
  const files = createHostFiles()

  await withCloseFailure(async () => {
    const read = await files.read(request(path, named, 'read-close-fail'))
    expect(read.kind).toBe('done')
    if (read.kind !== 'done') return

    const firstClose = await files.close({
      ...request(path, named, 'first-close'),
      handle: read.value.handle,
    })
    expect(firstClose).toEqual({ kind: 'unknown', requestId: 'first-close' })
  })

  const secondClose = await files.close({
    ...request(path, named, 'second-close'),
    handle: { object: named, generation: '1' },
  })
  expect(secondClose).toEqual({
    kind: 'done',
    requestId: 'second-close',
    value: { handle: { object: named, generation: '1' } },
  })
})

it('returns unknown on close when the stat-time close failed', async () => {
  const root = await tree()
  const path = join(root, 'notes.txt')
  await writeFile(path, 'stat-close-fail')
  const named = await hostObjectToken(path)
  const files = createHostFiles()

  await withCloseFailure(async () => {
    const stat = await files.stat(request(path, named, 'stat-close-fail'))
    expect(stat.kind).toBe('done')
    if (stat.kind !== 'done') return

    const closed = await files.close({
      ...request(path, named, 'close-stat-fail'),
      handle: stat.value.handle,
    })
    expect(closed).toEqual({ kind: 'unknown', requestId: 'close-stat-fail' })
  })
})

it('returns unknown on close when the write-time close failed, but the bytes were written', async () => {
  const root = await tree()
  const path = join(root, 'notes.txt')
  await writeFile(path, 'old')
  const named = await hostObjectToken(path)
  const files = createHostFiles()

  await withCloseFailure(async () => {
    const written = new TextEncoder().encode('new')
    const write = await files.write({ ...request(path, named, 'write-close-fail'), bytes: written })
    expect(write.kind).toBe('done')
    if (write.kind !== 'done') return

    const firstClose = await files.close({
      ...request(path, named, 'close-write-fail'),
      handle: write.value.handle,
    })
    expect(firstClose).toEqual({ kind: 'unknown', requestId: 'close-write-fail' })
  })

  expect(await readFile(path, 'utf8')).toBe('new')

  const secondClose = await files.close({
    ...request(path, named, 'close-write-retry'),
    handle: { object: named, generation: '1' },
  })
  expect(secondClose).toMatchObject({ kind: 'done' })
})

it('uses the request identity captured at call time even if the request object is mutated', async () => {
  const root = await tree()
  const originalPath = join(root, 'original.txt')
  const swappedPath = join(root, 'swapped.txt')
  await writeFile(originalPath, 'original-bytes')
  await writeFile(swappedPath, 'swapped-bytes')
  const originalNamed = await hostObjectToken(originalPath)
  const swappedNamed = await hostObjectToken(swappedPath)
  const expectedObject = { token: originalNamed.token }
  const files = createHostFiles()

  const req = request(originalPath, originalNamed, 'original-id')
  const pending = files.read(req)
  req.requestId = 'mutated-id'
  req.path = swappedPath
  ;(req.named as { token: string }).token = swappedNamed.token
  const result = await pending

  expect(result).toEqual({
    kind: 'done',
    requestId: 'original-id',
    value: {
      object: expectedObject,
      handle: { object: expectedObject, generation: '1' },
      bytes: text('original-bytes'),
    },
  })
})

it('uses the byte snapshot captured at call time even if the source array is mutated', async () => {
  const root = await tree()
  const path = join(root, 'notes.txt')
  await writeFile(path, 'old')
  const named = await hostObjectToken(path)
  const files = createHostFiles()

  const bytes = new TextEncoder().encode('new')
  const pending = files.write({ ...request(path, named, 'snapshot-write'), bytes })
  bytes[0] = 'X'.charCodeAt(0)
  const result = await pending

  expect(result.kind).toBe('done')
  expect(await readFile(path, 'utf8')).toBe('new')
})

it('accepts a real directory through a trailing slash', async () => {
  const root = await tree()
  const dir = join(root, 'dir')
  await mkdir(dir)
  const named = await hostObjectToken(dir)
  const result = await createHostFiles().stat(request(`${dir}/`, named, 'dir-slash'))
  expect(result).toEqual({
    kind: 'done',
    requestId: 'dir-slash',
    value: {
      object: named,
      handle: { object: named, generation: '1' },
    },
  })
})

it('leaves a regular file with a trailing slash unresolved on read', async () => {
  const root = await tree()
  const path = join(root, 'notes.txt')
  await writeFile(path, 'file-bytes')
  const named = await hostObjectToken(path)
  const result = await createHostFiles().read(request(`${path}/`, named, 'file-slash-read'))
  expect(result).toEqual({ kind: 'unresolved', requestId: 'file-slash-read' })
  expect(await readFile(path, 'utf8')).toBe('file-bytes')
})

it('leaves a regular file with a trailing slash unresolved on write and does not truncate it', async () => {
  const root = await tree()
  const path = join(root, 'notes.txt')
  await writeFile(path, 'file-bytes')
  const named = await hostObjectToken(path)
  const result = await createHostFiles().write({
    ...request(`${path}/`, named, 'file-slash-write'),
    bytes: text('new-bytes'),
  })
  expect(result).toEqual({ kind: 'unresolved', requestId: 'file-slash-write' })
  expect(await readFile(path, 'utf8')).toBe('file-bytes')
})

it('leaves a regular file with a trailing slash unresolved on stat', async () => {
  const root = await tree()
  const path = join(root, 'notes.txt')
  await writeFile(path, 'file-bytes')
  const named = await hostObjectToken(path)
  const result = await createHostFiles().stat(request(`${path}/`, named, 'file-slash-stat'))
  expect(result).toEqual({ kind: 'unresolved', requestId: 'file-slash-stat' })
})

it('keeps descriptors whose close failed on error paths for continued cleanup', async () => {
  const root = await tree()
  const conflictPath = join(root, 'conflict.txt')
  const otherPath = join(root, 'other.txt')
  await writeFile(conflictPath, 'conflict-bytes')
  await writeFile(otherPath, 'other-bytes')
  const wrongNamed = { token: 'wrong-token' }
  const files = createHostFilesSource()

  await withCloseFailure(async () => {
    const result = await files.read(request(conflictPath, wrongNamed, 'conflict-close-fail'))
    expect(result).toEqual({
      kind: 'rejected',
      requestId: 'conflict-close-fail',
      reason: 'conflict',
    })
    expect(__unsafeHostFilesState(files).pendingCloseCount).toBeGreaterThan(0)
  })

  await files.read(request(otherPath, await hostObjectToken(otherPath), 'drain'))
  expect(__unsafeHostFilesState(files).pendingCloseCount).toBe(0)
})
