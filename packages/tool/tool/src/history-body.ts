import { createHash } from 'node:crypto'
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import {
  decodeToolOperationId,
  type Reply,
  type ToolFailure,
  type ToolOperationId,
} from '@omne-harness/tool-contract'
import { decodeToolBodyId } from '@omne-harness/tool-contract/provider'
import { invalid, judgeAdoptionField, judgeEvidenceField, type MutationInput } from './boundary.ts'
import { fixAttachment, sameAttachment } from './ledger-content.ts'
import { sameFactValue } from './evidence.ts'
import { encodeToolMaterial, type MaterialBytes } from './material-codec.ts'
import {
  historyObject,
  type HistoricalSource,
  type HistoricalResultRecord,
} from './history-source.ts'
import type { HistoricalSourceReader, HistoricalTextInterpretation } from './history-contract.ts'
import type { createLedgerMaterialCustody } from './ledger-material-custody.ts'
import type { PreparedBody } from './ledger-result-material.ts'
import { materialContent } from './ledger-material-content.ts'
import type { BodyPolicy } from './result-offloading.ts'
import { textBodyCodec } from './text-body-codec.ts'

export function historicalBodyOperation(resultOperation: ToolOperationId) {
  return decodeToolOperationId(
    `history-body:${createHash('sha256').update(resultOperation).digest('hex')}`,
  )
}

export function historicalBodyInterpretations(
  source: HistoricalSource,
  values: readonly HistoricalTextInterpretation[],
): Outcome<ReadonlyMap<string, HistoricalTextInterpretation>, ToolFailure> {
  if (!Array.isArray(values) || 'failure' in encodeToolMaterial(values))
    return invalid('interpretations', 'encoding')
  const selected = new Map<string, HistoricalTextInterpretation>()
  for (const value of values) {
    if (
      !historyObject(value) ||
      !historyObject(value.representation) ||
      value.representation.kind !== 'text' ||
      Object.keys(value).some(
        key =>
          !['tool', 'rawCodec', 'source', 'interpretation', 'representation', 'basis'].includes(
            key,
          ),
      ) ||
      Object.keys(value.representation).some(key => !['kind', 'codec'].includes(key))
    )
      return invalid('interpretations', 'encoding')
    const tool = judgeAdoptionField(value.tool, 'tool')
    const rawCodec = judgeAdoptionField(value.rawCodec, 'rawCodec')
    const interpretation = judgeAdoptionField(value.interpretation, 'interpretation')
    const codec = judgeAdoptionField(value.representation.codec, 'codec')
    const basis = judgeEvidenceField(value.basis, 'basis')
    const attachment = fixAttachment(value.source)
    if (
      'failure' in tool ||
      'failure' in rawCodec ||
      'failure' in interpretation ||
      'failure' in codec ||
      'failure' in basis ||
      'failure' in attachment
    )
      return invalid('interpretations', 'encoding')
    const fixed: HistoricalTextInterpretation = {
      tool: tool.ok,
      rawCodec: rawCodec.ok,
      interpretation: interpretation.ok,
      source: attachment.ok,
      basis: basis.ok,
      representation: { kind: 'text', codec: codec.ok },
    }
    const matches = source.results.filter(
      result =>
        result.value.original.kind === 'offloaded' &&
        sameAttachment(result.value.original.source, fixed.source) &&
        sameFactValue(fixed.rawCodec, result.custody.raw.codec) &&
        sameFactValue(fixed.tool, source.call.request.availability.definition.adoption),
    )
    if (matches.length !== 1 || selected.has(matches[0]!.result))
      return invalid('interpretations', 'encoding')
    selected.set(matches[0]!.result, fixed)
  }
  if (
    source.results.some(
      result => result.value.original.kind === 'offloaded' && !selected.has(result.result),
    )
  )
    return invalid('interpretations', 'encoding')
  return succeed(selected)
}

