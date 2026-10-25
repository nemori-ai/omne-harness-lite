// The G7 suite of the binding registry (`ToolBindingRegistry.register` and the registry reads) and
// a non-durable registry that conforms to it. The suite follows the registration-semantics suite:
// no test framework, no Cordis runtime; the fixture gives the registry, the authorities of two
// keys and the fiber controls. The double declares `durability: 'none'`, keeps everything in one
// process and must not be assembled into production. The dynamics suite of RFC-0012 is a
// skeleton here: its ten cases name the criteria and report not applicable until 2.5 fills them.
import assert from 'node:assert/strict'
import { AsyncLocalStorage } from 'node:async_hooks'
import type { ContentBlock } from '@omne-harness/content-block'
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import {
  type Access,
  type Adoption,
  type DurableEvidence,
  type SourceLayer,
  type ToolDefinition,
} from '@omne-harness/tool-contract'
import {
  sameBindingKey,
  sameSourceLayer,
  shapeOf,
  type ToolAuthority,
  type ToolBindingEntry,
  type ToolBindingKey,
  type ToolBindingRegistry,
  type ToolContribution,
  type ToolContributionFailure,
  type ToolLoadedRegistration,
} from '@omne-harness/tool-contract/provider'
import {
  NotApplicable,
  testingTenant,
  type ConformanceCase,
} from '@omne-harness/tool-contract/testing'
import type { ToolAuthorityFailure } from './cordis.ts'

/** The registry that the G7 suite checks: `register` and the registry reads and marks. */
export type ToolBindingRegistryService<P> = ToolBindingRegistry<P, unknown, ContentBlock>

/**
 * What the G7 suite needs. A fresh fixture serves one case. `access` is a registrant the registry
 * admits at the layer of `authority`; `authority` and `otherAuthority` name two different binding
 * keys that the origin check accepts for that registrant; `foreignAuthority` names a key whose
 * origin check refuses (`denied`); a case that needs one that is missing reports not applicable.
 * `loaded(authority, digest)` builds a trusted loaded registration for the key of `authority` with
 * the given load digest. `asFiber` runs `work` as the caller fiber named `fiber`, and every
 * `register` that `work` starts belongs to that fiber; `endFiber` ends that fiber and its
 * automatic withdrawals, and resolves after the last entry is gone.
 */
export interface ToolBindingRegistryFixture<P> {
  readonly registry: ToolBindingRegistryService<P>
  readonly access: Access<P>
  readonly authority: ToolAuthority
  readonly otherAuthority?: ToolAuthority
  readonly foreignAuthority?: ToolAuthority
  loaded(authority: ToolAuthority, digest: string): ToolLoadedRegistration<unknown, ContentBlock>
  asFiber?<T>(fiber: string, work: () => T): T
  endFiber?(fiber: string): Promise<void>
}

function handle<T>(offered: T | undefined, name: string): T {
  if (offered === undefined) throw new NotApplicable(name)
  return offered
}

function registered<P>(
  fixture: ToolBindingRegistryFixture<P>,
  authority: ToolAuthority,
  digest: string,
  what: string,
): ToolContribution {
  const outcome = fixture.registry.register({
    ...fixture.access,
    loaded: fixture.loaded(authority, digest),
    authority,
  })
  if ('failure' in outcome)
    assert.fail(`${what}: expected a contribution, got ${JSON.stringify(outcome.failure)}`)
  return outcome.ok
}

function refusal<P>(
  fixture: ToolBindingRegistryFixture<P>,
  authority: ToolAuthority,
  digest: string,
  what: string,
): ToolContributionFailure {
  const outcome = fixture.registry.register({
    ...fixture.access,
    loaded: fixture.loaded(authority, digest),
    authority,
  })
  if ('ok' in outcome) assert.fail(`${what}: expected a failure, got a contribution`)
  return outcome.failure
}

function inFiber<P, T>(fixture: ToolBindingRegistryFixture<P>, fiber: string, work: () => T): T {
  if (fixture.asFiber === undefined) throw new NotApplicable('asFiber')
  return fixture.asFiber(fiber, work)
}

function entriesOf<P>(fixture: ToolBindingRegistryFixture<P>): readonly ToolBindingEntry[] {
  const snapshot = fixture.registry.snapshot({ scope: 'system' })
  if ('failure' in snapshot) assert.fail(`snapshot: ${JSON.stringify(snapshot.failure)}`)
  return snapshot.ok
}

