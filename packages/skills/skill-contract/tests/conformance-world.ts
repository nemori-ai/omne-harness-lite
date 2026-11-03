// One small world for the conformance suites: two principals, an adopted Skill with an earlier
// version, a stand-in, and a capability that exists for nobody. The memory doubles of `./testing`
// hold it; the violating variants in `fixtures/violations` wrap the same doubles.
import { capabilityId, type CapabilityId } from '@omne-harness/assets'
import {
  access,
  accountCodec,
  organizationCodec,
  tenant,
  type Access,
} from '@omne-harness/legal-identity'
import {
  toAssetVersion,
  toSafeReason,
  toSkillName,
  type DeclaredProjection,
  type SkillMaterialBasis,
} from '@omne-harness/skill-contract'
import type { PackageLocator, SkillRef } from '@omne-harness/skill-contract/provider'
import {
  createMemoryReadCheck,
  createMemoryResolution,
  createMemorySource,
  type MemoryMaterial,
} from '@omne-harness/skill-contract/testing'
import { buildPackage } from './package-builder.ts'

export type Principal = 'alice' | 'mallory'
export type Scope = 'workspace-a'

function ok<T>(result: { ok: T } | { failure: unknown }): T {
  if (!('ok' in result)) throw new Error(JSON.stringify(result.failure))
  return result.ok
}

function capability(name: string): CapabilityId {
  const id = capabilityId('skill', name)
  if (!id.ok) throw new Error(name)
  return id.id
}

const org = organizationCodec.parse('org_0123456789abcdefghjkmnpqrs')
const acc = accountCodec.parse('acc_0123456789abcdefghjkmnpqrs')
if (!org.ok || !acc.ok) throw new Error('the test tenant texts are not legal')
const home = tenant(org.value, acc.value)

export const alice: Access<Principal> = access('alice', home)
export const mallory: Access<Principal> = access('mallory', home)
export const scope: Scope = 'workspace-a'

export const reviewCapability = capability('review')
export const retiredCapability = capability('retired')
export const missingCapability = capability('nobody-has-this')

const currentFiles = {
  'SKILL.md': '---\nname: review\ndescription: Reviews a change.\n---\nRead the diff.\n',
  'scripts/run.sh': 'echo review\n',
}
const earlierFiles = {
  'SKILL.md': '---\nname: review\ndescription: Reviews a change.\n---\nOld body.\n',
}

export const reviewLocator: PackageLocator = { kind: 'directory', root: '/skills/review' }
export const missingLocator: PackageLocator = { kind: 'directory', root: '/skills/none' }

const current = buildPackage('review', currentFiles).snapshot
const earlier = buildPackage('review', earlierFiles).snapshot

const declared: DeclaredProjection = {
  name: ok(toSkillName('review')),
  description: 'Reviews a change.',
  tools: [],
  scripts: [],
  settings: [],
}

function material(digest: SkillRef['digest'], version: string): MemoryMaterial {
  const ref: SkillRef = {
    capability: reviewCapability,
    layer: 'tenant',
    assetVersion: ok(toAssetVersion(version)),
    locator: reviewLocator,
    ...(digest === undefined ? {} : { digest }),
  }
  return { ref, declared }
}

const onlyAlice = (who: Access<Principal>) => who.principal === 'alice'

export function memorySource() {
  return createMemorySource([{ locator: reviewLocator, rootName: 'review', files: currentFiles }])
}

export function memoryResolution() {
  return createMemoryResolution<Principal, Scope>([
    {
      capability: reviewCapability,
      visible: onlyAlice,
      state: {
        kind: 'adopted',
        current: material(current.digest, 'v2'),
        earlier: [material(earlier.digest, 'v1')],
      },
    },
    {
      capability: retiredCapability,
      visible: onlyAlice,
      state: {
        kind: 'known-unavailable',
        name: ok(toSkillName('retired')),
        description: 'Was disabled.',
        reason: ok(toSafeReason('Disabled by the organization.')),
      },
    },
  ])
}

export function memoryReadCheck() {
  return createMemoryReadCheck<Principal, Scope>([
    { capability: reviewCapability, visible: onlyAlice },
    { capability: retiredCapability, visible: onlyAlice },
  ])
}

export const resolutionSamples = {
  permitted: { access: alice, scope },
  refused: { access: mallory, scope },
  adopted: reviewCapability,
  missing: missingCapability,
  standIn: retiredCapability,
}

export const readCheckSamples = {
  permitted: { access: alice, scope },
  refused: { access: mallory, scope },
  readable: reviewCapability,
  missing: missingCapability,
}

export const sourceSamples = { present: reviewLocator, absent: missingLocator }

/** A basis of the earlier, still lawful version of `review`. */
export const earlierBasis: SkillMaterialBasis = {
  capability: reviewCapability,
  layer: 'tenant',
  assetVersion: ok(toAssetVersion('v1')),
  digest: earlier.digest,
}
