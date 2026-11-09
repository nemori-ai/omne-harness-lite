import type { JsonLimits } from '@omne-harness/json-text'
import type { ContentBlock, TextContentBlock } from '@omne-harness/content-block'
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import type {
  FixedToolRequest,
  ToolBodyDeclaration,
  ToolBodyRepresentation,
  ToolFailure,
  ToolRenderedResult,
  ToolReturnDeclaration,
} from '@omne-harness/tool-contract'
import { describedAdoption } from '@omne-harness/tool-contract/provider'
import { formatUsage } from '@omne-harness/unix-format'
import { callableRead, encodeBodyReference, type BodyReference } from './tools-protocol.ts'
import type { ToolOffloadingConfiguration } from './construction.ts'
import { bodyRepresentation } from './body-representation.ts'

const DEFAULT_PREVIEW_DIVISOR = 8

export type BodyPolicy = Readonly<{
  adoption: ReturnType<typeof describedAdoption>
  declaration: ToolBodyDeclaration
  inlineBytes: number
  retentionMs: number
  maxBodyBytes: number
  previewBytes: number
  jsonLimits: JsonLimits | null
  readResultArguments: JsonLimits
}>

export function resultBodyPolicy(
  request: FixedToolRequest,
  system: ToolOffloadingConfiguration,
  readResultArguments: JsonLimits,
): Outcome<BodyPolicy, ToolFailure> {
  const definition = request.availability.definition
  const declaration =
    definition.kind === 'function'
      ? definition.returns
      : definition.commands.find(command => command.name === request.command)?.returns
  if (declaration === undefined)
    return fail({ kind: 'invalid', field: 'command', reason: 'missing-return-declaration' })
  return succeed(resolveBodyPolicy(declaration, system, readResultArguments))
}

export function resolveBodyPolicy(
  declaration: Pick<ToolReturnDeclaration, 'body' | 'offloading'>,
  system: ToolOffloadingConfiguration,
  readResultArguments: JsonLimits,
): BodyPolicy {
  const { inline, retention } = declaration.offloading
  const inlineBytes =
    inline.kind === 'system'
      ? system.maxInlineUtf8Bytes
      : Math.min(inline.maxInlineUtf8Bytes, system.maxInlineUtf8Bytes)
  return {
    adoption: describedAdoption({
      owner: '@omne-harness/tool',
      name: 'body-policy',
      revision: '1',
      declaration,
      system,
      readResultArguments,
    }),
    declaration: declaration.body,
    jsonLimits:
      declaration.body.kind === 'json-document'
        ? { ...system.jsonDocument }
        : declaration.body.kind === 'json-lines'
          ? { ...system.jsonRecord }
          : null,
    readResultArguments: { ...readResultArguments },
    inlineBytes,
    retentionMs:
      retention.kind === 'system'
        ? system.maxRetentionMs
        : Math.min(retention.maxRetentionMs, system.maxRetentionMs),
    maxBodyBytes: system.maxBodyBytes,
    previewBytes: previewBudget(declaration.offloading, system, inlineBytes),
  }
}

/** P = min(Tp, Sp, floor(L / k)): the excerpt shown first never grows with the body. */
function previewBudget(
  declared: ToolReturnDeclaration['offloading'],
  system: ToolOffloadingConfiguration,
  threshold: number,
): number {
  const preview = declared.preview ?? { kind: 'system' }
  const author = preview.kind === 'system' ? system.previewUtf8Bytes : preview.maxPreviewUtf8Bytes
  return Math.min(
    author,
    system.previewUtf8Bytes,
    Math.floor(threshold / (system.previewDivisor ?? DEFAULT_PREVIEW_DIVISOR)),
  )
}

type BodyPlan<B extends ContentBlock> =
  | Readonly<{ kind: 'inline' | 'author'; value: ToolRenderedResult<B> }>
  | Readonly<{
      kind: 'body'
      representation: ToolBodyRepresentation
      content: readonly B[]
      summary: readonly B[]
      frames: readonly TextContentBlock[]
      bodyBytes: string
    }>

