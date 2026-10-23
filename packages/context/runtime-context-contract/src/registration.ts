import type { ScopeRef, ContextBlockKey, ConsumerClass } from './shared.js'
import type { NeedBinding, NeedBindingRef } from './need.js'
import type { StatefulBlockDescriptor } from './descriptor.js'
import type { BlockValue, RegistrationRevision } from './shared.js'
import type { TenantId } from '@omne-harness/legal-identity'

export type Registration<K extends ContextBlockKey = ContextBlockKey> = Readonly<{
  scope: ScopeRef
  /** The tenant of the scope, given with every registration (RC-02). */
  tenant: TenantId
  key: K
  bindings: readonly NeedBinding<K>[]
  /** Scope-level parameters; shape from the descriptor's `parameterSchema`. */
  parameters: unknown
  required: boolean
  /** Revision after the commit that produced this registration. */
  revision: RegistrationRevision
}>

type ChangeHead<K extends ContextBlockKey> = Readonly<{
  scope: ScopeRef
  tenant: TenantId
  key: K
  /** The registration revision the holder based this change on (RC-02 参数冲突, 注册修订与提交顺序). */
  basedOn: RegistrationRevision
  /** Holder fact: several commits can belong to the same scope creation. */
  creating: boolean
}>

export type RegistrationChange<K extends ContextBlockKey = ContextBlockKey> =
  | (ChangeHead<K> &
      Readonly<{
        kind: 'add'
        bindings: readonly NeedBinding<K>[]
        parameters: unknown
        required: boolean
        /** A stateful block brings its own descriptor at registration (RC-02 两条路径). */
        declaration?: StatefulBlockDescriptor<K, BlockValue<K>, unknown>
      }>)
  /** Update keeps the fixed identity and the necessity; only bindings and parameters change (RC-02). */
  | (ChangeHead<K> &
      Readonly<{ kind: 'update'; bindings: readonly NeedBinding<K>[]; parameters: unknown }>)
  | (ChangeHead<K> & Readonly<{ kind: 'remove' }>)

/** Minted by the mechanism at issue time (RC-03). */
export type EligibilityId = Readonly<{ eligibility: string }>

export type EligibilityState =
  | Readonly<{ kind: 'valid' }>
  | Readonly<{ kind: 'superseded'; by: EligibilityId }>
  | Readonly<{ kind: 'revoked' }>

export type Eligibility<P = unknown> = Readonly<{
  id: EligibilityId
  state: EligibilityState
  /** The eligibility this one replaced at issue time, or null (RC-03 重签). */
  supersedes: EligibilityId | null
  scope: ScopeRef
  consumer: ConsumerClass
  principal: P
  tenant: TenantId
  /** Keys readable in the block's own shape. A translated block is not here (RC-03, RC-06). */
  keys: readonly ContextBlockKey[]
  /** Translated needs readable through their binding. */
  bindings: readonly NeedBindingRef[]
  registrationRevision: RegistrationRevision
}>

/** What the holder gives to `issueEligibility`: everything but the minted id and the state. */
export type EligibilityMaterial<P = unknown> = Omit<Eligibility<P>, 'id' | 'state'>
