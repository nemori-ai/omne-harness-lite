import { readMaterialBytes } from './ledger-material-read.ts'
import { createHash } from 'node:crypto'
import type { ContentBlock } from '@omne-harness/content-block'
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import {
  decodeToolOperationId,
  type ToolOffloadedBody,
  type ToolRenderedResult,
  type Adoption,
  type ToolFailure,
  type ToolResult,
} from '@omne-harness/tool-contract'
import {
  decodeToolBodyId,
  decodeToolMaterialInstant,
  judgeCommittedToolResult,
} from '@omne-harness/tool-contract/provider'
import type {
  CallAccess,
  ResultPolicy,
  ToolMaterialFingerprint,
  ToolMaterialSeal,
  ToolMaterialStore,
  ToolMaterialInstant,
} from '@omne-harness/tool-contract/provider'
import type { createLedgerMaterialCustody } from './ledger-material-custody.ts'
import { encodeToolMaterial } from './material-codec.ts'
import { materialContent } from './ledger-material-content.ts'
import { planResultBody, type BodyPolicy } from './result-offloading.ts'
import { encodeTextBody } from './text-body-codec.ts'
import type { ResultReference } from './tools-protocol.ts'

type ChannelSlots = Readonly<{
  kind: 'channels'
  value: ToolMaterialFingerprint
  content: ToolMaterialSeal
  data: ToolMaterialSeal
  attachments: ToolMaterialSeal
}>
export type PreparedBody = Readonly<{
  description: Omit<ToolOffloadedBody, 'retention'>
  seal: ToolMaterialSeal
  retentionMs: number
  policy: Adoption
}>
export type PreparedResultChannels = ChannelSlots &
  Readonly<{
    original:
      | Readonly<{ kind: 'none' }>
      | Readonly<{
          kind: 'offloaded'
          summary: ToolMaterialSeal
          body: PreparedBody
        }>
  }>
export type ResultChannels = ChannelSlots &
  Readonly<{
    original:
      | Readonly<{ kind: 'none' }>
      | Readonly<{
          kind: 'offloaded'
          summary: ToolMaterialSeal
          body: Readonly<{ description: ToolOffloadedBody; seal: ToolMaterialSeal }>
        }>
  }>

type Custody<P> = ReturnType<typeof createLedgerMaterialCustody<P>>
type Validation<P> = Parameters<Custody<P>['preserve']>[4]
type PreparationInput<P> = Parameters<Custody<P>['preserve']>[0]

export async function prepareResultChannels<P, B extends ContentBlock>(
  custody: Custody<P>,
  input: PreparationInput<P>,
  rendered: ToolRenderedResult<B>,
  policy: BodyPolicy,
  authored: PreparedBody | null,
  validate: Validation<P>,
  target: ResultReference,
): Promise<Outcome<PreparedResultChannels, ToolFailure>> {
  const id = decodeToolBodyId(`body:${createHash('sha256').update(input.operation).digest('hex')}`)
  if ('failure' in id) return fail({ kind: 'invalid', field: 'bodyId', reason: 'body-identity' })
  const planned = planResultBody(rendered, policy, { ...target, bodyId: id.ok })
  if ('failure' in planned) return planned
  let value = rendered
  let body: PreparedBody | null = authored
  if (planned.ok.kind === 'author' && authored === null)
    return fail({
      kind: 'invalid',
      field: 'original.source',
      reason: 'same-call-sealed-body-required',
    })
  if (planned.ok.kind === 'body') {
    const bytes = encodeTextBody(planned.ok.frames)
    const identity = encodeToolMaterial({ source: input.source, policy, value: rendered })
    if ('failure' in identity) return identity
    const operation = decodeToolOperationId(
      `result-body:${createHash('sha256').update(input.operation).digest('hex')}`,
    )
    if ('failure' in operation)
      return fail({ kind: 'invalid', field: 'operation', reason: 'body-identity' })
    const saved = await custody.preserve(
      { ...input, operation: operation.ok },
      bytes,
      identity.ok.fingerprint,
      'body',
      validate,
    )
    if ('failure' in saved) return saved
    const source = materialContent(saved.ok)
    body = {
      seal: saved.ok,
      description: {
        source,
        bodyId: id.ok,
        representation: planned.ok.representation,
        bodyBytes: planned.ok.bodyBytes,
        previewKind: 'mechanical-head-tail',
      },
      retentionMs: policy.retentionMs,
      policy: policy.adoption,
    }
    value = {
      ...rendered,
      content: planned.ok.content,
      original: { kind: 'offloaded', source, summary: planned.ok.summary },
    }
  }
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
  let original: PreparedResultChannels['original'] = { kind: 'none' }
  if (value.original.kind === 'offloaded') {
    const summary = await slot('summary', value.original.summary)
    if ('failure' in summary) return summary
    if (body === null) return unavailable('body preparation is missing')
    original = { kind: 'offloaded', body, summary: summary.ok }
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
    original = { kind: 'offloaded', ...channels.original.body.description, summary: summary.ok }
  }
  const value = { content: content.ok, data: data.ok, attachments: attachments.ok, original }
  const checked = policyResult(policy, value)
  if ('failure' in checked) return checked
  const encoded = encodeToolMaterial({
    ...checked.ok,
    original:
      checked.ok.original.kind === 'none'
        ? checked.ok.original
        : {
            kind: 'offloaded',
            source: checked.ok.original.source,
            summary: checked.ok.original.summary,
          },
  })
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
  const checked = judgeCommittedToolResult(policy, value)
  return 'failure' in checked ? unavailable('stored result violates its contract') : checked
}

export function activateResultChannels(
  channels: PreparedResultChannels,
  activatedAt: ToolMaterialInstant | null,
): Outcome<ResultChannels, ToolFailure> {
  if (channels.original.kind === 'none')
    return succeed({ ...channels, original: channels.original })
  if (activatedAt === null) return unavailable('body activation requires a trusted time')
  const { body, summary } = channels.original
  const expires = Date.parse(activatedAt) + body.retentionMs
  if (!Number.isFinite(expires) || Math.abs(expires) > 8_640_000_000_000_000)
    return fail({ kind: 'invalid', field: 'retention', reason: 'expiry-overflow' })
  const decoded = decodeToolMaterialInstant(new Date(expires).toISOString())
  if ('failure' in decoded) return unavailable('body expiry is not a canonical instant')
  return succeed({
    ...channels,
    original: {
      kind: 'offloaded',
      summary,
      body: {
        seal: body.seal,
        description: {
          ...body.description,
          retention: { adoption: body.policy, activatedAt, expiresAt: decoded.ok },
        },
      },
    },
  })
}
