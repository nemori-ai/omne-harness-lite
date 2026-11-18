import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { capabilityId, createCategoryPoint } from '@omne-harness/assets'
import {
  createAssetsLocal,
  publishedRef,
  tenantLayerSource,
  type AssetsLocal,
} from '@omne-harness/assets-local'
import type { Access, TenantId } from '@omne-harness/legal-identity'
import { skillBodyContract, skillCategoryDisplay } from '@omne-harness/skill-contract'
import type { Resolution } from '@omne-harness/skill-contract/provider'
import {
  createDirectorySource,
  createSkillDecisions,
  skillInputsFromAssets,
} from '@omne-harness/skill-host-local'
import { directoryReader, openStorage, versionBodyOf } from './publish-journey.ts'

export type ListJourneyOptions = Readonly<{
  packageDir: string
  stateDir: string
  reader: Readonly<{ access: Access<string>; tenant: TenantId }>
}>

export type ListedResolution =
  | Readonly<{ name: string; kind: 'adopted'; layer: string }>
  | Readonly<{ name: string; kind: 'known-unavailable'; reason: string }>
  | Readonly<{ name: string; kind: Exclude<Resolution['kind'], 'adopted' | 'known-unavailable'> }>

export type ListJourney = Readonly<{
  listedBefore: readonly string[]
  resolutions: readonly ListedResolution[]
  listedAfter: readonly string[]
}>

const SCOPE = 'tenant'
type Scope = typeof SCOPE

const SECOND_SKILL = `---
name: second-skill
description: A second Skill of the tenant, published and then disabled in the list demo.
---

# Second skill

The list demo disables this Skill, so it is known but not available.
`

async function writeSecondSkill(parent: string): Promise<string> {
  const dir = join(parent, 'second-skill')
  await mkdir(dir, { recursive: true })
  await writeFile(join(dir, 'SKILL.md'), SECOND_SKILL)
  return dir
}

async function publishAndHold(
  assets: AssetsLocal,
  tenantRef: string,
  name: string,
  dir: string,
): Promise<string> {
  const made = capabilityId(skillBodyContract().category, name)
  if (!made.ok) throw new Error('not a capability identity')
  const published = await assets.packages.publish({
    capability: made.id,
    from: directoryReader(createDirectorySource(), dir),
    operationId: `publish-${name}`,
    holding: {
      sources: [
        { sourceId: 'tenant', ownerRef: tenantRef, scope: { kind: 'owner', subjectRef: 'skills' } },
      ],
      grants: [],
    },
  })
  if (published.kind !== 'published') throw new Error(JSON.stringify(published))
  return publishedRef(made.id)
}

async function changeHolding(
  assets: AssetsLocal,
  tenantRef: string,
  holdingRef: string,
  change: Readonly<{ kind: 'remove' }> | Readonly<{ kind: 'setEnabled'; enabled: boolean }>,
): Promise<void> {
  const read = await assets.readHolding({ holdingRef, scopeRef: tenantRef })
  if (read.kind !== 'holding') throw new Error(JSON.stringify(read))
  const changed = await assets.changeHolding({
    operationId: `${change.kind}-${holdingRef}`,
    holdingRef,
    scopeRef: tenantRef,
    expectedRevision: read.holding.revision,
    change,
  })
  if (changed.kind !== 'committed') throw new Error(JSON.stringify(changed))
}

function listedOf(name: string, answer: Resolution): ListedResolution {
  switch (answer.kind) {
    case 'adopted':
      return { name, kind: answer.kind, layer: answer.ref.layer }
    case 'known-unavailable':
      return { name, kind: answer.kind, reason: answer.reason }
    default:
      return { name, kind: answer.kind }
  }
}

export async function runListJourney(options: ListJourneyOptions): Promise<ListJourney> {
  const tenantRef = 'demo-tenant'
  await mkdir(options.stateDir, { recursive: true })
  const opened = await openStorage(options.stateDir, tenantRef)
  const categories = createCategoryPoint()
  categories.contribute({ contract: skillBodyContract(), display: skillCategoryDisplay })
  const assets = createAssetsLocal({
    storage: opened.storage,
    domain: opened.domain,
    combinationVersion: opened.combination.combinationVersion,
    manifestDigest: opened.combination.manifestDigest,
    categories,
    packageRoot: join(options.stateDir, 'packages'),
  })
  try {
    await publishAndHold(assets, tenantRef, 'sample-skill', options.packageDir)
    const second = await publishAndHold(
      assets,
      tenantRef,
      'second-skill',
      await writeSecondSkill(join(options.stateDir, 'source')),
    )
    await changeHolding(assets, tenantRef, second, { kind: 'setEnabled', enabled: false })

    const fromAssets = skillInputsFromAssets<string, Scope>({
      sources: [tenantLayerSource(assets)],
      body: versionBodyOf(assets),
    })
    const sameTenant = (who: Access<string>) =>
      JSON.stringify(who.tenant) === JSON.stringify(options.reader.tenant)
    const { resolution } = createSkillDecisions<string, Scope>({
      ...fromAssets,
      eligible: async who => (sameTenant(who) ? 'yes' : 'no'),
      readable: async who => (sameTenant(who) ? { kind: 'granted' } : { kind: 'refused' }),
    })
    const who = options.reader.access
    async function listed() {
      const identities = await fromAssets.identities(who, SCOPE)
      if (!('ok' in identities)) throw new Error('the Skill identities are unknown')
      return identities.ok
    }

    const before = await listed()
    const resolutions: ListedResolution[] = []
    for (const capability of before)
      resolutions.push(listedOf(capability.name, await resolution.resolve(who, SCOPE, capability)))
    await changeHolding(assets, tenantRef, second, { kind: 'remove' })
    const after = await listed()
    return {
      listedBefore: before.map(capability => capability.name),
      resolutions,
      listedAfter: after.map(capability => capability.name),
    }
  } finally {
    await assets.close()
    await opened.control.close({ initiator: 'disposal' })
  }
}
