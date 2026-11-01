// The evaluation of one profile snapshot: which same-route profile wins, what the requirement
// allows, and what a list offers. Every case drives the public factory `createModelProfiles` with
// a stub source, so a snapshot reaches the judge exactly as a real source hands it over.
import { organizationCodec, tenantCodec, type TenantId } from '@omne-harness/legal-identity'
import type {
  Adoption,
  DurableEvidence,
  ModalityRequirement,
  ModelProfile,
  ProfileResolution,
  ProfileScope,
} from '@omne-harness/model-contract'
import type {
  ModelChoices,
  ModelProfileSnapshot,
  ModelProfileSource,
} from '@omne-harness/model-contract/provider'
import { decodeRevision } from '@omne-harness/model-contract'
import type { Outcome } from '@omne-harness/operation-result'
import { createModelProfiles } from '@omne-harness/model'
import { expect, it } from 'vitest'

type Candidate = ModelProfileSnapshot['candidates'][number]

function must<T>(outcome: Outcome<T, unknown>): T {
  if ('ok' in outcome) return outcome.ok
  throw new Error(`expected success, got ${JSON.stringify(outcome.failure)}`)
}

function failureOf<T>(outcome: Outcome<T, unknown>): unknown {
  if ('failure' in outcome) return outcome.failure
  throw new Error('expected a failure')
}

const evidence: DurableEvidence = {
  owner: 'model-tests',
  record: 'profiles',
  revision: '1',
  digest: 'digest-profiles',
}

const adoption = (name: string): Adoption => ({
  owner: 'model-tests',
  name,
  revision: '1',
  digest: `digest-${name}`,
})

function scopeName(scope: ProfileScope): string {
  switch (scope.kind) {
    case 'factory':
      return 'factory'
    case 'organization':
      return `organization-${scope.organization.text}`
    case 'tenant':
      return `tenant-${scope.tenant.organization.text}-${scope.tenant.account.text}`
  }
}

const factory: ProfileScope = { kind: 'factory' }

/** A profile on `route` in `scope`, with the input modalities a case needs. */
function profileOf(
  over: Readonly<{
    route?: string
    scope?: ProfileScope
    input?: ModelProfile['definition']['input']
    availability?: ModelProfile['availability']
  }> = {},
): ModelProfile {
  const scope = over.scope ?? factory
  const route = over.route ?? 'alpha'
  return {
    identity: { scope, route },
    adoption: adoption(`profile-${route}-${scopeName(scope)}`),
    revision: must(decodeRevision('1')),
    updatedAt: '2026-11-01T00:00:00Z',
    availability: over.availability ?? 'active',
    definition: {
      suppliers: [{ adoption: adoption('supplier'), recipient: 'openrouter', model: route }],
      fallback: false,
      input: over.input ?? ['text', 'image'],
      output: ['text'],
      context: {
        window: { provided: '1000', upstream: [] },
        input: null,
        output: { provided: '100', upstream: [] },
        compactionTriggerPercent: '80',
      },
      limits: [],
      parameters: [],
      representation: adoption('representation'),
      meter: adoption('meter'),
      retryPolicy: adoption('retry'),
    },
  }
}

function candidateOf(
  profile: ModelProfile,
  over: Partial<Pick<Candidate, 'excluded' | 'locked' | 'credential'>> = {},
): Candidate {
  return { profile, excluded: false, locked: false, credential: 'unavailable', ...over }
}

function snapshotOf(
  candidates: readonly Candidate[],
  over: Readonly<{ precedence?: readonly ProfileScope[] }> = {},
): ModelProfileSnapshot {
  return { precedence: over.precedence ?? [factory], candidates, source: evidence }
}

function requirement(
  modalities: ModalityRequirement['modalities'] = ['text'],
): ModalityRequirement {
  return { modalities, source: evidence }
}