const bindingCase = <P>(
  name: string,
  run: (fixture: ToolBindingRegistryFixture<P>) => Promise<void>,
): ConformanceCase<ToolBindingRegistryFixture<P>> => ({ name, clause: 'G7', run })

/** The G7 cases: recognition, conflict, successor, late release, race and the registry reads. */
export function toolBindingRegistryConformance<P>(): readonly ConformanceCase<
  ToolBindingRegistryFixture<P>
>[] {
  return [
    bindingCase<P>(
      'register answers the key, a token and an ordinal, and the entry is live',
      async fixture => {
        const contribution = registered(fixture, fixture.authority, 'digest-1', 'register')
        assert.ok(
          sameBindingKey(contribution.key, {
            layer: fixture.authority.layer,
            asset: fixture.authority.asset,
          }),
        )
        assert.ok(contribution.token.length > 0, 'the contribution names a token')
        assert.match(contribution.ordinal, /^(0|[1-9][0-9]*)$/u)
        const [entry, ...rest] = entriesOf(fixture)
        assert.equal(rest.length, 0)
        assert.ok(entry !== undefined && sameBindingKey(entry.key, contribution.key))
        assert.equal(entry.state, 'live')
        assert.equal(entry.digest, 'digest-1')
        assert.equal(entry.ordinal, contribution.ordinal)
      },
    ),

    bindingCase<P>(
      'the same fiber registering the same key with the same digest is recognised',
      async fixture => {
        const first = inFiber(fixture, 'fiber-1', () =>
          registered(fixture, fixture.authority, 'digest-1', 'register'),
        )
        const again = inFiber(fixture, 'fiber-1', () =>
          registered(fixture, fixture.authority, 'digest-1', 'register again'),
        )
        assert.equal(again.token, first.token)
        assert.equal(again.ordinal, first.ordinal)
        assert.equal(entriesOf(fixture).length, 1)
      },
    ),

    bindingCase<P>(
      'another digest or another fiber on a held key is a conflict and the original stands',
      async fixture => {
        const first = inFiber(fixture, 'fiber-1', () =>
          registered(fixture, fixture.authority, 'digest-1', 'register'),
        )
        const otherDigest = inFiber(fixture, 'fiber-1', () =>
          refusal(fixture, fixture.authority, 'digest-2', 'other digest'),
        )
        assert.deepEqual(otherDigest, { kind: 'conflict' })
        const otherFiber = inFiber(fixture, 'fiber-2', () =>
          refusal(fixture, fixture.authority, 'digest-1', 'other fiber'),
        )
        assert.deepEqual(otherFiber, { kind: 'conflict' })
        const entries = entriesOf(fixture)
        assert.equal(entries.length, 1)
        assert.equal(entries[0]?.digest, 'digest-1')
        assert.equal(entries[0]?.ordinal, first.ordinal)
      },
    ),

    bindingCase<P>(
      'a successor registers once the original released, with a new token and a later ordinal',
      async fixture => {
        const original = inFiber(fixture, 'fiber-1', () =>
          registered(fixture, fixture.authority, 'digest-1', 'register'),
        )
        assert.deepEqual(original.release(), { removed: true })
        const successor = inFiber(fixture, 'fiber-2', () =>
          registered(fixture, fixture.authority, 'digest-2', 'successor'),
        )
        assert.notEqual(successor.token, original.token)
        assert.ok(BigInt(successor.ordinal) > BigInt(original.ordinal), 'ordinals are monotonic')
      },
    ),

    bindingCase<P>(
      'a late release of the original removes nothing and leaves the successor',
      async fixture => {
        const original = inFiber(fixture, 'fiber-1', () =>
          registered(fixture, fixture.authority, 'digest-1', 'register'),
        )
        original.release()
        const successor = inFiber(fixture, 'fiber-2', () =>
          registered(fixture, fixture.authority, 'digest-2', 'successor'),
        )
        assert.deepEqual(original.release(), { removed: false })
        const entries = entriesOf(fixture)
        assert.equal(entries.length, 1)
        assert.equal(entries[0]?.ordinal, successor.ordinal)
        assert.deepEqual(successor.release(), { removed: true })
        assert.deepEqual(successor.release(), { removed: false })
      },
    ),

    bindingCase<P>(
      'two fibers racing for one key: the first in the ordering domain wins, the other conflicts',
      async fixture => {
        const outcomes = [
          inFiber(fixture, 'fiber-1', () =>
            fixture.registry.register({
              ...fixture.access,
              loaded: fixture.loaded(fixture.authority, 'digest-1'),
              authority: fixture.authority,
            }),
          ),
          inFiber(fixture, 'fiber-2', () =>
            fixture.registry.register({
              ...fixture.access,
              loaded: fixture.loaded(fixture.authority, 'digest-1'),
              authority: fixture.authority,
            }),
          ),
        ]
        const won = outcomes.filter(outcome => 'ok' in outcome)
        assert.equal(won.length, 1, 'exactly one contribution stands')
        const lost = outcomes.find(outcome => 'failure' in outcome)
        assert.deepEqual(lost !== undefined && 'failure' in lost ? lost.failure : null, {
          kind: 'conflict',
        })
      },
    ),

    bindingCase<P>('the end of a fiber withdraws its contribution once', async fixture => {
      const endFiber = handle(fixture.endFiber, 'endFiber')
      const original = inFiber(fixture, 'fiber-1', () =>
        registered(fixture, fixture.authority, 'digest-1', 'register'),
      )
      await endFiber.call(fixture, 'fiber-1')
      assert.equal(entriesOf(fixture).length, 0)
      const successor = inFiber(fixture, 'fiber-2', () =>
        registered(fixture, fixture.authority, 'digest-1', 'successor'),
      )
      assert.deepEqual(original.release(), { removed: false })
      assert.equal(entriesOf(fixture)[0]?.ordinal, successor.ordinal)
    }),

    bindingCase<P>('two keys of one capability are separate contributions', async fixture => {
      const other = handle(fixture.otherAuthority, 'otherAuthority')
      const first = registered(fixture, fixture.authority, 'digest-1', 'register')
      const second = registered(fixture, other, 'digest-2', 'register other key')
      assert.notEqual(second.token, first.token)
      assert.equal(entriesOf(fixture).length, 2)
      assert.deepEqual(second.release(), { removed: true })
      assert.equal(entriesOf(fixture).length, 1)
    }),

    bindingCase<P>(
      'a refused origin registers nothing, and the failure keeps its kind',
      async fixture => {
        const foreign = handle(fixture.foreignAuthority, 'foreignAuthority')
        assert.deepEqual(refusal(fixture, foreign, 'digest-1', 'foreign origin'), {
          kind: 'denied',
        })
        assert.equal(entriesOf(fixture).length, 0)
      },
    ),

    bindingCase<P>(
      'a loaded registration whose key is not the verified key is invalid',
      async fixture => {
        const other = handle(fixture.otherAuthority, 'otherAuthority')
        const outcome = fixture.registry.register({
          ...fixture.access,
          loaded: fixture.loaded(other, 'digest-1'),
          authority: fixture.authority,
        })
        assert.ok(
          'failure' in outcome && outcome.failure.kind === 'invalid',
          'a key mismatch is invalid',
        )
        assert.equal(entriesOf(fixture).length, 0)
      },
    ),

    bindingCase<P>(
      'close marks draining, reopen clears it, drain reports pins, and the contribution stays',
      async fixture => {
        const contribution = registered(fixture, fixture.authority, 'digest-1', 'register')
        assert.deepEqual(fixture.registry.pins(contribution.key), { ok: '0' })
        assert.deepEqual(fixture.registry.close(contribution.key), { ok: undefined })
        assert.equal(entriesOf(fixture)[0]?.state, 'draining')
        assert.deepEqual(fixture.registry.drain(contribution.key), {
          ok: { pins: '0', inflight: [] },
        })
        assert.deepEqual(fixture.registry.reopen(contribution.key), { ok: undefined })
        assert.equal(entriesOf(fixture)[0]?.state, 'live')
        const unknown: ToolBindingKey = {
          ...contribution.key,
          asset: { ...contribution.key.asset, name: 'absent' },
        }
        assert.deepEqual(fixture.registry.pins(unknown), { failure: { kind: 'unknown-key' } })
        assert.deepEqual(fixture.registry.close(unknown), { failure: { kind: 'unknown-key' } })
      },
    ),

    bindingCase<P>(
      'a tenant scope sees official and own-layer entries, not the entries of another tenant',
      async fixture => {
        const other = handle(fixture.otherAuthority, 'otherAuthority')
        registered(fixture, fixture.authority, 'digest-1', 'register')
        registered(fixture, other, 'digest-2', 'register other key')
        const own = fixture.registry.snapshot(fixture.access)
        if ('failure' in own) assert.fail('snapshot of the registrant')
        assert.equal(own.ok.length, 2)
        const stranger: Access<P> = {
          principal: fixture.access.principal,
          tenant: testingTenant('org_c0nf0rmance0ther0000000000', 'acc_c0nf0rmance0ther0000000000'),
        }
        const seen = fixture.registry.snapshot(stranger)
        if ('failure' in seen) assert.fail('snapshot of another tenant')
        for (const entry of seen.ok)
          assert.ok(
            entry.key.layer.kind === 'official' || visibleTo(entry.key.layer, stranger.tenant),
            'another tenant saw a tenant or workspace entry it may not access',
          )
      },
    ),
  ]
}

