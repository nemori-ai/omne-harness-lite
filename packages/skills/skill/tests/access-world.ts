// One small world behind the three ports: a reader and a stranger, an adopted Skill `review`
// with an earlier version, a stand-in `retired`, an adopted identity without a readable package,
// an identity that the read check grants but the resolution does not know, an identity with a
// body of more than one page, and an identity that exists for nobody. The memory doubles of
// `skill-contract/testing` hold it. `controls` change the world between calls, so a test can
// show what the service does when the material moves.
//
// Two shapes of the resolution double: `hiding: false` (default) answers every principal, so
// the read check is the one guard and a service that skips step 2 shows in the tests;
// `hiding: true` answers only the reader, as the resolution suite (PR5) requires of a real port.
import { capabilityId, type CapabilityId } from '@omne-harness/assets'
import {
  access,
  accountCodec,
  organizationCodec,
  tenant,
  type Access,
} from '@omne-harness/legal-identity'
import { succeed } from '@omne-harness/operation-result'
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
  type AccessFixture,
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
/** Adopted from a workspace source: a reference without an asset version. */
export const workspaceNote = capability('workspace-note')
/** Adopted, with a body of more than one page. */
export const large = capability('large')
export const missing = capability('nobody-has-this')

export const reviewLocator: PackageLocator = { kind: 'directory', root: '/skills/review' }
export const largeLocator: PackageLocator = { kind: 'directory', root: '/skills/large' }

const encoder = new TextEncoder()
export const BODY = 'Read the diff.\n仔细看每一处改动。\n'
export const MANIFEST = `---\nname: review\ndescription: Reviews a change.\n---\n${BODY}`
export const GUIDE = 'héllo 中文 guide\n'
/** A resource whose text looks like a frontmatter: a resource has no header to leave out. */
export const FRONT = '---\nx: 1\n---\nnot a body\n'
export const BLOB = new Uint8Array([0, 1, 2, 0xff, 0xfe, 3])
/** A body of 70000 bytes: more than one page. */
export const LARGE_BODY = `${'a'.repeat(69_990)}中文中文\n`

/** The files of the adopted material of `review`. */
export const currentFiles: MemoryPackage['files'] = {
  'SKILL.md': MANIFEST,
  '.omne/skill.json': '{"formatVersion":1}',
  'docs/guide.md': GUIDE,
  'docs/front.md': FRONT,
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
const largeFiles: MemoryPackage['files'] = {
  'SKILL.md': `---\nname: large\ndescription: A long one.\n---\n${LARGE_BODY}`,
}

export function digestOf(rootName: string, files: MemoryPackage['files']): PackageDigest {
  const list = Object.entries(files).map(([raw, content]) => ({
    path: path(raw),
    bytes: typeof content === 'string' ? encoder.encode(content) : content,
  }))
  const sealed = sealSnapshot({ rootName, files: list })
  if (!('ok' in sealed)) throw new Error(`does not seal: ${sealed.failure.kind}`)
  return sealed.ok.digest
}

export const currentDigest = digestOf('review', currentFiles)
export const earlierDigest = digestOf('review', earlierFiles)
export const largeDigest = digestOf('large', largeFiles)

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
const everyone = () => true

/** How many times each port was called since the world was made. */
export type PortCalls = Readonly<{ check: number; resolve: number; snapshot: number; open: number }>

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
  /** A signal that the read check aborts right after it answers the next `check`. */
  abortAfterCheck(): AbortSignal
  calls(): PortCalls
}>

export type World = Readonly<{
  ports: SkillPorts<Principal, Scope>
  access: SkillAccess<Principal, Scope>
  controls: Controls
}>

export type WorldOptions = Readonly<{
  /** Whether the resolution hides every identity from the stranger, as a real port must. */
  hiding?: boolean
}>

