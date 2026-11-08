import { lstat, mkdtemp, realpath, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { ProviderFacts } from '@omne-harness/execution-environment-contract'
import { filesHelper, runHelper } from './transport.ts'

export function macosFilesPrerequisite(directory?: string): () => Promise<boolean> {
  let pending: Promise<ProviderFacts['prerequisites']> | undefined
  return async () => {
    const current = (pending ??= probeMacosFilesPrerequisite(directory))
    const result = await current
    if (result === 'unknown' && pending === current) pending = undefined
    return result === 'satisfied'
  }
}

export async function probeMacosFilesPrerequisite(
  directory = tmpdir(),
): Promise<ProviderFacts['prerequisites']> {
  if (process.platform !== 'darwin') return 'unsatisfied'
  const helper = await filesHelper()
  if (helper.kind !== 'ready') return 'unsatisfied'
  let made: string | undefined
  let result: ProviderFacts['prerequisites'] = 'unknown'
  try {
    made = await mkdtemp(join(directory, 'omne-files-probe-'))
    const root = await realpath(made)
    const info = await lstat(root, { bigint: true })
    const expectedRoot = `${info.dev}:${info.ino}`
    const input = {
      root,
      expectedRoot,
      segments: ['probe'],
      named: expectedRoot,
      path: join(root, 'probe'),
      rooted: true,
    }
    const written = await runHelper(helper.path, {
      ...input,
      operation: 'write',
      create: true,
      version: null,
      bytes: 'b21uZQ==',
    })
    if (typeof written !== 'string') {
      const removed = await runHelper(helper.path, {
        ...input,
        named: written.info.token,
        operation: 'remove',
        recursive: false,
        version: null,
      })
      if (typeof removed !== 'string') {
        result = await lstat(input.path).then(
          () => 'unknown' as const,
          error =>
            error instanceof Error && 'code' in error && error.code === 'ENOENT'
              ? ('satisfied' as const)
              : ('unknown' as const),
        )
      }
    }
  } catch {
    result = 'unknown'
  } finally {
    if (made !== undefined) {
      try {
        await rm(made, { recursive: true, force: true })
      } catch {
        result = 'unknown'
      }
    }
  }
  return result
}
