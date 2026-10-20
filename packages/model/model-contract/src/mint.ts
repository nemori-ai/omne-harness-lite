// One private conversion site for checked identity and reference text.
import type { Identity, ModelIdentityKey } from './root.ts'
import type { ModelInvocationRef, ModelOperationRef } from './reference.ts'

type Minted = { [K in ModelIdentityKey]: Identity<K> } & {
  ModelInvocationRef: ModelInvocationRef
  ModelOperationRef: ModelOperationRef
}
function mint<K extends ModelIdentityKey>(text: string): Identity<K>
function mint(text: string, kind: 'invocation'): ModelInvocationRef
function mint(text: string, kind: 'operation'): ModelOperationRef
function mint(text: string, _kind?: 'invocation' | 'operation'): Minted[keyof Minted] {
  // brand-mint: the caller has already checked the text or built it by a fixed rule.
  return text as Minted[keyof Minted]
}
export function mintIdentity<K extends ModelIdentityKey>(text: string): Identity<K> {
  return mint<K>(text)
}
export function mintInvocationReference(text: string): ModelInvocationRef {
  return mint(text, 'invocation')
}
export function mintOperationReference(text: string): ModelOperationRef {
  return mint(text, 'operation')
}
