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

export type Inspection = Readonly<{
  name: string
  root: string
  outcome: Outcome<SkillDefinition, InspectFailure>
}>

export type InspectedPackage = Readonly<{ name: string; root: string; definition: SkillDefinition }>

export type Reader<P, S> = Readonly<{ access: Access<P>; scope: S }>

export type StandIns<P, S> = (
  packages: readonly InspectedPackage[],
) => Pick<SkillPorts<P, S>, 'readCheck' | 'resolution'>

export type JourneyOptions<P, S> = Readonly<{
  reader: Reader<P, S>
  standIns: StandIns<P, S>
  query: string
}>

export type Journey = Readonly<{
  inspected: readonly Inspection[]
  summaries: Outcome<readonly CatalogEntry[], 'unknown'>
  search: Outcome<readonly CatalogEntry[], 'unknown'>
  described?: Outcome<SkillDescription, DescribeFailure>
  firstPage?: Outcome<ReadResult, ReadFailure>
}>

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

  const ports = standIns(legal)
  const catalog = createSkillCatalog(ports)
  const access = createSkillAccess({ ...ports, source })
  const summaries = await catalog.summaries(reader.access, reader.scope)
  const search = await catalog.search(reader.access, reader.scope, { text: query })

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