function tenantOf(organization: string, account: string): TenantId {
  const parsed = tenantCodec.parse(
    JSON.stringify({
      organization: `org_${organization.padStart(26, '0')}`,
      account: `acc_${account.padStart(26, '0')}`,
    }),
  )
  if (!parsed.ok) throw new Error('fixture tenant')
  return parsed.value
}

function organizationOf(name: string): ProfileScope & { kind: 'organization' } {
  const parsed = organizationCodec.parse(`org_${name.padStart(26, '0')}`)
  if (!parsed.ok) throw new Error('fixture organization')
  return { kind: 'organization', organization: parsed.value }
}

const principal = { owner: 'model-tests', subject: 'reader' }

/** A source that hands over one snapshot and records the accesses it read for. */
function sourceOf(snapshot: ModelProfileSnapshot) {
  const reads: unknown[] = []
  const source: ModelProfileSource<unknown> = {
    read: async input => {
      reads.push(input)
      return { ok: snapshot }
    },
  }
  return { source, reads }
}

function profilesOf(snapshot: ModelProfileSnapshot, tenant = tenantOf('1', '1')) {
  const { source, reads } = sourceOf(snapshot)
  return { profiles: createModelProfiles(source), reads, tenant }
}

async function resolveOf(snapshot: ModelProfileSnapshot, route: string, required = requirement()) {
  const { profiles, tenant } = profilesOf(snapshot)
  return must(await profiles.resolve({ principal, tenant, route, required }))
}

async function listOf(
  snapshot: ModelProfileSnapshot,
  selected: string | null,
  required = requirement(),
) {
  const { profiles, tenant } = profilesOf(snapshot)
  return must(await profiles.list({ principal, tenant, selected, required }))
}

function routesOf(choices: ModelChoices): readonly string[] {
  return choices.choices.map(choice =>
    choice.kind === 'resolved' ? choice.profile.identity.route : 'absent',
  )
}

function resolvedOf(resolution: ProfileResolution) {
  if (resolution.kind !== 'resolved') throw new Error(`expected resolved, got ${resolution.kind}`)
  return resolution
}

// --- one rule per case ----------------------------------------------------------------------

it('names a route that no candidate carries as unknown-name', async () => {
  const snapshot = snapshotOf([candidateOf(profileOf({ route: 'alpha' }))])
  expect(await resolveOf(snapshot, 'beta')).toEqual({ kind: 'absent', reason: 'unknown-name' })
})

it('names every same-route profile withdrawn as withdrawn', async () => {
  const snapshot = snapshotOf(
    [
      candidateOf(profileOf({ route: 'alpha', availability: 'withdrawn' })),
      candidateOf(
        profileOf({ route: 'alpha', scope: organizationOf('2'), availability: 'withdrawn' }),
        { excluded: true },
      ),
    ],
    { precedence: [factory, organizationOf('2')] },
  )
  expect(await resolveOf(snapshot, 'alpha')).toEqual({ kind: 'absent', reason: 'withdrawn' })
})

it('names registered profiles that are all excluded as excluded', async () => {
  const snapshot = snapshotOf(
    [
      candidateOf(profileOf({ route: 'alpha' }), { excluded: true }),
      candidateOf(profileOf({ route: 'alpha', scope: organizationOf('2'), input: ['image'] }), {
        excluded: true,
      }),
    ],
    { precedence: [factory, organizationOf('2')] },
  )
  expect(await resolveOf(snapshot, 'alpha')).toEqual({ kind: 'absent', reason: 'excluded' })
})

it('lets the most specific layer win a same route and lists the lower ones as shadowed', async () => {
  const low = profileOf({ route: 'alpha' })
  const high = profileOf({ route: 'alpha', scope: organizationOf('2') })
  const snapshot = snapshotOf([candidateOf(high), candidateOf(low)], {
    precedence: [factory, organizationOf('2')],
  })
  const resolution = resolvedOf(await resolveOf(snapshot, 'alpha'))
  expect(resolution.profile).toBe(high)
  expect(resolution.shadowed).toEqual([low.adoption])
})

