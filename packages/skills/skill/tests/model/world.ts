// The small worlds of the bounded exploration. A world is data (`WorldSpec`): three identities,
// two principals, two materials per identity, and for each identity who the read check grants,
// who the resolution knows it for, and which material the source holds at its locator. The
// memory doubles of `skill-contract/testing` hold the world; `portsOf` wraps them with the
// schedule of one run: port faults, an abort and a change of the source content, keyed by the
// number of port answers so far. The wrappers record every port call in a trace. The services
// under test are the real ones from `@omne-harness/skill` (its `dist`).
import type { CapabilityId } from '@omne-harness/assets'
import type { Access } from '@omne-harness/legal-identity'
import { fail } from '@omne-harness/operation-result'
import {
  createPackageInspection,
  createSkillAccess,
  createSkillCatalog,
  type SkillPorts,
} from '@omne-harness/skill'
import {
  isAssetVersion,
  isSafeReason,
  isSkillName,
  type DeclaredProjection,
  type PackageDigest,
  type SkillAccess,
  type SkillCatalog,
  type SkillMaterialBasis,
  type SkillPackageSnapshot,
} from '@omne-harness/skill-contract'
import {
  sealSnapshot,
  type CatalogResolution,
  type PackageInspection,
  type Resolution,
  type PackageLocator,
  type ReadVerdict,
  type SkillPackageSource,
  type SourceFailure,
} from '@omne-harness/skill-contract/provider'
import {
  createMemoryReadCheck,
  createMemoryResolution,
  createMemorySource,
  type MemoryMaterial,
  type MemoryPackage,
  type MemoryResolutionEntry,
} from '@omne-harness/skill-contract/testing'
import {
  alice,
  capability,
  granted,
  mallory,
  path,
  scope,
  tool,
  type Principal,
  type Scope,
} from '../access-world.ts'

export { alice, mallory, scope, type Principal, type Scope }

export const NAMES = ['alpha', 'beta', 'gamma'] as const
export type Name = (typeof NAMES)[number]
export type MaterialIndex = 0 | 1
export const MATERIALS: readonly MaterialIndex[] = [0, 1]

/** A word of each description that no name and no other description holds. */
export const DESCRIPTION_WORD: Readonly<Record<Name, string>> = {
  alpha: 'Reviews',
  beta: 'Translates',
  gamma: 'Summarizes',
}

export const PRINCIPALS: readonly Principal[] = ['alice', 'mallory']
export const ACCESS: Readonly<Record<Principal, Access<Principal>>> = { alice, mallory }
export function otherPrincipal(who: Principal): Principal {
  return who === 'alice' ? 'mallory' : 'alice'
}

export const CAPABILITY: Readonly<Record<Name, CapabilityId>> = {
  alpha: capability('alpha'),
  beta: capability('beta'),
  gamma: capability('gamma'),
}

export function locatorOf(name: Name): PackageLocator {
  return { kind: 'directory', root: `/skills/${name}` }
}

/** The bytes of a package: package path to text or bytes. */
export type Files = MemoryPackage['files']

export type Material = Readonly<{
  name: Name
  index: MaterialIndex
  files: Files
  digest: PackageDigest
  /** Byte length of the frontmatter of `SKILL.md`: the body starts here. */
  bodyStart: number
}>

const encoder = new TextEncoder()
export const GUIDE_PATH = 'docs/guide.md'
export const NEW_PATH = 'docs/new.md'
export const CONTROL_PATH = '.omne/skill.json'

/** The snapshot that a source gives for `files` under the root `rootName`. */
export function sealedOf(rootName: string, files: Files): SkillPackageSnapshot {
  const list = Object.entries(files).map(([raw, content]) => ({
    path: path(raw),
    bytes: typeof content === 'string' ? encoder.encode(content) : content,
  }))
  const sealed = sealSnapshot({ rootName, files: list })
  if (!('ok' in sealed)) throw new Error(`does not seal: ${sealed.failure.kind}`)
  return sealed.ok
}

