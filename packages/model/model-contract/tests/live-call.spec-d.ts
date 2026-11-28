import type { ContentBlock } from '@omne-harness/content-block'
import type {
  ControlState,
  LiveCommand,
  LiveCommandOutcome,
  LiveCommandReceipt,
  LiveEvent,
  LiveFrame,
  LiveMedia,
  LiveModelRequest,
  LivePhaseRefusal,
  MediaFrame,
  MediaWrite,
  ModelLiveCalls,
  ModelModality,
  ModelOperationId,
} from '@omne-harness/model-contract'
import type { ModelLivePreparation } from '@omne-harness/model-contract/provider'
import { expectTypeOf, it } from 'vitest'

type Calls = ModelLiveCalls<string>
type Answer<F extends (...args: never[]) => unknown> = Awaited<ReturnType<F>>

it('a command is something said into the call, of one of three uses', () => {
  expectTypeOf<LiveCommand['type']>().toEqualTypeOf<'say'>()
  expectTypeOf<LiveCommand['use']>().toEqualTypeOf<'directive' | 'context' | 'speak'>()
  expectTypeOf<LiveCommand['content']>().toEqualTypeOf<readonly ContentBlock[]>()
  expectTypeOf<Parameters<Calls['command']>[0]['command']>().toEqualTypeOf<LiveCommand>()
})

it('a command is taken once; sent again it is seen with its outcome so far', () => {
  expectTypeOf<Answer<Calls['command']>>().toExtend<
    { ok: LiveCommandReceipt } | { failure: unknown }
  >()
  expectTypeOf<Extract<LiveCommandReceipt, { state: 'seen' }>['outcome']>().toEqualTypeOf<
    LiveCommandOutcome | 'pending'
  >()
  expectTypeOf<'accepted'>().toExtend<LiveCommandOutcome>()
  expectTypeOf<'pending'>().not.toExtend<LiveCommandOutcome>()
  expectTypeOf<LivePhaseRefusal>().toEqualTypeOf<'not-open' | 'closing' | 'settled'>()
})

it('an end answers the control state, as a cancel does', () => {
  expectTypeOf<Answer<Calls['end']>>().toExtend<{ ok: ControlState } | { failure: unknown }>()
  expectTypeOf<'end'>().toExtend<Extract<ControlState, { kind: 'requested' }>['intent']>()
})

it('events are numbered frames, and a run of dropped numbers is a gap', () => {
  expectTypeOf<LiveEvent['t']>().toEqualTypeOf<
    'started' | 'transcript' | 'delegation' | 'asleep' | 'command'
  >()
  expectTypeOf<Extract<LiveEvent, { t: 'command' }>['id']>().toEqualTypeOf<ModelOperationId>()
  expectTypeOf<Extract<LiveFrame, { seq: number }>['event']>().toEqualTypeOf<LiveEvent>()
  expectTypeOf<{ gap: { from: number; to: number } }>().toExtend<LiveFrame>()
})

it('media frames are neither numbered nor kept, and a write says what became of the frame', () => {
  expectTypeOf<MediaFrame['modality']>().toEqualTypeOf<ModelModality>()
  expectTypeOf<ReturnType<LiveMedia['write']>>().toEqualTypeOf<MediaWrite>()
  expectTypeOf<MediaWrite>().toEqualTypeOf<'sent' | 'dropped' | { readonly refused: 'modality' }>()
  expectTypeOf<Answer<Calls['media']>>().toExtend<{ ok: LiveMedia } | { failure: unknown }>()
})

it('the preparation forms a live request from a model and the instructions', () => {
  type Prepare = ModelLivePreparation<string>['prepare']
  expectTypeOf<Parameters<Prepare>[0]['instructions']>().toEqualTypeOf<string>()
  expectTypeOf<Answer<Prepare>>().toExtend<{ ok: LiveModelRequest } | { failure: unknown }>()
})
