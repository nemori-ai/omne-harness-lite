import { expectTypeOf, it } from 'vitest'
import {
  start,
  accept,
  snapshot,
  closeOut,
  abandon,
  type AssemblyState,
  type AssemblySnapshot,
  type AssemblySettlement,
  type AssemblyResult,
  type AssemblyFailure,
  type AcceptRejection,
} from '@omne-harness-lite/stream-assembly'
import type { ToolCallBlock, ContentBlock } from '@omne-harness-lite/content-blocks'

it('w6.types.stream-public-immutable-and-closed-results', () => {
  expectTypeOf(start).returns.toEqualTypeOf<AssemblyResult<AssemblyState, 'malformed'>>()
  expectTypeOf(accept).returns.toEqualTypeOf<AssemblyResult<AssemblyState, AcceptRejection>>()
  expectTypeOf(snapshot).returns.toEqualTypeOf<AssemblySnapshot>()
  expectTypeOf(closeOut).returns.toEqualTypeOf<
    AssemblyResult<AssemblySettlement, 'stream_not_finished'>
  >()
  expectTypeOf(abandon).returns.toEqualTypeOf<
    AssemblyResult<AssemblySettlement, 'event_after_finish' | 'malformed'>
  >()
  expectTypeOf<AssemblySnapshot['blocks']>().toExtend<readonly unknown[]>()
  expectTypeOf<AssemblySettlement['blocks']>().toEqualTypeOf<readonly ContentBlock[]>()
  expectTypeOf<AssemblyFailure>().toEqualTypeOf<
    | 'index_reused'
    | 'index_not_monotonic'
    | 'block_not_open'
    | 'block_already_closed'
    | 'payload_kind_mismatch'
    | 'account_duplicate'
    | 'event_after_finish'
    | 'stream_not_finished'
  >()
  declareWritableCheck(null)
})

function declareWritableCheck(_unused: null) {
  const view = snapshot(startState())
  // @ts-expect-error publicly readonly snapshots have no mutation method
  view.blocks.push({})
  // @ts-expect-error a snapshot cannot set its own position
  view.position = 2
}
function startState(): AssemblyState {
  const result = start({ kind: 'model_call', callId: 'model', dispatch: 1 })
  if ('rejected' in result) throw new Error('test input is valid')
  return result.ok
}
it('w6.types.complete-unparseable-name-remains-raw', () => {
  type Raw = Extract<ToolCallBlock, { readonly unparseable: true }>
  expectTypeOf<Raw['tool']>().toEqualTypeOf<string>()
  expectTypeOf<Raw['rawArguments']>().toEqualTypeOf<string>()
  expectTypeOf<Raw['arguments']>().toEqualTypeOf<undefined>()
})
