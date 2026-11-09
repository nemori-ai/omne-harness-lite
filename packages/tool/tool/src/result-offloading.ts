import type { JsonLimits } from '@omne-harness/json-text'
import type { BlockId, ContentBlock, TextContentBlock } from '@omne-harness/content-block'
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import type {
  FixedToolRequest,
  ToolBodyDeclaration,
  ToolBodyRepresentation,
  ToolFailure,
  ToolOffloadedBody,
  ToolRenderedResult,
  ToolReturnDeclaration,
} from '@omne-harness/tool-contract'
import { describedAdoption } from '@omne-harness/tool-contract/provider'
import { callableRead, encodeBodyReference, type BodyReference } from './tools-protocol.ts'
import { blockBytes } from './result-page.ts'
import type { ToolOffloadingConfiguration } from './construction.ts'
import { bodyRepresentation } from './body-representation.ts'
import {
  bodyHeader,
  bodyUnits,
  headerMax,
  mechanicalPreview,
  utf8Bytes,
  type BodyHeaderFields,
} from './body-preview.ts'

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

type DeclaredCall = Pick<FixedToolRequest, 'availability' | 'command'>

function returnDeclaration(request: DeclaredCall): ToolReturnDeclaration | undefined {
  const definition = request.availability.definition
  return definition.kind === 'function'
    ? definition.returns
    : definition.commands.find(command => command.name === request.command)?.returns
}

export function resultBodyPolicy(
  request: FixedToolRequest,
  system: ToolOffloadingConfiguration,
  readResultArguments: JsonLimits,
): Outcome<BodyPolicy, ToolFailure> {
  const declaration = returnDeclaration(request)
  if (declaration === undefined)
    return fail({ kind: 'invalid', field: 'command', reason: 'missing-return-declaration' })
  return succeed(resolveBodyPolicy(declaration, system, readResultArguments))
}

/**
 * Admission of a call under the system bounds: its fixed return declaration must leave room for
 * the largest header and the preview within its threshold, or no result of it could be shown.
 */
export function callOffloadingRefusal(
  request: DeclaredCall,
  system: ToolOffloadingConfiguration,
): OffloadingRefusal | null {
  const declaration = returnDeclaration(request)
  return declaration === undefined ? null : offloadingRefusal(declaration, system)
}

export function resolveBodyPolicy(
  declaration: Pick<ToolReturnDeclaration, 'body' | 'offloading'>,
  system: ToolOffloadingConfiguration,
  readResultArguments: JsonLimits,
): BodyPolicy {
  const bounds = offloadingBounds(declaration.offloading, system)
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
    maxBodyBytes: system.maxBodyBytes,
    ...bounds,
  }
}

type OffloadingBounds = Pick<BodyPolicy, 'inlineBytes' | 'retentionMs' | 'previewBytes'>

