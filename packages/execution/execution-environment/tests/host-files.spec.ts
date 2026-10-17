import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it } from 'vitest'
import { createHostFiles, hostObjectToken } from '@omne-harness/execution-environment'

const roots: string[] = []

afterEach(async () => {
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })))
})

async function tree() {
  const root = await mkdtemp(join(tmpdir(), 'omne-exec-env-'))
  roots.push(root)
  return root
}

it('reads a named file outside the workspace directory', async () => {
  const root = await tree()
  const workspace = join(root, 'workspace')
  const outside = join(root, 'outside', 'notes.txt')
  await mkdir(workspace)
  await mkdir(join(root, 'outside'))
  await writeFile(outside, 'outside-bytes')
  const files = createHostFiles()
  const named = await hostObjectToken(outside)
  const result = await files.read({
    requestId: 'r-outside',
    originalCallId: 'call-1',
    subjectId: 'subject-a',
    binding: { kind: 'host_machine' },
    path: outside,
    named,
  })
  expect(result).toEqual({
    kind: 'done',
    requestId: 'r-outside',
    value: {
      object: named,
      handle: { object: named, generation: '1' },
      bytes: new TextEncoder().encode('outside-bytes'),
    },
  })
})
