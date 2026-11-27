import { createHash } from 'node:crypto'
import { readJsonText, writeJsonText, type JsonValue } from '@omne-harness/json-text'
import type { EndpointRef } from '@omne-harness/mcp-contract'
import {
  describedAdoption,
  type ToolCheckpointDeclaration,
} from '@omne-harness/tool-contract/provider'
import type { FormField, FormRequest } from './form.ts'

/** What a suspended call keeps: all a resume needs, and nothing the core has to still hold. */
export type Kept = Readonly<{
  ref: EndpointRef
  action: string
  definition: string
  args: JsonValue
  requestState?: string
  requests: readonly FormRequest[]
  round: number
}>

const OWNER = '@omne-harness/mcp-bridge'
const STATE_MAX_BYTES = 131_072
const LIMITS = {
  maxBytes: STATE_MAX_BYTES,
  maxDepth: 64,
  maxItems: 16_384,
  maxMembers: 4096,
  maxStringLength: STATE_MAX_BYTES,
  maxNumberLength: 64,
}

export const CONTINUATION_CHECKPOINT: ToolCheckpointDeclaration = {
  schema: {
    id: `${OWNER}/continuation`,
    revision: '1',
    digest: `sha256:${createHash('sha256').update('mcp-bridge continuation 1').digest('hex')}`,
  },
  codec: describedAdoption({ owner: OWNER, name: 'continuation-state', revision: '1' }),
  maxBytes: STATE_MAX_BYTES,
}

export function encodeKept(kept: Kept): Uint8Array {
  const { args, ...rest } = kept
  return new TextEncoder().encode(JSON.stringify({ ...rest, args: writeJsonText(args) }))
}

const isText = (value: unknown): value is string => typeof value === 'string'
const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
const KINDS: ReadonlySet<unknown> = new Set(['text', 'number', 'boolean', 'choice'])

function isField(value: unknown): value is FormField {
  return (
    isRecord(value) &&
    isText(value['name']) &&
    KINDS.has(value['kind']) &&
    isText(value['label']) &&
    isText(value['description']) &&
    typeof value['required'] === 'boolean' &&
    Array.isArray(value['values']) &&
    value['values'].every(isText)
  )
}

function isRequest(value: unknown): value is FormRequest {
  return (
    isRecord(value) &&
    isText(value['key']) &&
    isText(value['message']) &&
    Array.isArray(value['fields']) &&
    value['fields'].every(isField)
  )
}

/** The state a suspension handed out, read back; anything else is not this bridge's checkpoint. */
export function decodeKept(bytes: Uint8Array): Kept | undefined {
  let saved: unknown
  try {
    saved = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes))
  } catch {
    return undefined
  }
  if (!isRecord(saved) || !isRecord(saved['ref']) || !isText(saved['args'])) return undefined
  const { ref, action, definition, requestState, requests, round } = saved
  if (!isText(ref['name']) || !isText(ref['holding']) || !isText(action) || !isText(definition))
    return undefined
  if (requestState !== undefined && !isText(requestState)) return undefined
  if (!Array.isArray(requests) || !requests.every(isRequest)) return undefined
  if (typeof round !== 'number' || !Number.isSafeInteger(round) || round < 1) return undefined
  const args = readJsonText(saved['args'], LIMITS)
  if (args.kind !== 'ok') return undefined
  return {
    ref: ref as unknown as EndpointRef,
    action,
    definition,
    args: args.value,
    ...(requestState === undefined ? {} : { requestState }),
    requests,
    round,
  }
}

/** The name of a checkpoint in the continuation records: the digest of its bytes. */
export const checkpointDigest = (bytes: Uint8Array): string =>
  `sha256:${createHash('sha256').update(bytes).digest('hex')}`
