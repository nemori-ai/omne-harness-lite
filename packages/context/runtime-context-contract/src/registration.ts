import type { ScopeRef, ContextBlockKey, ConsumerClass } from './shared.js'
import type { NeedBinding, NeedBindingRef } from './need.js'
import type { StatefulBlockDescriptor } from './descriptor.js'
import type { BlockValue, RegistrationRevision } from './shared.js'
import type { TenantId } from '@omne-harness/legal-identity'

export type Registration<K extends ContextBlockKey = ContextBlockKey> = Readonly<{
  scope: ScopeRef
  tenant: TenantId
  key: K
  bindings: readonly NeedBinding<K>[]
  parameters: unknown
  required: boolean
  revision: RegistrationRevision
}>

type ChangeHead<K extends ContextBlockKey> = Readonly<{
  scope: ScopeRef
  tenant: TenantId
  key: K
  basedOn: RegistrationRevision
  creating: boolean
}>

export type RegistrationChange<K extends ContextBlockKey = ContextBlockKey> =
  | (ChangeHead<K> &
      Readonly<{
        kind: 'add'
        bindings: readonly NeedBinding<K>[]
        parameters: unknown
        required: boolean
        declaration?: StatefulBlockDescriptor<K, BlockValue<K>, unknown>
      }>)
  | (ChangeHead<K> &
      Readonly<{ kind: 'update'; bindings: readonly NeedBinding<K>[]; parameters: unknown }>)
  | (ChangeHead<K> & Readonly<{ kind: 'remove' }>)

export type EligibilityId = Readonly<{ eligibility: string }>

export type EligibilityState =
  | Readonly<{ kind: 'valid' }>
  | Readonly<{ kind: 'superseded'; by: EligibilityId }>
  | Readonly<{ kind: 'revoked' }>

export type Eligibility<P = unknown> = Readonly<{
  id: EligibilityId
  state: EligibilityState
  supersedes: EligibilityId | null
  scope: ScopeRef
  consumer: ConsumerClass
  principal: P
  tenant: TenantId
  keys: readonly ContextBlockKey[]
  bindings: readonly NeedBindingRef[]
  registrationRevision: RegistrationRevision
}>

export type EligibilityMaterial<P = unknown> = Omit<Eligibility<P>, 'id' | 'state'>
