import type { ContentReference, Holder, Provenance } from './values.ts'

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
