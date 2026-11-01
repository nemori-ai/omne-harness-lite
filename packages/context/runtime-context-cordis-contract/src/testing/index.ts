// The testing entry: the scripted reader eligibility handoff and the handoff conformance suite.
// Neither imports a provider member; the suite drives the handoff that the fixture hands in.
import { tenantEquals, type TenantId } from '@omne-harness/legal-identity'
import type {
  ConsumerClass,
  EligibilityId,
  ReaderEligibilityHandoff,
  ReaderEligibilityRequest,
  ReaderEligibilityResult,
  ScopeRef,
} from '@omne-harness/runtime-context-contract'

/**
 * Every answer is listed. A scope that the script binds to another tenant than the request's is
 * refused before any answer is looked up; an input that is not listed is answered `unavailable`.
 */
export type ReaderEligibilityScript<P> = Readonly<{
  scopes: readonly Readonly<{ scope: ScopeRef; tenant: TenantId }>[]
  answers: readonly Readonly<{
    request: ReaderEligibilityRequest<P>
    result: ReaderEligibilityResult
  }>[]
}>

/** Structural equality of plain data; a field one side does not state is a difference. */
function same(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true
  if (typeof left !== 'object' || typeof right !== 'object' || left === null || right === null)
    return false
  if (Array.isArray(left) !== Array.isArray(right)) return false
  const a = new Map<string, unknown>(Object.entries(left))
  const b = new Map<string, unknown>(Object.entries(right))
  if (a.size !== b.size) return false
  return [...a].every(([name, value]) => b.has(name) && same(value, b.get(name)))
}

const unlisted = (what: string): ReaderEligibilityResult => ({
  kind: 'unavailable',
  diagnostic: `The scripted handoff lists no ${what} for this request`,
})

/** A handoff that answers only what the script lists; an eligibility is never a default. */
export function createScriptedReaderEligibility<P>(
  script: ReaderEligibilityScript<P>,
): ReaderEligibilityHandoff<P> {
  return {
    async current(request) {
      const binding = script.scopes.find(entry => entry.scope.ref === request.scope.ref)
      if (binding === undefined) return unlisted('scope binding')
      if (!tenantEquals(binding.tenant, request.tenant)) return { kind: 'refused' }
      const hit = script.answers.find(
        entry =>
          same(entry.request.principal, request.principal) &&
          tenantEquals(entry.request.tenant, request.tenant) &&
          entry.request.scope.ref === request.scope.ref &&
          entry.request.consumer === request.consumer,
      )
      return hit === undefined ? unlisted('answer') : hit.result
    },
  }
}

export interface ReaderEligibilityFixture<P> {
  readonly handoff: ReaderEligibilityHandoff<P>
  /** A request that the holder answers with `eligibility` as current. */
  readonly held: Readonly<{ request: ReaderEligibilityRequest<P>; eligibility: EligibilityId }>
  /** A tenant that the scope of `held` does not belong to. */
  readonly otherTenant: TenantId
}
export type ReaderEligibilityCase = Readonly<{
  name: string
  clause: string
  run(): Promise<void>
}>

function expectThat(condition: boolean, message: string): void {
  if (!condition) throw new Error(message)
}
function names(result: ReaderEligibilityResult, eligibility: EligibilityId): boolean {
  return result.kind === 'current' && result.eligibility.eligibility === eligibility.eligibility
}

const cases = <P>(fixture: ReaderEligibilityFixture<P>): ReaderEligibilityCase[] => [
  {
    name: 'held-eligibility-is-current',
    clause: 'K-RC: the holder answers the eligibility it holds for the request as current',
    async run() {
      const result = await fixture.handoff.current(fixture.held.request)
      expectThat(names(result, fixture.held.eligibility), `expected current, got ${result.kind}`)
    },
  },
  {
    name: 'other-tenant-is-refused',
    clause: 'K-RC: a tenant that the scope does not belong to is refused',
    async run() {
      const request = { ...fixture.held.request, tenant: fixture.otherTenant }
      const result = await fixture.handoff.current(request)
      expectThat(result.kind === 'refused', `expected refused, got ${result.kind}`)
    },
  },
  {
    name: 'other-consumer-gets-no-held-eligibility',
    clause: 'K-RC: the eligibility of one consumer class is not handed to another',
    async run() {
      const consumer: ConsumerClass = fixture.held.request.consumer === 'model' ? 'tool' : 'model'
      const result = await fixture.handoff.current({ ...fixture.held.request, consumer })
      expectThat(
        !names(result, fixture.held.eligibility),
        `the ${consumer} consumer received the held eligibility`,
      )
    },
  },
]

/** The cases of the handoff suite; run each one and report it by `name`. */
export function readerEligibilityConformance<P>(
  fixture: ReaderEligibilityFixture<P>,
): readonly ReaderEligibilityCase[] {
  return cases(fixture)
}
