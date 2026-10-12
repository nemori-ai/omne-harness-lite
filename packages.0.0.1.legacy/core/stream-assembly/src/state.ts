import { ExactDecimal } from '@omne-harness-lite/call-accounts'
import type { TrimSummary } from '@omne-harness-lite/call-accounts'
import type { ContentBlock, JsonNumber } from '@omne-harness-lite/content-blocks'
import type {
  AccountEvent,
  ArrivalTarget,
  FillEvent,
  FinishEvent,
  OpenEvent,
} from '@omne-harness-lite/arrival-events'

export interface FillChain {
  readonly payload: FillEvent['payload']
  readonly previous: FillChain | undefined
}
interface RecordBase {
  readonly opened: OpenEvent
  readonly numericIndex: ExactDecimal
}
export interface OpenRecord extends RecordBase {
  readonly closed: false
  readonly fills: FillChain | undefined
  readonly changed: boolean
}
export interface ClosedRecord extends RecordBase {
  readonly closed: true
  readonly block: ContentBlock
}
export type BlockRecord = OpenRecord | ClosedRecord
export interface StateData {
  readonly target: ArrivalTarget
  readonly blocks: readonly BlockRecord[]
  readonly position: JsonNumber
  readonly firstContentAt?: JsonNumber
  readonly acceptedFrames: JsonNumber
  readonly trims: TrimSummary
  readonly previousLongTrim: boolean
  readonly reported?: AccountEvent
  readonly finish?: FinishEvent
}

/** Publicly exported only as a type. All reachable owned data is already frozen. */
export class AssemblyState {
  readonly #data: StateData
  private constructor(data: StateData) {
    this.#data = Object.freeze(data)
    Object.freeze(this)
  }
  static create(data: StateData): AssemblyState {
    return new AssemblyState(data)
  }
  static read(state: AssemblyState): StateData {
    return state.#data
  }
}
Object.freeze(AssemblyState.prototype)
Object.freeze(AssemblyState)

/** Array slots are implementation positions; the producer's index is compared exactly. */
export function recordSlot(blocks: readonly BlockRecord[], index: JsonNumber): number {
  const sought = ExactDecimal.from(index)
  return blocks.findIndex(record => record.numericIndex.compare(sought) === 0)
}

export function replaceRecord(
  blocks: readonly BlockRecord[],
  slot: number,
  replacement: BlockRecord,
): readonly BlockRecord[] {
  return Object.freeze(blocks.map((record, position) => (position === slot ? replacement : record)))
}

export function fillRecord(record: OpenRecord, payload: FillEvent['payload']): OpenRecord {
  return Object.freeze({
    ...record,
    fills: Object.freeze({
      payload,
      previous: record.opened.fill === 'append' ? record.fills : undefined,
    }),
  })
}
