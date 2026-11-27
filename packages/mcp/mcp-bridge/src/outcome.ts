import { judgeContentBlock } from '@omne-harness/content-block'
import { readJsonText, writeJsonText, type JsonValue } from '@omne-harness/json-text'
import {
  sameJson,
  type CallOutcome,
  type DeliveredContent,
  type Generation,
  type InvokeResult,
  type NotSentReason,
  type OperationFailure,
  type TaskId,
  type UnavailableReason,
} from '@omne-harness/mcp-contract'
import type { ToolProgramDeclaration, ToolRenderedResult } from '@omne-harness/tool-contract'
import type { ToolMessageContentBlock } from '@omne-harness/tool-contract/provider'
import { oneLine, PEER_TEXT_BEGIN, PEER_TEXT_END } from './convert.ts'

export type BridgeResult = ToolRenderedResult<ToolMessageContentBlock>
export type ProgramData = Extract<ToolProgramDeclaration, { kind: 'json' }>

/** What one call to an endpoint came to, as the tool tells it. Nothing here is guessed as success. */
export type Settlement =
  | Readonly<{ effect: 'happened'; result: BridgeResult }>
  | Readonly<{ effect: 'not-started'; message: string }>
  | Readonly<{
      effect: 'unknown'
      message: string
      cancelTask?: Readonly<{ taskId: TaskId; issuedAt: Generation }>
    }>

const PEER_LINE_MAX = 300
const NOT_KNOWN = 'Whether the action took effect is not known. It was not sent again.'

const CONFIG_ITEM = {
  target: 'address',
  credential: 'credential',
  'connect-timeout': 'connection timeout',
} as const

const CREDENTIAL_CAUSE = {
  missing: 'is not set',
  rejected: 'was rejected by the endpoint; the person needs to set the right one',
  unknown: 'could not be read',
} as const

const UNAVAILABLE: Readonly<Record<UnavailableReason, string>> = {
  'connection-unavailable': 'the endpoint could not be reached',
  'authorization-required': 'the endpoint requires an authorization this version cannot give',
  'credential-rejected':
    'the credential of the endpoint was rejected by the endpoint; the person needs to set the right one',
  'credential-unavailable': 'the credential of the endpoint is not usable',
}

export function unavailableText(reason: UnavailableReason): string {
  return UNAVAILABLE[reason]
}

function peerLine(text: string): string {
  const line = oneLine(text)
  const points = [...line]
  return JSON.stringify(
    points.length <= PEER_LINE_MAX ? line : `${points.slice(0, PEER_LINE_MAX).join('')}...`,
  )
}

/** Why the endpoint gave nothing, or why a call was not sent to it. */
export function failureText(failure: OperationFailure | NotSentReason): string {
  switch (failure.kind) {
    case 'not-available-to-you':
      return 'the endpoint is not available to this caller'
    case 'blocked':
      return 'the endpoint is disabled'
    case 'unknown':
      return 'whether the endpoint may be used could not be read'
    case 'config-missing':
      return `the ${CONFIG_ITEM[failure.item]} of the endpoint is not set`
    case 'config-invalid':
      return `the ${CONFIG_ITEM[failure.item]} of the endpoint is not valid`
    case 'credential-unavailable':
      return `the credential of the endpoint ${CREDENTIAL_CAUSE[failure.cause]}`
    case 'authorization-required':
      return UNAVAILABLE['authorization-required']
    case 'connection-unavailable':
      return UNAVAILABLE['connection-unavailable']
    case 'effect-unknown':
      return 'the endpoint did not answer'
    case 'error-answer':
      return `the endpoint answered with an error (code ${String(failure.code)}): ${peerLine(failure.message)}`
    case 'answer-malformed':
      return `the endpoint answered something that could not be read (${failure.what})`
    case 'correlation-key-in-use':
      return 'this call is already in flight'
    case 'cancelled':
      return 'the call was cancelled before it was sent'
    case 'definition-changed':
      return 'the definition of the action changed after the call was accepted; read its usage again, then call again'
    case 'action-unavailable':
      return 'the endpoint does not offer this action now'
    default: {
      const exhaustive: never = failure
      return exhaustive
    }
  }
}

export function notStarted(tool: string, action: string, why: string): Settlement {
  return {
    effect: 'not-started',
    message: `${tool} ${action} did not start: ${why}. Nothing was sent to the endpoint.`,
  }
}