async function historicalBytes<P>(
  input: MutationInput<P>,
  result: HistoricalResultRecord,
  reader: HistoricalSourceReader<P> | undefined,
  limit: number,
  authorize: () => Reply<unknown>,
): Promise<Outcome<MaterialBytes, ToolFailure>> {
  if (reader === undefined)
    return fail({
      kind: 'unavailable',
      dependency: 'historical-source',
      diagnostic: 'source reader is not connected',
    })
  if (result.value.original.kind !== 'offloaded') return invalid('original', 'offloaded-required')
  const attachment = result.value.original.source
  const total = BigInt(attachment.bytes)
  if (total > BigInt(limit)) return invalid('original', 'historical-body-limit')
  const parts: Uint8Array[] = []
  const hash = createHash('sha256')
  const decoder = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true })
  let offset = 0n,
    after: string | null = null
  try {
    do {
      const allowed = await authorize()
      if ('failure' in allowed) return allowed
      const page = await reader.read({
        ...input,
        result: result.result,
        attachment,
        after,
        maxBytes: 65536,
      })
      if ('failure' in page) return page
      if (
        page.ok.result !== result.result ||
        !sameAttachment(page.ok.attachment, attachment) ||
        page.ok.offset !== String(offset) ||
        !(page.ok.bytes instanceof Uint8Array) ||
        page.ok.bytes.length > 65536 ||
        (page.ok.bytes.length === 0 && total !== 0n)
      )
        return invalid('original', 'historical-page')
      const bytes = Uint8Array.from(page.ok.bytes)
      offset += BigInt(bytes.length)
      if (
        offset > total ||
        (offset === total) !== (page.ok.next === null) ||
        (page.ok.next !== null && (typeof page.ok.next !== 'string' || page.ok.next.length === 0))
      )
        return invalid('original', 'historical-range')
      decoder.decode(bytes, { stream: page.ok.next !== null })
      hash.update(bytes)
      parts.push(bytes)
      after = page.ok.next
    } while (after !== null)
  } catch {
    return fail({
      kind: 'unavailable',
      dependency: 'historical-source',
      diagnostic: 'source read or UTF-8 validation failed',
    })
  }
  const digest = hash.digest('hex')
  if (attachment.digest !== `sha256:${digest}` || offset !== total)
    return invalid('original', 'historical-fingerprint')
  return succeed({
    bytes: Buffer.concat(parts, Number(offset)),
    codec: textBodyCodec,
    fingerprint: { algorithm: 'sha256', digest, bytes: String(offset) },
  })
}

export async function prepareHistoricalBody<P>(
  input: MutationInput<P>,
  result: HistoricalResultRecord,
  interpretation: HistoricalTextInterpretation,
  ports: Readonly<{
    policy: BodyPolicy
    reader: HistoricalSourceReader<P> | undefined
    custody: ReturnType<typeof createLedgerMaterialCustody<P>>
    validate: Parameters<ReturnType<typeof createLedgerMaterialCustody<P>>['preserve']>[4]
    authorize: () => Reply<unknown>
  }>,
): Reply<PreparedBody> {
  const { policy, reader, custody, validate, authorize } = ports
  const bytes = await historicalBytes(input, result, reader, policy.maxBodyBytes, authorize)
  if ('failure' in bytes) return bytes
  const operation = historicalBodyOperation(input.operation)
  const bodyId = decodeToolBodyId(
    `body:${createHash('sha256').update(input.operation).digest('hex')}`,
  )
  if ('failure' in operation || 'failure' in bodyId)
    return invalid('operation', 'historical-body-identity')
  const identity = encodeToolMaterial({
    source: result.source,
    original: result.value.original,
    interpretation,
    policy,
  })
  if ('failure' in identity) return identity
  const saved = await custody.preserve(
    { ...input, operation: operation.ok, source: result.source },
    bytes.ok,
    identity.ok.fingerprint,
    'body',
    validate,
  )
  if ('failure' in saved) return saved
  return succeed({
    seal: saved.ok,
    description: {
      source: materialContent(saved.ok),
      bodyId: bodyId.ok,
      representation: interpretation.representation,
      bodyBytes: bytes.ok.fingerprint.bytes,
      previewKind: 'author-summary',
    },
    retentionMs: policy.retentionMs,
    policy: policy.adoption,
  })
}
