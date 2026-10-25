import { describe, expectTypeOf, it } from 'vitest'
import type { Adoption, ConsumerRef, DurableEvidence } from '@omne-harness/exchange-refs'

describe('the three exchange values', () => {
  it('Adoption has exactly four required readonly string members', () => {
    expectTypeOf<Adoption>().toEqualTypeOf<
      Readonly<{ owner: string; name: string; revision: string; digest: string }>
    >()
  })

  it('DurableEvidence has exactly four required readonly string members', () => {
    expectTypeOf<DurableEvidence>().toEqualTypeOf<
      Readonly<{ owner: string; record: string; revision: string; digest: string }>
    >()
  })

  it('ConsumerRef has exactly four required readonly string members', () => {
    expectTypeOf<ConsumerRef>().toEqualTypeOf<
      Readonly<{ owner: string; work: string; position: string; purpose: string }>
    >()
  })

  it('refuses a value that lacks a member', () => {
    // @ts-expect-error digest is required
    const adoption: Adoption = { owner: 'o', name: 'n', revision: 'r' }
    // @ts-expect-error purpose is required
    const consumer: ConsumerRef = { owner: 'o', work: 'w', position: 'p' }
    expectTypeOf(adoption).not.toBeAny()
    expectTypeOf(consumer).not.toBeAny()
  })

  it('refuses a write to a member', () => {
    const evidence: DurableEvidence = { owner: 'o', record: 'r', revision: '1', digest: 'd' }
    // @ts-expect-error members are readonly
    evidence.owner = 'other'
    expectTypeOf(evidence.owner).toEqualTypeOf<string>()
  })

  it('keeps the members strings, not literals or numbers', () => {
    // @ts-expect-error revision is a string, not a number
    const evidence: DurableEvidence = { owner: 'o', record: 'r', revision: 1, digest: 'd' }
    expectTypeOf(evidence).not.toBeAny()
  })
})
