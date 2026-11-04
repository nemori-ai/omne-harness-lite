// One journey over a real directory of Skill packages, through the public entries of the three
// Skill members: `createDirectorySource` of this member gives the bytes; `createPackageInspection`
// of `@omne-harness/skill` checks every package; `createSkillCatalog` lists and searches what the
// reader may read; `createSkillAccess` describes the first Skill found and reads the first page
// of its body on the material that `describe` pinned. The read check and the resolution are not
// products of any member: the caller gives them through `standIns`, built from the packages that
// passed inspection (the tests give the memory doubles of `@omne-harness/skill-contract/testing`).
// This is an example, not a product assembly: a real integrator owns the read right and the
// lawful set.
//
// It runs as the test `tests/examples.spec.ts`: `pnpm test examples` in the member directory
// after `pnpm run build`.
import { readdir } from 'node:fs/promises'
import { join } from 'node:path'
import type { Access } from '@omne-harness/legal-identity'
import type { Outcome } from '@omne-harness/operation-result'
import {
  createPackageInspection,
  createSkillAccess,
  createSkillCatalog,
  type SkillPorts,
} from '@omne-harness/skill'
import type {
  CatalogEntry,
  DeclaredProjection,
  DescribeFailure,
  InspectFailure,
  ReadFailure,
  ReadResult,
  SkillDefinition,
  SkillDescription,
} from '@omne-harness/skill-contract'
import { createDirectorySource } from '@omne-harness/skill-host-local'

/** One package directory under the root and what `inspect` answered for it. */
export type Inspection = Readonly<{
  /** The directory name under the root. */
  name: string
  /** The absolute path of the package directory. */
  root: string
  outcome: Outcome<SkillDefinition, InspectFailure>
}>

/** A package that passed inspection. */
export type InspectedPackage = Readonly<{ name: string; root: string; definition: SkillDefinition }>

/** The principal who takes the journey, and the scope. */
export type Reader<P, S> = Readonly<{ access: Access<P>; scope: S }>

/** The two judging ports, built by the caller from the packages that passed inspection. */
export type StandIns<P, S> = (
  packages: readonly InspectedPackage[],
) => Pick<SkillPorts<P, S>, 'readCheck' | 'resolution'>

export type JourneyOptions<P, S> = Readonly<{
  reader: Reader<P, S>
  standIns: StandIns<P, S>
  /** The text that `search` looks for. */
  query: string
}>

export type Journey = Readonly<{
  /** Every directory under the root, by name, with its inspection outcome. */
  inspected: readonly Inspection[]
  /** The summaries of the Skills that the reader may read. */
  summaries: Outcome<readonly CatalogEntry[], 'unknown'>
  /** The result of `search` for the query. */
  search: Outcome<readonly CatalogEntry[], 'unknown'>
  /** `describe` of the first adopted Skill that `search` found; absent when it found none. */
  described?: Outcome<SkillDescription, DescribeFailure>
  /** The first page of its body, on the material that `describe` pinned; absent when `search`
   * found none or `describe` failed. */
  firstPage?: Outcome<ReadResult, ReadFailure>
}>

/** The declaration projection of a definition, as a resolution would give it back for an adopted Skill. */
export function declaredOf(definition: SkillDefinition): DeclaredProjection {
  const { manifest, declaration } = definition
  return {
    name: manifest.name,
    description: manifest.description,
    tools: declaration.dependencies,
    scripts: declaration.scripts,
    settings: declaration.settings,
  }
}

function firstAdopted(
  found: Outcome<readonly CatalogEntry[], 'unknown'>,
): CatalogEntry | undefined {
  return 'ok' in found ? found.ok.find(entry => entry.kind === 'adopted') : undefined
}

export async function runDirectoryJourney<P, S>(
  root: string,
  options: JourneyOptions<P, S>,
): Promise<Journey> {
  const { reader, standIns, query } = options
  const source = createDirectorySource()
  const inspection = createPackageInspection(source)

  // Step 1: inspect every directory under the root. A package that cannot be read is a rejection,
  // not a gap.
  const names = (await readdir(root, { withFileTypes: true }))
    .filter(item => item.isDirectory())
    .map(item => item.name)
    .sort()
  const inspected: Inspection[] = []
  for (const name of names) {
    const packageRoot = join(root, name)
    const outcome = await inspection.inspect({ kind: 'directory', root: packageRoot })
    inspected.push({ name, root: packageRoot, outcome })
  }
  const legal = inspected.flatMap(item =>
    'ok' in item.outcome ? [{ name: item.name, root: item.root, definition: item.outcome.ok }] : [],
  )

  // Step 2: the catalog and the access over the stand-ins and the same source.
  const ports = standIns(legal)
  const catalog = createSkillCatalog(ports)
  const access = createSkillAccess({ ...ports, source })
  const summaries = await catalog.summaries(reader.access, reader.scope)
  const search = await catalog.search(reader.access, reader.scope, { text: query })

  // Step 3: describe the first Skill that the search found, then read the first page of its body
  // on the material that `describe` pinned. Without a pinned material the read goes without a
  // basis, and the service says what that is.
  const entry = firstAdopted(search)
  if (entry === undefined) return { inspected, summaries, search }
  const described = await access.describe(reader.access, reader.scope, entry.capability)
  if (!('ok' in described)) return { inspected, summaries, search, described }
  const { material } = described.ok
  const firstPage = await access.read(
    reader.access,
    reader.scope,
    { capability: entry.capability, part: { kind: 'body' } },
    material.kind === 'pinned' ? { basis: material.basis } : undefined,
  )
  return { inspected, summaries, search, described, firstPage }
}