function textOf(value: JsonValue | undefined): string | undefined {
  return value?.kind === 'string' ? value.value : undefined
}

function memberOf(value: JsonValue, key: string): JsonValue | undefined {
  return value.kind === 'object' ? value.entries.find(entry => entry.key === key)?.value : undefined
}

function deliveredText(item: DeliveredContent): string {
  if (item.kind === 'invalid') return item.block.text
  if (item.kind === 'block') {
    const { block } = item
    if (block.kind === 'text') return block.text
    const type = 'mediaType' in block ? ` of type ${block.mediaType}` : ''
    return `[the endpoint returned ${block.kind} content${type}; this version delivers text only]`
  }
  if (item.type === 'resource_link') {
    const name = textOf(memberOf(item.item, 'name')) ?? ''
    return `[resource link] ${textOf(memberOf(item.item, 'uri')) ?? ''} ${name}`.trimEnd()
  }
  const resource = memberOf(item.item, 'resource')
  const uri = resource === undefined ? '' : (textOf(memberOf(resource, 'uri')) ?? '')
  const text = resource === undefined ? undefined : textOf(memberOf(resource, 'text'))
  return text === undefined
    ? `[the endpoint returned a binary resource ${uri}; this version delivers text only]`
    : `[resource ${uri}]\n${text}`
}

const CARRIED_LIMITS = {
  maxBytes: 4_194_304,
  maxDepth: 64,
  maxItems: 262_144,
  maxMembers: 65_536,
  maxStringLength: 4_194_304,
  maxNumberLength: 128,
} as const

function carries(item: DeliveredContent, structured: JsonValue): boolean {
  if (item.kind !== 'block' || item.block.kind !== 'text') return false
  const read = readJsonText(item.block.text, CARRIED_LIMITS)
  return read.kind === 'ok' && sameJson(read.value, structured)
}

const ENVELOPE_BYTES = 2048
const encodedBytes = (text: string) => Buffer.byteLength(JSON.stringify(text))

// The longest head of the text that fits the result budget once it is written as JSON.
function fitted(text: string, maxBytes: number): Readonly<{ text: string; cutFrom?: number }> {
  const budget = Math.max(maxBytes - ENVELOPE_BYTES, Math.floor(maxBytes / 2))
  const whole = encodedBytes(text)
  if (whole <= budget) return { text }
  const points = [...text]
  let low = 0
  let high = points.length
  while (low < high) {
    const middle = Math.ceil((low + high) / 2)
    if (encodedBytes(points.slice(0, middle).join('')) <= budget) low = middle
    else high = middle - 1
  }
  return { text: points.slice(0, low).join(''), cutFrom: whole }
}

const record = (members: Readonly<Record<string, string | undefined>>): JsonValue => ({
  kind: 'object',
  entries: Object.entries(members).flatMap(([key, value]) =>
    value === undefined ? [] : [{ key, value: { kind: 'string', value } }],
  ),
})

function itemOf(item: DeliveredContent): JsonValue {
  if (item.kind === 'invalid') return record({ type: 'undelivered', reason: item.reason })
  if (item.kind === 'block') {
    const { block } = item
    if (block.kind === 'text') return record({ type: 'text', text: block.text })
    return record({
      type: block.kind,
      mediaType: 'mediaType' in block ? block.mediaType : undefined,
    })
  }
  if (item.type === 'resource_link')
    return record({
      type: item.type,
      uri: textOf(memberOf(item.item, 'uri')),
      name: textOf(memberOf(item.item, 'name')),
    })
  const resource = memberOf(item.item, 'resource')
  return record({
    type: item.type,
    uri: resource === undefined ? undefined : textOf(memberOf(resource, 'uri')),
    text: resource === undefined ? undefined : textOf(memberOf(resource, 'text')),
  })
}

function programValue(outcome: Extract<CallOutcome, { kind: 'complete' | 'toolError' }>) {
  if (outcome.kind !== 'complete') return undefined
  if (outcome.output.kind === 'conforms') return outcome.structured
  return outcome.output.kind === 'no-schema'
    ? ({ kind: 'array', items: outcome.content.map(itemOf) } satisfies JsonValue)
    : undefined
}

