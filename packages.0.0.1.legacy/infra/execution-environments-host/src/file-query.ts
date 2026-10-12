import { opendir } from 'node:fs/promises'
import { basename, join } from 'node:path'
import type {
  FacilityFailure,
  FileReadRequest,
  FileReadResult,
  FileListRequest,
  FileSearchRequest,
  FileSearchHit,
} from '@omne-harness-lite/execution-environments'
import { captureFileArguments } from '@omne-harness-lite/execution-environments'
import {
  absoluteHostPath,
  fileFailure,
  hostFileInformation,
  hostFileVersion,
  inspectHostPath,
  openHostRegularFile,
  HostFileFailure,
} from './file-path.ts'
import { captureHostNativePolicy, type HostNativePolicy } from './native-policy.ts'

async function boundedDirectory(path: string, maximum: number) {
  const names: string[] = [],
    directory = await opendir(path)
  for await (const item of directory) {
    if (names.length >= maximum) throw new HostFileFailure('capacity')
    names.push(item.name)
  }
  return names.sort()
}

export async function statHostFile(rawPath: string) {
  try {
    const path = absoluteHostPath(rawPath),
      stat = await inspectHostPath(path, false, true)
    if (!stat) throw new HostFileFailure('notFound')
    return { kind: 'stat' as const, value: hostFileInformation(path, stat) }
  } catch (error) {
    return fileFailure(error)
  }
}
export async function readHostFile(
  rawRequest: FileReadRequest,
  rawPolicy: HostNativePolicy,
): Promise<FileReadResult | FacilityFailure> {
  const args = captureFileArguments('read', [rawRequest]),
    policy = captureHostNativePolicy(rawPolicy)
  if (!args) return { kind: 'rejected', reason: 'invalidInput' }
  const request = args[0] as FileReadRequest
  try {
    const path = absoluteHostPath(request.path),
      limit = request.limitBytes ?? policy.fileReadBytes
    if (limit > policy.fileReadBytes) throw new HostFileFailure('capacity')
    const { handle, stat } = await openHostRegularFile(path)
    try {
      const offset = request.offsetBytes ?? 0,
        size = Math.min(limit, Math.max(0, Number(stat.size) - offset))
      const data = Buffer.alloc(size)
      let count = 0
      while (count < size) {
        const { bytesRead } = await handle.read(data, count, size - count, offset + count)
        if (!bytesRead) break
        count += bytesRead
      }
      const after = await handle.stat({ bigint: true }),
        current = await inspectHostPath(path)
      if (
        hostFileVersion(after) !== hostFileVersion(stat) ||
        !current ||
        hostFileVersion(current) !== hostFileVersion(stat)
      )
        throw new HostFileFailure('conflict')
      return {
        kind: 'read',
        path,
        data: new Uint8Array(data.subarray(0, count)),
        offsetBytes: offset,
        nextOffsetBytes: offset + count,
        eof: offset + count >= Number(stat.size),
        version: hostFileVersion(stat),
      }
    } finally {
      await handle.close()
    }
  } catch (error) {
    return fileFailure(error)
  }
}
export async function listHostFiles(rawRequest: FileListRequest, rawPolicy: HostNativePolicy) {
  const args = captureFileArguments('list', [rawRequest]),
    policy = captureHostNativePolicy(rawPolicy)
  if (!args) return { kind: 'rejected' as const, reason: 'invalidInput' as const }
  const request = args[0] as FileListRequest
  try {
    const path = absoluteHostPath(request.path),
      stat = await inspectHostPath(path)
    if (!stat?.isDirectory()) throw new HostFileFailure('unsupported')
    const limit = request.limit ?? policy.pageEntries,
      offset = request.offset ?? 0
    if (limit > policy.maxPageEntries) throw new HostFileFailure('capacity')
    const names = await boundedDirectory(path, policy.searchNodes)
    if (names.length > policy.searchNodes) throw new HostFileFailure('capacity')
    const values = []
    for (const name of names.slice(offset, offset + limit)) {
      const result = await statHostFile(join(path, name))
      if (result.kind !== 'stat') return result
      values.push(result.value)
    }
    return {
      kind: 'listed' as const,
      values,
      ...(offset + limit < names.length ? { nextOffset: offset + limit } : {}),
    }
  } catch (error) {
    return fileFailure(error)
  }
}