/** Material 0 and 1 of one identity: `SKILL.md` differs, `docs/guide.md` is the same, and
 * material 1 adds `docs/new.md`. */
function materialOf(name: Name, index: MaterialIndex): Material {
  const header = `---\nname: ${name}\ndescription: ${DESCRIPTION_WORD[name]} things.\n---\n`
  const files: Record<string, string> = {
    'SKILL.md': `${header}Body ${index} of ${name}: 中文 ✓.\n`,
    [CONTROL_PATH]: '{"formatVersion":1}',
    [GUIDE_PATH]: 'héllo 中文 guide\n',
  }
  if (index === 1) files[NEW_PATH] = 'New in material 1.\n'
  return {
    name,
    index,
    files,
    digest: sealedOf(name, files).digest,
    bodyStart: encoder.encode(header).length,
  }
}

export const MATERIAL: Readonly<Record<Name, readonly [Material, Material]>> = {
  alpha: [materialOf('alpha', 0), materialOf('alpha', 1)],
  beta: [materialOf('beta', 0), materialOf('beta', 1)],
  gamma: [materialOf('gamma', 0), materialOf('gamma', 1)],
}

/** The material of each digest that any world holds. */
export function materialByDigest(digest: PackageDigest): Material | undefined {
  return NAMES.flatMap(name => MATERIAL[name]).find(item => item.digest === digest)
}

/** The basis that names material `index` of `name`. */
export function basisOf(name: Name, index: MaterialIndex): SkillMaterialBasis {
  return {
    capability: CAPABILITY[name],
    layer: 'tenant',
    assetVersion: granted(isAssetVersion, `v${index}`),
    digest: MATERIAL[name][index].digest,
  }
}

function declaredOf(name: Name): DeclaredProjection {
  return {
    name: granted(isSkillName, name),
    description: `${DESCRIPTION_WORD[name]} things.`,
    tools: [tool('read-file')],
    scripts: [],
    settings: [{ name: 'tone', category: 'preference' }],
  }
}

export type IdentityState =
  | Readonly<{ kind: 'absent' }>
  /** Adopted; material `current` is the adopted one, material 0 stays lawful. */
  | Readonly<{ kind: 'adopted'; current: MaterialIndex }>
  /** Adopted, and the asset body has no `package.digest`. */
  | Readonly<{ kind: 'no-digest' }>
  | Readonly<{ kind: 'stand-in' }>

export type Held = MaterialIndex | 'none'

export type IdentitySpec = Readonly<{
  state: IdentityState
  /** The principals that the read check grants. */
  readers: readonly Principal[]
  /** The principals that the resolution answers for this identity. */
  knownTo: readonly Principal[]
  /** The material that the source holds at the locator of the identity. */
  held: Held
}>

export type WorldSpec = Readonly<Record<Name, IdentitySpec>>

export const ABSENT: IdentitySpec = {
  state: { kind: 'absent' },
  readers: [],
  knownTo: [],
  held: 'none',
}

/** The twin of `world` in which `hidden` was deleted: no read grant, no resolution, no package. */
export function twinWorld(world: WorldSpec, hidden: Name): WorldSpec {
  return { ...world, [hidden]: ABSENT }
}

/** The basis that a read without a basis pins: the adopted material of the reference. */
export function adoptedBasis(world: WorldSpec, name: Name): SkillMaterialBasis | undefined {
  const { state } = world[name]
  return state.kind === 'adopted' ? basisOf(name, state.current) : undefined
}

function memoryMaterial(name: Name, index: MaterialIndex, withDigest: boolean): MemoryMaterial {
  return {
    ref: {
      capability: CAPABILITY[name],
      layer: 'tenant',
      assetVersion: granted(isAssetVersion, `v${index}`),
      locator: locatorOf(name),
      ...(withDigest ? { digest: MATERIAL[name][index].digest } : {}),
    },
    declared: declaredOf(name),
  }
}

