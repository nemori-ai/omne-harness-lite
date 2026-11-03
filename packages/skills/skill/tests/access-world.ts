// One small world behind the three ports: a reader and a stranger, an adopted Skill `review`
// with an earlier version, a stand-in `retired`, an adopted identity without a readable package,
// an identity that the read check grants but the resolution does not know, and an identity that
// exists for nobody. The memory doubles of `skill-contract/testing` hold it. `controls` change
// the world between calls, so a test can show what the service does when the material moves.
import { capabilityId, type CapabilityId } from '@omne-harness/assets'
import {
  access,
  accountCodec,
  organizationCodec,
  tenant,
  type Access,
} from '@omne-harness/legal-identity'
import { fail, succeed } from '@omne-harness/operation-result'
import { createSkillAccess, type SkillPorts } from '@omne-harness/skill'
import {
  isAssetVersion,
  isSafeReason,
  isSkillName,
  toPackagePath,
  type Bytes,
  type DeclaredProjection,
  type PackageDigest,
  type PackagePath,
  type SkillAccess,
  type SkillMaterialBasis,
} from '@omne-harness/skill-contract'
import {
  sealSnapshot,
  type PackageLocator,
  type SkillPackageSource,
  type SkillRef,
} from '@omne-harness/skill-contract/provider'
import {
  createMemoryReadCheck,
  createMemoryResolution,
  createMemorySource,
  type MemoryMaterial,
  type MemoryPackage,
} from '@omne-harness/skill-contract/testing'

export type Principal = 'alice' | 'mallory'
export type Scope = 'workspace-a'

export function granted<T>(guard: (value: unknown) => value is T, value: unknown): T {
  if (!guard(value)) throw new Error(`${guard.name} refuses ${JSON.stringify(value)}`)
  return value
}

export function path(raw: string): PackagePath {
  const checked = toPackagePath(raw)
  if (!('ok' in checked)) throw new Error(`not a package path: ${raw}`)
  return checked.ok
}

function identity(category: string, name: string): CapabilityId {
  const id = capabilityId(category, name)
  if (!id.ok) throw new Error(`${category}:${name}`)
  return id.id
}

export function capability(name: string): CapabilityId {
  return identity('skill', name)
}

export function tool(name: string): CapabilityId {
  return identity('tool', name)
}

const org = organizationCodec.parse('org_0123456789abcdefghjkmnpqrs')
const acc = accountCodec.parse('acc_0123456789abcdefghjkmnpqrs')
if (!org.ok || !acc.ok) throw new Error('the test tenant texts are not legal')
const home = tenant(org.value, acc.value)

export const alice: Access<Principal> = access('alice', home)
export const mallory: Access<Principal> = access('mallory', home)
export const scope: Scope = 'workspace-a'

export const review = capability('review')
export const retired = capability('retired')
export const noPackage = capability('no-package')
export const checkedOnly = capability('checked-only')
export const missing = capability('nobody-has-this')

export const reviewLocator: PackageLocator = { kind: 'directory', root: '/skills/review' }

const encoder = new TextEncoder()
export const BODY = 'Read the diff.\n仔细看每一处改动。\n'
export const MANIFEST = `---\nname: review\ndescription: Reviews a change.\n---\n${BODY}`
export const GUIDE = 'héllo 中文 guide\n'
export const BLOB = new Uint8Array([0, 1, 2, 0xff, 0xfe, 3])

/** The files of the adopted material of `review`. */
export const currentFiles: MemoryPackage['files'] = {
  'SKILL.md': MANIFEST,
  '.omne/skill.json': '{"formatVersion":1}',
  'docs/guide.md': GUIDE,
  'assets/blob.bin': BLOB,
}
/** An earlier, still lawful version of `review`. */
const earlierFiles: MemoryPackage['files'] = {
  'SKILL.md': '---\nname: review\ndescription: Reviews a change.\n---\nOld body.\n',
}
/** What the source holds after the package was replaced under the resolution. */
const replacedFiles: MemoryPackage['files'] = {
  'SKILL.md': '---\nname: review\ndescription: Reviews a change.\n---\nReplaced.\n',
  'docs/guide.md': GUIDE,
}

export function digestOf(files: MemoryPackage['files']): PackageDigest {
  const list = Object.entries(files).map(([raw, content]) => ({
    path: path(raw),
    bytes: typeof content === 'string' ? encoder.encode(content) : content,
  }))
  const sealed = sealSnapshot({ rootName: 'review', files: list })
  if (!('ok' in sealed)) throw new Error(`does not seal: ${sealed.failure.kind}`)
  return sealed.ok.digest
}

export const currentDigest = digestOf(currentFiles)
export const earlierDigest = digestOf(earlierFiles)

const declared: DeclaredProjection = {
  name: granted(isSkillName, 'review'),
  description: 'Reviews a change.',
  tools: [tool('read-file')],
  scripts: [],
  settings: [{ name: 'tone', category: 'preference' }],
}

