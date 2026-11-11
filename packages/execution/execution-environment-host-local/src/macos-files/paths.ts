import { constants } from 'node:fs'
import { lstat, open, realpath } from 'node:fs/promises'
import { basename, dirname, isAbsolute } from 'node:path'
import type { FileRequest } from '@omne-harness/execution-environment-contract'
import { hostSegmentsBelowRoot } from '../root-segments.ts'
import { fail, mapped, ok, openCodes, type Failure, type Outcome } from '../host-paths.ts'
import type { Endpoint } from './protocol.ts'

export type RootIdentity = Readonly<{ path: string; token: string }>

async function identify(path: string, root = false): Promise<RootIdentity> {
  const opening = root ? await realpath(path) : path
  const handle = await open(
    opening,
    constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW,
  )
  try {
    const info = await handle.stat({ bigint: true })
    return { path: await realpath(opening), token: `${info.dev}:${info.ino}` }
  } finally {
    await handle.close()
  }
}

/** A recorded root never silently rebinds to its replacement. */
export function createMacosRootIdentity(root: string): () => Promise<RootIdentity | undefined> {
  let pending: Promise<RootIdentity | undefined> | undefined
  return async () => {
    const current = (pending ??= identify(root, true).catch(() => undefined))
    const found = await current
    if (found === undefined && pending === current) pending = undefined
    return found
  }
}

export function requestRefusal(request: FileRequest<unknown>): Failure | undefined {
  if (request.binding.kind !== 'host_machine') return 'unsupported'
  if (!isAbsolute(request.path) || request.path.includes('\0')) return 'invalidInput'
  if (!request.named?.token) return 'notAuthorized'
  return undefined
}

export function createMacosPaths(rootIdentity?: () => Promise<RootIdentity | undefined>) {
  return async (path: string, parents = false, directory = false): Promise<Outcome<Endpoint>> => {
    if (rootIdentity !== undefined) {
      const root = await rootIdentity()
      if (root === undefined) return fail('unavailable')
      const segments = await hostSegmentsBelowRoot(root.path, path, 'darwin')
      return segments === undefined
        ? fail('notAuthorized')
        : ok({
            root: root.path,
            expectedRoot: root.token,
            segments,
          })
    }
    if (directory) {
      try {
        const root = await identify(path)
        return ok({ root: root.path, expectedRoot: root.token, segments: [] })
      } catch (error) {
        try {
          if (!(await lstat(path)).isDirectory()) return fail('unsupported')
        } catch {
          /* The original open error owns the missing or unreadable path. */
        }
        return fail(mapped(openCodes, error) ?? 'unknown')
      }
    }
    const last = basename(path)
    let parent = last === '.' || last === '..' ? path : dirname(path)
    const segments = last === '.' || last === '..' || last === '' ? [] : [last]
    for (;;) {
      try {
        const root = await identify(parent)
        return ok({
          root: root.path,
          expectedRoot: root.token,
          segments,
        })
      } catch (error) {
        const reason = mapped(openCodes, error) ?? 'unknown'
        const next = dirname(parent)
        if (!parents || reason !== 'unresolved' || next === parent) return fail(reason)
        segments.unshift(basename(parent))
        parent = next
      }
    }
  }
}
