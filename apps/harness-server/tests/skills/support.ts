import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { capabilityId, createCategoryPoint, type PackageReader } from '@omne-harness/assets'
import { createAssetsLocal, publishedRef } from '@omne-harness/assets-local'
import { skillBodyContract, skillCategoryDisplay } from '@omne-harness/skill-contract'
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

export type PublishPlace = Readonly<{
  storage: SqlStorage
  materials: SqlMaterialCatalog
  domain: DomainRef
  packageRoot: string
}>

export type PublishInput = PublishPlace & Readonly<{ dir: string; name: string; enabled?: boolean }>

export type SkillPublisher = Readonly<{
  publish(dir: string, name: string, enabled?: boolean): Promise<string>
  close(): Promise<void>
}>

export function skillCategories() {
  const point = createCategoryPoint()
  point.contribute({ contract: skillBodyContract(), display: skillCategoryDisplay })
  return point
}

/** Publishes Skill directories into a tenant domain and holds them, the way the assets owner does. */
export async function openSkillPublisher(place: PublishPlace): Promise<SkillPublisher> {
  const combination = governanceStorageCombinations(place.materials).assets
  const registered = await place.storage.registerCombination({ ...place.domain, ...combination })
  if (registered.kind !== 'registered') throw new Error(JSON.stringify(registered))
  const assets = createAssetsLocal({
    ...combination,
    domain: place.domain,
    storage: place.storage,
    categories: skillCategories(),
    packageRoot: domainRoot(place.packageRoot, place.domain),
  })
  const tenant = place.domain.scope.kind === 'tenant' ? place.domain.scope.tenant : 'system'
  return {
    async publish(dir, name, enabled = true) {
      const made = capabilityId('skill', name)
      if (!made.ok) throw new Error(`not a Skill name: ${name}`)
      const published = await assets.packages.publish({
        capability: made.id,
        from: directoryReader(dir),
        operationId: `publish-${name}-${Date.now()}`,
        holding: {
          sources: [
            {
              sourceId: 'tenant',
              ownerRef: tenant,
              scope: { kind: 'owner', subjectRef: 'skills' },
            },
          ],
          grants: [],
        },
      })
      if (published.kind !== 'published') throw new Error(JSON.stringify(published))
      if (!enabled) {
        const disabled = await assets.changeHolding({
          operationId: `disable-${name}-${Date.now()}`,
          holdingRef: publishedRef(made.id),
          scopeRef: tenant,
          expectedRevision: 1,
          change: { kind: 'setEnabled', enabled: false },
        })
        if (disabled.kind !== 'committed') throw new Error(JSON.stringify(disabled))
      }
      return published.version
    },
    close: () => assets.close(),
  }
}

export async function publishSkill(input: PublishInput): Promise<string> {
  const publisher = await openSkillPublisher(input)
  try {
    return await publisher.publish(input.dir, input.name, input.enabled)
  } finally {
    await publisher.close()
  }
}