function material(digest: PackageDigest | undefined, version: string): MemoryMaterial {
  const ref: SkillRef = {
    capability: review,
    layer: 'tenant',
    assetVersion: granted(isAssetVersion, version),
    locator: reviewLocator,
    ...(digest === undefined ? {} : { digest }),
  }
  return { ref, declared }
}

export const earlierBasis: SkillMaterialBasis = {
  capability: review,
  layer: 'tenant',
  assetVersion: granted(isAssetVersion, 'v1'),
  digest: earlierDigest,
}

export const currentBasis: SkillMaterialBasis = {
  capability: review,
  layer: 'tenant',
  assetVersion: granted(isAssetVersion, 'v2'),
  digest: currentDigest,
}

const onlyAlice = (who: Access<Principal>) => who.principal === 'alice'

export type Controls = Readonly<{
  /** The source now holds other content at the locator of `review`; the resolution still names the old digest. */
  replaceAdopted(): void
  /** `open` of `path` now gives other bytes than the snapshot lists. */
  tamper(path: PackagePath): void
  /** `open` now throws. */
  breakOpen(): void
  /** Every read check now answers `refused`. */
  refuseAll(): void
  /** A signal that the source aborts right after it answers the next `snapshot`. */
  abortAfterSnapshot(): AbortSignal
  /** How many times `open` was called. */
  opens(): number
}>

export type World = Readonly<{
  ports: SkillPorts<Principal, Scope>
  access: SkillAccess<Principal, Scope>
  controls: Controls
}>

/** A fresh world. Each test builds its own, so the controls of one test do not reach another. */
export function createWorld(): World {
  let inner = createMemorySource([
    { locator: reviewLocator, rootName: 'review', files: currentFiles },
  ])
  const tampered = new Set<PackagePath>()
  let broken = false
  let refused = false
  let aborter: AbortController | undefined
  let opens = 0
  const source: SkillPackageSource = {
    async snapshot(locator) {
      const answer = await inner.snapshot(locator)
      aborter?.abort()
      aborter = undefined
      return answer
    },
    async open(locator, digest, entryPath) {
      opens += 1
      if (broken) throw new Error('the source broke at open')
      const answer = await inner.open(locator, digest, entryPath)
      if ('ok' in answer && tampered.has(entryPath)) return succeed(encoder.encode('tampered'))
      return answer
    },
  }
  const readCheck = createMemoryReadCheck<Principal, Scope>(
    [review, retired, noPackage, checkedOnly].map(item => ({
      capability: item,
      visible: onlyAlice,
    })),
  )
  const resolution = createMemoryResolution<Principal, Scope>([
    {
      capability: review,
      visible: onlyAlice,
      state: {
        kind: 'adopted',
        current: material(currentDigest, 'v2'),
        earlier: [material(earlierDigest, 'v1')],
      },
    },
    {
      capability: retired,
      visible: onlyAlice,
      state: {
        kind: 'known-unavailable',
        name: granted(isSkillName, 'retired'),
        description: 'Was disabled.',
        reason: granted(isSafeReason, 'Disabled by the organization.'),
      },
    },
    {
      capability: noPackage,
      visible: onlyAlice,
      state: {
        kind: 'adopted',
        current: {
          ref: { capability: noPackage, layer: 'workspace', locator: reviewLocator },
          declared: { ...declared, name: granted(isSkillName, 'no-package') },
        },
      },
    },
  ])
  const ports: SkillPorts<Principal, Scope> = {
    readCheck: {
      check: (who, at, item) =>
        refused ? Promise.resolve({ kind: 'refused' }) : readCheck.check(who, at, item),
    },
    resolution,
    source,
  }
  return {
    ports,
    access: createSkillAccess(ports),
    controls: {
      replaceAdopted() {
        inner = createMemorySource([
          { locator: reviewLocator, rootName: 'review', files: replacedFiles },
        ])
      },
      tamper(entryPath) {
        tampered.add(entryPath)
      },
      breakOpen() {
        broken = true
      },
      refuseAll() {
        refused = true
      },
      abortAfterSnapshot() {
        aborter = new AbortController()
        return aborter.signal
      },
      opens: () => opens,
    },
  }
}

/** The failure of an outcome, or an error naming the unexpected success. */
export function failureOf<T, F>(outcome: { ok: T } | { failure: F }): F {
  if ('ok' in outcome) throw new Error(`expected a failure, got ${JSON.stringify(outcome.ok)}`)
  return outcome.failure
}

/** The value of an outcome, or an error naming the unexpected failure. */
export function okOf<T, F>(outcome: { ok: T } | { failure: F }): T {
  if (!('ok' in outcome)) throw new Error(`expected ok, got ${JSON.stringify(outcome.failure)}`)
  return outcome.ok
}

export function bytesOf(content: string | Bytes): Bytes {
  return typeof content === 'string' ? encoder.encode(content) : content
}

export { fail }
