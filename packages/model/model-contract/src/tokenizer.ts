// Declarations of the public-api chapter "文本分词与完整计量依据".
import type { Outcome } from '@omne-harness/operation-result'
import type { Adoption } from './root.ts'
import type { ProfileSupplier } from './profile.ts'

export type TokenizerDefinition = Readonly<{
  adoption: Adoption
  implementation: Adoption
  vocabulary: Adoption
  configuration: Adoption
}>
export type TokenizationSegment =
  | Readonly<{ kind: 'text'; text: string }>
  | Readonly<{ kind: 'special-token'; name: string }>
export type TokenizationFailure =
  | Readonly<{ kind: 'invalid'; reason: string }>
  | Readonly<{ kind: 'unsupported-token'; name: string }>
  | Readonly<{ kind: 'unavailable'; diagnostic: string }>
export interface ModelTextTokenizer {
  readonly definition: TokenizerDefinition
  count(
    input: readonly TokenizationSegment[],
  ): Outcome<Readonly<{ tokens: string }>, TokenizationFailure>
}
export type ModelCountingBasis = Readonly<{
  supplier: ProfileSupplier
  meter: Adoption
  tokenization:
    | Readonly<{ kind: 'local'; definition: TokenizerDefinition }>
    | Readonly<{ kind: 'not-used'; method: Adoption }>
  prompt:
    | Readonly<{ kind: 'declared-template'; template: Adoption }>
    | Readonly<{ kind: 'provider-private'; estimation: Adoption }>
  projection: Adoption
  mediaTransform: Adoption
  replay: Adoption
  evidence: Adoption
}>
