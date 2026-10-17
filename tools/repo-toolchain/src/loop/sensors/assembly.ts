import { actualFactIdentity, type ActualExtraction, type Fact } from '../../arch/actual-model.ts'
import { data, noData, type Reading } from '../reading.ts'

export interface AssemblyChange {
  readonly before: readonly Fact[]
  readonly after: readonly Fact[]
}
export interface AssemblyDelta {
  readonly added: readonly Fact[]
  readonly removed: readonly Fact[]
  readonly changed: readonly AssemblyChange[]
}
export interface AssemblyObservations {
  readonly current: ActualExtraction
  readonly facts: readonly Fact[]
  readonly delta: Reading<AssemblyDelta>
}

/** Metadata is separate from identity. A contract change is observable without a new service. */
export function assemblyMetadata(fact: Fact): string {
  return JSON.stringify([
    fact.contract ?? null,
    fact.owner ?? null,
    fact.layer ?? null,
    fact.definitionForm ?? null,
    fact.provideForm ?? null,
    fact.expressionShape ?? null,
    fact.injectShape ?? null,
  ])
}
function byIdentity(extraction: ActualExtraction): Map<string, Map<string, Fact>> {
  const groups = new Map<string, Map<string, Fact>>()
  // Occurrences retain names that the old delimiter-based deduplication could collide.
  const occurrences = [...extraction.factOccurrences].sort(
    (a, b) => a.path.localeCompare(b.path) || a.line - b.line,
  )
  for (const fact of occurrences) {
    const id = actualFactIdentity(fact)
    let variants = groups.get(id)
    if (variants === undefined) {
      variants = new Map()
      groups.set(id, variants)
    }
    const metadata = assemblyMetadata(fact)
    if (!variants.has(metadata)) variants.set(metadata, fact)
  }
  return groups
}
const variantsOf = (variants: Map<string, Fact> | undefined): Fact[] =>
  [...(variants?.entries() ?? [])].sort(([a], [b]) => a.localeCompare(b)).map(([, fact]) => fact)
const flattened = (groups: Map<string, Map<string, Fact>>): Fact[] =>
  [...groups.entries()].sort(([a], [b]) => a.localeCompare(b)).flatMap(([, v]) => variantsOf(v))

/** Absence of a static fact is not proof that its runtime effect was released. */
export function observeAssembly(
  current: ActualExtraction,
  baseline?: ActualExtraction,
): AssemblyObservations {
  const after = byIdentity(current)
  if (baseline === undefined) return { current, facts: flattened(after), delta: noData('没给基线') }
  const before = byIdentity(baseline)
  const added: Fact[] = [],
    removed: Fact[] = [],
    changed: AssemblyChange[] = []
  for (const id of [...new Set([...before.keys(), ...after.keys()])].sort()) {
    const old = before.get(id),
      fresh = after.get(id)
    if (old === undefined) added.push(...variantsOf(fresh))
    else if (fresh === undefined) removed.push(...variantsOf(old))
    else if (JSON.stringify([...old.keys()].sort()) !== JSON.stringify([...fresh.keys()].sort()))
      changed.push({ before: variantsOf(old), after: variantsOf(fresh) })
  }
  return { current, facts: flattened(after), delta: data({ added, removed, changed }) }
}