/** G7 access by layer: official to every tenant, organization to the same organization, tenant to the same tenant. */
function visibleTo(layer: SourceLayer, tenant: Access<unknown>['tenant']): boolean {
  switch (layer.kind) {
    case 'official':
      return true
    case 'organization':
      return layer.organization.text === tenant.organization.text
    case 'tenant':
      return (
        layer.tenant.organization.text === tenant.organization.text &&
        layer.tenant.account.text === tenant.account.text
      )
    case 'workspace':
      // The double has no workspace grants: a workspace entry is visible to no tenant scope.
      return false
    default: {
      const unreachable: never = layer
      return unreachable
    }
  }
}

// ---------------------------------------------------------------------------------------------
// The non-durable binding registry
// ---------------------------------------------------------------------------------------------

export interface MemoryToolBindingRegistry<P> extends ToolBindingRegistryService<P> {
  readonly durability: 'none'
  readonly controls: Readonly<{
    asFiber<T>(fiber: string, work: () => T): T
    endFiber(fiber: string): Promise<void>
    /** The answer of the origin check for an authority, by the text of its holding evidence. */
    verify(authority: ToolAuthority): Outcome<ToolAuthority, ToolAuthorityFailure>
  }>
}

type Entry = {
  readonly token: string
  readonly ordinal: string
  readonly fiber: string
  readonly digest: string
  readonly key: ToolBindingKey
  readonly contribution: ToolContribution
  readonly entry: { state: 'live' | 'draining'; shape: ToolBindingEntry['shape'] }
}

