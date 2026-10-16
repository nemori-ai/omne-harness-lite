import { functionMetrics, type FunctionMetric } from '../metrics/complexity.ts'
import { productSource } from './resolve.ts'
import { extractArchitecture } from './extract.ts'
import {
  readArchitectureSource,
  type ActualMember,
  type ArchitectureSource,
  type SourceCoordinates,
} from './source.ts'
import type { Fact, ImportUnknown, PackageImport, Site, Unknown } from './actual-model.ts'
import { actualFactIdentity } from './actual-model.ts'

export type { ActualMember, SourceCoordinates, JsonValue, ArchitectureSource } from './source.ts'
export { readArchitectureSource } from './source.ts'
export type { Fact, FactKind, Site, PackageImport, Unknown, ImportUnknown } from './actual-model.ts'
export { buildArchitectureView, selectArchitectureView, RELATIONS } from './view.ts'
export type {
  ArchitectureView,
  ViewNode,
  ViewEdge,
  ViewSelection,
  SelectedArchitecture,
} from './view.ts'

export interface ActualArchitectureInput {
  /** Git repository top-level directory. A pnpm workspace and named manifests are required. */
  readonly root: string
  /** Absent means current filesystem, including uncommitted files. Otherwise read only this commit. */
  readonly revision?: string
  /** Exact comparison revision; never replaced by a merge-base. */
  readonly base?: string
}
export interface ObservedFact extends Fact {
  readonly occurrences: readonly Fact[]
}
export interface ObservedImport extends PackageImport {
  readonly occurrences: readonly PackageImport[]
}
export interface ObservedUnknown {
  readonly id: string
  readonly occurrences: readonly (Unknown | ImportUnknown)[]
}
export interface ActualArchitecture {
  readonly source: SourceCoordinates
  readonly members: readonly ActualMember[]
  readonly scope: {
    readonly workspacePatterns: readonly string[]
    readonly productMembers: readonly string[]
    readonly developmentMembers: readonly string[]
    readonly analyzedFiles: readonly string[]
    readonly configuration: {
      readonly read: readonly string[]
      readonly appliedToResolution: readonly string[]
      /** Package-name extends that were not applied, as `<config> -> <specifier>`. */
      readonly installedExtends: readonly string[]
      readonly policy: string
    }
    readonly limitations: readonly string[]
  }
  readonly facts: readonly ObservedFact[]
  readonly imports: readonly ObservedImport[]
  readonly unknown: readonly ObservedUnknown[]
  readonly serviceIdentifiers: {
    readonly attempted: number
    readonly unresolved: number
    readonly rate: number
  }
  readonly candidateProviders: readonly {
    readonly key: string
    readonly facts: readonly string[]
    readonly runtimeSelection: 'not-observed'
  }[]
  readonly complexity: {
    readonly state: 'data'
    readonly algorithm: 'functionMetrics'
    readonly functions: readonly (FunctionMetric & Site & { readonly member: string })[]
  }
  readonly coverage: { readonly state: 'no-data'; readonly reason: string }
}
export interface IdentityDifference<T> {
  readonly added: readonly T[]
  readonly removed: readonly T[]
}
export interface ActualArchitectureDifference {
  readonly from: string
  readonly to: string
  readonly members: IdentityDifference<ActualMember>
  readonly facts: IdentityDifference<ObservedFact>
  readonly imports: IdentityDifference<ObservedImport>
  readonly unknown: IdentityDifference<ObservedUnknown>
}
export interface ActualArchitectureDocument {
  readonly schemaVersion: 1
  readonly kind: 'actual-architecture'
  readonly generatedAt: string
  readonly current: ActualArchitecture
  readonly baseline?: ActualArchitecture
  readonly difference?: ActualArchitectureDifference
}

