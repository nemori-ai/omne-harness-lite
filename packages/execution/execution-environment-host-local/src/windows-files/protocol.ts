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

/**
 * The first request of a copy: the source starts like a read and the target like a move. The helper
 * streams the source into the new object `temporary` below the target's parent and flushes it; the
 * target is not changed.
 */
export type CopyInput = Start &
  Final &
  Readonly<{
    named: string
    operation: 'copy'
    version: string | null
    targetRoot: string
    expectedTargetRoot: string
    targetSegments: readonly string[]
    targetNamed: string
    replace: boolean
    temporary: string
  }>

/**
 * The second request of a copy: publishes the staged object `temporary`, named by its token, under
 * the target by the rules of a write. `version` is the target's version when it was staged.
 */
export type PublishInput = Start &
  Readonly<{
    operation: 'publish'
    temporary: string
    named: string
    targetNamed: string
    version: string | null
    create: boolean
  }>

export type NativeInput =
  | RunInput
  | IdentifyInput
  | ChangeInput
  | WriteInput
  | CopyInput
  | PublishInput

export type Metadata = Readonly<{
  token: string
  version: string
  size: number
  modified: number
  type: FileInformation['type']
  name: string
}>

export type Hit = Readonly<{ path: string; token: string; offsetBytes: number }>

/**
 * The result of one native operation. Fields an operation does not fill hold their empty value.
 * The first request of a copy also names the source and the target as it was (`null`: absent).
 */
export type NativeReply = Readonly<{
  info: Metadata
  bytes: string
  entries: readonly Metadata[]
  next: number
  hits: readonly Hit[]
  truncated: boolean
  eof: boolean
  source?: Metadata
  target?: Metadata | null
}>

/** A parsed line of the helper's standard output. */
export type ReplyFrame =
  | Readonly<{ kind: 'ready' }>
  | Readonly<{ kind: 'reply'; id: number; outcome: NativeReply | Failure }>

/** The request line for request number `id`, with its terminating newline. */
export function requestFrame(id: number, input: NativeInput): string {
  return `${JSON.stringify({ v: 1, id, ...input })}\n`
}

type Fields = Readonly<Record<string, unknown>>

const fieldsOf = (value: unknown): Fields | undefined =>
  value !== null && typeof value === 'object' ? { ...value } : undefined
const text = (value: unknown): value is string => typeof value === 'string'
const number = (value: unknown): value is number => typeof value === 'number'
const objectType = (value: unknown): value is Metadata['type'] =>
  value === 'file' || value === 'directory' || value === 'symlink'

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
  const fields = fieldsOf(value)
  if (fields?.['v'] !== 1) return undefined
  if ('ready' in fields)
    return fields['ready'] === true && !('id' in fields) ? { kind: 'ready' } : undefined
  const id = fields['id']
  if (!number(id) || !Number.isSafeInteger(id) || id < 1) return undefined
  if ('failure' in fields)
    return 'ok' in fields ? undefined : { kind: 'reply', id, outcome: failure(fields['failure']) }
  return 'ok' in fields ? { kind: 'reply', id, outcome: reply(fields['ok']) } : undefined
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
    case 'capacity':
      return value
    default:
      return 'unknown'
  }
}

function hit(value: unknown): Hit | undefined {
  const { path, token, offsetBytes } = fieldsOf(value) ?? {}
  return text(path) && text(token) && number(offsetBytes) ? { path, token, offsetBytes } : undefined
}

function metadata(value: unknown): Metadata | undefined {
  const { token, version, size, modified, type, name } = fieldsOf(value) ?? {}
  return text(token) &&
    text(version) &&
    number(size) &&
    number(modified) &&
    objectType(type) &&
    text(name)
    ? { token, version, size, modified, type, name }
    : undefined
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

/** A copy's `source` and `target`: absent, or present and parsed; `target` may be `null`. */
function copyNames(fields: Fields): Pick<NativeReply, 'source' | 'target'> | undefined {
  const names: { source?: Metadata; target?: Metadata | null } = {}
  if ('source' in fields) {
    const source = metadata(fields['source'])
    if (source === undefined) return undefined
    names.source = source
  }
  if ('target' in fields) {
    const target = fields['target'] === null ? null : metadata(fields['target'])
    if (target === undefined) return undefined
    names.target = target
  }
  return names
}

function reply(value: unknown): NativeReply | Failure {
  const fields = fieldsOf(value)
  if (fields === undefined || !('info' in fields)) return 'unknown'
  const { bytes, entries, next, hits } = fields
  if (!text(bytes) || !Array.isArray(entries) || !number(next)) return 'unknown'
  const info = metadata(fields['info'])
  const listed = each(entries, metadata)
  const found = Array.isArray(hits) ? each(hits, hit) : []
  const names = copyNames(fields)
  if (info === undefined || listed === undefined || found === undefined || names === undefined)
    return 'unknown'
  return {
    info,
    bytes,
    entries: listed,
    next,
    hits: found,
    truncated: fields['truncated'] === true,
    eof: fields['eof'] === true,
    ...names,
  }
}