function resolutionEntry(
  name: Name,
  spec: IdentitySpec,
): MemoryResolutionEntry<Principal, Scope> | undefined {
  const visible = (who: Access<Principal>) => spec.knownTo.includes(who.principal)
  const base = { capability: CAPABILITY[name], visible }
  switch (spec.state.kind) {
    case 'absent':
      return undefined
    case 'adopted': {
      const { current } = spec.state
      return {
        ...base,
        state: {
          kind: 'adopted',
          current: memoryMaterial(name, current, true),
          earlier: current === 1 ? [memoryMaterial(name, 0, true)] : [],
        },
      }
    }
    case 'no-digest':
      return { ...base, state: { kind: 'adopted', current: memoryMaterial(name, 0, false) } }
    case 'stand-in':
      return {
        ...base,
        state: {
          kind: 'known-unavailable',
          name: granted(isSkillName, name),
          description: `${DESCRIPTION_WORD[name]} things.`,
          reason: granted(isSafeReason, 'Disabled by the organization.'),
        },
      }
    default: {
      const exhaustive: never = spec.state
      return exhaustive
    }
  }
}

function sourceOf(held: Readonly<Record<Name, Held>>): SkillPackageSource {
  const packages: MemoryPackage[] = []
  for (const name of NAMES) {
    const index = held[name]
    if (index !== 'none')
      packages.push({
        locator: locatorOf(name),
        rootName: name,
        files: MATERIAL[name][index].files,
      })
  }
  return createMemorySource(packages)
}

/** Where a port call went. `name` is the identity asked about; `path` the entry opened. */
export type CallSite =
  | Readonly<{ port: 'check'; name: Name }>
  | Readonly<{ port: 'resolve'; name: Name }>
  | Readonly<{ port: 'adopted' }>
  | Readonly<{ port: 'snapshot'; name: Name }>
  | Readonly<{ port: 'open'; name: Name; path: string }>

/** An answer that the port gives instead of the world's answer. The first five are "no answer"
 * in the contract's sense, except `unknown`, which is the decided answer "cannot decide now".
 * The misdirections are well-formed `resolve` answers that break PR1 or PR3; see `Misdirection`. */
export type Fault =
  | 'unknown'
  | 'malformed'
  | 'reject'
  | 'throw'
  | 'proxy'
  | SourceFailure
  | Misdirection

/**
 * A `resolve` answer that names other material than the request, without the premise PR1 and PR3:
 * `misdirect` answers `adopted` with the reference and declarations of another identity (the
 * point's `to`); the other three take the world's `adopted` answer and change one field of its
 * reference: the source layer, the asset version, or the digest. Skill must take each of them
 * for no answer when it names another identity, or, with a basis, other material than the basis.
 */
export type Misdirection = 'misdirect' | 'mislayer' | 'misversion' | 'misdigest'

export const MISDIRECTIONS: readonly Misdirection[] = [
  'misdirect',
  'mislayer',
  'misversion',
  'misdigest',
]

/** Which call a fault replaces. `item` replaces one item of the lawful set by a malformed one. */
export type FaultSite =
  | Readonly<{ port: 'check'; name: Name }>
  | Readonly<{ port: 'resolve'; name: Name }>
  | Readonly<{ port: 'adopted' }>
  | Readonly<{ port: 'item'; name: Name }>
  | Readonly<{ port: 'snapshot' }>
  /** Every `open`, or only the `open` of `path`. */
  | Readonly<{ port: 'open'; path?: string }>

/** `to` is the identity whose reference a `misdirect` gives; the default is the next name. */
export type FaultPoint = Readonly<{ site: FaultSite; fault: Fault; to?: Name }>

export type Schedule = Readonly<{
  /** `digest`: `open` keys bytes by the snapshot digest (the memory double); `locator`: it gives
   * the current bytes at the locator and ignores the digest (like `DirectorySource`). */
  addressing: 'digest' | 'locator'
  /** After this many port answers, the source holds `to` at the locator of `name`. */
  change?: Readonly<{ after: number; name: Name; to: Held }>
  /** The signal aborts as the port gives answer number `after`; 0 aborts before the operation. */
  abortAfter?: number
  /** At most one fault per call site; the first point that matches a call decides it. */
  faults?: readonly FaultPoint[]
}>

