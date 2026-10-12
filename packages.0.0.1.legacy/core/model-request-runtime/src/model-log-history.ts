import { readSessionFact, type SessionFact } from '@omne-harness-lite/session-runtime'
import { List, Map as PersistentMap } from 'immutable'
import { ExactDecimal } from '@omne-harness-lite/call-accounts'
import {
  copyJsonValue,
  isNonNegativeJsonInteger,
  writeJsonLossless,
  type JsonNumber,
  type JsonObject,
  type JsonValue,
} from '@omne-harness-lite/content-blocks'
import { tenantIdEquals } from '@omne-harness-lite/identity-values'
import {
  checkAppendInput,
  checkSourceToken,
  type LogEntry,
  type SourceToken,
} from '@omne-harness-lite/session-log'
import { messageReferencesEarlier } from '@omne-harness-lite/messages'
import {
  captureWrapper,
  inspectCapturedEntry,
  type InspectedModelLogEntry,
  type ModelLogPurpose,
} from './log-codec-entry.ts'
import { currentCodecDomain } from './log-codec-domain.ts'
import { readModelLogEnvelope } from './log-envelope.ts'
import { decodeModelLogKey, encodeModelLogKey, object } from './log-codec-key.ts'
import type { CapturedModelLogValue } from './log-codec-value.ts'
import {
  createIndexedModelLogReadInspector,
  modelLogCallIdentityMatches,
  foreignReserved,
  type ModelLogReadInspector,
  type SettlementMembersResult,
} from './log-codec-settlement.ts'

type Positions = PersistentMap<string, List<number>>
type Failure = Exclude<
  SettlementMembersResult,
  { readonly absent: true } | { readonly completeMembers: unknown }
