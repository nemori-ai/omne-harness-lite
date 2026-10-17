// Declarations of the public-api chapter "消费者 owner 的装配声明".
// deriveGuardControlOperation is a runtime value and is not implemented yet.
import type { Adoption } from './root.ts'

export type ModelConsumerOwnerDeclaration = Readonly<{
  consumerOwner: string
  work: Readonly<{ kind: 'guarded'; participant: Adoption }> | Readonly<{ kind: 'exempt' }>
  evidence: Adoption
}>