export function planResultBody<B extends ContentBlock>(
  value: ToolRenderedResult<B>,
  policy: BodyPolicy,
  address: BodyReference,
): Outcome<BodyPlan<B>, ToolFailure> {
  if (value.original.kind === 'offloaded') {
    for (const blocks of [value.content, value.original.summary]) {
      const texts = blocks.flatMap(block =>
        block.kind === 'text' && block.visibility.toModel ? [block.text] : [],
      )
      if (texts.some(text => !text.isWellFormed()))
        return fail({ kind: 'invalid', field: 'original.summary', reason: 'invalid-unicode-text' })
      const bytes = texts.reduce((size, text) => size + BigInt(Buffer.byteLength(text, 'utf8')), 0n)
      if (bytes > BigInt(policy.previewBytes))
        return fail({
          kind: 'invalid',
          field: 'original.summary',
          reason: 'author-preview-too-large',
        })
    }
    return succeed({ kind: 'author', value })
  }
  const frames: TextContentBlock[] = []
  for (const block of value.content) {
    if (block.kind === 'text' && block.visibility.toModel)
      frames.push({ kind: 'text', id: block.id, visibility: block.visibility, text: block.text })
  }
  if (frames.some(block => !block.text.isWellFormed()))
    return fail({ kind: 'invalid', field: 'content', reason: 'invalid-unicode-text' })
  const size = frames.reduce(
    (total, block) => total + BigInt(Buffer.byteLength(block.text, 'utf8')),
    0n,
  )
  if (size > BigInt(policy.maxBodyBytes))
    return fail({ kind: 'invalid', field: 'content', reason: 'body-too-large' })
  if (size <= BigInt(policy.inlineBytes)) return succeed({ kind: 'inline', value })
  const representation = bodyRepresentation(policy.declaration)
  if (representation === null)
    return fail({
      kind: 'unsupported',
      adoption: policy.adoption,
      reason: 'automatic offloading requires a model body declaration',
    })
  const reference = encodeBodyReference(address)
  const params = JSON.stringify({ kind: 'body', reference, after: null })
  if (!callableRead({ kind: 'body', reference, after: null }, policy.readResultArguments))
    return fail({
      kind: 'invalid',
      field: 'readResultArguments',
      reason: 'read-instruction-not-callable',
    })
  const schema =
    representation.kind === 'json-document'
      ? `\nSchema: ${JSON.stringify(representation.schema)}`
      : representation.kind === 'json-lines'
        ? `\nRecord schema: ${JSON.stringify(representation.recordSchema)}`
        : ''
  const instruction = `\nBody format: ${representation.kind}${schema}\nBody bytes: ${size}\nRetention: ${policy.retentionMs} ms from result publication; reads do not renew it.\nThe body may already have expired when this result is delivered.\nbodyReference: ${reference}\n${formatUsage('Tools', 'read_result', params)}`
  const marker = '\n[offloaded]\n'
  const available =
    Math.min(policy.previewBytes, policy.inlineBytes - Buffer.byteLength(instruction, 'utf8')) -
    Buffer.byteLength(marker, 'utf8')
  if (available < 0)
    return fail({
      kind: 'invalid',
      field: 'offloading.previewUtf8Bytes',
      reason: 'preview-instruction-does-not-fit',
    })
  const bytes = Buffer.from(frames.map(frame => frame.text).join(''), 'utf8')
  const head = Math.ceil(available / 2)
  const tail = Math.floor(available / 2)
  const preview =
    utf8Slice(bytes, 0, head) +
    marker +
    utf8Slice(bytes, bytes.length - tail, bytes.length) +
    instruction
  let emitted = false
  const content = value.content.flatMap(block => {
    if (block.kind !== 'text' || !block.visibility.toModel) return [block]
    if (emitted) return []
    emitted = true
    return [{ ...block, text: preview }]
  })
  const summary = content.filter(block => block.kind === 'text' && block.visibility.toModel)
  return succeed({
    kind: 'body',
    representation,
    content,
    summary,
    frames,
    bodyBytes: String(size),
  })
}

function utf8Slice(bytes: Uint8Array, from: number, to: number): string {
  let start = Math.max(0, from)
  let end = Math.min(bytes.length, to)
  while (start < end && ((bytes[start] ?? 0) & 0xc0) === 0x80) start += 1
  while (end > start && end < bytes.length && ((bytes[end] ?? 0) & 0xc0) === 0x80) end -= 1
  return new TextDecoder('utf-8', { fatal: true }).decode(bytes.subarray(start, end))
}

export function systemBodyPolicy(
  system: ToolOffloadingConfiguration,
  readResultArguments: JsonLimits,
): BodyPolicy {
  return resolveBodyPolicy(
    {
      body: {
        kind: 'text',
        codec: describedAdoption({
          owner: '@omne-harness/tool',
          name: 'system-text',
          revision: '1',
        }),
      },
      offloading: { inline: { kind: 'system' }, retention: { kind: 'system' } },
    },
    system,
    readResultArguments,
  )
}
