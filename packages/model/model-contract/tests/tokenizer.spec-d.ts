import { expectTypeOf, it } from 'vitest'
import type { ModelCountingBasis, TokenizerDefinition } from '@omne-harness/model-contract'
import type {
  ModelTextTokenizer,
  TokenizationFailure,
  TokenizationSegment,
} from '@omne-harness/model-contract/provider'
import { adoption, counting, profileSupplier } from './values.ts'

const definition: TokenizerDefinition = {
  adoption,
  implementation: adoption,
  vocabulary: adoption,
  configuration: adoption,
}

it('a tokenizer counts segments and returns tokens or a named failure', () => {
  const tokenizer: ModelTextTokenizer = {
    definition,
    count: segments => ({ ok: { tokens: String(segments.length) } }),
  }
  const failures: TokenizationFailure[] = [
    { kind: 'invalid', reason: 'r' },
    { kind: 'unsupported-token', name: 'n' },
    { kind: 'unavailable', diagnostic: 'd' },
  ]
  void [tokenizer, failures]
  expectTypeOf<ModelTextTokenizer>().not.toHaveProperty('encode')
})

it('a special token segment names the token', () => {
  const segments: TokenizationSegment[] = [
    { kind: 'text', text: 't' },
    { kind: 'special-token', name: 'n' },
  ]
  // @ts-expect-error a special token segment needs its name
  const noName: TokenizationSegment = { kind: 'special-token' }
  void [segments, noName]
})

it('a counting basis fixes the supplier, the template and the replay rules', () => {
  const local: ModelCountingBasis = { ...counting, tokenization: { kind: 'local', definition } }
  const declared: ModelCountingBasis = {
    ...counting,
    prompt: { kind: 'declared-template', template: adoption },
  }
  // @ts-expect-error a basis names its evidence
  const noEvidence: ModelCountingBasis = { ...counting, evidence: undefined }
  const credential: ModelCountingBasis = {
    ...counting,
    // @ts-expect-error a basis supplier is a profile supplier without credential
    supplier: { ...profileSupplier, credential: { kind: 'factory' } },
  }
  void [local, declared, noEvidence, credential]
})