export const PLAIN: Schedule = { addressing: 'digest' }

export type TracedCall = Readonly<{
  site: CallSite
  /** The answer could not be decided: `unknown`, malformed, rejected, thrown, or a proxy. */
  undecided: boolean
  /** The signal was already aborted when the call was made. */
  afterAbort: boolean
}>

/** The port types do not let a malformed answer be written; this one helper widens it. */
function widened<T>(answer: unknown): T {
  return answer as T
}

/** An object that throws on every look at its fields. It is no thenable, so a promise settles with it. */
const EXPLODING: unknown = new Proxy(
  {},
  {
    get(_target, key) {
      if (key === 'then') return undefined
      throw new Error('the answer broke while it was read')
    },
    has() {
      throw new Error('the answer broke while it was read')
    },
    ownKeys() {
      throw new Error('the answer broke while it was read')
    },
    getOwnPropertyDescriptor() {
      throw new Error('the answer broke while it was read')
    },
  },
)

/** A malformed answer of each port: the right outer shape, a wrong inside. */
function malformedOf(site: CallSite): unknown {
  switch (site.port) {
    case 'check':
      return { kind: 'allowed' }
    case 'resolve':
      return { kind: 'adopted', ref: { capability: CAPABILITY[site.name] } }
    case 'adopted':
      return { ok: [{ kind: 'adopted' }] }
    case 'snapshot':
      return { ok: { rootName: site.name, entries: [], digest: MATERIAL[site.name][0].digest } }
    case 'open':
      return { ok: 'not bytes' }
    default: {
      const exhaustive: never = site
      return exhaustive
    }
  }
}

/**
 * Whether `point` names other material than `request` asks for. Without a basis, the source
 * layer, the asset version and the digest of the adopted material are the resolution's own word,
 * so only `misdirect` breaks a request without one: the others are honest answers there.
 */
export function misdirects(point: FaultPoint | undefined, basis: unknown): boolean {
  if (point === undefined || !isMisdirection(point.fault)) return false
  return point.fault === 'misdirect' || basis !== undefined
}

function isMisdirection(fault: Fault): fault is Misdirection {
  return MISDIRECTIONS.some(item => item === fault)
}

function isSourceFailure(fault: Fault): fault is SourceFailure {
  return (
    !isMisdirection(fault) && !['unknown', 'malformed', 'reject', 'throw', 'proxy'].includes(fault)
  )
}

/** Whether a fault leaves the answer undecided. A source failure is a decided answer. A
 * misdirection is no answer only when it breaks the request; see `misdirected`. */
export function undecides(fault: Fault): boolean {
  return !isSourceFailure(fault) && !isMisdirection(fault)
}

function nextName(name: Name): Name {
  return NAMES[(NAMES.indexOf(name) + 1) % NAMES.length] ?? name
}

/**
 * The answer of `misdirection` for a `resolve` of `name` whose world answer is `given`, and
 * whether it breaks the request: it names another identity, or, with a basis, another source
 * layer, asset version or digest than the basis. A change that does not apply (the world does
 * not answer `adopted`, or the reference has no digest) leaves the answer as it is.
 */
function misdirected(
  misdirection: Misdirection,
  name: Name,
  to: Name | undefined,
  given: Resolution,
  basis: SkillMaterialBasis | undefined,
): Readonly<{ answer: Resolution; breaks: boolean }> {
  if (misdirection === 'misdirect') {
    const other = to ?? nextName(name)
    return {
      answer: { kind: 'adopted', ...memoryMaterial(other, 0, true) },
      breaks: other !== name,
    }
  }
  if (given.kind !== 'adopted') return { answer: given, breaks: false }
  const { ref } = given
  switch (misdirection) {
    case 'mislayer':
      return {
        answer: {
          ...given,
          ref: { ...ref, layer: ref.layer === 'tenant' ? 'workspace' : 'tenant' },
        },
        breaks: basis !== undefined,
      }
    case 'misversion':
      return {
        answer: { ...given, ref: { ...ref, assetVersion: granted(isAssetVersion, 'v9') } },
        breaks: basis?.assetVersion !== undefined,
      }
    case 'misdigest': {
      if (ref.digest === undefined) return { answer: given, breaks: false }
      const other = MATERIAL[name].find(item => item.digest !== ref.digest)?.digest ?? ref.digest
      return { answer: { ...given, ref: { ...ref, digest: other } }, breaks: basis !== undefined }
    }
    default: {
      const exhaustive: never = misdirection
      return exhaustive
    }
  }
}

