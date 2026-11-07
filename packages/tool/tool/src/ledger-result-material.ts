import { readMaterialBytes } from './ledger-material-read.ts'
import { createHash } from 'node:crypto'
import type { ContentBlock } from '@omne-harness/content-block'
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import {
  decodeToolOperationId,
  type Adoption,
  type ToolFailure,
  type ToolResult,
} from '@omne-harness/tool-contract'
import type {
  CallAccess,
  ResultPolicy,
  ToolMaterialFingerprint,
  ToolMaterialSeal,
  ToolMaterialStore,
} from '@omne-harness/tool-contract/provider'
import type { createLedgerMaterialCustody } from './ledger-material-custody.ts'
import { encodeToolMaterial } from './material-codec.ts'

export type ResultChannels = Readonly<{
  kind: 'channels'
  value: ToolMaterialFingerprint
  content: ToolMaterialSeal
  data: ToolMaterialSeal
  attachments: ToolMaterialSeal
  original:
    | Readonly<{ kind: 'none' }>
    | Readonly<{
        kind: 'offloaded'
        source: Extract<ToolResult<ContentBlock>['original'], { kind: 'offloaded' }>['source']
        summary: ToolMaterialSeal
      }>
}>

type Custody<P, B extends ContentBlock> = ReturnType<typeof createLedgerMaterialCustody<P, B>>
type Validation<P, B extends ContentBlock> = Parameters<Custody<P, B>['preserve']>[4]
type PreparationInput<P> = Parameters<Custody<P, ContentBlock>['preserve']>[0]

export async function prepareResultChannels<P, B extends ContentBlock>(
  custody: Custody<P, B>,
  input: PreparationInput<P>,
  value: ToolResult<B>,
  validate: Validation<P, B>,
): Promise<Outcome<ResultChannels, ToolFailure>> {
  const encoded = encodeToolMaterial(value)
  if ('failure' in encoded) return encoded
  const slot = async (name: string, part: unknown) => {
    const bytes = encodeToolMaterial(part)
    if ('failure' in bytes) return bytes
    const identity = encodeToolMaterial({
      source: input.source,
      value: encoded.ok.fingerprint,
      slot: name,
      bytes: bytes.ok.fingerprint,
    })
    if ('failure' in identity) return identity
    const operation = decodeToolOperationId(
      `result-slot:${createHash('sha256').update(input.operation).update('\0').update(name).digest('hex')}`,
    )
    if ('failure' in operation)
      return fail({ kind: 'invalid' as const, field: 'operation', reason: 'result-slot-identity' })
    return custody.preserve(
      { ...input, operation: operation.ok },
      bytes.ok,
      identity.ok.fingerprint,
      'result',
      validate,
    )
  }
  const content = await slot('content', value.content)
  if ('failure' in content) return content
  const data = await slot('data', value.data)
  if ('failure' in data) return data
  const attachments = await slot('attachments', value.attachments)
  if ('failure' in attachments) return attachments
  let original: ResultChannels['original'] = { kind: 'none' }
  if (value.original.kind === 'offloaded') {
    const summary = await slot('summary', value.original.summary)
    if ('failure' in summary) return summary
    original = { kind: 'offloaded', source: value.original.source, summary: summary.ok }
  }
  return succeed({
    kind: 'channels',
    value: encoded.ok.fingerprint,
    content: content.ok,
    data: data.ok,
    attachments: attachments.ok,
    original,
  })
}

const unavailable = (diagnostic: string) =>
  fail({ kind: 'unavailable' as const, dependency: 'result-material', diagnostic })

async function readChannel<P>(
  store: ToolMaterialStore<P>,
  access: CallAccess<P>,
  seal: ToolMaterialSeal,
): Promise<Outcome<unknown, ToolFailure>> {
  const bytes = await readMaterialBytes(access, seal, store)
  if ('failure' in bytes) return bytes
  try {
    return succeed(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes.ok)))
  } catch {
    return unavailable('result material is not UTF-8 JSON')
  }
}

export async function readResultChannels<P, B extends ContentBlock>(
  store: ToolMaterialStore<P> | undefined,
  access: CallAccess<P>,
  channels: ResultChannels,
  policy: ResultPolicy<B>,
  adoption: Adoption,
): Promise<Outcome<ToolResult<B>, ToolFailure>> {
  if (store === undefined) return unavailable('material provider is not connected')
  if (channels.value.codec !== 'tool-canonical-json-v1')
    return fail({ kind: 'unsupported', adoption, reason: 'unsupported result material encoding' })
  const content = await readChannel(store, access, channels.content)
  if ('failure' in content) return content
  const data = await readChannel(store, access, channels.data)
  if ('failure' in data) return data
  const attachments = await readChannel(store, access, channels.attachments)
  if ('failure' in attachments) return attachments
  let original: unknown = { kind: 'none' }
  if (channels.original.kind === 'offloaded') {
    const summary = await readChannel(store, access, channels.original.summary)
    if ('failure' in summary) return summary
    original = { kind: 'offloaded', source: channels.original.source, summary: summary.ok }
  }
  const value = { content: content.ok, data: data.ok, attachments: attachments.ok, original }
  const checked = policyResult(policy, value)
  if ('failure' in checked) return checked
  const encoded = encodeToolMaterial(checked.ok)
  if (
    'failure' in encoded ||
    encoded.ok.fingerprint.digest !== channels.value.digest ||
    encoded.ok.fingerprint.bytes !== channels.value.bytes
  )
    return unavailable('result value fingerprint mismatch')
  return checked
}

function policyResult<B extends ContentBlock>(
  policy: ResultPolicy<B>,
  value: unknown,
): Outcome<ToolResult<B>, ToolFailure> {
  const checked = policy.judgeResult(value as ToolResult<ContentBlock>)
  return 'failure' in checked ? unavailable('stored result violates its contract') : checked
}