const AMBIENT_FIBER = 'ambient'

/** The grants of the in-memory registry: which holdings the origin check accepts, and for which registrant tenants. */
export type ToolBindingGrant = Readonly<{
  authority: ToolAuthority
  /** The tenants that may register at this authority's layer; null admits every tenant. */
  registrants: readonly Access<unknown>['tenant'][] | null
}>

const sameEvidence = (left: DurableEvidence, right: DurableEvidence): boolean =>
  left.owner === right.owner && left.record === right.record && left.digest === right.digest

/**
 * A binding registry in memory. The origin check, the conflict test and the write are one
 * synchronous step, so no other register can come between them. The entry is keyed by the
 * verified binding key; it is recognised by the same fiber with the same digest, and removed only
 * by its own token, whether by `release` or by the end of its fiber (G7).
 */
export function createMemoryToolBindingRegistry<P>(
  grants: readonly ToolBindingGrant[],
): MemoryToolBindingRegistry<P> {
  const entries: Entry[] = []
  const ended = new Set<string>()
  const fibers = new AsyncLocalStorage<string>()
  let minted = 0

  const find = (key: ToolBindingKey): Entry | undefined =>
    entries.find(entry => sameBindingKey(entry.key, key))
  const verify = (authority: ToolAuthority): Outcome<ToolAuthority, ToolAuthorityFailure> => {
    const grant = grants.find(candidate =>
      sameEvidence(candidate.authority.holding, authority.holding),
    )
    if (grant === undefined) return fail({ kind: 'denied' })
    if (!sameSourceLayer(grant.authority.layer, authority.layer))
      return fail({ kind: 'invalid', reason: 'layer' })
    return succeed(grant.authority)
  }
  const admits = (tenant: Access<unknown>['tenant'], authority: ToolAuthority): boolean => {
    const grant = grants.find(candidate =>
      sameEvidence(candidate.authority.holding, authority.holding),
    )
    if (grant === undefined || grant.registrants === null) return grant !== undefined
    return grant.registrants.some(
      candidate =>
        candidate.organization.text === tenant.organization.text &&
        candidate.account.text === tenant.account.text,
    )
  }
  const remove = (token: string): boolean => {
    const index = entries.findIndex(entry => entry.token === token)
    if (index < 0) return false
    entries.splice(index, 1)
    return true
  }

  const registry: ToolBindingRegistryService<P> = {
    register: input => {
      const fiber = fibers.getStore() ?? AMBIENT_FIBER
      const verified = verify(input.authority)
      if ('failure' in verified) return verified
      if (!admits(input.tenant, input.authority)) return fail({ kind: 'denied' })
      const key: ToolBindingKey = { layer: verified.ok.layer, asset: verified.ok.asset }
      if (!sameBindingKey(input.loaded.key, key)) return fail({ kind: 'invalid', reason: 'key' })
      if (ended.has(fiber))
        return fail({ kind: 'unavailable', diagnostic: 'the caller fiber has exited' })
      const digest = input.loaded.executor.digest
      const existing = find(key)
      if (existing !== undefined) {
        const same = existing.fiber === fiber && existing.digest === digest
        return same ? succeed(existing.contribution) : fail({ kind: 'conflict' })
      }
      minted += 1
      const token = `contribution-${minted}`
      const ordinal = String(minted)
      const contribution: ToolContribution = Object.freeze({
        key,
        token,
        ordinal,
        release: () => Object.freeze({ removed: remove(token) }),
      })
      entries.push({
        token,
        ordinal,
        fiber,
        digest,
        key,
        contribution,
        entry: { state: 'live', shape: input.loaded.shape },
      })
      return succeed(contribution)
    },
    snapshot: scope =>
      succeed(
        Object.freeze(
          entries
            .filter(entry => 'scope' in scope || visibleTo(entry.key.layer, scope.tenant))
            .map(entry =>
              Object.freeze({
                key: entry.key,
                ordinal: entry.ordinal,
                digest: entry.digest,
                shape: entry.entry.shape,
                state: entry.entry.state,
                fiber: entry.fiber,
              }),
            ),
        ),
      ),
    pins: key => (find(key) === undefined ? fail({ kind: 'unknown-key' }) : succeed('0')),
    close: key => {
      const entry = find(key)
      if (entry === undefined) return fail({ kind: 'unknown-key' })
      entry.entry.state = 'draining'
      return succeed(undefined)
    },
    reopen: key => {
      const entry = find(key)
      if (entry === undefined) return fail({ kind: 'unknown-key' })
      entry.entry.state = 'live'
      return succeed(undefined)
    },
    drain: key =>
      find(key) === undefined
        ? fail({ kind: 'unknown-key' })
        : succeed(Object.freeze({ pins: '0', inflight: Object.freeze([]) })),
  }

  const controls: MemoryToolBindingRegistry<P>['controls'] = {
    asFiber: (fiber, work) => fibers.run(fiber, work),
    endFiber: fiber => {
      ended.add(fiber)
      // Release mutates `entries`: pick the fiber's entries first, then release them.
      for (const entry of entries.filter(item => item.fiber === fiber)) entry.contribution.release()
      return Promise.resolve()
    },
    verify,
  }
  return Object.freeze({ ...registry, durability: 'none' as const, controls })
}

