// The readers of SPEC T2 and T6: what a transport hands over for a result that
// `classifyWireEvent` put into the readable class. Each reader is total and answers the defect
// of the shape it cannot read, with the `what` of T7. One implementation for every transport.
import type { JsonValue } from '@omne-harness/json-text'
import type { Outcome } from '@omne-harness/operation-result'
import { isProtocolVersion, type Generation, type ProtocolVersion } from './brands.ts'
import { countOf, taskHintsOf } from './classify.ts'
import { SERVER_INFO_KEY } from './envelope.ts'
import { boundInstructions } from './instructions.ts'
import { isObject, itemsOf, member, textOf } from './json.ts'
import type { ErrorAnswer, TaskReport, TaskStatus } from './outcomes.ts'
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

/** What `server/discover` or `initialize` said, before the instructions are bound (T3). */
export type PeerRead = Readonly<{
  protocolVersion: ProtocolVersion
  capabilities: JsonValue
  serverInfo?: JsonValue
  instructions?: string
}>

/** The material facts that turn a `PeerRead` into the peer identity. */
export type IdentityBound = Readonly<{ generation: Generation; instructionsByteLimit: number }>

/**
 * The modern answer (T2, T3): a result with `supportedVersions` and `capabilities`; the version
 * is the highest of `versions` the peer offers. `no-common-version` when it offers none of them.
 */
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

/** The legacy answer (T2): `protocolVersion` in `LEGACY_PROTOCOL_VERSIONS`, `capabilities` an object. */
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

/** The peer identity of a read (T3, S3): the instructions bound to the material's byte limit. */
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

/**
 * A page of `tools/list` (T2): `tools` a list, `nextCursor` absent or text, `ttlMs` kept only as
 * a non-negative safe integer. With `checkHeaders` the `x-mcp-header` rule withholds tools.
 */
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

/** The status read of a `tasks/get` result (T6), with the input requests of an `input_required` task. */
export function readTaskReport(result: JsonValue): Outcome<TaskReport, TaskReadDefect> {
  if (!isObject(result)) return { failure: 'status-unknown' }
  const written = textOf(member(result, 'status'))
  const status = TASK_STATUSES.find(known => known === written)
  const taskId = textOf(member(result, 'taskId'))
  if (status === undefined || taskId === undefined || taskId === '')
    return { failure: 'status-unknown' }
  const inputRequests = member(result, 'inputRequests')
  if (status === 'input_required' && !isObject(inputRequests))
    return { failure: 'input-requests-missing' }
  if (status === 'completed' && member(result, 'result') === undefined)
    return { failure: 'result-missing' }
  if (status === 'failed' && !isObject(member(result, 'error'))) return { failure: 'error-missing' }
  return {
    ok: {
      status,
      ...(status === 'input_required' && inputRequests !== undefined
        ? { inputRequests: { untrusted: inputRequests } }
        : {}),
      ...taskHintsOf(result),
    },
  }
}

/** The answer read of a `tasks/get` result (T6): the result or error of a finished task. */
export function readTaskAnswer(result: JsonValue): Outcome<TaskAnswer, TaskReadDefect> {
  const report = readTaskReport(result)
  if ('failure' in report) return report
  if (!isObject(result)) return { failure: 'status-unknown' }
  switch (report.ok.status) {
    case 'completed': {
      const value = member(result, 'result')
      return value === undefined
        ? { failure: 'result-missing' }
        : { ok: { kind: 'finished', answer: { kind: 'result', result: value } } }
    }
    case 'failed': {
      const error = member(result, 'error')
      return error === undefined
        ? { failure: 'error-missing' }
        : { ok: { kind: 'finished', answer: { kind: 'error', error } } }
    }
    case 'cancelled':
      return { ok: { kind: 'cancelled' } }
    case 'working':
    case 'input_required':
      return { ok: { kind: 'not-finished' } }
    default: {
      const exhaustive: never = report.ok.status
      return exhaustive
    }
  }
}

/** A readable JSON-RPC error object (T2) as an `error-answer`, or undefined when it is not readable. */
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
