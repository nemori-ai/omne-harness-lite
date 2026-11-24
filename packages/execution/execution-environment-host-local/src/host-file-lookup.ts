import { lstat } from 'node:fs/promises'
import type { ObjectToken } from '@omne-harness/execution-environment-contract'
import {
  createHostPathsCore,
  errorCode,
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
) => Promise<Outcome<Readonly<{ object: ObjectToken; size: number }> | null>>

/** Observe a regular file below the held root. Only a missing final name in an opened parent proves absence. */
export function createHostFileLookup(root: string): FileLookup {
  if (process.platform === 'darwin') {
    const locate = createMacosPaths(createMacosRootIdentity(root))
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
      return typeof result === 'string'
        ? result === 'notFound'
          ? ok(null)
          : fail(result)
        : ok({ object: { token: result.info.token }, size: result.info.size })
    }
  }
  if (process.platform === 'win32') {
    const rootIdentity = createWindowsRootIdentity(root)
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
      if (result.info.type !== 'file') return fail('unsupported')
      return ok({ object: { token: result.info.token }, size: result.info.size })
    }
  }
  const paths = createHostPathsCore({ root }).bind(handle => handle.close())
  return async path => {
    const refusal = await paths.checkPath(path)
    if (refusal) return fail(refusal)
    const located = await paths.locate(path)
    if (!located.ok) return located
    const { parent, name } = located.value
    try {
      const stat = await lstat(fdPath(parent, name), { bigint: true })
      if (!stat.isFile()) return fail('unsupported')
      if (stat.dev !== (await parent.stat({ bigint: true })).dev) return fail('notAuthorized')
      return ok({ object: tokenOf(stat), size: Number(stat.size) })
    } catch (error) {
      return errorCode(error) === 'ENOENT' ? ok(null) : fail('unavailable')
    } finally {
      await parent.close()
    }
  }
}
