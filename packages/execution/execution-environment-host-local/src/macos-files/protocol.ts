import type { FileInformation } from '@omne-harness/execution-environment-contract'
import type { Failure } from '../host-paths.ts'

export type Endpoint = Readonly<{
  root: string
  expectedRoot: string
  segments: readonly string[]
}>

export type NativeInput = Endpoint &
  Readonly<{
    operation:
      | 'read'
      | 'stat'
      | 'write'
      | 'list'
      | 'search'
      | 'mkdir'
      | 'remove'
      | 'move'
      | 'copy'
      | 'observe'
    named: string
    path: string
    rooted: boolean
    version?: string | null
    create?: boolean
    bytes?: string
    trailingSlash?: boolean
    offset?: number
    limit?: number
    pattern?: string
    content?: boolean
    recursive?: boolean
    replace?: boolean
    targetRoot?: string
    expectedTargetRoot?: string
    targetSegments?: readonly string[]
    targetNamed?: string
    entryBudget?: number
    byteBudget?: number
    fileBytes?: number
  }>

export type Metadata = Readonly<{
  token: string
  version: string
  size: number
  modified: number
  type: FileInformation['type']
  name: string
}>

export type NativeReply = Readonly<{
  info: Metadata
  bytes: string
  entries: readonly Metadata[]
  next: number
  hits: readonly { path: string; token: string; offsetBytes: number }[]
  truncated: boolean
  eof: boolean
  source?: string
}>

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function string(value: unknown): string {
  if (typeof value !== 'string') throw new Error('invalid helper string')
  return value
}

function integer(value: unknown, minimum = 0): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < minimum)
    throw new Error('invalid helper integer')
  return value
}

function metadata(value: unknown): Metadata {
  if (!record(value)) throw new Error('invalid helper metadata')
  const type = value['type']
  if (type !== 'file' && type !== 'directory' && type !== 'symlink')
    throw new Error('invalid helper object type')
  return {
    token: string(value['token']),
    version: string(value['version']),
    size: integer(value['size']),
    modified: integer(value['modified'], Number.MIN_SAFE_INTEGER),
    name: string(value['name']),
    type,
  }
}

function failure(value: unknown): Failure {
  switch (value) {
    case 'unresolved':
    case 'unsupported':
    case 'notAuthorized':
    case 'invalidInput':
    case 'conflict':
    case 'unavailable':
    case 'capacity':
    case 'busy':
      return value
    default:
      return 'unknown'
  }
}

/** A complete, well-formed reply is required before a child can report success. */
export function parseReply(value: unknown): NativeReply | Failure {
  if (!record(value)) return 'unknown'
  if ('failure' in value) return failure(value['failure'])
  try {
    const entries = value['entries']
    const hits = value['hits']
    const bytes = string(value['bytes'])
    if (
      !Array.isArray(entries) ||
      !Array.isArray(hits) ||
      typeof value['truncated'] !== 'boolean' ||
      typeof value['eof'] !== 'boolean' ||
      Buffer.from(bytes, 'base64').toString('base64') !== bytes
    )
      return 'unknown'
    return {
      info: metadata(value['info']),
      bytes,
      entries: entries.map(metadata),
      next: integer(value['next'], -1),
      hits: hits.map(item => {
        if (!record(item)) throw new Error('invalid helper hit')
        return {
          path: string(item['path']),
          token: string(item['token']),
          offsetBytes: integer(item['offsetBytes'], -1),
        }
      }),
      truncated: value['truncated'],
      eof: value['eof'],
      ...('source' in value ? { source: string(value['source']) } : {}),
    }
  } catch {
    return 'unknown'
  }
}