/** L = min(T, S) and the effective retention, each the smaller of the author and system bounds. */
function offloadingBounds(
  declared: ToolReturnDeclaration['offloading'],
  system: ToolOffloadingConfiguration,
): OffloadingBounds {
  const { inline, retention } = declared
  const inlineBytes =
    inline.kind === 'system'
      ? system.maxInlineUtf8Bytes
      : Math.min(inline.maxInlineUtf8Bytes, system.maxInlineUtf8Bytes)
  return {
    inlineBytes,
    retentionMs:
      retention.kind === 'system'
        ? system.maxRetentionMs
        : Math.min(retention.maxRetentionMs, system.maxRetentionMs),
    previewBytes: previewBudget(declared, system, inlineBytes),
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

type ScreenPlan<B extends ContentBlock, K extends 'inline' | 'author'> = Readonly<{
  kind: K
  value: ToolRenderedResult<B>
}>
type OffloadedPlan<B extends ContentBlock> = Readonly<{
  kind: 'body'
  representation: ToolBodyRepresentation
  content: readonly B[]
  summary: readonly B[]
  frames: readonly TextContentBlock[]
  bodyBytes: string
}>
type BodyPlan<B extends ContentBlock> =
  | ScreenPlan<B, 'inline'>
  | ScreenPlan<B, 'author'>
  | OffloadedPlan<B>

/** The transport bound a committed result must meet: every content block fits one result page. */
export type ResultDelivery = Readonly<{ pageBytes: number }>

/**
 * Decides inline or offloaded and builds the first screen, so that the result is deliverable when it
 * is committed (I-2 at settlement). A result stays inline only when its model-visible text is within
 * L and every block fits the result page; a text block over the page offloads like one over L; a
 * block offloading cannot shrink is refused here. An offloaded first screen is the preview (author
 * content, or the mechanical preview) within P followed by the header within headerMax; acceptance
 * has checked headerMax + P <= L. `authored` is the sealed author body, if any.
 */
export function planResultBody<B extends ContentBlock>(
  value: ToolRenderedResult<B>,
  policy: BodyPolicy,
  address: BodyReference,
  authored: Pick<ToolOffloadedBody, 'bodyId' | 'representation' | 'bodyBytes'> | null,
  delivery: ResultDelivery,
): Outcome<BodyPlan<B>, ToolFailure> {
  if (value.original.kind === 'offloaded') {
    const planned = planAuthoredScreen(value, value.original.summary, policy, address, authored)
    if ('failure' in planned) return planned
    const stuck = oversizeBlock(planned.ok.value.content, delivery.pageBytes)
    return stuck === null ? planned : fail(stuck)
  }
  const frames = modelFrames(value.content)
  if (frames.some(block => !block.text.isWellFormed()))
    return fail({ kind: 'invalid', field: 'content', reason: 'invalid-unicode-text' })
  const size = frames.reduce((total, block) => total + BigInt(utf8Bytes(block.text)), 0n)
  if (size > BigInt(policy.maxBodyBytes))
    return fail({ kind: 'invalid', field: 'content', reason: 'body-too-large' })
  const overPage = value.content.some(block => blockBytes(block) > delivery.pageBytes)
  if (size <= BigInt(policy.inlineBytes) && !overPage) return succeed({ kind: 'inline', value })
  const stuck = oversizeBlock(
    value.content.map(block => (isModelText(block) ? null : block)),
    delivery.pageBytes,
  )
  return stuck === null
    ? planOffloadedScreen(value, frames, size, policy, address, delivery)
    : fail(stuck)
}

/** The author's first screen: content and summary each within P, the header after the content. */
function planAuthoredScreen<B extends ContentBlock>(
  value: ToolRenderedResult<B>,
  summary: readonly ContentBlock[],
  policy: BodyPolicy,
  address: BodyReference,
  authored: Pick<ToolOffloadedBody, 'bodyId' | 'representation' | 'bodyBytes'> | null,
): Outcome<ScreenPlan<B, 'author'>, ToolFailure> {
  for (const blocks of [value.content, summary]) {
    const texts = modelTexts(blocks)
    if (texts.some(text => !text.isWellFormed()))
      return fail({ kind: 'invalid', field: 'original.summary', reason: 'invalid-unicode-text' })
    const bytes = texts.reduce((size, text) => size + BigInt(utf8Bytes(text)), 0n)
    if (bytes > BigInt(policy.previewBytes))
      return fail({
        kind: 'invalid',
        field: 'original.summary',
        reason: 'author-preview-too-large',
      })
  }
  if (authored === null)
    return fail({
      kind: 'invalid',
      field: 'original.source',
      reason: 'same-call-sealed-body-required',
    })
  const header = readableHeader(policy, {
    representation: authored.representation,
    bodyBytes: Number(authored.bodyBytes),
    units: null,
    address: { ...address, bodyId: authored.bodyId },
  })
  if ('failure' in header) return header
  return succeed({
    kind: 'author',
    value: { ...value, content: withHeader(value.content, header.ok) },
  })
}

/** The system's first screen in place of the model text: the mechanical preview, then the header. */
function planOffloadedScreen<B extends ContentBlock>(
  value: ToolRenderedResult<B>,
  frames: readonly TextContentBlock[],
  size: bigint,
  policy: BodyPolicy,
  address: BodyReference,
  delivery: ResultDelivery,
): Outcome<OffloadedPlan<B>, ToolFailure> {
  const representation = bodyRepresentation(policy.declaration)
  if (representation === null)
    return fail({
      kind: 'unsupported',
      adoption: policy.adoption,
      reason: 'automatic offloading requires a model body declaration',
    })
  const body = frames.map(frame => frame.text).join('')
  const header = readableHeader(policy, {
    representation,
    bodyBytes: Number(size),
    units: bodyUnits(representation, body),
    address,
  })
  if ('failure' in header) return header
  const screen =
    mechanicalPreview(representation, body, policy.previewBytes, policy.jsonLimits) + header.ok
  const content = withFirstScreen(value.content, screen)
  if (content.some(block => isModelText(block) && blockBytes(block) > delivery.pageBytes))
    return fail({ kind: 'invalid', field: 'content', reason: 'first-screen-exceeds-result-page' })
  return succeed({
    kind: 'body',
    representation,
    content,
    summary: content.filter(isModelText),
    frames,
    bodyBytes: String(size),
  })
}

/** The first model-visible text block carries the screen; the other model texts leave the content. */
function withFirstScreen<B extends ContentBlock>(blocks: readonly B[], screen: string): B[] {
  let emitted = false
  return blocks.flatMap(block => {
    if (!isModelText(block)) return [block]
    if (emitted) return []
    emitted = true
    return [{ ...block, text: screen }]
  })
}

/** The first block over the page, named by its position; `null` entries are blocks not under judgement. */
function oversizeBlock(
  blocks: readonly (ContentBlock | null)[],
  pageBytes: number,
): Extract<ToolFailure, { kind: 'invalid' }> | null {
  const index = blocks.findIndex(block => block !== null && blockBytes(block) > pageBytes)
  return index === -1
    ? null
    : { kind: 'invalid', field: `content[${index}]`, reason: 'block-exceeds-result-page' }
}

function isModelText(block: ContentBlock): block is TextContentBlock {
  return block.kind === 'text' && block.visibility.toModel
}

function modelFrames(blocks: readonly ContentBlock[]): TextContentBlock[] {
  return blocks.filter(isModelText).map(block => ({
    kind: 'text',
    id: block.id,
    visibility: block.visibility,
    text: block.text,
  }))
}

function readableHeader(
  policy: BodyPolicy,
  fields: Omit<BodyHeaderFields, 'reference' | 'retentionMs'> &
    Readonly<{ address: BodyReference }>,
): Outcome<string, ToolFailure> {
  const reference = encodeBodyReference(fields.address)
  if (!callableRead({ kind: 'body', reference, after: null }, policy.readResultArguments))
    return fail({
      kind: 'invalid',
      field: 'readResultArguments',
      reason: 'read-instruction-not-callable',
    })
  return succeed(
    bodyHeader({
      representation: fields.representation,
      bodyBytes: fields.bodyBytes,
      units: fields.units,
      retentionMs: policy.retentionMs,
      reference,
    }),
  )
}

function modelTexts(blocks: readonly ContentBlock[]): string[] {
  return blocks.filter(isModelText).map(block => block.text)
}

/** The header follows the last model-visible text, or stands alone when the author gave none. */
function withHeader<B extends ContentBlock>(blocks: readonly B[], header: string): B[] {
  const last = blocks.findLastIndex(isModelText)
  if (last === -1)
    return [
      ...blocks,
      {
        kind: 'text',
        id: 'offloaded-body-header' as BlockId,
        visibility: { toHuman: false, toModel: true },
        text: header,
      } as B,
    ]
  return blocks.map((block, index) =>
    index === last && block.kind === 'text' ? { ...block, text: block.text + header } : block,
  )
}

/** W + 2ε: the time within which a write under an already issued permit may still land. */
export function lateWriteWindowMs(
  system: Pick<ToolOffloadingConfiguration, 'permitMs' | 'clockSkewMs'>,
): number {
  return system.permitMs + 2 * system.clockSkewMs
}

export type OffloadingRefusal =
  | 'header-and-preview-exceed-threshold'
  | 'retention-within-late-write-window'

/**
 * Acceptance of a return declaration under the system bounds: the largest header plus the preview
 * budget must fit the offloading threshold, so no first screen exceeds L; and the retention must
 * exceed W + 2ε, or a sweep at expiry could meet a late write of the body (model `ttl-too-small`).
 */
export function offloadingRefusal(
  declaration: Pick<ToolReturnDeclaration, 'body' | 'offloading'>,
  system: ToolOffloadingConfiguration,
): OffloadingRefusal | null {
  const representation = bodyRepresentation(declaration.body)
  if (representation === null) return null
  const bounds = offloadingBounds(declaration.offloading, system)
  if (
    headerMax(representation, bounds.retentionMs, system.maxBodyBytes) + bounds.previewBytes >
    bounds.inlineBytes
  )
    return 'header-and-preview-exceed-threshold'
  return bounds.retentionMs > lateWriteWindowMs(system)
    ? null
    : 'retention-within-late-write-window'
}

export function offloadingFits(
  declaration: Pick<ToolReturnDeclaration, 'body' | 'offloading'>,
  system: ToolOffloadingConfiguration,
): boolean {
  return offloadingRefusal(declaration, system) === null
}

/** The return declaration of the system's own results, accepted at startup like any author's. */
export const SYSTEM_RETURN: Pick<ToolReturnDeclaration, 'body' | 'offloading'> = {
  body: {
    kind: 'text',
    codec: describedAdoption({ owner: '@omne-harness/tool', name: 'system-text', revision: '1' }),
  },
  offloading: { inline: { kind: 'system' }, retention: { kind: 'system' } },
}

export function systemBodyPolicy(
  system: ToolOffloadingConfiguration,
  readResultArguments: JsonLimits,
): BodyPolicy {
  return resolveBodyPolicy(SYSTEM_RETURN, system, readResultArguments)
}
