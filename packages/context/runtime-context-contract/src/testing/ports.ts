import type { TenantId } from '@omne-harness/legal-identity'
import type {
  ScopeRef,
  ScopeBinding,
  ScopeBindingSource,
  RuntimeContextAuthority,
  AuthorityDecision,
  HolderAction,
  HolderDecision,
  ProducerAction,
  Eligibility,
} from '../index.js'

/** Which face of the authority port one recorded call used. */
export type AuthorityFace = 'holder' | 'producer' | 'reader'
export type AuthorityCall<P> =
  | Readonly<{ face: 'holder'; principal: P; action: HolderAction<P> }>
  | Readonly<{ face: 'producer'; principal: P; action: ProducerAction }>
  | Readonly<{ face: 'reader'; principal: P; eligibility: Eligibility<P> }>

/** A scripted answer; `undefined` keeps the default authorized answer. */
export type AuthorityScript<P> = (call: AuthorityCall<P>) => HolderDecision<P> | undefined

/**
 * Test doubles of the two authority ports. Not for production: the binding table trusts whatever the
 * test binds, and the default authority authorizes every call until a script or `revokeAll` says
 * otherwise. `current()` of every earlier answer turns false after `revokeAll`.
 */
export type TestAuthorityPorts<P> = Readonly<{
  authority: RuntimeContextAuthority<P>
  bindings: ScopeBindingSource
  /** Records a trusted binding of a scope to a tenant. */
  bind(scope: ScopeRef, tenant: TenantId): void
  /** Answers every later lookup of this scope with the given binding answer. */
  answerBinding(scope: ScopeRef, answer: ScopeBinding): void
  /** Replaces the authority script; pass `undefined` to authorize again. */
  script(next: AuthorityScript<P> | undefined): void
  /** Makes every answer given so far stale: its `current()` returns false. */
  revokeAll(): void
  readonly calls: readonly AuthorityCall<P>[]
}>

export function createTestAuthorityPorts<P>(): TestAuthorityPorts<P> {
  const table = new Map<string, ScopeBinding>()
  const calls: AuthorityCall<P>[] = []
  let scripted: AuthorityScript<P> | undefined
  let revision = 0
  function decide(call: AuthorityCall<P>): HolderDecision<P> {
    calls.push(call)
    const answer = scripted?.(call)
    if (answer !== undefined) return answer
    const issued = revision
    return { kind: 'authorized', principal: call.principal, current: () => issued === revision }
  }
  function ordinary(decision: HolderDecision<P>): AuthorityDecision<P> {
    return decision.kind === 'invalid' ? { kind: 'unknown' } : decision
  }
  return {
    authority: {
      async holder(principal, action) {
        return decide({ face: 'holder', principal, action })
      },
      async producer(principal, action) {
        return ordinary(decide({ face: 'producer', principal, action }))
      },
      async reader(principal, eligibility) {
        return ordinary(decide({ face: 'reader', principal, eligibility }))
      },
    },
    bindings: {
      async lookup(scope) {
        return table.get(scope.ref) ?? { kind: 'unbound' }
      },
    },
    bind(scope, tenant) {
      table.set(scope.ref, { kind: 'bound', tenant })
    },
    answerBinding(scope, answer) {
      table.set(scope.ref, answer)
    },
    script(next) {
      scripted = next
    },
    revokeAll() {
      revision++
    },
    calls,
  }
}
