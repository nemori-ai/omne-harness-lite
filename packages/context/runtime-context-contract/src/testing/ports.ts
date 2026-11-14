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

export type AuthorityFace = 'holder' | 'producer' | 'reader'
export type AuthorityCall<P> =
  | Readonly<{ face: 'holder'; principal: P; action: HolderAction<P> }>
  | Readonly<{ face: 'producer'; principal: P; action: ProducerAction }>
  | Readonly<{ face: 'reader'; principal: P; eligibility: Eligibility<P> }>

export type AuthorityScript<P> = (call: AuthorityCall<P>) => HolderDecision<P> | undefined

export type TestAuthorityPorts<P> = Readonly<{
  authority: RuntimeContextAuthority<P>
  bindings: ScopeBindingSource
  bind(scope: ScopeRef, tenant: TenantId): void
  answerBinding(scope: ScopeRef, answer: ScopeBinding): void
  script(next: AuthorityScript<P> | undefined): void
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
