import type { Outcome } from '@omne-harness/operation-result'
import type { FixedToolRequest } from './definitions.ts'
import type { Adoption, CallAccess } from './identity.ts'
import type { ToolFailure } from './results.ts'

export type ToolCredentialUsage = Readonly<{
  adoption: Adoption
  purpose: string
  target: string
}>

export type ToolCredentialRequest<P> = CallAccess<P> &
  Readonly<{ request: FixedToolRequest; usage: ToolCredentialUsage }>

export type ToolCredentialFailure =
  | Readonly<{ kind: 'missing' }>
  | Extract<ToolFailure, { kind: 'denied' | 'invalid' | 'unavailable' }>

export interface ToolCredentials<P, C> {
  resolve(input: ToolCredentialRequest<P>): Promise<Outcome<C, ToolCredentialFailure>>
}
