import { createHash } from 'node:crypto'
import {
  copyJsonValue,
  judgeContentBlock,
  type JsonValue,
  type ToolResultBlock,
} from '@omne-harness-lite/content-blocks'
import { parseOpaqueIdentifier, unwrap } from '@omne-harness-lite/identity-values'
import { toolResultOf, type ToolResult } from '@omne-harness-lite/tool-definition'
import type {
  DeliveryBasis,
  ExecutionRef,
  ExecutionTerminal,
  ToolResultWriter,
} from '@omne-harness-lite/tool-execution-runtime'

export interface PreparedTerminal {
  readonly terminal: ExecutionTerminal
  readonly delivery: DeliveryBasis
}
function blockId(ref: ExecutionRef, purpose: string) {
  const digest = createHash('sha256')
    .update(
      JSON.stringify([
        ref.tenant.organization,
        ref.tenant.account,
        ref.session,
        ref.callId,
        purpose,
      ]),
    )
    .digest('hex')
  return unwrap(parseOpaqueIdentifier(`tool-${digest}`, 'BlockId'))
}

/** Normalize the author return and prepare its bytes before terminal A. No extension runs here. */
export function createResultPreparation(input: {
  readonly ref: ExecutionRef
  readonly writer?: ToolResultWriter
  readonly pass: string
  readonly chain: JsonValue
  /** Classification comes from the trusted control ingress, rather than author result text. */
  readonly interruptionCode?: Extract<ToolResultBlock, { outcome: 'interrupted' }>['reason']['code']
}) {
  const coordinates = captureCoordinates(input)
  const writer = input.writer
  const storeRaw = writer?.storeRaw.bind(writer),
    recordResult = writer?.recordResult.bind(writer)
  return async (supplied: ExecutionTerminal): Promise<PreparedTerminal | 'unavailable'> => {
    const captured = copyJsonValue(supplied)
    if ('failed' in captured) return 'unavailable'
    let terminal = captured.ok as unknown as ExecutionTerminal
    const candidate = authorRecordCandidate(terminal, coordinates, storeRaw, recordResult)
    if (candidate === 'unavailable') return candidate
    let original: ToolResult | undefined
    if (candidate) {
      original = candidate.original
      const { storeRaw, recordResult } = candidate
      const offload = original.offload
      if (offload && 'inline' in offload.raw) {
        const stored = await storeRaw(
          Buffer.from(offload.raw.inline, 'base64'),
          offload.raw.mediaType,
        )
        if (stored.kind !== 'stored') return 'unavailable'
        original = toolResultOf(
          { ...original, offload: { ...offload, raw: stored.reference } },
          blockId(coordinates.ref, 'original-text'),
        )
      }
      const raw = original.offload?.raw
      // recordResult prepares immutable contents. The journal's terminal first winner still owns visibility.
      const recorded = await recordResult({
        ref: coordinates.ref,
        result: original,
        ...(raw && !('inline' in raw) ? { raw } : {}),
      })
      if (recorded !== 'recorded' && recorded !== 'duplicate') return 'unavailable'
      terminal = recordedTerminal(terminal, original)
    }
    return preparedTerminal(terminal, original, coordinates)
  }
}

type Coordinates = Pick<
  Parameters<typeof createResultPreparation>[0],
  'ref' | 'pass' | 'chain' | 'interruptionCode'
>

function captureCoordinates(input: Parameters<typeof createResultPreparation>[0]): Coordinates {
  const copied = copyJsonValue({
    ref: input.ref,
    pass: input.pass,
    chain: input.chain,
    ...(input.interruptionCode ? { interruptionCode: input.interruptionCode } : {}),
  })
  if ('failed' in copied) throw new TypeError('ordinary result preparation coordinates required')
  const coordinates = copied.ok as unknown as Pick<
    typeof input,
    'ref' | 'pass' | 'chain' | 'interruptionCode'
  >
  return coordinates
}

function authorRecordCandidate(
  terminal: ExecutionTerminal,
  coordinates: Coordinates,
  storeRaw: ToolResultWriter['storeRaw'] | undefined,
  recordResult: ToolResultWriter['recordResult'] | undefined,
):
  | {
      original: ToolResult
      storeRaw: ToolResultWriter['storeRaw']
      recordResult: ToolResultWriter['recordResult']
    }
  | 'unavailable'
  | undefined {
  if (terminal.outcome === 'interrupted' && !coordinates.interruptionCode) return 'unavailable'
  const author =
    terminal.outcome === 'completed'
      ? terminal.result
      : terminal.outcome === 'failed'
        ? terminal.result
        : undefined
  if (author === undefined) return
  if (!storeRaw || !recordResult) return 'unavailable'
  return {
    original: toolResultOf(author, blockId(coordinates.ref, 'original-text')),
    storeRaw,
    recordResult,
  }
}

function recordedTerminal(terminal: ExecutionTerminal, original: ToolResult): ExecutionTerminal {
  if (terminal.outcome === 'completed') {
    if (typeof terminal.result !== 'string') return { ...terminal, result: original }
  } else if (terminal.outcome === 'failed') {
    if (typeof terminal.result !== 'string') return { ...terminal, result: original }
  }
  return terminal
}

function terminalPlaceholder(terminal: ExecutionTerminal, coordinates: Coordinates) {
  const text =
    terminal.outcome === 'failed'
      ? terminal.code
      : terminal.outcome === 'unavailable' || terminal.outcome === 'interrupted'
        ? terminal.reason
        : terminal.outcome
  const reason =
    terminal.outcome === 'interrupted'
      ? { code: coordinates.interruptionCode, text: terminal.reason }
      : terminal.outcome === 'failed' && terminal.code === 'abnormal_interruption'
        ? { code: 'abnormal_interruption' as const, text: terminal.code }
        : undefined
  return { text, reason }
}

function preparedTerminal(
  terminal: ExecutionTerminal,
  original: ToolResult | undefined,
  coordinates: Coordinates,
): PreparedTerminal | 'unavailable' {
  const placeholder = terminalPlaceholder(terminal, coordinates)
  const blocks =
    original?.content ??
    toolResultOf(placeholder.text, blockId(coordinates.ref, 'ending-text')).content
  const reason = placeholder.reason
  const raw = original?.offload?.raw
  const judged = judgeContentBlock({
    id: blockId(coordinates.ref, 'result'),
    kind: 'tool_result',
    callId: coordinates.ref.callId,
    visibility: { toHuman: true, toModel: true },
    outcome: terminal.outcome,
    blocks,
    ...(raw && !('inline' in raw) ? { offloaded: raw } : {}),
    ...(reason ? { reason } : {}),
  })
  if ('rejected' in judged || judged.ok.kind !== 'tool_result') return 'unavailable'
  return {
    terminal,
    delivery: {
      result: judged.ok,
      pass: coordinates.pass,
      selectedChain: coordinates.chain,
      ...(raw && !('inline' in raw) ? { raw } : {}),
    },
  }
}
