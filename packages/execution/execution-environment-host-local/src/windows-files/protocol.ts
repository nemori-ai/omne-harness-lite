import type { FileInformation } from '@omne-harness/execution-environment-contract'
import type { Failure } from '../host-paths.ts'

export type Start = Readonly<{
  root: string
  expectedRoot: string
  segments: readonly string[]
  rooted: boolean
}>

export type Final = Readonly<{ directory: boolean; follow: boolean }>

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

export type IdentifyInput = Start & Final & Readonly<{ operation: 'identify' }>

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

export type WriteInput = Start &
  Readonly<{
    named: string
    operation: 'write'
    version: string | null
    trailingSlash: boolean
    create: boolean
    bytes: string
  }>

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

export type ReplyFrame =
  | Readonly<{ kind: 'ready' }>
  | Readonly<{ kind: 'reply'; id: number; outcome: NativeReply | Failure }>

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

function each<T>(values: readonly unknown[], parse: (value: unknown) => T | undefined) {
  const parsed: T[] = []
  for (const value of values) {
    const item = parse(value)
    if (item === undefined) return undefined
    parsed.push(item)
  }
  return parsed
}

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