/** A tool scope definition for the fixture: a read_file function tool at version `revision`. */
function fixtureDefinition(name: string, adoption: Adoption): ToolDefinition {
  return {
    adoption,
    name,
    description: `The ${name} tool.`,
    requiredCapabilities: [],
    backgroundAllowed: false,
    declarations: {
      adoption: {
        owner: 'conformance',
        name: 'declarations',
        revision: '1',
        digest: 'sha256:declarations',
      },
      environment: null,
      attachments: [],
      inputModalities: [],
      outputModalities: [],
      settings: null,
    },
    kind: 'function',
    parameters: {
      schema: {
        kind: 'object',
        entries: [{ key: 'type', value: { kind: 'string', value: 'object' } }],
      },
      vocabulary: {
        owner: 'conformance',
        name: 'json-schema',
        revision: '1',
        digest: 'sha256:json-schema',
      },
      descriptions: [],
    },
    returns: { kind: 'ordinary', program: { kind: 'none' } },
  }
}

const evidenceOf = (record: string): DurableEvidence => ({
  owner: 'conformance',
  record,
  revision: '1',
  digest: `sha256:${record}`,
})

function authorityOf(
  layer: SourceLayer,
  name: string,
  revision: string,
  holding: string,
): ToolAuthority {
  return {
    layer,
    asset: {
      name,
      adoption: { owner: 'conformance', name, revision, digest: `sha256:${name}-${revision}` },
    },
    holding: evidenceOf(holding),
    publication: evidenceOf(`${holding}-publication`),
  }
}

/**
 * A loaded registration for the double. Only a trusted loader builds this handle in production;
 * the double builds it for the suite and never leaves the testing entry.
 */