>
type Capture = { readonly ok: CapturedModelLogValue | null } | Failure
interface Cell {
  readonly entry: LogEntry
  envelope?: ReturnType<typeof readModelLogEnvelope>
  capture?: Capture
  fact?: ReturnType<typeof readSessionFact>
  record?: InspectedModelLogEntry | null
}
interface SelectionState {
  readonly length: number
  readonly selected: string | null
  readonly failed: boolean
}
interface FactState {
  readonly length: number
  readonly invalid: boolean
  readonly facts: PersistentMap<number, SessionFact>
  readonly calls: Positions
  readonly runs: Positions
  readonly kinds: Positions
}
interface ModelState {
  readonly length: number
  readonly captures: List<CapturedModelLogValue | null>
  readonly inspected: PersistentMap<number, InspectedModelLogEntry>
  readonly responses: Positions
  readonly messages: Positions
  readonly dispatchResponses: Positions
  readonly assistants: Positions
  readonly failures: PersistentMap<number, Failure>
  readonly captureFailure?: Failure
}
const token = Object.freeze({})
function add(index: Positions, key: string, position: number): Positions {
  return index.set(key, (index.get(key) ?? List<number>()).push(position))
}
function failure(reason: Failure['reason'], undetermined = false): Failure {
  return undetermined ? { undetermined: true, reason } : { inconsistent: true, reason }
}
function emptyState(): ModelState {
  return {
    length: 0,
    captures: List(),
    inspected: PersistentMap(),
    responses: PersistentMap(),
    messages: PersistentMap(),
    assistants: PersistentMap(),
    dispatchResponses: PersistentMap(),
    failures: PersistentMap(),
  }
}
function captureCell(cell: Cell): Capture {
  if (cell.capture !== undefined) return cell.capture
  const decoded = (cell.envelope ??= readModelLogEnvelope(cell.entry.payload))
  if ('failure' in decoded) return (cell.capture = failure('entry', true))
  if (decoded.kind === 'other')
    return (cell.capture = foreignReserved(cell.entry)
      ? failure('unknown_format', true)
      : { ok: null })
  if (!currentCodecDomain.readFormats.includes(decoded.envelope.format))
    return (cell.capture = failure('unknown_format', true))
  const captured = captureWrapper(cell.entry.payload)
  return (cell.capture = 'invalidValue' in captured ? failure('entry', true) : captured)
}
function reservedModelIdentity(entry: LogEntry): boolean {
  return (
    entry.readKeys.some(key => 'ok' in decodeModelLogKey(key) || key.startsWith('mrr/')) ||
    entry.dedupeKey?.startsWith('mrr/') === true
  )
}
function matchingFact(
  fact: SessionFact,
  selector: { readonly call?: string; readonly run?: string; readonly kind?: SessionFact['kind'] },
): boolean {
  if (selector.call !== undefined && (!('call' in fact) || fact.call !== selector.call))
    return false
  if (selector.run !== undefined && (!('run' in fact) || fact.run !== selector.run)) return false
  return selector.kind === undefined || fact.kind === selector.kind
}
interface HistoryContent {
  cells: List<Cell>
  dedupes: Positions
  readKeys: Positions
  entryBytes: number
  references: number
}
function emptyContent(): HistoryContent {
  return {
    cells: List(),
    dedupes: PersistentMap(),
    readKeys: PersistentMap(),
    entryBytes: 0,
    references: 0,
  }
}
function emptyFacts(): FactState {
  return {
    length: 0,
    invalid: false,
    facts: PersistentMap(),
    calls: PersistentMap(),
    runs: PersistentMap(),
    kinds: PersistentMap(),
  }
}
function sameHistorySource(previous: ModelLogHistory | null, source: SourceToken): boolean {
  if (previous === null) return true
  return (
    previous.source.session === source.session &&
    tenantIdEquals(previous.source.tenant, source.tenant) &&
    previous.source.journalGeneration === source.journalGeneration
  )
}
function validHistoryTail(
  previous: ModelLogHistory | null,
  entries: readonly JsonValue[],
  source: SourceToken,
  tail: JsonValue | undefined,
): boolean {
  if (
    !isNonNegativeJsonInteger(source.tail) ||
    ExactDecimal.from(source.tail).compare(
      ExactDecimal.from((previous?.length ?? 0) + entries.length),
    ) !== 0
  )
    return false
  return (
    tail === undefined ||
    (isNonNegativeJsonInteger(tail) &&
      ExactDecimal.from(source.tail).compare(ExactDecimal.from(tail)) === 0)
  )
}
function historyEnvelope(
  value: JsonObject,
): { readonly entries: readonly JsonValue[]; readonly source: SourceToken } | null {
  if (Object.keys(value).some(key => !['entries', 'tail', 'source'].includes(key))) return null
  if (!Array.isArray(value.entries) || !object(value.source)) return null
  const source = checkSourceToken(value.source)
  return 'failure' in source ? null : { entries: value.entries, source: source.ok }
}
function captureHistoryInput(previous: ModelLogHistory | null, received: unknown) {
  if (previous !== null && !ModelLogHistory.owns(previous)) return null
  const copied = copyJsonValue(received)
  if ('failed' in copied || !object(copied.ok)) return null
  const value = copied.ok
  const input = historyEnvelope(value)
  if (input === null || !sameHistorySource(previous, input.source)) return null
  if (!validHistoryTail(previous, input.entries, input.source, value.tail)) return null
  const tail = value.tail === undefined ? input.source.tail : (value.tail as JsonNumber)
  return { ...input, tail }
}
function captureLocatedEntry(
  source: SourceToken,
  raw: JsonValue,
  position: number,
): LogEntry | null {
  if (
    !object(raw) ||
    raw.session !== source.session ||
    !isNonNegativeJsonInteger(raw.position) ||
    ExactDecimal.from(raw.position).compare(ExactDecimal.from(position + 1)) !== 0
  )
    return null
  const { session: _session, position: ordinal, ...shell } = raw
  const checked = checkAppendInput(
    source.session,
    [shell],
    { kind: 'unfenced' },
    { kind: 'unconditional' },
  )
  const owned = 'ok' in checked ? checked.ok.entries[0] : undefined
  if (owned === undefined || !tenantIdEquals(owned.tenant, source.tenant)) return null
  return Object.freeze({ ...owned, session: source.session, position: ordinal })
}
export type ModelHistorySelector =
  | { readonly kind: 'dedupe' | 'readKey'; readonly key: string }
  | { readonly kind: 'position'; readonly position: JsonNumber }
  | { readonly kind: 'message' | 'response' | 'dispatchResponse'; readonly id: string }
  | { readonly kind: 'call'; readonly call: string }
  | { readonly kind: 'all' }

