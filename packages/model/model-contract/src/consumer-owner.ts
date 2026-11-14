import type { Adoption } from './root.ts'

export type ModelConsumerOwnerDeclaration = Readonly<{
  consumerOwner: string
  work: Readonly<{ kind: 'guarded'; participant: Adoption }> | Readonly<{ kind: 'exempt' }>
  evidence: Adoption
}>
