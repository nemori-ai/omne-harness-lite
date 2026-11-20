import type { UsageSource } from '@omne-harness/usage-contract'

export type UsageRegistration =
  | Readonly<{ kind: 'registered'; withdraw(): void }>
  | Readonly<{ kind: 'conflict'; name: string }>

/** Sources registered one contribution at a time; a name is unique; a withdrawal takes back its own. */
export interface UsageSources<P> {
  register(source: UsageSource<P>): UsageRegistration
  current(): readonly UsageSource<P>[]
}