/** Immutable content only. This handle grants no access to a Session or Storage Unit. */
export class ModelLogHistory {
  readonly #owned = true
  readonly #cells: List<Cell>
  readonly #dedupes: Positions
  readonly #readKeys: Positions
  readonly #entryBytes: number
  readonly #tail: JsonNumber
  #facts: FactState
  #checkpoint: ModelState
  #selection: SelectionState
  #inspector: { readonly ok: ModelLogReadInspector } | SettlementMembersResult | undefined
  readonly indexReferences: number
  private constructor(
    key: object,
    readonly source: SourceToken,
    cells: List<Cell>,
    dedupes: Positions,
    readKeys: Positions,
    entryBytes: number,
    checkpoint: ModelState,
    indexReferences: number,
    facts: FactState,
    tail: JsonNumber,
    selection: SelectionState,
  ) {
    if (key !== token) throw new TypeError('Use captureModelLogHistory')
    this.#cells = cells
    this.#dedupes = dedupes
    this.#readKeys = readKeys
    this.#entryBytes = entryBytes
    this.#checkpoint = checkpoint
    this.#facts = facts
    this.#tail = tail
    this.#selection = selection
    this.indexReferences = indexReferences
    Object.freeze(this)
  }
  static owns(value: unknown): value is ModelLogHistory {
    return value !== null && typeof value === 'object' && #owned in value
  }
  get tail(): JsonNumber {
    return this.#tail
  }
  get length(): number {
    return this.#cells.size
  }
  get entries(): readonly LogEntry[] {
    return Object.freeze(this.#cells.map(cell => cell.entry).toArray())
  }
  get retainedBytes(): number {
    return (
      Buffer.byteLength(writeJsonLossless({ entries: [], tail: this.tail }), 'utf8') +
      this.#entryBytes +
      Math.max(0, this.length - 1)
    )
  }
  entryAt(index: number): LogEntry | undefined {
    return this.#cells.get(index)?.entry
  }
  entriesSince(index: number): readonly LogEntry[] {
    return Object.freeze(
      this.#cells
        .slice(index)
        .map(cell => cell.entry)
        .toArray(),
    )
  }
  select(
    selector: Exclude<ModelHistorySelector, { kind: 'message' | 'response' | 'dispatchResponse' }>,
  ): readonly LogEntry[] {
    return Object.freeze(this.positions(selector).map(position => this.#cells.get(position)!.entry))
  }
  private positions(selector: ModelHistorySelector): number[] {
    switch (selector.kind) {
      case 'call': {
        const key = encodeModelLogKey({ kind: 'call', call: selector.call })
        return 'ok' in key ? (this.#readKeys.get(key.ok)?.toArray() ?? []) : []
      }
      case 'all':
        return Array.from({ length: this.length }, (_, index) => index)
      case 'position':
        return this.ordinalPosition(selector.position)
      case 'dedupe':
        return this.#dedupes.get(selector.key)?.toArray() ?? []
      case 'readKey':
        return this.#readKeys.get(selector.key)?.toArray() ?? []
      default:
        return this.modelIdentityPositions(selector)
    }
  }
  private ordinalPosition(position: JsonNumber): number[] {
    const number = Number(ExactDecimal.from(position).toCanonicalString())
    return Number.isSafeInteger(number) && number > 0 && number <= this.length ? [number - 1] : []
  }
  private modelIdentityPositions(
    selector: Extract<ModelHistorySelector, { readonly id: string }>,
  ): number[] {
    const indexes = {
      message: this.#checkpoint.messages,
      response: this.#checkpoint.responses,
      dispatchResponse: this.#checkpoint.dispatchResponses,
    }
    return indexes[selector.kind].get(selector.id)?.toArray() ?? []
  }
  recordAt(index: number): InspectedModelLogEntry | null {
    const cell = this.#cells.get(index)
    if (cell === undefined) return null
    if (cell.record !== undefined) return cell.record
    const captured = captureCell(cell)
    if (!('ok' in captured) || captured.ok === null) return (cell.record = null)
    const inspected = inspectCapturedEntry(cell.entry, captured.ok, { kind: 'record' })
    return (cell.record = 'ok' in inspected ? inspected.ok : null)
  }
  modelSelection(): { readonly selected: string | null } | { readonly unavailable: true } {
    let { length, selected, failed } = this.#selection
    for (; !failed && length < this.length; length++) {
      const result = this.localSelectionAt(length)
      if ('unavailable' in result) failed = true
      else if (result.selected !== null) selected = result.selected
    }
    this.#selection = { length, selected, failed }
    return failed ? { unavailable: true } : { selected }
  }
  private localSelectionAt(index: number) {
    const cell = this.#cells.get(index)!
    const decoded = (cell.envelope ??= readModelLogEnvelope(cell.entry.payload))
    if ('failure' in decoded) return { unavailable: true } as const
    if (decoded.kind === 'other')
      return reservedModelIdentity(cell.entry)
        ? ({ unavailable: true } as const)
        : { selected: null }
    if (decoded.envelope.format !== currentCodecDomain.writeFormat)
      return { unavailable: true } as const
    return decoded.envelope.category === 'record'
      ? this.selectionRecordAt(index)
      : { selected: null }
  }
  private selectionRecordAt(index: number) {
    const record = this.recordAt(index)?.captured.record
    if (record === undefined || record === null) return { unavailable: true } as const
    if (record.kind !== 'model_selection_changed') return { selected: null }
    const entry = this.#cells.get(index)!.entry
    if (entry.run !== undefined || entry.attempt !== undefined)
      return { unavailable: true } as const
    return { selected: record.routeName }
  }
  sessionFacts(selector: {
    readonly call?: string
    readonly run?: string
    readonly kind?: SessionFact['kind']
  }): {
    readonly invalid: boolean
    readonly entries: readonly { readonly entry: LogEntry; readonly fact: SessionFact }[]
  } {
    const { invalid, facts, calls, runs, kinds } = this.foldFacts()
    const positions =
      selector.call !== undefined
        ? calls.get(selector.call)
        : selector.run !== undefined
          ? runs.get(selector.run)
          : selector.kind !== undefined
            ? kinds.get(selector.kind)
            : facts.keySeq().toList()
    return {
      invalid,
      entries: Object.freeze(
        (positions ?? List<number>())
          .flatMap(position => {
            const fact = facts.get(position)!
            return matchingFact(fact, selector)
              ? [{ entry: this.#cells.get(position)!.entry, fact }]
              : []
          })
          .toArray(),
      ),
    }
  }
  private foldFacts(): FactState {
    let { length, invalid, facts, calls, runs, kinds } = this.#facts
    for (; length < this.length; length++) {
      const cell = this.#cells.get(length)!
      const read = (cell.fact ??= readSessionFact(cell.entry))
      if ('failure' in read) {
        invalid = true
        continue
      }
      if (read.kind === 'other') continue
      const fact = read.fact
      facts = facts.set(length, fact)
      kinds = add(kinds, fact.kind, length)
      if ('call' in fact) calls = add(calls, fact.call, length)
      if ('run' in fact) runs = add(runs, fact.run, length)
    }
    return (this.#facts = { length, invalid, facts, calls, runs, kinds })
  }
  inspect(): { readonly ok: ModelLogReadInspector } | SettlementMembersResult {
    if (this.#inspector !== undefined) return this.#inspector
    const state = this.fold()
    this.#checkpoint = state
    if (state.captureFailure !== undefined) return (this.#inspector = state.captureFailure)
    if (state.failures.size > 0) {
      let first = Infinity
      let rejected: Failure = failure('entry')
      for (const [position, result] of state.failures)
        if (position < first) {
          first = position
          rejected = result
        }
      return (this.#inspector = rejected)
    }
    return (this.#inspector = {
      ok: createIndexedModelLogReadInspector(this.source, selector =>
        Object.freeze(
          this.positions(selector).flatMap(position => {
            const inspected = state.inspected.get(position)
            return inspected === undefined ||
              (selector.kind === 'call' && !modelLogCallIdentityMatches(inspected, selector.call))
              ? []
              : [inspected]
          }),
        ),
      ),
    })
  }
  private fold(): ModelState {
    const base = this.#checkpoint
    if (base.captureFailure !== undefined) return { ...base, length: this.length }
    const captured = this.captureSuffix(base)
    if ('failure' in captured)
      return { ...base, length: this.length, captureFailure: captured.failure }
    return this.associateSuffix(captured.state, captured.affected)
  }
  private captureAt(position: number): Capture {
    const cell = this.#cells.get(position)!
    if (
      cell.entry.dedupeKey !== undefined &&
      this.#dedupes.get(cell.entry.dedupeKey)!.first() !== position
    )
      return failure('duplicate_key')
    return captureCell(cell)
  }
  private captureSuffix(
    base: ModelState,
  ):
    | { readonly state: ModelState; readonly affected: ReadonlySet<number> }
    | { readonly failure: Failure } {
    let { captures, responses, messages, assistants, dispatchResponses } = base
    const affected = new Set<number>()
    for (let position = base.length; position < this.length; position++) {
      const result = this.captureAt(position)
      if (!('ok' in result)) return { failure: result }
      const captured = result.ok
      captures = captures.push(captured)
      if (captured === null) continue
      affected.add(position)
      if (captured.record?.kind === 'model_call_dispatched')
        dispatchResponses = add(dispatchResponses, captured.record.response, position)
      if (captured.response !== null) {
        const id = captured.response.id
        responses = add(responses, id, position)
        for (const old of assistants.get(id) ?? []) affected.add(old)
      }
      if (captured.message !== null) {
        messages = add(messages, captured.message.id, position)
        if (captured.message.type === 'assistant')
          assistants = add(assistants, captured.message.response, position)
      }
    }
    return {
      affected,
      state: {
        ...base,
        length: this.length,
        captures,
        responses,
        messages,
        assistants,
        dispatchResponses,
      },
    }
  }
  private associationPurpose(
    captured: CapturedModelLogValue,
    state: ModelState,
  ): ModelLogPurpose | null {
    if (captured.category === 'record') return { kind: 'record' }
    if (captured.category === 'response') return { kind: 'response' }
    const message = captured.message
    if (message === null || message.type === 'system') return null
    if (message.type !== 'assistant') return { kind: 'message' }
    const positions = state.responses.get(message.response)
    const response = positions?.size === 1 ? state.captures.get(positions.first()!) : undefined
    return response ? { kind: 'persistedMessage', response } : null
  }
  private associateAt(
    position: number,
    captured: CapturedModelLogValue,
    state: ModelState,
  ): { readonly ok: InspectedModelLogEntry } | Failure {
    const purpose = this.associationPurpose(captured, state)
    if (purpose === null) return failure('message')
    if (
      captured.message !== null &&
      !messageReferencesEarlier(
        captured.message,
        id => (state.messages.get(id)?.first() ?? Infinity) < position,
      )
    )
      return failure('entry')
    const result = inspectCapturedEntry(this.#cells.get(position)!.entry, captured, purpose)
    return 'invalidValue' in result ? failure('entry') : result
  }
  private associateSuffix(state: ModelState, affected: ReadonlySet<number>): ModelState {
    let { inspected, failures } = state
    for (const position of affected) {
      const captured = state.captures.get(position)!
      if (captured === null) continue
      const result = this.associateAt(position, captured, state)
      if ('ok' in result) {
        inspected = inspected.set(position, result.ok)
        failures = failures.delete(position)
      } else failures = failures.set(position, result)
    }
    return { ...state, inspected, failures }
  }
  private contentForAppend(): HistoryContent {
    return {
      cells: this.#cells,
      dedupes: this.#dedupes,
      readKeys: this.#readKeys,
      entryBytes: this.#entryBytes,
      references:
        this.indexReferences +
        16 * (this.length - Math.min(this.#checkpoint.length, this.#facts.length)),
    }
  }
  static capture(
    previous: ModelLogHistory | null,
    received: unknown,
  ): { readonly history: ModelLogHistory } | { readonly failure: 'invalidPrefix' } {
    const invalid = { failure: 'invalidPrefix' } as const
    const input = captureHistoryInput(previous, received)
    if (input === null) return invalid
    const content = previous === null ? emptyContent() : previous.contentForAppend()
    for (const raw of input.entries) {
      const entry = captureLocatedEntry(input.source, raw, content.cells.size)
      if (entry === null) return invalid
      content.cells = content.cells.push({ entry })
      content.entryBytes += Buffer.byteLength(writeJsonLossless(entry), 'utf8')
      if (entry.dedupeKey !== undefined) {
        content.dedupes = add(content.dedupes, entry.dedupeKey, content.cells.size - 1)
        content.references++
      }
      for (const key of entry.readKeys) {
        content.readKeys = add(content.readKeys, key, content.cells.size - 1)
        content.references++
      }
      content.references += 16
    }
    return {
      history: new ModelLogHistory(
        token,
        input.source,
        content.cells,
        content.dedupes,
        content.readKeys,
        content.entryBytes,
        previous === null ? emptyState() : previous.#checkpoint,
        content.references,
        previous === null ? emptyFacts() : previous.#facts,
        input.tail,
        previous === null ? { length: 0, selected: null, failed: false } : previous.#selection,
      ),
    }
  }
}
export const captureModelLogHistory = ModelLogHistory.capture
