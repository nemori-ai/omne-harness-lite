// One small world for the conformance suites: two principals, an adopted Skill with an earlier
// version, a stand-in, and a capability that exists for nobody. The memory doubles of `./testing`
// hold it; the violating variants in `conformance.spec.ts` wrap the same doubles.
import { capabilityId, type CapabilityId } from '@omne-harness/assets'
import {
  access,
  accountCodec,
  organizationCodec,
  tenant,
  type Access,
} from '@omne-harness/legal-identity'
import {
  isAssetVersion,
  isSafeReason,
  isSkillName,
  type DeclaredProjection,
  type SkillMaterialBasis,
} from '@omne-harness/skill-contract'
import type {
  PackageLocator,
  SkillReadCheck,
  SkillRef,
  SkillResolution,
} from '@omne-harness/skill-contract/provider'
import {
  createMemoryReadCheck,
  createMemoryResolution,
  createMemorySource,
  type MemoryMaterial,
  type ReadCheckFixture,
  type ResolutionFixture,
  type SourceFixture,
} from '@omne-harness/skill-contract/testing'
import { buildPackage, granted } from './package-builder.ts'

export type Principal = 'alice' | 'mallory'
export type Scope = 'workspace-a'

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
/** Adopted, but its asset body has no `package.digest`: no readable package. */
export const noPackageCapability = capability('no-package')

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
  name: granted(isSkillName, 'review'),
  description: 'Reviews a change.',
  tools: [],
  scripts: [],
  settings: [],
}

function material(digest: SkillRef['digest'], version: string): MemoryMaterial {
  const ref: SkillRef = {
    capability: reviewCapability,
    layer: 'tenant',
    assetVersion: granted(isAssetVersion, version),
    locator: reviewLocator,
    ...(digest === undefined ? {} : { digest }),
  }
  return { ref, declared }
}

const onlyAlice = (who: Access<Principal>) => who.principal === 'alice'

export const escapingLocator: PackageLocator = { kind: 'directory', root: '/skills/escaping' }

export function memorySource() {
  return createMemorySource([
    { locator: reviewLocator, rootName: 'review', files: currentFiles },
    {
      locator: escapingLocator,
      rootName: 'escaping',
      files: { 'SKILL.md': '---\nname: escaping\ndescription: d\n---\n' },
      links: { 'scripts/run.sh': '../../outside.sh' },
    },
  ])
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
      capability: noPackageCapability,
      visible: onlyAlice,
      state: {
        kind: 'adopted',
        current: {
          ref: { capability: noPackageCapability, layer: 'tenant', locator: missingLocator },
          declared: { ...declared, name: granted(isSkillName, 'no-package') },
        },
      },
    },
    {
      capability: retiredCapability,
      visible: onlyAlice,
      state: {
        kind: 'known-unavailable',
        name: granted(isSkillName, 'retired'),
        description: 'Was disabled.',
        reason: granted(isSafeReason, 'Disabled by the organization.'),
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

/** A fresh fixture of the resolution suite; `resolution` replaces the memory double. */
export function resolutionFixture(
  resolution: SkillResolution<Principal, Scope> = memoryResolution(),
): ResolutionFixture<Principal, Scope> {
  return {
    resolution,
    permitted: { access: alice, scope },
    refused: { access: mallory, scope },
    adopted: reviewCapability,
    missing: missingCapability,
    standIn: retiredCapability,
    earlier: earlierBasis,
    unlawfulLayer: 'workspace',
    noPackage: noPackageCapability,
  }
}

/** A fresh fixture of the read check suite; `readCheck` replaces the memory double. */
export function readCheckFixture(
  readCheck: SkillReadCheck<Principal, Scope> = memoryReadCheck(),
): ReadCheckFixture<Principal, Scope> {
  return {
    readCheck,
    permitted: { access: alice, scope },
    refused: { access: mallory, scope },
    readable: reviewCapability,
    missing: missingCapability,
  }
}

/** A fresh fixture of the source suite over the memory source, which keeps bytes by digest. */
export function sourceFixture(): SourceFixture {
  return {
    source: memorySource(),
    present: reviewLocator,
    absent: missingLocator,
    addressing: 'content-digest',
    escaping: escapingLocator,
  }
}

/** A basis of the earlier, still lawful version of `review`. */
export const earlierBasis: SkillMaterialBasis = {
  capability: reviewCapability,
  layer: 'tenant',
  assetVersion: granted(isAssetVersion, 'v1'),
  digest: earlier.digest,
}