function loadedFor(
  authority: ToolAuthority,
  digest: string,
): ToolLoadedRegistration<unknown, ContentBlock> {
  const definition = fixtureDefinition(authority.asset.name, authority.asset.adoption)
  if (definition.kind !== 'function') throw new Error('the fixture definition is a function tool')
  const loaded = {
    implementation: Object.freeze({
      facts: Object.freeze({
        implements: {
          kind: 'function',
          parameters: definition.parameters,
          returns: definition.returns,
        },
        description: definition.description,
        backgroundAllowed: definition.backgroundAllowed,
        declarations: definition.declarations,
      }),
    }),
    key: { layer: authority.layer, asset: authority.asset },
    definition,
    shape: shapeOf(definition),
    executor: { owner: 'conformance', name: 'executor', revision: '1', digest },
    settings: { owner: 'conformance', name: 'settings', revision: '1', digest: 'sha256:settings' },
  }
  // The brand of a loaded registration has no run-time value; the double is the trusted loader here.
  return loaded as unknown as ToolLoadedRegistration<unknown, ContentBlock>
}

/** A fresh fixture over a fresh in-memory binding registry, with every control handle. */
export function memoryToolBindingRegistryFixture(): ToolBindingRegistryFixture<string> {
  const tenant = testingTenant('org_c0nf0rmance000000000000000', 'acc_c0nf0rmance000000000000000')
  const access: Access<string> = { principal: 'registrant', tenant }
  const authority = authorityOf({ kind: 'official' }, 'read_file', '1', 'holding-official')
  const otherAuthority = authorityOf({ kind: 'tenant', tenant }, 'read_file', '2', 'holding-tenant')
  const foreignAuthority = authorityOf({ kind: 'official' }, 'read_file', '3', 'holding-unknown')
  const registry = createMemoryToolBindingRegistry<string>([
    { authority, registrants: null },
    { authority: otherAuthority, registrants: [tenant] },
  ])
  return {
    registry,
    access,
    authority,
    otherAuthority,
    foreignAuthority,
    loaded: loadedFor,
    asFiber: registry.controls.asFiber,
    endFiber: registry.controls.endFiber,
  }
}

// ---------------------------------------------------------------------------------------------
// The dynamics suite skeleton (RFC-0012, SYS-DYNAMIC for Tool)
// ---------------------------------------------------------------------------------------------

/**
 * What the dynamics suite will drive: a real Cordis `Context` with the five stable providers, the
 * generation coordinator and a session reference reader. The handles are named here so 2.5 fills
 * the case bodies against a fixed fixture shape; every case reports not applicable until then.
 */
export interface ToolDynamicsFixture {
  readonly context?: unknown
  readonly generations?: unknown
  readonly residency?: unknown
}

/** The ten criteria of RFC-0012「验收判据」, in order. */
export const TOOL_DYNAMICS_CRITERIA = [
  'the fiber uid of toolRuntime, toolCommands, toolReads and toolInstances is unchanged across a load',
  'same-key recognition and conflict; release withdraws only its own token; a late release leaves the successor',
  'unload with a referencing session and no same-shape substitute returns retained and the contribution stays live',
  'unload without references or in-flight calls goes draining to released; resolve then answers unavailable; the fiber is DISPOSED',
  'old and new versions coexist; a different-shape new version serves new sessions only',
  'a refresh during a Run routes later calls to a same-shape new implementation; the recorded basis is unchanged',
  'a different-shape new version keeps the old one; the session stays usable',
  'a sudden fiber removal gives known-unavailable; in-flight calls recover as unknown; a reload continues at the next adoption point',
  'no same-shape contribution, missing package and a different-shape winner: the next adoption point freezes once; repeats are no-ops',
  'unrelated capabilities see zero failures throughout; P16 directory and Catalog absence semantics are unchanged',
] as const

const dynamicsCase = (index: number, name: string): ConformanceCase<ToolDynamicsFixture> => ({
  name: `dynamics ${index + 1}: ${name}`,
  clause: 'RFC-0012',
  run: () => {
    // The case body arrives with 2.5 (coordinator and author plugin on real Cordis 4.0.4).
    throw new NotApplicable('generations')
  },
})

/** The dynamics suite skeleton: ten named cases, each not applicable until 2.5 fills it. */
export function runToolDynamicsSuite(): readonly ConformanceCase<ToolDynamicsFixture>[] {
  return TOOL_DYNAMICS_CRITERIA.map((name, index) => dynamicsCase(index, name))
}
