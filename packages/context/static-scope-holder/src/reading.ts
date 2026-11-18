import type { TenantId } from '@omne-harness/legal-identity'
import { succeed, type Outcome } from '@omne-harness/operation-result'
import type {
  ContextReader,
  NeedBindingRef,
  RuntimeContextOperations,
  ScopeRef,
  StaticRead,
  StaticReaderGrant,
  StaticReaderRequest,
  StaticScopeFailure,
} from '@omne-harness/runtime-context-contract'
import { refusal, unavailable } from './answers.ts'
import type { Content } from './content.ts'
import type { Held } from './registering.ts'

export type Ensured = Readonly<{ scope: ScopeRef; state: Held; content: Content }>
type Reading<P> = Readonly<{
  principal: P
  tenant: TenantId
  reader: StaticReaderRequest
  ensured: Ensured
}>
type Bound = Readonly<{ granted: string; context: ContextReader }>

// What a reader may read now: the registered blocks it names, and what its needs give it.
function readableBy(content: Content, reader: StaticReaderRequest) {
  const keys = new Set(reader.blocks.filter(key => content.has(key)))
  const bindings: NeedBindingRef[] = []
  const bound = new Set<string>()
  for (const [key, entry] of content)
    for (const { need, translate } of entry.bindings) {
      if (!reader.needs.includes(need.name) || need.consumer !== reader.consumer) continue
      bound.add(need.name)
      if (translate === undefined) keys.add(key)
      else bindings.push({ need: need.name, key })
    }
  const missing = {
    blocks: reader.blocks.filter(key => !content.has(key)),
    needs: reader.needs.filter(name => !bound.has(name)),
  }
  return { material: { keys: [...keys], bindings }, missing }
}

export function createReading<P>(runtime: RuntimeContextOperations<P>) {
  const kept = new WeakMap<StaticReaderRequest, Map<string, Bound>>()

  async function grant(
    reading: Reading<P>,
  ): Promise<Outcome<StaticReaderGrant, StaticScopeFailure>> {
    const { principal, tenant, reader, ensured } = reading
    const { material, missing } = readableBy(ensured.content, reader)
    const issued = await runtime.issueEligibility(principal, {
      supersedes: null,
      scope: ensured.scope,
      consumer: reader.consumer,
      principal,
      tenant,
      ...material,
      registrationRevision: ensured.state.revision,
    })
    return issued.kind === 'issued'
      ? succeed({ eligibility: issued.eligibility.id, missing })
      : refusal('issueEligibility', issued)
  }

  // A reader lives while what it was granted is what the request would be granted now, and until
  // a read of it is refused: a recovery ends it.
  async function read(reading: Reading<P>): Promise<Outcome<StaticRead, StaticScopeFailure>> {
    const { reader, ensured } = reading
    const held = kept.get(reader) ?? new Map<string, Bound>()
    kept.set(reader, held)
    const { material, missing } = readableBy(ensured.content, reader)
    const granted = JSON.stringify([ensured.state.revision, material])
    for (const attempt of ['held', 'fresh'] as const) {
      const bound = attempt === 'held' ? held.get(ensured.scope.ref) : undefined
      let context = bound?.granted === granted ? bound.context : undefined
      if (context === undefined) {
        const issued = await grant(reading)
        if ('failure' in issued) return issued
        const answer = await runtime.bind(issued.ok.eligibility)
        if (answer.kind !== 'bound') return refusal('bind', answer)
        context = answer.reader
        held.set(ensured.scope.ref, { granted, context })
      }
      const snapshot = await context.snapshot()
      if (snapshot.kind === 'success')
        return succeed({ entries: snapshot.value.perRequest, missing })
      held.delete(ensured.scope.ref)
      if (snapshot.kind !== 'refused') return unavailable(`snapshot answered ${snapshot.kind}`)
    }
    return unavailable('snapshot answered refused')
  }

  return { grant, read }
}
