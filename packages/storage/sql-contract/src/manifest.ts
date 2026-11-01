// Combination validity, manifest and manifest digest (SPEC 4.3, 4.4). All three are pure.
import { canonicalJson, sha256Hex } from './canonical.ts'
import type {
  CombinationManifest,
  CombinationManifestResult,
  CombinationProblem,
  FactKey,
  ManifestMigration,
  ManifestParticipant,
  MigrationDescriptor,
  MigrationRef,
  ParticipantDescriptor,
  SqlMaterialCatalog,
} from './types.ts'

/** UTF-16 code unit order, the order that every list of the manifest uses. */
function compare(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0
}

const byText = (list: readonly string[]): string[] => [...list].sort(compare)
const byFact = (a: FactKey, b: FactKey): number =>
  compare(a.key, b.key) || compare(a.protocol, b.protocol)
const byRef = (a: MigrationRef, b: MigrationRef): number =>
  compare(a.owner, b.owner) || compare(a.id, b.id)
const factId = (fact: FactKey): string => JSON.stringify([fact.key, fact.protocol])
const refId = (ref: MigrationRef): string => JSON.stringify([ref.owner, ref.id])
const sortedFacts = (facts: readonly FactKey[]): FactKey[] =>
  facts.map(fact => ({ key: fact.key, protocol: fact.protocol })).sort(byFact)

/**
 * Strongly connected components with more than one node, or with a self edge. Each component is
 * sorted and the list is sorted by its first member, so the result does not depend on input order.
 */
function cycles(
  nodes: readonly string[],
  edges: ReadonlyMap<string, readonly string[]>,
): string[][] {
  const index = new Map<string, number>()
  const low = new Map<string, number>()
  const onStack = new Set<string>()
  const stack: string[] = []
  const found: string[][] = []
  let counter = 0
  const visit = (node: string): void => {
    index.set(node, counter)
    low.set(node, counter)
    counter += 1
    stack.push(node)
    onStack.add(node)
    for (const next of edges.get(node) ?? []) {
      if (!index.has(next)) {
        visit(next)
        low.set(node, Math.min(low.get(node) as number, low.get(next) as number))
      } else if (onStack.has(next)) {
        low.set(node, Math.min(low.get(node) as number, index.get(next) as number))
      }
    }
    if (low.get(node) !== index.get(node)) return
    const component: string[] = []
    for (let top = stack.pop(); top !== undefined; top = stack.pop()) {
      onStack.delete(top)
      component.push(top)
      if (top === node) break
    }
    const selfEdge = (edges.get(node) ?? []).includes(node)
    if (component.length > 1 || selfEdge) found.push(component.sort(compare))
  }
  for (const node of nodes) if (!index.has(node)) visit(node)
  return found.sort((a, b) => compare(a[0] as string, b[0] as string))
}

function factProblems(selected: readonly ParticipantDescriptor[]): CombinationProblem[] {
  const providers = new Map<string, string[]>()
  const facts = new Map<string, FactKey>()
  for (const descriptor of selected)
    for (const fact of descriptor.providesFacts) {
      providers.set(factId(fact), [...(providers.get(factId(fact)) ?? []), descriptor.participant])
      facts.set(factId(fact), fact)
    }
  const edges = new Map<string, string[]>()
  for (const descriptor of selected)
    for (const fact of descriptor.requiresFacts)
      for (const provider of providers.get(factId(fact)) ?? [])
        edges.set(provider, [...(edges.get(provider) ?? []), descriptor.participant])
  const problems: CombinationProblem[] = cycles(
    selected.map(descriptor => descriptor.participant),
    edges,
  ).map(participants => ({ kind: 'fact_cycle', participants }))
  for (const descriptor of selected)
    for (const fact of sortedFacts(descriptor.requiresFacts))
      if (!providers.has(factId(fact)))
        problems.push({ kind: 'fact_unprovided', participant: descriptor.participant, fact })
  const twice = [...providers.entries()].filter(([, names]) => names.length > 1)
  for (const [id, names] of twice.sort(([a], [b]) =>
    byFact(facts.get(a) as FactKey, facts.get(b) as FactKey),
  ))
    problems.push({
      kind: 'fact_provided_twice',
      fact: { key: (facts.get(id) as FactKey).key, protocol: (facts.get(id) as FactKey).protocol },
      participants: byText(names),
    })
  return problems
}

function tableProblems(selected: readonly ParticipantDescriptor[]): CombinationProblem[] {
  const owners = new Map<string, string[]>()
  for (const descriptor of selected)
    for (const table of new Set(descriptor.ownedTables))
      owners.set(table, [...(owners.get(table) ?? []), descriptor.participant])
  const problems: CombinationProblem[] = []
  for (const table of byText([...owners.keys()])) {
    const names = owners.get(table) as string[]
    if (names.length > 1)
      problems.push({ kind: 'table_owned_twice', table, participants: byText(names) })
  }
  for (const descriptor of selected)
    for (const table of byText(descriptor.readTables))
      if (!owners.has(table))
        problems.push({ kind: 'read_table_unowned', participant: descriptor.participant, table })
  return problems
}

