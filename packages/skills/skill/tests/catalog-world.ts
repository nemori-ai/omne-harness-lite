// One small world behind the two ports of the catalog: a reader and a stranger, an adopted Skill
// `review` that the reader may read, an adopted Skill `secret` that is in the reader's lawful set
// and that the read check refuses, a stand-in `retired`, and an identity that exists for nobody.
// The memory doubles of `skill-contract/testing` hold it; the controls change the world between
// calls and count the read checks, so a test can show what the catalog does when a port answers
// `unknown`, lists an identity twice, or answers in another order.
import type { CapabilityId } from '@omne-harness/assets'
import { fail, succeed } from '@omne-harness/operation-result'
import { createSkillCatalog, type SkillPorts } from '@omne-harness/skill'
import {
  isSafeReason,
  isSkillName,
  sameCapability,
  type CatalogEntry,
  type DeclaredProjection,
  type SkillCatalog,
} from '@omne-harness/skill-contract'
import type {
  CatalogResolution,
  ReadVerdict,
  SkillRef,
} from '@omne-harness/skill-contract/provider'
import {
  createMemoryReadCheck,
  createMemoryResolution,
  type CatalogFixture,
} from '@omne-harness/skill-contract/testing'
import {
  alice,
  capability,
  granted,
  mallory,
  missing,
  retired,
  review,
  reviewLocator,
  scope,
  tool,
  type Principal,
  type Scope,
} from './access-world.ts'

export { missing, retired, review }
export const secret = capability('secret')

const onlyAlice = (who: { principal: Principal }) => who.principal === 'alice'

function ref(item: CapabilityId): SkillRef {
  return { capability: item, layer: 'tenant', locator: reviewLocator }
}

const reviewDeclared: DeclaredProjection = {
  name: granted(isSkillName, 'review'),
  description: 'Reviews a change.',
  tools: [tool('read-file')],
  scripts: [],
  settings: [{ name: 'tone', category: 'preference' }],
}

const secretDeclared: DeclaredProjection = {
  name: granted(isSkillName, 'secret'),
  description: 'Keeps a secret.',
  tools: [],
  scripts: [],
  settings: [],
}

/** The entry that the catalog must give for `review`. */
export const reviewEntry: Extract<CatalogEntry, { kind: 'adopted' }> = {
  kind: 'adopted',
  capability: review,
  name: reviewDeclared.name,
  description: 'Reviews a change.',
  dependencies: [tool('read-file')],
}

/** The entry that the catalog must give for `retired`. */
export const retiredEntry: Extract<CatalogEntry, { kind: 'stand-in' }> = {
  kind: 'stand-in',
  capability: retired,
  name: granted(isSkillName, 'retired'),
  description: 'Was disabled.',
  reason: granted(isSafeReason, 'Disabled by the organization.'),
}

/** A read check whose answers wait until the test releases them, in the order it chooses. */
export type Held = Readonly<{
  /** How many answers are waiting. */
  pending(): number
  /** Lets every waiting answer through, first to last or last to first. */
  release(order: 'forward' | 'reverse'): void
}>

export type CatalogControls = Readonly<{
  lawfulSetUnknown(): void
  verdictUnknown(capability: CapabilityId): void
  repeatGranted(): void
  removeRefused(): void
  /** From now on every read check answer waits; the returned handle releases them. */
  holdVerdicts(): Held
  checks(): number
}>

export type CatalogWorld = Readonly<{
  ports: Pick<SkillPorts<Principal, Scope>, 'readCheck' | 'resolution'>
  catalog: SkillCatalog<Principal, Scope>
  controls: CatalogControls
}>

/** A fresh world. Each test builds its own, so the controls of one test do not reach another. */
export function createCatalogWorld(): CatalogWorld {
  const readCheck = createMemoryReadCheck<Principal, Scope>([
    { capability: review, visible: onlyAlice },
    { capability: retired, visible: onlyAlice },
  ])
  const resolution = createMemoryResolution<Principal, Scope>([
    {
      capability: review,
      visible: onlyAlice,
      state: { kind: 'adopted', current: { ref: ref(review), declared: reviewDeclared } },
    },
    {
      capability: secret,
      visible: onlyAlice,
      state: { kind: 'adopted', current: { ref: ref(secret), declared: secretDeclared } },
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
  ])
  let setUnknown = false
  let repeated = false
  let removed = false
  const undecided: CapabilityId[] = []
  let checks = 0
  let held: (() => void)[] | undefined
  const ports: CatalogWorld['ports'] = {
    readCheck: {
      async check(who, at, item) {
        checks += 1
        const verdict: ReadVerdict = undecided.some(it => sameCapability(it, item))
          ? { kind: 'unknown' }
          : await readCheck.check(who, at, item)
        if (held === undefined) return verdict
        const waiting = held
        return new Promise<ReadVerdict>(resolve => {
          waiting.push(() => resolve(verdict))
        })
      },
    },
    resolution: {
      resolve: (who, at, item, options) => resolution.resolve(who, at, item, options),
      async adopted(who, at) {
        if (setUnknown) return fail('unknown')
        const listed = await resolution.adopted(who, at)
        if (!('ok' in listed)) return listed
        const kept = listed.ok.filter(answer => !(removed && isAbout(answer, secret)))
        const twice = repeated ? kept.filter(answer => isAbout(answer, review)) : []
        return succeed([...kept, ...twice])
      },
    },
  }
  return {
    ports,
    catalog: createSkillCatalog(ports),
    controls: {
      lawfulSetUnknown() {
        setUnknown = true
      },
      verdictUnknown(item) {
        undecided.push(item)
      },
      repeatGranted() {
        repeated = true
      },
      removeRefused() {
        removed = true
      },
      holdVerdicts() {
        const waiting: (() => void)[] = []
        held = waiting
        return {
          pending: () => waiting.length,
          release(order) {
            const releases = waiting.splice(0)
            held = undefined
            for (const release of order === 'forward' ? releases : releases.reverse()) release()
          },
        }
      },
      checks: () => checks,
    },
  }
}

function isAbout(answer: CatalogResolution, item: CapabilityId): boolean {
  const capability = answer.kind === 'adopted' ? answer.ref.capability : answer.capability
  return sameCapability(capability, item)
}

/** A fresh fixture of the catalog suite over a fresh world; `catalog` replaces the real one. */
export function catalogFixture(
  catalog?: (world: CatalogWorld) => SkillCatalog<Principal, Scope>,
): CatalogFixture<Principal, Scope> {
  const world = createCatalogWorld()
  return {
    catalog: catalog === undefined ? world.catalog : catalog(world),
    reader: { access: alice, scope },
    nobody: { access: mallory, scope },
    granted: reviewEntry,
    refused: secret,
    standIn: retiredEntry,
    missing,
    world: world.controls,
  }
}