it('lets an active lower layer win when the higher layer is withdrawn (contract 854/860, O1)', async () => {
  // O1: model-contract 1275 says a shadowed low item must not take over automatically. The
  // accepted decision (D2 第 6 条) writes these cases to the 854/860 reading and leaves the
  // conflict with the contract owner. M2 has one layer, so no official profile reaches this.
  const low = profileOf({ route: 'alpha' })
  const high = profileOf({ route: 'alpha', scope: organizationOf('2'), availability: 'withdrawn' })
  const snapshot = snapshotOf([candidateOf(high), candidateOf(low)], {
    precedence: [factory, organizationOf('2')],
  })
  const resolution = resolvedOf(await resolveOf(snapshot, 'alpha'))
  expect(resolution.profile).toBe(low)
  expect(resolution.shadowed).toEqual([])
})

it('leaves a withdrawn or an excluded lower layer out of shadowed', async () => {
  const withdrawn = profileOf({ route: 'alpha', availability: 'withdrawn' })
  const excluded = profileOf({ route: 'alpha', scope: organizationOf('2') })
  const winner = profileOf({ route: 'alpha', scope: organizationOf('3') })
  const snapshot = snapshotOf(
    [candidateOf(withdrawn), candidateOf(excluded, { excluded: true }), candidateOf(winner)],
    { precedence: [factory, organizationOf('2'), organizationOf('3')] },
  )
  expect(resolvedOf(await resolveOf(snapshot, 'alpha')).shadowed).toEqual([])
})

it('adds the locked reason to a locked winner and makes it unselectable', async () => {
  const snapshot = snapshotOf([candidateOf(profileOf(), { locked: true })])
  const resolution = resolvedOf(await resolveOf(snapshot, 'alpha'))
  expect(resolution.reasons).toEqual(['locked'])
  expect(resolution.selectable).toBe(false)
})

it('adds the modality reason when the winner does not cover the requirement', async () => {
  const winner = profileOf({ input: ['text'] })
  const snapshot = snapshotOf([candidateOf(winner)])
  const resolution = resolvedOf(await resolveOf(snapshot, 'alpha', requirement(['text', 'voice'])))
  expect(resolution.profile).toBe(winner)
  expect(resolution.reasons).toEqual(['modality'])
  expect(resolution.selectable).toBe(false)
})

it('does not let a video requirement through, since no profile can declare it', async () => {
  const snapshot = snapshotOf([candidateOf(profileOf({ input: ['text', 'image'] }))])
  expect(
    resolvedOf(await resolveOf(snapshot, 'alpha', requirement(['text', 'video']))).reasons,
  ).toEqual(['modality'])
})

it('keeps a winner without a credential selectable and reports the state it was given', async () => {
  const snapshot = snapshotOf([candidateOf(profileOf(), { credential: 'missing' })])
  const resolution = resolvedOf(await resolveOf(snapshot, 'alpha'))
  expect(resolution.selectable).toBe(true)
  expect(resolution.reasons).toEqual([])
  expect(resolution.credential).toBe('missing')
})

it('reports the credential state of the winner, available included', async () => {
  const snapshot = snapshotOf([candidateOf(profileOf(), { credential: 'available' })])
  expect(resolvedOf(await resolveOf(snapshot, 'alpha')).credential).toBe('available')
})