function dataOf(
  outcome: Extract<CallOutcome, { kind: 'complete' | 'toolError' }>,
  program: ProgramData | undefined,
): BridgeResult['data'] {
  const value = program === undefined ? undefined : programValue(outcome)
  if (program === undefined || value === undefined) return { kind: 'none' }
  return { kind: 'json', contract: program.contract, schema: program.schema, value }
}

function answered(
  head: string,
  outcome: Extract<CallOutcome, { kind: 'complete' | 'toolError' }>,
  maxBytes: number,
  program: ProgramData | undefined,
): BridgeResult {
  const parts = outcome.content.map(deliveredText)
  const { structured } = outcome
  if (structured !== undefined && !outcome.content.some(item => carries(item, structured)))
    parts.push(`structured content: ${writeJsonText(structured)}`)
  const peer = fitted(parts.join('\n'), maxBytes)
  const body =
    parts.length === 0
      ? 'The endpoint returned no content.'
      : `${PEER_TEXT_BEGIN}\n${peer.text}\n${PEER_TEXT_END}`
  const notes = [
    peer.cutFrom === undefined
      ? ''
      : `\nThe result is cut here: the endpoint returned about ${String(peer.cutFrom)} bytes, more than one result of this tool carries. Ask the action for less at a time.`,
    outcome.kind === 'complete' && outcome.output.kind === 'violates'
      ? `\nThe structured content does not match the output schema the endpoint declared: ${outcome.output.reason}`
      : '',
  ]
  const judged = judgeContentBlock({
    kind: 'text',
    id: 'mcp.result',
    visibility: { toHuman: true, toModel: true },
    text: `${head}\n${body}${notes.join('')}`,
  })
  if (!('ok' in judged) || judged.ok.kind !== 'text')
    throw new TypeError('the result text of the endpoint is not a text block')
  return {
    content: [judged.ok],
    data: dataOf(outcome, program),
    original: { kind: 'none' },
    attachments: [],
  }
}

function faultText(fault: Extract<CallOutcome, { kind: 'protocolError' }>['fault']): string {
  switch (fault.kind) {
    case 'peer-error':
      return `a protocol error (code ${String(fault.code)}): ${peerLine(fault.message)}`
    case 'result-type-unknown':
      return `a result of a type this version does not know (${peerLine(fault.resultType)})`
    case 'result-malformed':
      return 'a result that could not be read'
    case 'error-malformed':
      return 'an error that could not be read'
    default: {
      const exhaustive: never = fault
      return exhaustive
    }
  }
}

/** The call was sent and what became of it is not known; it is not sent again. */
export function unknownText(tool: string, action: string, what: string): string {
  return `${tool} ${action} was sent, and ${what}. ${NOT_KNOWN}`
}

/** What MCP gave back, as what the tool call came to; an answer above `maxBytes` is cut and says so. */
export function settle(
  tool: string,
  action: string,
  result: InvokeResult,
  maxBytes: number,
  program?: ProgramData,
): Settlement {
  if (result.kind === 'not-sent') return notStarted(tool, action, failureText(result.reason))
  const { outcome } = result
  switch (outcome.kind) {
    case 'complete':
      return {
        effect: 'happened',
        result: answered(`done ${tool} ${action}`, outcome, maxBytes, program),
      }
    case 'toolError':
      return {
        effect: 'happened',
        result: answered(
          `${tool} ${action}: the endpoint reported that the action failed. Its report follows.`,
          outcome,
          maxBytes,
          program,
        ),
      }
    case 'protocolError':
      return {
        effect: 'unknown',
        message: unknownText(
          tool,
          action,
          `the endpoint answered with ${faultText(outcome.fault)}`,
        ),
      }
    case 'unknown':
      return {
        effect: 'unknown',
        message: unknownText(
          tool,
          action,
          outcome.cause === 'stream-broken'
            ? 'the connection broke before an answer arrived'
            : 'the wait for an answer was given up',
        ),
      }
    case 'inputRequired':
      return {
        effect: 'unknown',
        message: unknownText(
          tool,
          action,
          'the endpoint asked a person for more input, which this version does not support',
        ),
      }
    case 'task':
      return {
        effect: 'unknown',
        message: unknownText(
          tool,
          action,
          'the endpoint turned it into a long-running task, which this version does not follow; the task was asked to cancel',
        ),
        cancelTask: { taskId: outcome.taskId, issuedAt: outcome.issuedAt },
      }
    default: {
      const exhaustive: never = outcome
      return exhaustive
    }
  }
}
