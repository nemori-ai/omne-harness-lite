import {
  engineAccepts,
  isInconvertibleReason,
  modalityOf,
  representationHolder,
  type ContentReference,
  type DefinitionAnswer,
  type DerivedMedium,
  type EngineAccess,
  type EngineLease,
  type EngineOutput,
  type MediaFacts,
  type MediaRow,
  type Preprocess,
  type PreprocessFailure,
  type Representation,
} from '@omne-harness/media-contract'
import type { MediaDependencies } from './deps.ts'
import { convertWithin, createTurns, type Converted } from './lending.ts'
import type { Objects } from './objects.ts'

type Resolved = Extract<DefinitionAnswer, { kind: 'resolved' }>
export type Todo = Readonly<{ row: MediaRow; resolved: Resolved; key: string }>

export const failed = (reason: PreprocessFailure): Preprocess => ({ kind: 'failed', reason })
export const done = (representation: Representation): Preprocess => ({
  kind: 'done',
  representation,
})
const ENDED: Readonly<Record<Exclude<Converted, EngineOutput>, PreprocessFailure>> = {
  timeout: 'timeout',
  withdrawn: 'engine-unavailable',
  cancelled: 'cancelled',
  threw: 'engine-error',
}
const ENGINE_FAILED: Readonly<Record<string, PreprocessFailure | undefined>> = {
  unavailable: 'engine-unavailable',
  error: 'engine-error',
  'outcome-unknown': 'outcome-unknown',
}
type Piece = Readonly<{ item: DerivedMedium; facts: MediaFacts }>
type Origin = Pick<Representation, 'definition' | 'engine'>

function wellFormed(output: EngineOutput): boolean {
  const value = output as { kind?: unknown; text?: unknown; derived?: unknown; reason?: unknown }
  if (value.kind === 'failed') return true
  if (value.kind === 'inconvertible')
    return !('reason' in value) || isInconvertibleReason(value.reason)
  if (value.kind !== 'converted' || typeof value.text !== 'string') return false
  return (
    Array.isArray(value.derived) &&
    (value.derived as Partial<DerivedMedium>[]).every(
      item => typeof item?.mediaType === 'string' && item.bytes instanceof Uint8Array,
    )
  )
}

/** One conversion from the borrowing of its engine to the keeping of its outcome. */
export function createConversion(deps: MediaDependencies, objects: Objects) {
  const { index, config } = deps
  const enter = createTurns(config.conversion.queueLimit)

  /** The other media an engine made, each of the type it claims and within the size limit; else null. */
  async function measured(derived: readonly DerivedMedium[]): Promise<Piece[] | null> {
    const pieces: Piece[] = []
    for (const item of derived) {
      if (item.bytes.byteLength > config.maxBytes[modalityOf(item.mediaType)]) return null
      const facts = await objects.measure(item.mediaType, item.bytes)
      if ('failure' in facts) return null
      pieces.push({ item, facts: facts.ok })
    }
    return pieces
  }

  /** Stores the pieces as media held in the name of the original. */
  async function stored(
    row: MediaRow,
    origin: Origin,
    pieces: readonly Piece[],
  ): Promise<ContentReference[] | PreprocessFailure> {
    const refs: ContentReference[] = []
    for (const { item, facts } of pieces) {
      const kept = await objects.keep({
        tenant: row.tenant,
        mediaType: item.mediaType,
        bytes: item.bytes,
        facts,
        holder: representationHolder(row.key, origin.definition),
      })
      if ('failure' in kept)
        return kept.failure.kind === 'outcome-unknown' ? 'outcome-unknown' : 'basis-unavailable'
      refs.push(kept.ok.ref)
    }
    return refs
  }

  async function keep(
    row: MediaRow,
    origin: Origin,
    output: Extract<EngineOutput, { kind: 'converted' }>,
  ): Promise<Preprocess> {
    const others = await measured(output.derived)
    if (others === null) return failed('invalid-result')
    const words = new TextEncoder().encode(output.text)
    if (words.byteLength <= config.conversion.inlineTextBytes) {
      const refs = await stored(row, origin, others)
      return typeof refs === 'string'
        ? failed(refs)
        : record(row, { ...origin, outcome: 'converted', text: output.text, others: refs })
    }
    const long: Piece = { item: { mediaType: 'text/plain', bytes: words }, facts: { kind: 'file' } }
    const refs = await stored(row, origin, [long, ...others])
    if (typeof refs === 'string') return failed(refs)
    const [text, ...rest] = refs as [ContentReference, ...ContentReference[]]
    return record(row, { ...origin, outcome: 'converted', text, others: rest })
  }

  async function record(row: MediaRow, representation: Representation): Promise<Preprocess> {
    const kept = await index.recordRepresentation({
      tenant: row.tenant,
      key: row.key,
      representation,
    })
    if ('ok' in kept) return done(kept.ok)
    return failed(kept.failure.kind === 'unknown' ? 'outcome-unknown' : 'basis-unavailable')
  }

  /** Step five and six, once the engine has a turn: convert within the bounds, check, keep. */
  async function converted(
    access: EngineAccess,
    { row, resolved }: Todo,
    lease: EngineLease,
    stop: AbortSignal,
  ): Promise<Preprocess> {
    const bytes = await objects.whole(row)
    if ('failure' in bytes) return failed('basis-unavailable')
    const media = {
      mediaType: row.mediaType,
      bytes: row.bytes,
      async *open() {
        yield Uint8Array.from(bytes.ok)
      },
    }
    const { timer } = deps
    const output = await convertWithin(
      lease.engine,
      { access, media, parameters: resolved.parameters },
      { timer, timeoutMs: config.conversion.timeoutMs, withdrawn: lease.withdrawn, stop },
    )
    if (typeof output === 'string') return failed(ENDED[output])
    if (!wellFormed(output)) return failed('invalid-result')
    if (output.kind === 'failed') return failed(ENGINE_FAILED[output.reason] ?? 'invalid-result')
    const { name, revision } = lease.engine.declaration
    const origin = { definition: resolved.definition, engine: { name, revision } }
    if (output.kind === 'converted') return keep(row, origin, output)
    const { reason } = output
    return record(row, {
      ...origin,
      outcome: 'inconvertible',
      ...(reason === undefined ? {} : { reason }),
    })
  }

  /** Step four: the engine is borrowed for this one medium and waits for its turn. */
  async function withEngine(
    access: EngineAccess,
    todo: Todo,
    lease: EngineLease,
    stop: AbortSignal,
  ): Promise<Preprocess> {
    const { declaration } = lease.engine
    const { row } = todo
    if (!engineAccepts(declaration, row.mediaType) || row.bytes > declaration.maxBytes)
      return failed('engine-unavailable')
    const leave = await enter(lease.engine, stop)
    if (leave === 'full') return failed('engine-unavailable')
    if (leave === 'cancelled') return failed('cancelled')
    try {
      return await converted(access, todo, lease, stop)
    } finally {
      leave()
    }
  }

  return async function converting(
    access: EngineAccess,
    todo: Todo,
    stop: AbortSignal,
  ): Promise<Preprocess> {
    const { row, resolved } = todo
    const { definition } = resolved
    const kept = await index.readRepresentation({ tenant: row.tenant, key: row.key, definition })
    if ('ok' in kept && kept.ok !== null) return done(kept.ok)
    const lease = deps.engines()?.borrow(resolved.engine) ?? null
    if (lease === null) return failed('engine-unavailable')
    try {
      return await withEngine(access, todo, lease, stop)
    } finally {
      lease.release()
    }
  }
}
