import { expectTypeOf, it } from 'vitest'
import type {
  Adoption,
  ConsumerRef,
  ModelConsumerOwnerDeclaration,
} from '@omne-harness/model-contract'
import { adoption } from './values.ts'

it('an exempt owner declares its evidence adapter', () => {
  const exempt: ModelConsumerOwnerDeclaration = {
    consumerOwner: 'owner',
    work: { kind: 'exempt' },
    evidence: adoption,
  }
  void exempt
})

it('a guarded owner names a participant and an evidence adapter', () => {
  const guarded: ModelConsumerOwnerDeclaration = {
    consumerOwner: 'owner',
    work: { kind: 'guarded', participant: adoption },
    evidence: adoption,
  }
  const noParticipant: ModelConsumerOwnerDeclaration = {
    consumerOwner: 'owner',
    // @ts-expect-error a guarded owner names its participant
    work: { kind: 'guarded' },
    evidence: adoption,
  }
  void [guarded, noParticipant]
  expectTypeOf<
    Extract<ModelConsumerOwnerDeclaration['work'], { kind: 'guarded' }>['participant']
  >().toEqualTypeOf<Adoption>()
})

it('the declaration cannot omit the evidence adapter, misspell the kind or call the owner field owner', () => {
  // @ts-expect-error evidence is required, also for an exempt owner
  const noEvidence: ModelConsumerOwnerDeclaration = {
    consumerOwner: 'owner',
    work: { kind: 'exempt' },
  }
  const misspelled: ModelConsumerOwnerDeclaration = {
    consumerOwner: 'owner',
    // @ts-expect-error a misspelled work kind
    work: { kind: 'exempted' },
    evidence: adoption,
  }
  const renamed: ModelConsumerOwnerDeclaration = {
    // @ts-expect-error the field is consumerOwner, not owner
    owner: 'owner',
    work: { kind: 'exempt' },
    evidence: adoption,
  }
  void [noEvidence, misspelled, renamed]
})

it('the owner text compares with the owner of a consumer reference', () => {
  expectTypeOf<ModelConsumerOwnerDeclaration['consumerOwner']>().toEqualTypeOf<
    ConsumerRef['owner']
  >()
})
