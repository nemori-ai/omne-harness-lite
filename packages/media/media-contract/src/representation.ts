import type { TenantId } from '@omne-harness/legal-identity'
import type { Outcome } from '@omne-harness/operation-result'
import type { EngineAccess } from './engine.ts'
import type {
  ContentReference,
  Custody,
  Holder,
  InvalidReference,
  Provenance,
  Reads,
  Uploads,
  Variants,
} from './values.ts'

export const REPRESENTATION_OWNER = '@omne-harness/media/representation'

/** Who holds the media a representation is made of: the original, under one version of a definition. */
export function representationHolder(original: string, definition: Provenance): Holder {
  return {
    owner: REPRESENTATION_OWNER,
    work: original,
    position: `${definition.name}@${definition.revision}`,
    purpose: 'representation',
  }
}

export type PreprocessFailure =
  | 'basis-unavailable'
  | 'engine-unavailable'
  | 'engine-error'
  | 'timeout'
  | 'invalid-result'
  | 'outcome-unknown'
  | 'cancelled'

/** What a medium came to under one version of a converter definition: a fact, with where it came from. */
export type Representation = Readonly<{ definition: Provenance; engine: Provenance }> &
  (
    | Readonly<{
        outcome: 'converted'
        /** The words in line, or the medium that keeps them when they are many. */
        text: string | ContentReference
        others: readonly ContentReference[]
      }>
    | Readonly<{ outcome: 'inconvertible' }>
  )

/** Running and failed are of this process only: neither is kept, and asking again starts over. */
export type Preprocess =
  | Readonly<{ kind: 'not-needed' }>
  | Readonly<{ kind: 'not-started' }>
  | Readonly<{ kind: 'running' }>
  | Readonly<{ kind: 'done'; representation: Representation }>
  | Readonly<{ kind: 'failed'; reason: PreprocessFailure }>

type Answer = Promise<Outcome<Preprocess, InvalidReference>>

export interface Representations {
  /** Makes the representation of a medium ready, once: asked twice at a time, it converts once. */
  ensure(input: { access: EngineAccess; ref: ContentReference; signal: AbortSignal }): Answer
  read(input: { tenant: TenantId; ref: ContentReference }): Answer
  /** What `read` answers now, then every change of it, until the signal aborts. */
  watch(input: {
    tenant: TenantId
    ref: ContentReference
    signal: AbortSignal
  }): AsyncIterable<Preprocess>
}

export interface Media {
  readonly uploads: Uploads
  readonly custody: Custody
  readonly variants: Variants
  readonly reads: Reads
  readonly representations: Representations
}
