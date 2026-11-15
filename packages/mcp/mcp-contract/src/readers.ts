import type { JsonValue } from '@omne-harness/json-text'
import type { Outcome } from '@omne-harness/operation-result'
import { isProtocolVersion, type Generation, type ProtocolVersion } from './brands.ts'
import { countOf, taskHintsOf } from './classify.ts'
import { SERVER_INFO_KEY } from './envelope.ts'
import { boundInstructions } from './instructions.ts'
import { isObject, itemsOf, member, textOf, type JsonObject } from './json.ts'
import type { ErrorAnswer, TaskHints, TaskReport, TaskStatus } from './outcomes.ts'
import { isLegacyProtocolVersion, isModernProtocolVersion } from './revisions.ts'
import type { ListingPage, TaskAnswer } from './transport.ts'
import type { PeerIdentity } from './values.ts'
import { withheldTools } from './withheld.ts'

const INTEGER = /^-?\d+$/u
const TASK_STATUSES: readonly TaskStatus[] = [
  'working',
  'input_required',
  'completed',
  'failed',
  'cancelled',
]

export type PeerRead = Readonly<{
  protocolVersion: ProtocolVersion
  capabilities: JsonValue
  serverInfo?: JsonValue
  instructions?: string
}>

export type IdentityBound = Readonly<{ generation: Generation; instructionsByteLimit: number }>

export function readDiscoverResult(
  result: JsonValue,
  versions: readonly string[],
): Outcome<PeerRead, 'shape' | 'no-common-version'> {
  if (!isObject(result)) return { failure: 'shape' }
  const offered = itemsOf(member(result, 'supportedVersions'))
  const capabilities = member(result, 'capabilities')
  if (offered === undefined || !isObject(capabilities)) return { failure: 'shape' }
  const texts = offered.flatMap(item => (item.kind === 'string' ? [item.value] : []))
  const version = versions.find(
    candidate => texts.includes(candidate) && isModernProtocolVersion(candidate),
  )
  if (version === undefined || !isProtocolVersion(version)) return { failure: 'no-common-version' }
  const meta = member(result, '_meta')
  const serverInfo = isObject(meta) ? member(meta, SERVER_INFO_KEY) : undefined
  const instructions = textOf(member(result, 'instructions'))
  return {
    ok: {
      protocolVersion: version,
      capabilities,
      ...(serverInfo === undefined ? {} : { serverInfo }),
      ...(instructions === undefined ? {} : { instructions }),
    },
  }
}

export function readInitializeResult(result: JsonValue): Outcome<PeerRead, 'shape'> {
  if (!isObject(result)) return { failure: 'shape' }
  const version = textOf(member(result, 'protocolVersion'))
  const capabilities = member(result, 'capabilities')
  if (
    version === undefined ||
    !isProtocolVersion(version) ||
    !isLegacyProtocolVersion(version) ||
    !isObject(capabilities)
  )
    return { failure: 'shape' }
  const serverInfo = member(result, 'serverInfo')
  const instructions = textOf(member(result, 'instructions'))
  return {
    ok: {
      protocolVersion: version,
      capabilities,
      ...(serverInfo === undefined ? {} : { serverInfo }),
      ...(instructions === undefined ? {} : { instructions }),
    },
  }
}

export function peerIdentityOf(read: PeerRead, bound: IdentityBound): PeerIdentity {
  return {
    protocolVersion: read.protocolVersion,
    capabilities: read.capabilities,
    ...(read.serverInfo === undefined ? {} : { serverInfo: { untrusted: read.serverInfo } }),
    ...(read.instructions === undefined
      ? {}
      : {
          instructions: {
            untrusted: {
              ...boundInstructions(read.instructions, bound.instructionsByteLimit),
              generation: bound.generation,
            },
          },
        }),
  }
}

