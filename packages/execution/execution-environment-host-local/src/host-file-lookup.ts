import { isAbsolute } from 'node:path'
import { lstat, realpath, type FileHandle } from 'node:fs/promises'
import type { ObjectToken } from '@omne-harness/execution-environment-contract'
import {
  createHostPathsCore,
  errorCode,
  fdDir,
  fdPath,
  tokenOf,
  fail,
  ok,
  type Outcome,
} from './host-paths.ts'
import { hostSegmentsBelowRoot } from './root-segments.ts'
import { createMacosPaths, createMacosRootIdentity } from './macos-files/paths.ts'
import { invoke } from './macos-files/transport.ts'
import { createWindowsRootIdentity } from './windows-files/facility.ts'
import { getWindowsFilesHelper } from './windows-files/helper.ts'

type FileLookup = (
  path: string,
) => Promise<Outcome<Readonly<{ object: ObjectToken; size: number; directory: string }> | null>>

function lookupResult(result: {
  info: { type: string; token: string; size: number }
  directory?: string
}): Awaited<ReturnType<FileLookup>> {
  if (result.info.type !== 'file') return fail('unsupported')
  if (!result.directory || !isAbsolute(result.directory)) return fail('unknown')
  return ok({
    object: { token: result.info.token },
    size: result.info.size,
    directory: result.directory,
  })
}

function createMacosFileLookup(root: string, expected?: string): FileLookup {
  const locate = createMacosPaths(createMacosRootIdentity(root, expected))
  return async path => {
    const endpoint = await locate(path)
    if (!endpoint.ok) return endpoint
    const result = await invoke({
      ...endpoint.value,
      operation: 'lookup',
      rooted: true,
      named: '',
      path,
    })
    if (typeof result === 'string') return result === 'notFound' ? ok(null) : fail(result)
    return lookupResult(result)
  }
}

function createWindowsFileLookup(root: string, expected?: string): FileLookup {
  const rootIdentity = createWindowsRootIdentity(root, expected)
  return async path => {
    const segments = await hostSegmentsBelowRoot(root, path)
    if (!segments || segments.length === 0) return fail('notAuthorized')
    const expectedRoot = await rootIdentity()
    if (!expectedRoot) return fail('unavailable')
    const result = await getWindowsFilesHelper().request({
      root,
      expectedRoot,
      segments,
      rooted: true,
      operation: 'lookup',
      directory: false,
      follow: false,
    })
    if (typeof result === 'string') return result === 'notFound' ? ok(null) : fail(result)
    return lookupResult(result)
  }
}

/** Only the final name is being tested here; its parent was already opened and fenced. */
function missingFinal(error: unknown): null {
  if (errorCode(error) === 'ENOENT') return null
  throw error
}

/** Owns the opened parent's lifetime, including all observation and failure paths. */
async function observeOpenedFile(parent: FileHandle, name: string): ReturnType<FileLookup> {
  try {
    const stat = await lstat(fdPath(parent, name), { bigint: true }).catch(missingFinal)
    if (stat === null) return ok(null)
    if (!stat.isFile()) return fail('unsupported')
    if (stat.dev !== (await parent.stat({ bigint: true })).dev) return fail('notAuthorized')
    return ok({
      object: tokenOf(stat),
      size: Number(stat.size),
      directory: await realpath(fdDir(parent)),
    })
  } catch {
    return fail('unavailable')
  } finally {
    await parent.close()
  }
}

function createLinuxFileLookup(root: string, expected?: string): FileLookup {
  const paths = createHostPathsCore({ root, expectedRoot: expected }).bind(handle => handle.close())
  return async path => {
    const refusal = await paths.checkPath(path)
    if (refusal) return fail(refusal)
    const located = await paths.locate(path)
    if (!located.ok) return located
    return observeOpenedFile(located.value.parent, located.value.name)
  }
}

/** Observe a regular file below the held root. Only a missing final name in an opened parent proves absence. */
export function createHostFileLookup(root: string, expected?: string): FileLookup {
  if (process.platform === 'darwin') return createMacosFileLookup(root, expected)
  if (process.platform === 'win32') return createWindowsFileLookup(root, expected)
  return createLinuxFileLookup(root, expected)
}
