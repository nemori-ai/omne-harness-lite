// How `open` answers a path that names no readable file: a directory is not an entry, a path
// through a file names nothing, and a pipe is refused without blocking the read.
import { execFile } from 'node:child_process'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { describe, expect, it } from 'vitest'
import { isPackageDigest, isPackagePath } from '@omne-harness/skill-contract'
import { createDirectorySource } from '@omne-harness/skill-host-local'
import { directory, SAMPLE, scratch, writeTree } from './scratch.ts'

const DIGEST = `sha256:${'0'.repeat(64)}`

async function open(root: string, at: string) {
  if (!isPackageDigest(DIGEST) || !isPackagePath(at)) throw new TypeError(at)
  const answer = await createDirectorySource().open(directory(root), DIGEST, at)
  return 'ok' in answer ? 'bytes' : answer.failure
}

describe('open of a path that names no file', () => {
  it('answers entry-not-found for a directory', async () => {
    const root = join(await scratch(), 'pkg')
    await writeTree(root, SAMPLE)
    expect(await open(root, 'notes')).toBe('entry-not-found')
    expect(await open(root, 'empty')).toBe('entry-not-found')
  })

  it('answers entry-not-found for a path below a file', async () => {
    const root = join(await scratch(), 'pkg')
    await writeTree(root, SAMPLE)
    expect(await open(root, 'SKILL.md/below')).toBe('entry-not-found')
  })

  it('answers unavailable for a named pipe, without waiting for a writer', async ctx => {
    const root = join(await scratch(), 'pkg')
    await writeTree(root, SAMPLE)
    try {
      await promisify(execFile)('mkfifo', [join(root, 'pipe')])
    } catch (error) {
      if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT')
        return ctx.skip('NotApplicable: no mkfifo command on this host')
      throw error
    }
    expect(await open(root, 'pipe')).toBe('unavailable')
  })
})
