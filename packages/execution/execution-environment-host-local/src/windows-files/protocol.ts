import type { FileInformation } from '@omne-harness/execution-environment-contract'
import type { Failure } from '../host-paths.ts'

/**
 * The frames between the Windows files backend and its resident helper process. Every frame is one
 * line of JSON. The helper's standard output is outside data: this module is the only place that
 * turns it into types.
 */

/**
 * Where a request starts and how it walks. With a files root, `root` is the root and
 * `expectedRoot` its recorded token; without one, `root` is the drive root and `expectedRoot` is
 * empty. `segments` are opened one below the other from there.
 */
export type Start = Readonly<{
  root: string
  expectedRoot: string
  segments: readonly string[]
  rooted: boolean
}>

/**
 * How the last segment is opened. `directory`: the path ends in a separator or a `.` segment, so
 * it must name a directory. `follow`: it ends in a `.` segment, so the last segment is resolved as
 * a directory on the way, as POSIX resolves `name/.`.
 */
export type Final = Readonly<{ directory: boolean; follow: boolean }>

/** A request for `read`, `stat`, `list` or `search`. */
export type RunInput = Start &
  Final &
  Readonly<{
    named: string
    operation: 'read' | 'stat' | 'list' | 'search'
    offset: number
    limit: number
    pattern: string
    content: boolean
    recursive: boolean
    entryBudget: number
    byteBudget: number
    fileBytes: number
    path: string
  }>

/** The token and metadata of the object a path names, without a named object to check. */
export type IdentifyInput = Start & Final & Readonly<{ operation: 'identify' }>

/** A request for `mkdir`, `remove` or `move`. The target starts the same way as the source. */
export type ChangeInput = Start &
  Readonly<{
    named: string
    operation: 'mkdir' | 'remove' | 'move'
    recursive: boolean
    version: string | null
    targetRoot: string
    expectedTargetRoot: string
    targetSegments: readonly string[]
    targetNamed: string
    replace: boolean
  }>

/** A request for `write`: exclusive creation, or replacement of the named object. */
export type WriteInput = Start &
  Readonly<{
    named: string
    operation: 'write'
    version: string | null
    trailingSlash: boolean
    create: boolean
    bytes: string
  }>

export type NativeInput = RunInput | IdentifyInput | ChangeInput | WriteInput

export type Metadata = Readonly<{
  token: string
  version: string
  size: number
  modified: number
  type: FileInformation['type']
  name: string
}>

export type Hit = Readonly<{ path: string; token: string; offsetBytes: number }>

/** The result of one native operation. Fields an operation does not fill hold their empty value. */
export type NativeReply = Readonly<{
  info: Metadata
  bytes: string
  entries: readonly Metadata[]
  next: number
  hits: readonly Hit[]
  truncated: boolean
  eof: boolean
}>

/** A parsed line of the helper's standard output. */
export type ReplyFrame =
  | Readonly<{ kind: 'ready' }>
  | Readonly<{ kind: 'reply'; id: number; outcome: NativeReply | Failure }>

/** The request line for request number `id`, with its terminating newline. */
export function requestFrame(id: number, input: NativeInput): string {
  return `${JSON.stringify({ v: 1, id, ...input })}\n`
}

/**
 * One line without its newline. `undefined` when the line is not a frame: not JSON, another
 * version, no request number, or a reply that is neither `ok` nor `failure`. A frame with a valid
 * envelope and a body of the wrong shape answers its request `unknown`.
 */
export function parseReplyFrame(line: string): ReplyFrame | undefined {
  let value: unknown
  try {
    value = JSON.parse(line)
  } catch {
    return undefined
  }
  if (value === null || typeof value !== 'object' || !('v' in value) || value.v !== 1)
    return undefined
  if ('ready' in value)
    return value.ready === true && !('id' in value) ? { kind: 'ready' } : undefined
  if (
    !('id' in value) ||
    typeof value.id !== 'number' ||
    !Number.isSafeInteger(value.id) ||
    value.id < 1
  )
    return undefined
  const id = value.id
  if ('failure' in value)
    return 'ok' in value ? undefined : { kind: 'reply', id, outcome: failure(value.failure) }
  return 'ok' in value ? { kind: 'reply', id, outcome: reply(value.ok) } : undefined
}

function failure(value: unknown): Failure {
  switch (value) {
    case 'notAuthorized':
    case 'unresolved':
    case 'unsupported':
    case 'busy':
    case 'invalidInput':
    case 'conflict':
    case 'unavailable':
      return value
    default:
      return 'unknown'
  }
}

function hit(value: unknown): Hit | undefined {
  if (
    value === null ||
    typeof value !== 'object' ||
    !('path' in value) ||
    typeof value.path !== 'string' ||
    !('token' in value) ||
    typeof value.token !== 'string' ||
    !('offsetBytes' in value) ||
    typeof value.offsetBytes !== 'number'
  )
    return undefined
  return { path: value.path, token: value.token, offsetBytes: value.offsetBytes }
}

function metadata(value: unknown): Metadata | undefined {
  if (
    value === null ||
    typeof value !== 'object' ||
    !('token' in value) ||
    typeof value.token !== 'string' ||
    !('version' in value) ||
    typeof value.version !== 'string' ||
    !('size' in value) ||
    typeof value.size !== 'number' ||
    !('modified' in value) ||
    typeof value.modified !== 'number' ||
    !('type' in value) ||
    (value.type !== 'file' && value.type !== 'directory' && value.type !== 'symlink') ||
    !('name' in value) ||
    typeof value.name !== 'string'
  )
    return undefined
  return {
    token: value.token,
    version: value.version,
    size: value.size,
    modified: value.modified,
    type: value.type,
    name: value.name,
  }
}

/** Every element parsed, or `undefined` when one element does not parse. */
function each<T>(values: readonly unknown[], parse: (value: unknown) => T | undefined) {
  const parsed: T[] = []
  for (const value of values) {
    const item = parse(value)
    if (item === undefined) return undefined
    parsed.push(item)
  }
  return parsed
}

function reply(value: unknown): NativeReply | Failure {
  if (
    value === null ||
    typeof value !== 'object' ||
    !('info' in value) ||
    !('bytes' in value) ||
    typeof value.bytes !== 'string' ||
    !('entries' in value) ||
    !Array.isArray(value.entries) ||
    !('next' in value) ||
    typeof value.next !== 'number'
  )
    return 'unknown'
  const info = metadata(value.info)
  const entries = each(value.entries, metadata)
  const hits = 'hits' in value && Array.isArray(value.hits) ? each(value.hits, hit) : []
  if (info === undefined || entries === undefined || hits === undefined) return 'unknown'
  return {
    info,
    bytes: value.bytes,
    entries,
    next: value.next,
    hits,
    truncated: 'truncated' in value && value.truncated === true,
    eof: 'eof' in value && value.eof === true,
  }
}
