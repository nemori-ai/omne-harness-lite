import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { capabilityId, createCategoryRegistry, type PackageReader } from '@omne-harness/assets'
import { createAssetsLocal } from '@omne-harness/assets-local'
import { skillBodyContract } from '@omne-harness/skill-contract'
import type { PackageLocator } from '@omne-harness/skill-contract/provider'
import { createDirectorySource } from '@omne-harness/skill-host-local'
import type { DomainRef, SqlMaterialCatalog, SqlStorage } from '@omne-harness/sql-contract'
import { governanceStorageCombinations } from '../../src/rows/governance/storage-combinations.ts'
import { domainRoot } from '../../src/rows/skills/tenant-skills.ts'

export const SAMPLE_LINE = 'weekly report collected 3 changes'

export async function writeSampleSkill(
  parent: string,
  name = 'weekly-report',
  description = '生成周报：每周五汇总本周的提交与卡片。Writes the weekly report.',
): Promise<string> {
  const dir = join(parent, name)
  await mkdir(join(dir, 'scripts'), { recursive: true })
  await writeFile(
    join(dir, 'SKILL.md'),
    `---\nname: ${name}\ndescription: ${description}\n---\nRun the collector with Shell:\n\n    node <directory>/scripts/collect.mjs\n\nThen write the report from its output.\n`,
  )
  await writeFile(
    join(dir, 'scripts', 'collect.mjs'),
    `console.log(${JSON.stringify(SAMPLE_LINE)})\n`,
  )
  return dir
}

function directoryReader(root: string): PackageReader {
  const source = createDirectorySource()
  const locator: PackageLocator = { kind: 'directory', root }
  return {
    async manifest() {
      const snapshot = await source.snapshot(locator)
      if (!('ok' in snapshot)) return { failure: 'unavailable' }
      return {
        ok: {
          entries: snapshot.ok.entries.map(entry => ({
            path: entry.path,
            bytes: entry.size,
            digest: entry.digest,
          })),
        },
      }
    },
    async open(path, expected) {
      const snapshot = await source.snapshot(locator)
      if (!('ok' in snapshot)) return { failure: 'unavailable' }
      const entry = snapshot.ok.entries.find(one => one.path === path && one.digest === expected)
      if (entry === undefined) return { failure: 'entry-not-found' }
      const bytes = await source.open(locator, snapshot.ok.digest, entry.path)
      return 'ok' in bytes ? bytes : { failure: 'unavailable' }
    },
  }
}

export type PublishInput = Readonly<{
  storage: SqlStorage
  materials: SqlMaterialCatalog
  domain: DomainRef
  packageRoot: string
  dir: string
  name: string
  enabled?: boolean
}>

/** Publishes a Skill directory into a tenant domain and holds it, the way the assets owner does. */
export async function publishSkill(input: PublishInput): Promise<string> {
  const combination = governanceStorageCombinations(input.materials).assets
  const registered = await input.storage.registerCombination({ ...input.domain, ...combination })
  if (registered.kind !== 'registered') throw new Error(JSON.stringify(registered))
  const categories = createCategoryRegistry()
  categories.register(skillBodyContract())
  const assets = createAssetsLocal({
    ...combination,
    domain: input.domain,
    storage: input.storage,
    categories,
    packageRoot: domainRoot(input.packageRoot, input.domain),
  })
  try {
    const made = capabilityId('skill', input.name)
    if (!made.ok) throw new Error(`not a Skill name: ${input.name}`)
    const assetRef = `tenant/skill/${input.name}`
    const published = await assets.packages.publish({
      capability: made.id,
      assetRef,
      from: directoryReader(input.dir),
      operationId: `publish-${input.name}-${Date.now()}`,
    })
    if (published.kind !== 'published') throw new Error(JSON.stringify(published))
    const tenant = input.domain.scope.kind === 'tenant' ? input.domain.scope.tenant : 'system'
    const held = await assets.hold({
      operationId: `hold-${input.name}-${Date.now()}`,
      holdingRef: `skill.${input.name}`,
      scopeRef: tenant,
      assetRef,
      selection: { kind: 'follow' },
      sources: [
        { sourceId: 'tenant', ownerRef: tenant, scope: { kind: 'owner', subjectRef: 'skills' } },
      ],
      grants: [],
    })
    if (held.kind !== 'committed') throw new Error(JSON.stringify(held))
    if (input.enabled === false) {
      const disabled = await assets.changeHolding({
        operationId: `disable-${input.name}-${Date.now()}`,
        holdingRef: `skill.${input.name}`,
        scopeRef: tenant,
        expectedRevision: 1,
        change: { kind: 'setEnabled', enabled: false },
      })
      if (disabled.kind !== 'committed') throw new Error(JSON.stringify(disabled))
    }
    return published.version
  } finally {
    await assets.close()
  }
}
