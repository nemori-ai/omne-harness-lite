import {
  KNOWN_MEDIA_TYPES,
  engineAccepts,
  modalityOf,
  representationHolder,
  type ContentReference,
  type DefinitionAnswer,
  type DerivedMedium,
  type EngineAccess,
  type EngineOutput,
  type MediaFacts,
  type MediaRow,
  type Preprocess,
  type PreprocessFailure,
  type Provenance,
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
const ENGINE_SAID: Readonly<Record<string, PreprocessFailure>> = {
  timeout: 'timeout',
  withdrawn: 'engine-unavailable',
  cancelled: 'cancelled',
  threw: 'engine-error',
  unavailable: 'engine-unavailable',
  error: 'engine-error',
  'outcome-unknown': 'outcome-unknown',
}

function wellFormed(output: Exclude<Converted, string>): output is EngineOutput {
  const value = output as { kind?: unknown; text?: unknown; derived?: unknown }
  if (value.kind === 'inconvertible' || value.kind === 'failed') return true
  if (value.kind !== 'converted' || typeof value.text !== 'string') return false
  return (
    Array.isArray(value.derived) &&
    (value.derived as Partial<DerivedMedium>[]).every(
      item => typeof item.mediaType === 'string' && item.bytes instanceof Uint8Array,
    )
  )
}

/** One conversion from the borrowing of its engine to the keeping of its outcome. */
export function createConversion(deps: MediaDependencies, objects: Objects) {
  const { index, config } = deps
  const enter = createTurns(config.conversion.queueLimit)

  /** Stores what the engine made and keeps the outcome; the media are held in the name of the original. */
  async function keep(
    row: MediaRow,
    origin: Pick<Representation, 'definition' | 'engine'>,
    output: Extract<EngineOutput, { kind: 'converted' }>,
  ): Promise<Preprocess> {
    const measured: { item: DerivedMedium; facts: MediaFacts }[] = []
    for (const item of output.derived) {
      if (!KNOWN_MEDIA_TYPES.includes(item.mediaType)) return failed('invalid-result')
      if (item.bytes.byteLength > config.maxBytes[modalityOf(item.mediaType)])
        return failed('invalid-result')
      const facts = await objects.measure(item.mediaType, item.bytes)
      if ('failure' in facts) return failed('invalid-result')
      measured.push({ item, facts: facts.ok })
    }
    const words = new TextEncoder().encode(output.text)
    const inline = words.byteLength <= config.conversion.inlineTextBytes
    const pieces = inline
      ? measured
      : [
          { item: { mediaType: 'text/plain', bytes: words }, facts: { kind: 'file' } as const },
          ...measured,
        ]
    const refs: ContentReference[] = []
    for (const { item, facts } of pieces) {
      const stored = await objects.keep({
        tenant: row.tenant,
        mediaType: item.mediaType,
        bytes: item.bytes,
        facts,
        holder: representationHolder(row.key, origin.definition),
      })
      if ('failure' in stored)
        return failed(
          stored.failure.kind === 'outcome-unknown' ? 'outcome-unknown' : 'basis-unavailable',
        )
      refs.push(stored.ok.ref)
    }
    const [text, others] = inline ? [output.text, refs] : [refs[0] ?? '', refs.slice(1)]
    return record(row, { ...origin, outcome: 'converted', text, others })
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

  /** Steps four to six: borrow the engine, convert within the bounds, check, keep. */
  async function converting(
    access: EngineAccess,
    { row, resolved }: Todo,
    stop: AbortSignal,
  ): Promise<Preprocess> {
    const { definition } = resolved
    const again = await index.readRepresentation({ tenant: row.tenant, key: row.key, definition })
    if ('ok' in again && again.ok !== null) return done(again.ok)
    const lease = deps.engines()?.borrow(resolved.engine) ?? null
    if (lease === null) return failed('engine-unavailable')
    try {
      const { declaration } = lease.engine
      if (!engineAccepts(declaration, row.mediaType) || row.bytes > declaration.maxBytes)
        return failed('engine-unavailable')
      const leave = await enter(lease.engine, stop)
      if (leave === 'full') return failed('engine-unavailable')
      if (leave === 'cancelled') return failed('cancelled')
      try {
        const bytes = await objects.whole(row)
        if ('failure' in bytes) return failed('basis-unavailable')
        const media = {
          mediaType: row.mediaType,
          bytes: row.bytes,
          async *open() {
            yield Uint8Array.from(bytes.ok)
          },
        }
        const output = await convertWithin(
          lease.engine,
          { access, media, parameters: resolved.parameters },
          {
            timer: deps.timer,
            timeoutMs: config.conversion.timeoutMs,
            withdrawn: lease.withdrawn,
            stop,
          },
        )
        if (typeof output === 'string') return failed(ENGINE_SAID[output] ?? 'engine-error')
        if (!wellFormed(output)) return failed('invalid-result')
        if (output.kind === 'failed') return failed(ENGINE_SAID[output.reason] ?? 'invalid-result')
        const origin = {
          definition,
          engine: { name: declaration.name, revision: declaration.revision } satisfies Provenance,
        }
        return output.kind === 'converted'
          ? await keep(row, origin, output)
          : await record(row, { ...origin, outcome: 'inconvertible' })
      } finally {
        leave()
      }
    } finally {
      lease.release()
    }
  }

  return converting
}