it('lists only selectable profiles, one per route, in the order the routes first appear', async () => {
  const snapshot = snapshotOf(
    [
      candidateOf(profileOf({ route: 'beta' }), { excluded: true }),
      candidateOf(profileOf({ route: 'alpha' })),
      candidateOf(profileOf({ route: 'beta', scope: organizationOf('2') })),
      candidateOf(profileOf({ route: 'gamma', input: ['text'] })),
    ],
    { precedence: [factory, organizationOf('2')] },
  )
  // The excluded factory beta drops out and the organization beta takes its place; gamma's winner
  // covers text only, so it is not a choice. Beta comes first because it appears first.
  const choices = await listOf(snapshot, null, requirement(['text', 'image']))
  expect(routesOf(choices)).toEqual(['beta', 'alpha'])
  expect(
    choices.choices.map(choice =>
      choice.kind === 'resolved' ? choice.profile.identity.scope : null,
    ),
  ).toEqual([
    { kind: 'organization', organization: organizationOf('2').organization },
    { kind: 'factory' },
  ])
  expect(choices.source).toEqual(evidence)
  expect(choices.selected).toBeNull()
})

it('explains a selection the snapshot cannot offer instead of dropping it', async () => {
  const snapshot = snapshotOf([candidateOf(profileOf({ route: 'alpha' }))])
  const choices = await listOf(snapshot, 'missing')
  expect(choices.selected).toEqual({
    route: 'missing',
    resolution: { kind: 'absent', reason: 'unknown-name' },
  })
  expect(routesOf(choices)).toEqual(['alpha'])
})

it('keeps a selection that is present but not selectable, with its reasons', async () => {
  const snapshot = snapshotOf([candidateOf(profileOf({ route: 'alpha' }), { locked: true })])
  const choices = await listOf(snapshot, 'alpha')
  expect(choices.choices).toEqual([])
  expect(choices.selected?.resolution).toMatchObject({
    kind: 'resolved',
    selectable: false,
    reasons: ['locked'],
  })
})

it('refuses a snapshot with a duplicated identity instead of using half of it', async () => {
  const snapshot = snapshotOf([
    candidateOf(profileOf()),
    candidateOf(profileOf({ input: ['text'] })),
  ])
  const { profiles, tenant } = profilesOf(snapshot)
  const failure = failureOf(
    await profiles.resolve({ principal, tenant, route: 'alpha', required: requirement() }),
  )
  expect(failure).toEqual({
    kind: 'unavailable',
    dependency: 'model-profiles',
    diagnostic: 'duplicate-profile-identity',
  })
})

it('refuses a snapshot whose candidate scope is outside the precedence', async () => {
  const snapshot = snapshotOf([candidateOf(profileOf({ scope: organizationOf('2') }))])
  const { profiles, tenant } = profilesOf(snapshot)
  const failure = failureOf(
    await profiles.list({ principal, tenant, selected: null, required: requirement() }),
  )
  expect(failure).toEqual({
    kind: 'unavailable',
    dependency: 'model-profiles',
    diagnostic: 'profile-scope-outside-precedence',
  })
})

it('denies an unminted tenant before reading the source', async () => {
  const snapshot = snapshotOf([candidateOf(profileOf())])
  const { profiles, reads } = profilesOf(snapshot)
  const copied = structuredClone(tenantOf('1', '1'))
  const refusal = { kind: 'denied', action: 'tenant' }
  expect(
    failureOf(
      await profiles.resolve({
        principal,
        tenant: copied,
        route: 'alpha',
        required: requirement(),
      }),
    ),
  ).toEqual(refusal)
  expect(
    failureOf(
      await profiles.list({ principal, tenant: copied, selected: null, required: requirement() }),
    ),
  ).toEqual(refusal)
  expect(reads).toEqual([])
})

it('hands a source failure back unchanged and never judges a missing snapshot', async () => {
  const unreadable = {
    failure: {
      kind: 'unavailable',
      dependency: 'model-profile-source',
      diagnostic: 'store-unreadable',
    },
  } as const
  const profiles = createModelProfiles<unknown>({ read: async () => unreadable })
  expect(
    failureOf(
      await profiles.resolve({
        principal,
        tenant: tenantOf('1', '1'),
        route: 'alpha',
        required: requirement(),
      }),
    ),
  ).toBe(unreadable.failure)
})