/** A fresh world. Each test builds its own, so the controls of one test do not reach another. */
export function createWorld(options: WorldOptions = {}): World {
  const visible = options.hiding === true ? onlyAlice : everyone
  let inner = createMemorySource([
    { locator: reviewLocator, rootName: 'review', files: currentFiles },
    { locator: largeLocator, rootName: 'large', files: largeFiles },
  ])
  const tampered = new Set<PackagePath>()
  let broken = false
  let refused = false
  let snapshotAborter: AbortController | undefined
  let checkAborter: AbortController | undefined
  const calls = { check: 0, resolve: 0, snapshot: 0, open: 0 }
  const source: SkillPackageSource = {
    async snapshot(locator) {
      calls.snapshot += 1
      const answer = await inner.snapshot(locator)
      snapshotAborter?.abort()
      snapshotAborter = undefined
      return answer
    },
    async open(locator, digest, entryPath) {
      calls.open += 1
      if (broken) throw new Error('the source broke at open')
      const answer = await inner.open(locator, digest, entryPath)
      if ('ok' in answer && tampered.has(entryPath)) return succeed(encoder.encode('tampered'))
      return answer
    },
  }
  const readCheck = createMemoryReadCheck<Principal, Scope>(
    [review, retired, noPackage, checkedOnly, workspaceNote, large].map(item => ({
      capability: item,
      visible: onlyAlice,
    })),
  )
  const resolution = createMemoryResolution<Principal, Scope>([
    {
      capability: review,
      visible,
      state: {
        kind: 'adopted',
        current: material(currentDigest, 'v2'),
        earlier: [material(earlierDigest, 'v1')],
      },
    },
    {
      capability: retired,
      visible,
      state: {
        kind: 'known-unavailable',
        name: granted(isSkillName, 'retired'),
        description: 'Was disabled.',
        reason: granted(isSafeReason, 'Disabled by the organization.'),
      },
    },
    {
      capability: workspaceNote,
      visible,
      state: {
        kind: 'adopted',
        current: {
          ref: {
            capability: workspaceNote,
            layer: 'workspace',
            locator: reviewLocator,
            digest: currentDigest,
          },
          declared: { ...declared, name: granted(isSkillName, 'workspace-note') },
        },
      },
    },
    {
      capability: large,
      visible,
      state: {
        kind: 'adopted',
        current: {
          ref: {
            capability: large,
            layer: 'workspace',
            locator: largeLocator,
            digest: largeDigest,
          },
          declared: { ...declared, name: granted(isSkillName, 'large') },
        },
      },
    },
    {
      capability: noPackage,
      visible,
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
      async check(who, at, item) {
        calls.check += 1
        const verdict = refused
          ? { kind: 'refused' as const }
          : await readCheck.check(who, at, item)
        checkAborter?.abort()
        checkAborter = undefined
        return verdict
      },
    },
    resolution: {
      resolve(who, at, item, resolveOptions) {
        calls.resolve += 1
        return resolution.resolve(who, at, item, resolveOptions)
      },
      adopted: (who, at) => resolution.adopted(who, at),
    },
    source,
  }
  return {
    ports,
    access: createSkillAccess(ports),
    controls: {
      replaceAdopted() {
        inner = createMemorySource([
          { locator: reviewLocator, rootName: 'review', files: replacedFiles },
          { locator: largeLocator, rootName: 'large', files: largeFiles },
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
        snapshotAborter = new AbortController()
        return snapshotAborter.signal
      },
      abortAfterCheck() {
        checkAborter = new AbortController()
        return checkAborter.signal
      },
      calls: () => ({ ...calls }),
    },
  }
}

/** A fresh fixture of the access suite over a fresh world. */
export function accessFixture(
  options: WorldOptions = {},
): AccessFixture<Principal, Scope> & Readonly<{ ports: SkillPorts<Principal, Scope> }> {
  const { ports, access: service, controls } = createWorld(options)
  return {
    ports,
    access: service,
    principals: { reader: { access: alice, scope }, stranger: { access: mallory, scope } },
    capability: {
      adopted: review,
      missing,
      checkedOnly,
      standIn: retired,
      noPackage,
      large,
    },
    world: {
      replaceAdopted: controls.replaceAdopted,
      changeEntry() {
        const guide = path('docs/guide.md')
        controls.tamper(guide)
        return guide
      },
      breakOpen: controls.breakOpen,
      abortAfterSnapshot: controls.abortAfterSnapshot,
      calls: controls.calls,
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