/** The migrations of the selected participants and everything that their requires reach. */
function migrationClosure(
  catalog: SqlMaterialCatalog,
  selected: readonly ParticipantDescriptor[],
): Readonly<{ migrations: MigrationDescriptor[]; problems: CombinationProblem[] }> {
  const known = new Map(catalog.migrations.map(item => [refId(item), item]))
  const names = new Set(selected.map(descriptor => descriptor.participant))
  const included = new Map<string, MigrationDescriptor>()
  const missing = new Map<string, MigrationRef>()
  const pending = catalog.migrations.filter(item => names.has(item.owner))
  for (let next = pending.pop(); next !== undefined; next = pending.pop()) {
    if (included.has(refId(next))) continue
    included.set(refId(next), next)
    for (const required of next.requires) {
      const found = known.get(refId(required))
      if (found === undefined)
        missing.set(refId(required), { owner: required.owner, id: required.id })
      else pending.push(found)
    }
  }
  const problems: CombinationProblem[] = [...missing.values()]
    .sort(byRef)
    .map(required => ({ kind: 'migration_missing', required }))
  const edges = new Map<string, string[]>()
  for (const item of included.values())
    edges.set(
      refId(item),
      item.requires.map(refId).filter(id => included.has(id)),
    )
  for (const component of cycles([...included.keys()], edges))
    problems.push({
      kind: 'migration_cycle',
      migrations: component
        .map(id => included.get(id) as MigrationDescriptor)
        .map(item => ({ owner: item.owner, id: item.id }))
        .sort(byRef),
    })
  return { migrations: [...included.values()], problems }
}

function manifestParticipant(descriptor: ParticipantDescriptor): ManifestParticipant {
  return {
    participant: descriptor.participant,
    protocol: descriptor.protocol,
    codeDigest: descriptor.codeDigest,
    ownedTables: byText(descriptor.ownedTables),
    readTables: byText(descriptor.readTables),
    requiresFacts: sortedFacts(descriptor.requiresFacts),
    providesFacts: sortedFacts(descriptor.providesFacts),
    allowedFunctions: byText(descriptor.allowedFunctions),
    grouping: descriptor.grouping,
  }
}

function manifestMigration(item: MigrationDescriptor): ManifestMigration {
  return {
    owner: item.owner,
    id: item.id,
    checksum: item.checksum,
    requires: item.requires.map(ref => ({ owner: ref.owner, id: ref.id })).sort(byRef),
  }
}

/**
 * Judges a combination and builds the digest input (SPEC 4.3). A participant that the catalog lacks
 * is reported first, alone. Otherwise every problem of the combination is collected in one result.
 */
export function combinationManifest(
  input: Readonly<{ catalog: SqlMaterialCatalog; participants: readonly string[] }>,
): CombinationManifestResult {
  const { catalog } = input
  const selected: ParticipantDescriptor[] = []
  for (const name of byText([...new Set(input.participants)])) {
    const descriptor = catalog.participants.find(item => item.participant === name)
    if (descriptor === undefined) return { kind: 'material_unavailable', participant: name }
    selected.push(descriptor)
  }
  const closure = migrationClosure(catalog, selected)
  const problems = [...factProblems(selected), ...tableProblems(selected), ...closure.problems]
  // The order of the kinds is the order of SPEC 4.3. migration_missing comes before cycles.
  const rank = (problem: CombinationProblem): number =>
    [
      'fact_cycle',
      'fact_unprovided',
      'fact_provided_twice',
      'table_owned_twice',
      'read_table_unowned',
      'migration_missing',
      'migration_cycle',
    ].indexOf(problem.kind)
  if (problems.length > 0)
    return {
      kind: 'combination_invalid',
      problems: problems
        .map((problem, position) => ({ problem, position }))
        .sort((a, b) => rank(a.problem) - rank(b.problem) || a.position - b.position)
        .map(({ problem }) => problem),
    }
  return {
    kind: 'manifest',
    manifest: {
      manifestProtocol: 'sql-manifest/1',
      participants: selected.map(manifestParticipant),
      migrations: closure.migrations.map(manifestMigration).sort(byRef),
    },
  }
}

/** Lowercase hex SHA-256 of the RFC 8785 UTF-8 text of the manifest (SPEC 4.4). */
export function manifestDigest(manifest: CombinationManifest): string {
  return sha256Hex(canonicalJson(manifest))
}
