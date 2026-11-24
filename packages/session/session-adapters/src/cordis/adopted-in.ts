import type { DurableEvidence } from '@omne-harness/agent-contract'
import type { SessionRequestChoice } from '@omne-harness/session-cordis-contract'
import {
  EXECUTION_RECORD_HANDLERS,
  decodeExecutionRequestChoices,
  decodeExecutionSessionAdoption,
} from '@omne-harness/session-storage-sql/participants'
import type { JsonValue } from '@omne-harness/sql-contract'
import type { ExecutionView, RequestView } from '../journal/index.ts'
import { blobRowDigest } from './journal-batch.ts'
import { readBlob, type Reader, type Scope } from './journal-read.ts'

export type AdoptedPart = Readonly<{
  order: string
  execution: string
  reference: string
  fixed: DurableEvidence
  coverage: DurableEvidence | null
  schema: RequestView['schema']
  record: JsonValue
}>

export type Unread = Readonly<{ kind: 'unavailable'; diagnostic: string }>

export type AdoptedRead = Readonly<{ kind: 'value'; value: AdoptedPart | null }> | Unread

export type ChoicesRead =
  | Readonly<{ kind: 'value'; value: readonly SessionRequestChoice[] | null }>
  | Unread

const unread = (diagnostic: string): Unread => ({ kind: 'unavailable', diagnostic })

/** The request adopted last in the session, or the one adopted for the named model call. */
export function adoptedIn(
  executions: Iterable<ExecutionView>,
  reference: string | undefined,
): Readonly<{ execution: string; request: RequestView }> | null {
  let latest: Readonly<{ execution: string; request: RequestView }> | null = null
  for (const execution of executions) {
    const request =
      reference === undefined
        ? execution.adopted
        : (execution.requests.findLast(each => each.reference === reference) ?? null)
    if (request !== null && (latest === null || request.pub > latest.request.pub))
      latest = { execution: execution.execution, request }
  }
  return latest
}

const isRecord = (value: JsonValue | undefined): value is { readonly [key: string]: JsonValue } =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

function parsed(payload: string): Readonly<{ record: JsonValue }> | Unread {
  try {
    return { record: JSON.parse(payload) as JsonValue }
  } catch (error) {
    return unread(`the record block does not decode: ${String(error)}`)
  }
}

async function kept(read: Reader, scope: Scope): Promise<AdoptedPart | null | Unread> {
  const output = await read(EXECUTION_RECORD_HANDLERS.sessionAdoption, scope)
  if (output.kind === 'unread') return unread(`the kept adoption is not readable: ${output.reason}`)
  const decoded = decodeExecutionSessionAdoption(output.output)
  if (decoded === null) return unread('the kept adoption does not decode')
  if (decoded.value === null) return null
  const { reference, pub, execution, payload, adoption } = decoded.value
  const { fixed, coverage, schema } = adoption
  if (!isRecord(fixed) || !isRecord(schema) || !(coverage === null || isRecord(coverage)))
    return unread('the kept adoption does not decode')
  const body = parsed(payload)
  if ('kind' in body) return body
  return {
    order: pub,
    execution,
    reference,
    fixed: fixed as DurableEvidence,
    coverage: coverage as DurableEvidence | null,
    schema: schema as RequestView['schema'],
    record: body.record,
  }
}

async function live(
  read: Reader,
  scope: Scope,
  blobs: Map<string, string>,
  latest: Readonly<{ execution: string; request: RequestView }>,
): Promise<AdoptedRead> {
  const digest = blobRowDigest(latest.request.record.digest)
  let payload = blobs.get(digest)
  if (payload === undefined) {
    const found = await readBlob(read, scope.tenant, latest.execution, digest)
    if (typeof found !== 'string') return unread(`the record block ${digest} is not readable`)
    blobs.set(digest, found)
    payload = found
  }
  const body = parsed(payload)
  if ('kind' in body) return body
  return {
    kind: 'value',
    value: {
      order: String(latest.request.pub),
      execution: latest.execution,
      reference: String(latest.request.reference),
      fixed: latest.request.fixed,
      coverage: latest.request.coverage,
      schema: latest.request.schema,
      record: body.record,
    },
  }
}

/** Without a reference, the adoption the session kept from a settled execution wins when later. */
export async function readAdoptedIn(
  input: Readonly<{
    executions: Iterable<ExecutionView>
    reference: string | undefined
    read: Reader
    scope: Scope
    blobs: Map<string, string>
  }>,
): Promise<AdoptedRead> {
  const latest = adoptedIn(input.executions, input.reference)
  if (input.reference !== undefined)
    return latest === null
      ? { kind: 'value', value: null }
      : live(input.read, input.scope, input.blobs, latest)
  const retained = await kept(input.read, input.scope)
  if (retained !== null && 'kind' in retained) return retained
  if (
    latest === null ||
    (retained !== null && BigInt(retained.order) >= BigInt(latest.request.pub))
  )
    return { kind: 'value', value: retained }
  return live(input.read, input.scope, input.blobs, latest)
}

function choiceOf(value: JsonValue): SessionRequestChoice | null {
  if (!isRecord(value)) return null
  const { message, block, choice, mediaType } = value
  return typeof message === 'string' &&
    typeof block === 'string' &&
    (choice === 'original' || choice === 'derived' || choice === 'transcript') &&
    (mediaType === null || typeof mediaType === 'string')
    ? { message, block, choice, mediaType }
    : null
}

export async function readChoices(
  read: Reader,
  scope: Scope & Readonly<{ reference: string }>,
): Promise<ChoicesRead> {
  const output = await read(EXECUTION_RECORD_HANDLERS.requestChoices, scope)
  if (output.kind === 'unread') return unread(`the choices are not readable: ${output.reason}`)
  const decoded = decodeExecutionRequestChoices(output.output)
  if (decoded === null) return unread('the choices do not decode')
  if (decoded.value === null) return { kind: 'value', value: null }
  const choices = decoded.value.map(choiceOf)
  return choices.every(item => item !== null)
    ? { kind: 'value', value: choices }
    : unread('the choices do not decode')
}