function matches(site: FaultSite, call: CallSite): boolean {
  switch (site.port) {
    case 'check':
    case 'resolve':
      return call.port === site.port && call.name === site.name
    case 'adopted':
    case 'snapshot':
      return call.port === site.port
    case 'open':
      return call.port === 'open' && (site.path === undefined || site.path === call.path)
    case 'item':
      return false
    default: {
      const exhaustive: never = site
      return exhaustive
    }
  }
}

/** The fault of the schedule for `call`, if any. */
function faultAt(schedule: Schedule, call: CallSite): Fault | undefined {
  return schedule.faults?.find(point => matches(point.site, call))?.fault
}

export type Run = Readonly<{
  ports: SkillPorts<Principal, Scope>
  signal: AbortSignal
  trace: () => readonly TracedCall[]
  access: SkillAccess<Principal, Scope>
  catalog: SkillCatalog<Principal, Scope>
  inspection: PackageInspection
}>

/** Holds the read check answers until `release` lets them out; see `heldChecks`. */
export type CheckGate = (name: Name, answer: () => Promise<unknown>) => Promise<unknown>

/**
 * The ports of one run over `world` with `schedule`, and the three real services over them.
 * `gate`, when given, decides when each read check answer comes out (the order exploration).
 */
export function runOf(world: WorldSpec, schedule: Schedule = PLAIN, gate?: CheckGate): Run {
  const held: Record<Name, Held> = {
    alpha: world.alpha.held,
    beta: world.beta.held,
    gamma: world.gamma.held,
  }
  let inner = sourceOf(held)
  const controller = new AbortController()
  if (schedule.abortAfter === 0) controller.abort()
  const calls: TracedCall[] = []
  const readCheck = createMemoryReadCheck<Principal, Scope>(
    NAMES.filter(name => world[name].state.kind !== 'absent').map(name => ({
      capability: CAPABILITY[name],
      visible: (who: Access<Principal>) => world[name].readers.includes(who.principal),
    })),
  )
  const resolution = createMemoryResolution<Principal, Scope>(
    NAMES.flatMap(name => {
      const entry = resolutionEntry(name, world[name])
      return entry === undefined ? [] : [entry]
    }),
  )

  /** Counts one answer: the change and the abort of the schedule happen as it is given. */
  const answered = (): void => {
    const count = calls.length
    const { change, abortAfter } = schedule
    if (change !== undefined && change.after === count) {
      held[change.name] = change.to
      inner = sourceOf(held)
    }
    if (abortAfter !== undefined && abortAfter === count) controller.abort()
  }

  /** One port call: the world's answer, or the fault of the schedule. A misdirection is the
   * world's answer changed by `misdirect`, which also says whether the change breaks the request. */
  const call = <T>(
    site: CallSite,
    real: () => Promise<T>,
    misdirect?: (misdirection: Misdirection, given: T) => Readonly<{ answer: T; breaks: boolean }>,
  ): Promise<T> => {
    const fault = faultAt(schedule, site)
    const index = calls.length
    calls.push({
      site,
      undecided: fault !== undefined && undecides(fault),
      afterAbort: controller.signal.aborted,
    })
    if (fault === 'throw') {
      answered()
      throw new Error('the port threw at once')
    }
    const answer = async (): Promise<T> => {
      try {
        if (fault === undefined) return await real()
        switch (fault) {
          case 'unknown':
            return widened<T>(
              site.port === 'adopted' ? { failure: 'unknown' } : { kind: 'unknown' },
            )
          case 'malformed':
            return widened<T>(malformedOf(site))
          case 'reject':
            throw new Error('the port rejected')
          case 'proxy':
            return widened<T>(EXPLODING)
          case 'misdirect':
          case 'mislayer':
          case 'misversion':
          case 'misdigest': {
            if (misdirect === undefined) throw new Error(`${fault} is a fault of resolve only`)
            const { answer: changed, breaks } = misdirect(fault, await real())
            const traced = calls[index]
            if (traced !== undefined) calls[index] = { ...traced, undecided: breaks }
            return changed
          }
          default:
            return widened<T>(fail(fault))
        }
      } finally {
        answered()
      }
    }
    return answer()
  }

  const malformedItems = new Set(
    (schedule.faults ?? []).flatMap(point => (point.site.port === 'item' ? [point.site.name] : [])),
  )
  const ports: SkillPorts<Principal, Scope> = {
    readCheck: {
      check(who, at, item) {
        const name = nameOf(item)
        const site: CallSite = { port: 'check', name }
        const real = () => call(site, () => readCheck.check(who, at, item))
        // A synchronous throw stays synchronous: it is not held.
        if (gate === undefined || faultAt(schedule, site) === 'throw') return real()
        return gate(name, real).then(answer => widened<ReadVerdict>(answer))
      },
    },
    resolution: {
      resolve(who, at, item, options) {
        const name = nameOf(item)
        const site: CallSite = { port: 'resolve', name }
        const to = schedule.faults?.find(point => matches(point.site, site))?.to
        return call(
          site,
          () => resolution.resolve(who, at, item, options),
          (misdirection, given) => misdirected(misdirection, name, to, given, options?.basis),
        )
      },
      adopted(who, at) {
        return call({ port: 'adopted' }, async () => {
          const listed = await resolution.adopted(who, at)
          if (malformedItems.size === 0 || !('ok' in listed)) return listed
          return widened<typeof listed>({
            ok: listed.ok.map(answer =>
              malformedItems.has(answerName(answer)) ? { kind: 'adopted', ref: {} } : answer,
            ),
          })
        })
      },
    },
    source: {
      snapshot(locator) {
        return call({ port: 'snapshot', name: locatorName(locator) }, () => inner.snapshot(locator))
      },
      open(locator, digest, entryPath) {
        return call({ port: 'open', name: locatorName(locator), path: entryPath }, async () => {
          if (schedule.addressing === 'digest') return inner.open(locator, digest, entryPath)
          const now = await inner.snapshot(locator)
          return 'ok' in now ? inner.open(locator, now.ok.digest, entryPath) : now
        })
      },
    },
  }
  return {
    ports,
    signal: controller.signal,
    trace: () => [...calls],
    access: createSkillAccess(ports),
    catalog: createSkillCatalog(ports),
    inspection: createPackageInspection(ports.source),
  }
}

function nameOf(item: CapabilityId): Name {
  const found = NAMES.find(
    name => CAPABILITY[name].name === item.name && CAPABILITY[name].category === item.category,
  )
  if (found === undefined)
    throw new Error(`not an identity of the world: ${item.category}:${item.name}`)
  return found
}

function answerName(answer: CatalogResolution): Name {
  return nameOf(answer.kind === 'adopted' ? answer.ref.capability : answer.capability)
}

function locatorName(locator: PackageLocator): Name {
  const found = NAMES.find(
    name => locator.kind === 'directory' && locator.root === `/skills/${name}`,
  )
  if (found === undefined) throw new Error('not a locator of the world')
  return found
}

/** The bytes of `path` in `material`. */
export function bytesIn(material: Material, entryPath: string): Uint8Array | undefined {
  const content = material.files[entryPath]
  if (content === undefined) return undefined
  return typeof content === 'string' ? encoder.encode(content) : content
}