async function contentHit(
  path: string,
  pattern: string,
  remaining: number,
  policy: HostNativePolicy,
) {
  if (remaining < 1) return { bytes: 0, exhausted: true }
  const read = await readHostFile(
    { path, limitBytes: Math.min(remaining, policy.fileReadBytes) },
    policy,
  )
  if (read.kind !== 'read') throw new HostFileFailure(read.reason)
  const offset = Buffer.from(read.data).indexOf(Buffer.from(pattern, 'utf8'))
  return {
    bytes: read.data.length,
    exhausted: !read.eof,
    hit: offset < 0 ? undefined : { path, offsetBytes: offset },
  }
}
interface SearchState {
  paths: string[]
  values: FileSearchHit[]
  bytes: number
  truncated: boolean
}
async function searchDirectory(
  path: string,
  root: string,
  request: FileSearchRequest,
  state: SearchState,
  policy: HostNativePolicy,
  nodes: number,
) {
  if (path !== root && !request.recursive) return true
  let names: string[]
  try {
    names = await boundedDirectory(path, policy.searchNodes - nodes - state.paths.length)
  } catch (error) {
    if (fileFailure(error).reason !== 'capacity') throw error
    state.truncated = true
    return false
  }
  for (let index = names.length - 1; index >= 0; index--)
    state.paths.push(join(path, names[index]!))
  return true
}
async function searchFile(
  path: string,
  request: FileSearchRequest,
  state: SearchState,
  policy: HostNativePolicy,
) {
  if (request.match === 'name') {
    if (basename(path).includes(request.pattern)) state.values.push({ path })
    return true
  }
  const found = await contentHit(path, request.pattern, policy.searchBytes - state.bytes, policy)
  state.bytes += found.bytes
  state.truncated ||= found.exhausted
  if (found.hit) state.values.push(found.hit)
  if (state.bytes < policy.searchBytes) return true
  state.truncated ||= state.paths.length > 0
  return false
}
async function visitSearchPath(
  path: string,
  root: string,
  request: FileSearchRequest,
  state: SearchState,
  policy: HostNativePolicy,
  nodes: number,
) {
  const stat = await inspectHostPath(path, false, true)
  if (!stat || stat.isSymbolicLink()) return true
  if (stat.isDirectory()) return searchDirectory(path, root, request, state, policy, nodes)
  return stat.isFile() ? searchFile(path, request, state, policy) : true
}
export async function searchHostFiles(rawRequest: FileSearchRequest, rawPolicy: HostNativePolicy) {
  const args = captureFileArguments('search', [rawRequest]),
    policy = captureHostNativePolicy(rawPolicy)
  if (!args) return { kind: 'rejected' as const, reason: 'invalidInput' as const }
  const request = args[0] as FileSearchRequest
  try {
    const root = absoluteHostPath(request.path),
      limit = request.limit ?? policy.pageEntries,
      offset = request.offset ?? 0
    if (limit > policy.maxPageEntries) throw new HostFileFailure('capacity')
    const state: SearchState = { paths: [root], values: [], bytes: 0, truncated: false }
    let nodes = 0
    while (state.paths.length) {
      if (++nodes > policy.searchNodes) {
        state.truncated = true
        break
      }
      if (!(await visitSearchPath(state.paths.pop()!, root, request, state, policy, nodes))) break
    }
    return {
      kind: 'found' as const,
      values: state.values.slice(offset, offset + limit),
      truncated: state.truncated,
      ...(offset + limit < state.values.length ? { nextOffset: offset + limit } : {}),
    }
  } catch (error) {
    return fileFailure(error)
  }
}