export function readListingPage(
  result: JsonValue,
  checkHeaders: boolean,
): Outcome<ListingPage, 'tools-missing' | 'cursor-invalid'> {
  const tools = isObject(result) ? itemsOf(member(result, 'tools')) : undefined
  if (!isObject(result) || tools === undefined) return { failure: 'tools-missing' }
  const cursor = member(result, 'nextCursor')
  const nextCursor = textOf(cursor)
  if (cursor !== undefined && nextCursor === undefined) return { failure: 'cursor-invalid' }
  const ttlMs = countOf(member(result, 'ttlMs'))
  const page = checkHeaders ? withheldTools(tools) : { tools }
  return {
    ok: {
      ...page,
      ...(nextCursor === undefined ? {} : { nextCursor }),
      ...(ttlMs === undefined ? {} : { ttlMs }),
    },
  }
}

export type TaskReadDefect =
  | 'status-unknown'
  | 'input-requests-missing'
  | 'result-missing'
  | 'error-missing'

type TaskRead =
  | Readonly<{ status: 'working' | 'cancelled' }>
  | Readonly<{ status: 'input_required'; inputRequests: JsonValue }>
  | Readonly<{ status: 'completed'; result: JsonValue }>
  | Readonly<{ status: 'failed'; error: JsonValue }>

function readTask(
  result: JsonValue,
): Outcome<Readonly<{ read: TaskRead; hints: TaskHints }>, TaskReadDefect> {
  if (!isObject(result)) return { failure: 'status-unknown' }
  const written = textOf(member(result, 'status'))
  const status = TASK_STATUSES.find(known => known === written)
  const taskId = textOf(member(result, 'taskId'))
  if (status === undefined || taskId === undefined || taskId === '')
    return { failure: 'status-unknown' }
  const read = taskReadOf(status, result)
  return 'failure' in read ? read : { ok: { read: read.ok, hints: taskHintsOf(result) } }
}

function taskReadOf(status: TaskStatus, result: JsonObject): Outcome<TaskRead, TaskReadDefect> {
  switch (status) {
    case 'input_required': {
      const inputRequests = member(result, 'inputRequests')
      return isObject(inputRequests)
        ? { ok: { status, inputRequests } }
        : { failure: 'input-requests-missing' }
    }
    case 'completed': {
      const value = member(result, 'result')
      return value === undefined ? { failure: 'result-missing' } : { ok: { status, result: value } }
    }
    case 'failed': {
      const error = member(result, 'error')
      return isObject(error) ? { ok: { status, error } } : { failure: 'error-missing' }
    }
    case 'working':
    case 'cancelled':
      return { ok: { status } }
    default: {
      const exhaustive: never = status
      return exhaustive
    }
  }
}

export function readTaskReport(result: JsonValue): Outcome<TaskReport, TaskReadDefect> {
  const task = readTask(result)
  if ('failure' in task) return task
  const { read, hints } = task.ok
  return {
    ok: {
      status: read.status,
      ...(read.status === 'input_required'
        ? { inputRequests: { untrusted: read.inputRequests } }
        : {}),
      ...hints,
    },
  }
}

export function readTaskAnswer(result: JsonValue): Outcome<TaskAnswer, TaskReadDefect> {
  const task = readTask(result)
  if ('failure' in task) return task
  const { read } = task.ok
  switch (read.status) {
    case 'completed':
      return { ok: { kind: 'finished', answer: { kind: 'result', result: read.result } } }
    case 'failed':
      return { ok: { kind: 'finished', answer: { kind: 'error', error: read.error } } }
    case 'cancelled':
      return { ok: { kind: 'cancelled' } }
    case 'working':
    case 'input_required':
      return { ok: { kind: 'not-finished' } }
    default: {
      const exhaustive: never = read
      return exhaustive
    }
  }
}

export function errorAnswerOf(error: JsonValue): ErrorAnswer | undefined {
  if (!isObject(error)) return undefined
  const code = member(error, 'code')
  const message = textOf(member(error, 'message'))
  if (code?.kind !== 'number' || !INTEGER.test(code.lexeme) || message === undefined)
    return undefined
  const data = member(error, 'data')
  return {
    kind: 'error-answer',
    code: Number(code.lexeme),
    message,
    ...(data === undefined ? {} : { data }),
  }
}
