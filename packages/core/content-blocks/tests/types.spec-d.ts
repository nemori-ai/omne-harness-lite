import { expectTypeOf, test } from 'vitest'
import {
  type BlockId,
  type CallId,
  type ContentBlock,
  type FileBlock,
  type IncompleteToolCallBlock,
  type JsonNumber,
  type Modality,
  type OpaqueJson,
  type RenderingBlock,
  type ThinkingBlock,
  type ToolCallBlock,
  type ToolResultBlock,
  LosslessNumber,
  readJsonStrict,
  readOpaqueJson,
} from '@omne-harness-lite/content-blocks'

test('number representation and identifiers have useful distinct types', () => {
  expectTypeOf(new LosslessNumber('1.10')).toExtend<JsonNumber>()
  expectTypeOf<BlockId>().not.toEqualTypeOf<CallId>()
  // @ts-expect-error number wrappers are not ordinary JS numbers
  const number: number = new LosslessNumber('9007199254740993')
  // @ts-expect-error there is no fifth modality
  const modality: Modality = 'none'
  // @ts-expect-error raw strings need identity branding
  const id: BlockId = 'b'
  void [number, modality, id]
})
test('opaque data can only be read through the explicit boundary', () => {
  const boundary = (block: ThinkingBlock) => {
    if (block.opaque !== undefined) {
      expectTypeOf(block.opaque).toEqualTypeOf<OpaqueJson>()
      readOpaqueJson(block.opaque)
      // @ts-expect-error opaque contents have no readable members
      block.opaque.signature
      // @ts-expect-error opaque data is not an object index
      block.opaque['signature']
    }
  }
  expectTypeOf(boundary).toBeFunction()
  // @ts-expect-error a raw JSON object is not opaque
  const opaque: OpaqueJson = { signature: 'x' }
  void opaque
})
test('call forms, incomplete annotations, reasons and derivations remain exclusive', () => {
  const visibility = { toHuman: true, toModel: true }
  const check = (id: BlockId, callId: CallId) => {
    const mixedArguments = {
      id,
      kind: 'tool_call',
      visibility,
      complete: true,
      callId,
      tool: 't',
      arguments: null,
      rawArguments: '',
      unparseable: true,
    } as const
    // @ts-expect-error parsed and unparseable argument forms are exclusive
    const call: ToolCallBlock = mixedArguments
    const visibleIncomplete = {
      id,
      kind: 'tool_call',
      visibility,
      complete: false,
      rawArguments: '',
    } as const
    // @ts-expect-error incomplete annotations are both false
    const incomplete: IncompleteToolCallBlock = visibleIncomplete
    // @ts-expect-error backgrounded requires a matching reason
    const result: ToolResultBlock = {
      id,
      kind: 'tool_result',
      visibility,
      callId,
      outcome: 'backgrounded',
      blocks: [],
    }
    const completedWithReason = {
      id,
      kind: 'tool_result',
      visibility,
      callId,
      outcome: 'completed',
      reason: { code: 'run_cancelled', text: 'x' },
      blocks: [],
    } as const
    // @ts-expect-error completed carries no reason
    const completed: ToolResultBlock = completedWithReason
    const fileRendering = {
      id,
      kind: 'file',
      visibility,
      attachment: { storage: 's', key: 'k', mediaType: 'application/pdf' },
    } as const
    // @ts-expect-error file is not a rendering target
    const rendering: RenderingBlock = fileRendering
    // @ts-expect-error derivation and transcript are paired
    const file: FileBlock = {
      id,
      kind: 'file',
      visibility,
      attachment: { storage: 's', key: 'k', mediaType: 'video/mp4' },
      transcript: 'x',
    }
    void [call, incomplete, result, completed, rendering, file]
  }
  expectTypeOf(check).toBeFunction()
})
test('read outcomes and block variants narrow from their discriminants', () => {
  const result = readJsonStrict('42')
  if ('failed' in result) expectTypeOf(result.failed).toEqualTypeOf<'syntax' | 'duplicate_member'>()
  const narrow = (block: ContentBlock) => {
    if (block.kind === 'tool_call' && block.complete)
      expectTypeOf(block.callId).toEqualTypeOf<CallId>()
    // @ts-expect-error validated blocks are immutable
    block.visibility.toModel = true
  }
  expectTypeOf(narrow).toBeFunction()
})