function observations<T extends { readonly id: string }>(
  items: readonly T[],
): (T & { readonly occurrences: readonly T[] })[] {
  const groups = new Map<string, T[]>()
  for (const item of items) {
    const group = groups.get(item.id)
    if (group === undefined) groups.set(item.id, [item])
    else group.push(item)
  }
  return [...groups]
    .sort(([a], [b]) => a.localeCompare(b))
    .flatMap(([, occurrences]) => {
      const first = occurrences[0]
      return first === undefined ? [] : [{ ...first, occurrences }]
    })
}
function unknownIdentity(value: Unknown | ImportUnknown): string {
  if (value.kind === 'import') return value.id
  return JSON.stringify([
    value.member,
    value.plugin ?? '',
    value.scope,
    value.kind,
    value.expression,
    value.reason,
  ])
}
function unknownObservations(items: readonly (Unknown | ImportUnknown)[]): ObservedUnknown[] {
  const groups = new Map<string, (Unknown | ImportUnknown)[]>()
  for (const item of items) {
    const id = unknownIdentity(item),
      group = groups.get(id)
    if (group === undefined) groups.set(id, [item])
    else group.push(item)
  }
  return [...groups]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([id, occurrences]) => ({ id, occurrences }))
}
function candidates(facts: readonly ObservedFact[]): ActualArchitecture['candidateProviders'] {
  const groups = new Map<string, string[]>()
  for (const fact of facts) {
    if (fact.kind !== 'provides') continue
    const group = groups.get(fact.key)
    if (group === undefined) groups.set(fact.key, [fact.id])
    else group.push(fact.id)
  }
  return [...groups]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, facts]) => ({ key, facts, runtimeSelection: 'not-observed' }))
}
/** Project the shared AST extraction; never read intent or execute product code. */
export function actualArchitectureOf(input: ArchitectureSource): ActualArchitecture {
  const extraction = extractArchitecture(input.snapshot)
  const products = input.members.filter(member => member.category === 'product')
  const files = products.flatMap(member =>
    member.sources
      .filter(productSource)
      .map(path => ({ path, member: member.path, text: input.snapshot.texts.get(path) })),
  )
  const facts = observations(
    extraction.factOccurrences.map(fact => ({ ...fact, id: actualFactIdentity(fact) })),
  )
  return {
    source: input.source,
    members: input.members,
    scope: {
      workspacePatterns: input.patterns,
      productMembers: products.map(member => member.path),
      developmentMembers: input.members
        .filter(member => member.category === 'development')
        .map(member => member.path),
      analyzedFiles: files.map(file => file.path).sort(),
      configuration: {
        read: [
          ...new Set([...input.discoveredConfigurationFiles, ...extraction.configurationFiles]),
        ].sort(),
        appliedToResolution: extraction.configurationFiles,
        installedExtends: extraction.installedExtends,
        policy:
          'Each importer uses its member tsconfig.json, then tsconfig.build.json, then root tsconfig.json or tsconfig.base.json; extends and module-resolution options use only this version. Workspace manifest exports supply source aliases. All selected product src TypeScript files are analyzed regardless of include/exclude.',
      },
      limitations: [
        'Static TypeScript AST only; no product execution, runtime provider selection, process or external resource observation.',
        'Development members are listed and available for static resolution, but are not independently analyzed. Product tests are excluded.',
        'No installed modules or standard library are loaded. Workspace dist exports are projected to matching src TypeScript paths; missing source and computed expressions may remain unknown.',
        'Configuration participates in static module resolution, not a compiler build: include/exclude, project-reference builds, runtime condition selection and type-checking correctness are not reproduced. Package-name extends point at installed modules; they are listed under configuration.installedExtends and their options are not applied.',
        'Import observations cover ESM import/export, empty named clauses, dynamic imports and TypeScript import types; CommonJS require calls are outside this extractor.',
        'Root task containers and node_modules are excluded. Workspace member dist/coverage build directories are excluded from resolution; same-named members and src directories remain inputs.',
        'No tenant isolation, transaction, lifecycle or resource ownership guarantee is inferred.',
      ],
    },
    facts,
    imports: observations(extraction.packageImports),
    unknown: unknownObservations([...extraction.unknown, ...extraction.importUnknown]),
    serviceIdentifiers: extraction.serviceIdentifiers,
    candidateProviders: candidates(facts),
    complexity: {
      state: 'data',
      algorithm: 'functionMetrics',
      functions: files.flatMap(file => {
        if (file.text === undefined) throw new Error(`Missing selected source ${file.path}`)
        return functionMetrics({ path: file.path, text: file.text }).map(metric => ({
          ...metric,
          path: file.path,
          member: file.member,
        }))
      }),
    },
    coverage: {
      state: 'no-data',
      reason: 'No test coverage artifact was supplied or executed by this static reader',
    },
  }
}
function identityDifference<T extends { readonly id: string }>(
  before: readonly T[],
  after: readonly T[],
): IdentityDifference<T> {
  const old = new Set(before.map(item => item.id)),
    next = new Set(after.map(item => item.id))
  return {
    added: after.filter(item => !old.has(item.id)),
    removed: before.filter(item => !next.has(item.id)),
  }
}
/** Positions and occurrence counts are evidence, not semantic relationship identity. */
export function compareActualArchitectures(
  before: ActualArchitecture,
  after: ActualArchitecture,
): ActualArchitectureDifference {
  return {
    from: before.source.commit,
    to: after.source.commit,
    members: identityDifference(before.members, after.members),
    facts: identityDifference(before.facts, after.facts),
    imports: identityDifference(before.imports, after.imports),
    unknown: identityDifference(before.unknown, after.unknown),
  }
}
export function readActualArchitecture(input: ActualArchitectureInput): ActualArchitectureDocument {
  const current = actualArchitectureOf(readArchitectureSource(input.root, input.revision))
  const generatedAt = new Date().toISOString()
  if (input.base === undefined)
    return { schemaVersion: 1, kind: 'actual-architecture', generatedAt, current }
  const baseline = actualArchitectureOf(readArchitectureSource(input.root, input.base))
  return {
    schemaVersion: 1,
    kind: 'actual-architecture',
    generatedAt,
    current,
    baseline,
    difference: compareActualArchitectures(baseline, current),
  }
}
