import { abandon, accept, closeOut, snapshot, start } from '../src/index.ts'
import type { AcceptRejection, AssemblySettlement, AssemblyState } from '../src/index.ts'
import * as PublicAssembly from '../src/index.ts'
// @ts-expect-error the removed construction seam is not a public strategy port
import { acceptWithSealer } from '../src/index.ts'

const initial = start({ kind: 'model_call', callId: 'mc_types', dispatch: 1 })
if ('ok' in initial) {
  const state: AssemblyState = initial.ok
  const result = accept(state, { t: 'finish', reason: 'end' })
  if ('rejected' in result) {
    const rejected: AcceptRejection = result.rejected
    // @ts-expect-error finishing is an accept boundary, not closeOut's missing-finish failure
    const noCloseOutFailure: 'stream_not_finished' = rejected
    void noCloseOutFailure
  }
  const snap = snapshot(state)
  // @ts-expect-error snapshots cannot be written through the public declaration
  snap.blocks.push({})
  // @ts-expect-error positions are exact JSON numbers and cannot be silently rounded by arithmetic
  const unsafePosition = snap.position + 1
  void unsafePosition
  const close = closeOut(state)
  if ('rejected' in close) {
    const onlyCloseFailure: 'stream_not_finished' = close.rejected
    void onlyCloseFailure
  } else {
    const settlement: AssemblySettlement = close.ok
    // @ts-expect-error settlement blocks are readonly
    settlement.blocks.length = 0
  }
  const lost = abandon(state, { cause: 'request_rejected' })
  if ('rejected' in lost) {
    const onlyAbandonFailures: 'malformed' | 'event_after_finish' = lost.rejected
    void onlyAbandonFailures
  }
  // @ts-expect-error a caller cannot add a sealer policy argument to accept
  accept(state, {}, () => ({}))
}
// @ts-expect-error state values must come from the nominal public producer
snapshot({})
// @ts-expect-error state is required
accept()
// @ts-expect-error target is required
start()
// @ts-expect-error no constructor is released through the package root
new PublicAssembly.AssemblyState({})
void acceptWithSealer

import type {
  AssemblyFailure,
  AssemblyRejection,
  AssemblyResult,
  OpenedBlock,
  ReducedContent,
  SnapshotBlock,
  AssemblySnapshot,
  AssemblyEnding,
  ModelAssemblyAccount,
  ToolAssemblyAccount,
} from '../src/index.ts'
import type { JsonNumber, ContentBlock } from '@omne-harness-lite/content-blocks'

declare const snapshotValue: AssemblySnapshot
const position: JsonNumber = snapshotValue.position
const blocks: readonly SnapshotBlock[] = snapshotValue.blocks
const failure: AssemblyFailure = 'stream_not_finished'
const rejection: AssemblyRejection = failure
const refusal: AssemblyResult<AssemblyState> = { rejected: rejection }
declare const blockId: ContentBlock['id']
const open: OpenedBlock = {
  kind: 'text',
  fill: 'append',
  id: blockId,
  visibility: { toHuman: true, toModel: false },
}
const content: ReducedContent = ''
const unfinished: SnapshotBlock = { index: 0, closed: false, opened: open, content }
const ending: AssemblyEnding = { reason: 'lost', error: { cause: 'upstream_unavailable' } }
declare const modelAccount: ModelAssemblyAccount
declare const toolAccount: ToolAssemblyAccount
const modelSettlement: AssemblySettlement = { blocks: [], account: modelAccount, ending }
const toolSettlement: AssemblySettlement = {
  blocks: [],
  account: toolAccount,
  ending: { reason: 'end' },
}
const contentBlocks: readonly ContentBlock[] = modelSettlement.blocks
// @ts-expect-error ending cause belongs only to lost
const wrongEnding: AssemblyEnding = { reason: 'end', error: { cause: 'upstream_unavailable' } }
// @ts-expect-error successful settlement never contains the stream snapshot position
modelSettlement.position
void [position, blocks, refusal, unfinished, toolSettlement, contentBlocks, wrongEnding]

import { expectTypeOf, it } from 'vitest'
it('PUBLIC-TYPES-01 all five operations preserve exact required inputs and results', () => {
  expectTypeOf(start).parameters.toEqualTypeOf<[target: unknown]>()
  expectTypeOf(accept).parameters.toEqualTypeOf<[state: AssemblyState, event: unknown]>()
  expectTypeOf(snapshot).returns.toEqualTypeOf<AssemblySnapshot>()
  expectTypeOf(closeOut).returns.toEqualTypeOf<
    AssemblyResult<AssemblySettlement, 'stream_not_finished'>
  >()
  expectTypeOf(abandon).returns.toEqualTypeOf<
    AssemblyResult<AssemblySettlement, 'malformed' | 'event_after_finish'>
  >()
})
