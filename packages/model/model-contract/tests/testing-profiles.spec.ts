import { describe, expect, it } from 'vitest'
import {
  organizationCodec,
  tenantCodec,
  type Access,
  type OrganizationId,
  type TenantId,
} from '@omne-harness/legal-identity'
import type { Modality } from '@omne-harness/modality'
import type { Outcome } from '@omne-harness/operation-result'
import {
  decodeRevision,
  type Adoption,
  type DurableEvidence,
  type ModalityRequirement,
  type ModelModality,
  type ModelProfile,
  type ProfileResolution,
  type ProfileScope,
} from '@omne-harness/model-contract'
import type { ModelChoices } from '@omne-harness/model-contract/provider'
import {
  createScriptedModelProfiles,
  createScriptedModelRequestPreparation,
  createScriptedTransport,
  ScriptedModelError,
} from '@omne-harness/model-contract/testing'

// Every identity is minted by the codec that owns it, inside a helper that a test calls.
function mint(organization: string, account: string): TenantId {
  const parsed = tenantCodec.parse(
    JSON.stringify({
      organization: `org_${organization.padStart(26, '0')}`,
      account: `acc_${account.padStart(26, '0')}`,
    }),
  )
  if (!parsed.ok) throw new Error('Invalid tenant fixture')
  return parsed.value
}
function organization(name: string): OrganizationId {
  const parsed = organizationCodec.parse(`org_${name.padStart(26, '0')}`)
  if (!parsed.ok) throw new Error('Invalid organization fixture')
  return parsed.value
}
function must<T>(outcome: Outcome<T, unknown>): T {
  if ('ok' in outcome) return outcome.ok
  throw new Error(`expected success, got ${JSON.stringify(outcome.failure)}`)
}

/** A principal with a method and a closure: the double must keep it by reference. */
class Agent {
  readonly name: string
  readonly secret: () => string
  constructor(name: string) {
    this.name = name
    const hidden = `${name}-closure`
    this.secret = () => hidden
  }
  greet(): string {
    return `hello ${this.name}`
  }
}

const adoption = (name: string): Adoption => ({ owner: 'test', name, revision: '1', digest: 'd' })
const evidence = (label: string): DurableEvidence => ({
  owner: 'test',
  record: label,
  revision: '1',
  digest: `digest-${label}`,
})
const requirement = (
  modalities: readonly [Modality, ...Modality[]] = ['text'],
  revision = '1',
): ModalityRequirement => ({ modalities, source: { ...evidence('modality'), revision } })

function profileOf(
  over: Readonly<{
    route?: string
    scope?: ProfileScope
    input?: readonly [ModelModality, ...ModelModality[]]
    availability?: ModelProfile['availability']
  }> = {},
): ModelProfile {
  const upstream = [{ supplier: adoption('supplier'), limit: { kind: 'unknown' } }] as const
  return {
    identity: { scope: over.scope ?? { kind: 'factory' }, route: over.route ?? 'default' },
    adoption: adoption(`profile-${over.route ?? 'default'}`),
    revision: must(decodeRevision('1')),
    updatedAt: '2026-11-01T00:00:00Z',
    availability: over.availability ?? 'active',
    definition: {
      suppliers: [{ adoption: adoption('supplier'), recipient: 'recipient', model: 'model' }],
      fallback: false,
      input: over.input ?? ['text', 'image'],
      output: ['text'],
      context: {
        window: { provided: '100', upstream },
        input: null,
        output: { provided: '10', upstream },
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

const resolvedOf = (
  profile: ModelProfile,
  over: Partial<Extract<ProfileResolution, { kind: 'resolved' }>> = {},
): ProfileResolution => ({
  kind: 'resolved',
  profile,
  source: evidence('profile'),
  selectable: true,
  reasons: [],
  credential: 'available',
  shadowed: [],
  ...over,
})

const tenantA = () => mint('1', '1')
const sameOrganizationTenant = () => mint('1', '2')
const tenantB = () => mint('2', '3')

async function rejection(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise
  } catch (error) {
    return error
  }
  throw new Error('expected a rejection')
}

function scriptMisuse(run: () => void): ScriptedModelError {
  try {
    run()
  } catch (error) {
    if (error instanceof ScriptedModelError) return error
    throw error
  }
  throw new Error('expected a script misuse')
}

describe('the principal and the access (M01, M02)', () => {
  it('records the principal by reference and neither copies nor freezes it', async () => {
    const principal = new Agent('alice')
    const access: Access<Agent> = { tenant: tenantA(), principal }
    const scripted = createScriptedModelProfiles<Agent>()
    scripted.setAccess(access, 'allow')
    const required = requirement()
    const answer = resolvedOf(profileOf())
    scripted.setResolution({ ...access, route: 'default', required }, { ok: answer })
    const outcome = await scripted.profiles.resolve({ ...access, route: 'default', required })
    expect(must(outcome)).toEqual(answer)
    const [call] = scripted.calls()
    expect(call?.input.principal).toBe(principal)
    expect(call?.input.tenant).toBe(access.tenant)
    expect(Object.isFrozen(principal)).toBe(false)
    expect(principal.greet()).toBe('hello alice')
    expect(principal.secret()).toBe('alice-closure')
  })

  it('denies an access that was never allowed, a principal that only looks the same and a factory profile', async () => {
    const principal = new Agent('alice')
    const access: Access<Agent> = { tenant: tenantA(), principal }
    const scripted = createScriptedModelProfiles<Agent>()
    const required = requirement()
    // A factory profile is registered: its scope grants nothing.
    scripted.setResolution(
      { ...access, route: 'default', required },
      { ok: resolvedOf(profileOf()) },
    )
    expect(await scripted.profiles.resolve({ ...access, route: 'default', required })).toEqual({
      failure: { kind: 'denied', action: 'profiles.resolve' },
    })
    expect(
      await scripted.profiles.list({ ...access, selected: null, required: requirement() }),
    ).toEqual({ failure: { kind: 'denied', action: 'profiles.list' } })
    scripted.setAccess(access, 'allow')
    const lookalike: Access<Agent> = { tenant: access.tenant, principal: new Agent('alice') }
    expect(await scripted.profiles.resolve({ ...lookalike, route: 'default', required })).toEqual({
      failure: { kind: 'denied', action: 'profiles.resolve' },
    })
    scripted.setAccess(access, 'deny')
    expect(await scripted.profiles.resolve({ ...access, route: 'default', required })).toEqual({
      failure: { kind: 'denied', action: 'profiles.resolve' },
    })
  })

  it('denies an access whose tenant is not minted with the tenant action, before the control plane', async () => {
    const principal = new Agent('alice')
    const scripted = createScriptedModelProfiles<Agent>()
    const forged: TenantId = structuredClone(tenantA())
    expect(
      await scripted.profiles.resolve({
        tenant: forged,
        principal,
        route: 'default',
        required: requirement(),
      }),
    ).toEqual({ failure: { kind: 'denied', action: 'tenant' } })
    const error = scriptMisuse(() => scripted.setAccess({ tenant: forged, principal }, 'allow'))
    expect(error.reason).toBe('invalid-script')
  })
})

describe('tenant partitions (M03)', () => {
  it('answers each tenant from its own rows and finds nothing for an allowed tenant without rows', async () => {
    const principal = new Agent('alice')
    const first: Access<Agent> = { tenant: tenantA(), principal }
    const second: Access<Agent> = { tenant: tenantB(), principal }
    const required = requirement()
    const scripted = createScriptedModelProfiles<Agent>()
    scripted.setAccess(first, 'allow')
    scripted.setAccess(second, 'allow')
    const own = profileOf({ scope: { kind: 'tenant', tenant: first.tenant } })
    scripted.setResolution({ ...first, route: 'default', required }, { ok: resolvedOf(own) })
    const error = await rejection(
      scripted.profiles.resolve({ ...second, route: 'default', required }),
    )
    expect(error).toBeInstanceOf(ScriptedModelError)
    expect(error).toMatchObject({
      reason: 'invalid-script',
      message: 'no scripted profiles.resolve answer',
    })
    scripted.setResolution(
      { ...second, route: 'default', required },
      { ok: { kind: 'absent', reason: 'unknown-name' } },
    )
    expect(must(await scripted.profiles.resolve({ ...first, route: 'default', required }))).toEqual(
      resolvedOf(own),
    )
    expect(
      must(await scripted.profiles.resolve({ ...second, route: 'default', required })),
    ).toEqual({ kind: 'absent', reason: 'unknown-name' })
  })

  it('refuses to register a profile of another tenant or organization, and keeps the rows it had', async () => {
    const principal = new Agent('alice')
    const first: Access<Agent> = { tenant: tenantA(), principal }
    const second: Access<Agent> = { tenant: tenantB(), principal }
    const required = requirement()
    const scripted = createScriptedModelProfiles<Agent>()
    scripted.setAccess(second, 'allow')
    scripted.setResolution(
      { ...second, route: 'default', required },
      { ok: { kind: 'absent', reason: 'excluded' } },
    )
    const foreignTenant = profileOf({ scope: { kind: 'tenant', tenant: first.tenant } })
    const foreignOrganization = profileOf({
      scope: { kind: 'organization', organization: first.tenant.organization },
    })
    for (const profile of [foreignTenant, foreignOrganization]) {
      const error = scriptMisuse(() =>
        scripted.setResolution(
          { ...second, route: 'default', required },
          { ok: resolvedOf(profile) },
        ),
      )
      expect(error.reason).toBe('invalid-script')
    }
    expect(
      must(await scripted.profiles.resolve({ ...second, route: 'default', required })),
    ).toEqual({ kind: 'absent', reason: 'excluded' })
    // The organization scope of the tenant's own organization applies to every tenant in it.
    const sibling: Access<Agent> = { tenant: sameOrganizationTenant(), principal }
    scripted.setResolution(
      { ...sibling, route: 'default', required },
      { ok: resolvedOf(foreignOrganization) },
    )
  })

  it('refuses a preparation for a profile of another tenant without touching the transport', async () => {
    const principal = new Agent('alice')
    const first: Access<Agent> = { tenant: tenantA(), principal }
    const second: Access<Agent> = { tenant: tenantB(), principal }
    const transport = createScriptedTransport({
      receipt: {
        supplier: adoption('supplier'),
        representation: adoption('representation'),
        payloadDigest: 'none',
      },
      facts: [],
      ending: { kind: 'exhausted' },
      rejection: null,
    })
    const scripted = createScriptedModelRequestPreparation<Agent>({
      transport: transport.transport,
    })
    scripted.setAccess(second, 'allow')
    const outcome = await scripted.preparation.prepare({
      ...second,
      profile: profileOf({ scope: { kind: 'tenant', tenant: first.tenant } }),
      required: requirement(),
      assembled: {
        system: [],
        messages: [],
        tools: [],
        toolChoice: 'none',
        parameters: [],
        representation: adoption('representation'),
        source: adoption('source'),
      },
    })
    expect(outcome).toEqual({ failure: { kind: 'denied', action: 'prepare' } })
    expect(transport.counts().prepare).toBe(0)
  })
})

describe('the requirement takes part in the match (M04)', () => {
  it('finds no answer when only the source revision or the order of the modalities differs', async () => {
    const principal = new Agent('alice')
    const access: Access<Agent> = { tenant: tenantA(), principal }
    const scripted = createScriptedModelProfiles<Agent>()
    scripted.setAccess(access, 'allow')
    const registered = requirement(['text', 'image'])
    scripted.setResolution(
      { ...access, route: 'default', required: registered },
      { ok: resolvedOf(profileOf()) },
    )
    expect(
      must(await scripted.profiles.resolve({ ...access, route: 'default', required: registered })),
    ).toMatchObject({ kind: 'resolved' })
    for (const required of [
      requirement(['text', 'image'], '2'),
      requirement(['image', 'text']),
      requirement(['text', 'image', 'image']),
    ]) {
      const error = await rejection(
        scripted.profiles.resolve({ ...access, route: 'default', required }),
      )
      expect(error).toMatchObject({ message: 'no scripted profiles.resolve answer' })
    }
  })

  it('lets a script answer a history with video with no choices and a selection held back by modality', async () => {
    const principal = new Agent('alice')
    const access: Access<Agent> = { tenant: tenantA(), principal }
    const scripted = createScriptedModelProfiles<Agent>()
    scripted.setAccess(access, 'allow')
    const required = requirement(['text', 'video'])
    const held = resolvedOf(profileOf(), { selectable: false, reasons: ['modality'] })
    const answer: ModelChoices = {
      choices: [],
      selected: { route: 'default', resolution: held },
      source: evidence('choices'),
    }
    scripted.setList({ ...access, selected: 'default', required }, { ok: answer })
    expect(
      must(await scripted.profiles.list({ ...access, selected: 'default', required })),
    ).toEqual(answer)
    const error = await rejection(
      scripted.profiles.list({ ...access, selected: 'default', required: requirement(['text']) }),
    )
    expect(error).toMatchObject({ message: 'no scripted profiles.list answer' })
  })
})

describe('the selection (M05)', () => {
  const principal = new Agent('alice')
  const required = requirement()

  it('keeps a missing selection, a selected choice and a selection that no longer resolves apart', async () => {
    const access: Access<Agent> = { tenant: tenantA(), principal }
    const scripted = createScriptedModelProfiles<Agent>()
    scripted.setAccess(access, 'allow')
    const choice = resolvedOf(profileOf())
    const none: ModelChoices = { choices: [choice], selected: null, source: evidence('choices') }
    const chosen: ModelChoices = {
      choices: [choice],
      selected: { route: 'default', resolution: choice },
      source: evidence('choices'),
    }
    scripted.setList({ ...access, selected: null, required }, { ok: none })
    scripted.setList({ ...access, selected: 'default', required }, { ok: chosen })
    const gone = (reason: 'unknown-name' | 'withdrawn' | 'excluded'): ModelChoices => ({
      choices: [choice],
      selected: { route: 'gone', resolution: { kind: 'absent', reason } },
      source: evidence('choices'),
    })
    for (const reason of ['unknown-name', 'withdrawn', 'excluded'] as const) {
      scripted.setList({ ...access, selected: 'gone', required }, { ok: gone(reason) })
      expect(must(await scripted.profiles.list({ ...access, selected: 'gone', required }))).toEqual(
        gone(reason),
      )
    }
    expect(must(await scripted.profiles.list({ ...access, selected: null, required }))).toEqual(
      none,
    )
    expect(
      must(await scripted.profiles.list({ ...access, selected: 'default', required })),
    ).toEqual(chosen)
  })

  it('refuses a selection that names another route or appears without being asked for', () => {
    const access: Access<Agent> = { tenant: tenantA(), principal }
    const scripted = createScriptedModelProfiles<Agent>()
    const choice = resolvedOf(profileOf())
    const selected = { route: 'default', resolution: choice }
    const cases: [string | null, ModelChoices][] = [
      [null, { choices: [choice], selected, source: evidence('choices') }],
      ['other', { choices: [choice], selected, source: evidence('choices') }],
      ['default', { choices: [choice], selected: null, source: evidence('choices') }],
      [
        'other',
        {
          choices: [choice],
          selected: { route: 'other', resolution: choice },
          source: evidence('choices'),
        },
      ],
    ]
    for (const [asked, answer] of cases) {
      const error = scriptMisuse(() =>
        scripted.setList({ ...access, selected: asked, required }, { ok: answer }),
      )
      expect(error.reason).toBe('invalid-script')
    }
  })
})

describe('resolutions keep reasons and credentials as scripted (M06)', () => {
  it('returns an unselectable resolution for each reason and every credential state as it was set', async () => {
    const principal = new Agent('alice')
    const access: Access<Agent> = { tenant: tenantA(), principal }
    const scripted = createScriptedModelProfiles<Agent>()
    scripted.setAccess(access, 'allow')
    const textOnly = profileOf({ input: ['text'] })
    const cases: [ModalityRequirement, ProfileResolution][] = [
      [
        requirement(['text', 'voice']),
        resolvedOf(textOnly, { selectable: false, reasons: ['modality'] }),
      ],
      [requirement(), resolvedOf(textOnly, { selectable: false, reasons: ['locked'] })],
      [requirement(['text'], '2'), resolvedOf(textOnly, { selectable: false, reasons: ['scope'] })],
    ]
    for (const [required, answer] of cases) {
      scripted.setResolution({ ...access, route: 'default', required }, { ok: answer })
      expect(
        must(await scripted.profiles.resolve({ ...access, route: 'default', required })),
      ).toEqual(answer)
    }
    for (const credential of ['available', 'missing', 'unreadable', 'unavailable'] as const) {
      const required = requirement(['text'], `credential-${credential}`)
      const answer = resolvedOf(textOnly, {
        credential,
        shadowed: [adoption('outer'), adoption('inner')],
      })
      scripted.setResolution({ ...access, route: 'default', required }, { ok: answer })
      const resolved = must(
        await scripted.profiles.resolve({ ...access, route: 'default', required }),
      )
      expect(resolved).toEqual(answer)
      // A missing credential does not fall back to an outer profile and does not take selectability.
      expect(resolved).toMatchObject({ selectable: true, profile: textOnly })
    }
  })
})

describe('failures stay what they are (M07)', () => {
  it('returns a source failure as set, apart from absent, and a full model failure such as capacity', async () => {
    const principal = new Agent('alice')
    const access: Access<Agent> = { tenant: tenantA(), principal }
    const scripted = createScriptedModelProfiles<Agent>()
    scripted.setAccess(access, 'allow')
    const sourceDown = {
      failure: { kind: 'unavailable', dependency: 'profile-source', diagnostic: 'store offline' },
    } as const
    scripted.setResolution({ ...access, route: 'down', required: requirement() }, sourceDown)
    scripted.setResolution(
      { ...access, route: 'gone', required: requirement() },
      { ok: { kind: 'absent', reason: 'unknown-name' } },
    )
    const capacity = {
      failure: { kind: 'capacity', required: { bytes: '1', blocks: '1', attachmentBytes: '0' } },
    } as const
    scripted.setList({ ...access, selected: null, required: requirement() }, capacity)
    const down = await scripted.profiles.resolve({
      ...access,
      route: 'down',
      required: requirement(),
    })
    expect(down).toEqual(sourceDown)
    const gone = await scripted.profiles.resolve({
      ...access,
      route: 'gone',
      required: requirement(),
    })
    expect(gone).not.toEqual(down)
    expect(
      await scripted.profiles.list({ ...access, selected: null, required: requirement() }),
    ).toEqual(capacity)
  })

  it('answers an unavailable control plane before any scripted answer', async () => {
    const principal = new Agent('alice')
    const access: Access<Agent> = { tenant: tenantA(), principal }
    const scripted = createScriptedModelProfiles<Agent>()
    scripted.setResolution(
      { ...access, route: 'default', required: requirement() },
      { ok: resolvedOf(profileOf()) },
    )
    scripted.setAccess(access, 'unavailable')
    expect(
      await scripted.profiles.resolve({ ...access, route: 'default', required: requirement() }),
    ).toEqual({
      failure: {
        kind: 'unavailable',
        dependency: 'model-profiles',
        diagnostic: 'scripted-access',
      },
    })
  })
})

describe('answers are checked before they are kept (M08)', () => {
  it('refuses each inconsistent answer with a script misuse and keeps the earlier answer usable', async () => {
    const principal = new Agent('alice')
    const access: Access<Agent> = { tenant: tenantA(), principal }
    const required = requirement()
    const scripted = createScriptedModelProfiles<Agent>()
    scripted.setAccess(access, 'allow')
    const profile = profileOf()
    const choice = resolvedOf(profile)
    const good: ModelChoices = {
      choices: [choice],
      selected: { route: 'default', resolution: choice },
      source: evidence('choices'),
    }
    scripted.setList({ ...access, selected: 'default', required }, { ok: good })
    scripted.setResolution({ ...access, route: 'default', required }, { ok: choice })
    const other = resolvedOf(profileOf({ route: 'other' }))
    const locked = resolvedOf(profile, { selectable: false, reasons: ['locked'] })
    const lists: ModelChoices[] = [
      // An absent resolution, or one that cannot be chosen, is not a choice.
      { ...good, choices: [{ kind: 'absent', reason: 'unknown-name' }] },
      { ...good, choices: [locked], selected: { route: 'default', resolution: locked } },
      // A route repeats.
      { ...good, choices: [choice, choice] },
      // A selectable selection that is not the choice of its route.
      { ...good, choices: [other] },
      { ...good, choices: [resolvedOf(profile, { source: evidence('elsewhere') })] },
    ]
    for (const answer of lists) {
      const error = scriptMisuse(() =>
        scripted.setList({ ...access, selected: 'default', required }, { ok: answer }),
      )
      expect(error.reason).toBe('invalid-script')
    }
    const resolutions: ProfileResolution[] = [
      // The modality reason must state exactly whether the profile covers the requirement.
      resolvedOf(profile, { selectable: false, reasons: ['modality'] }),
      resolvedOf(profileOf({ input: ['image'] })),
      // Selectable is the absence of reasons.
      resolvedOf(profile, { selectable: true, reasons: ['locked'] }),
      resolvedOf(profile, { selectable: false, reasons: [] }),
      resolvedOf(profile, { selectable: false, reasons: ['locked', 'locked'] }),
      // A resolved profile is active; a withdrawn one is absent.
      resolvedOf(profileOf({ availability: 'withdrawn' })),
      // The route of the resolved profile is the asked route.
      other,
    ]
    for (const answer of resolutions) {
      const error = scriptMisuse(() =>
        scripted.setResolution({ ...access, route: 'default', required }, { ok: answer }),
      )
      expect(error.reason).toBe('invalid-script')
    }
    expect(scripted.calls()).toEqual([])
    expect(
      must(await scripted.profiles.list({ ...access, selected: 'default', required })),
    ).toEqual(good)
    expect(
      must(await scripted.profiles.resolve({ ...access, route: 'default', required })),
    ).toEqual(choice)
  })
})

describe('copies and minted scopes (M09)', () => {
  it('keeps what was registered when the caller changes its objects, and freezes what it returns', async () => {
    const principal = new Agent('alice')
    const access: Access<Agent> = { tenant: tenantA(), principal }
    const scripted = createScriptedModelProfiles<Agent>()
    scripted.setAccess(access, 'allow')
    const modalities: [Modality, ...Modality[]] = ['text']
    const source = { ...evidence('modality') }
    const required = { modalities, source }
    const input: [ModelModality, ...ModelModality[]] = ['text', 'image']
    const base = profileOf()
    const definition = { ...base.definition, input }
    const profile = { ...base, definition }
    const resolutionSource = { ...evidence('profile') }
    const shadowed = [adoption('outer')]
    const answer: ProfileResolution = {
      kind: 'resolved',
      profile,
      source: resolutionSource,
      selectable: true,
      reasons: [],
      credential: 'available',
      shadowed,
    }
    const expected = structuredClone(answer)
    scripted.setResolution({ ...access, route: 'default', required }, { ok: answer })
    input.push('voice')
    shadowed.push(adoption('inner'))
    resolutionSource.revision = '9'
    const resolved = must(
      await scripted.profiles.resolve({
        ...access,
        route: 'default',
        required: requirement(),
      }),
    )
    expect(resolved).toEqual(expected)
    // The registered requirement is a copy too: changing it does not move the row.
    modalities.push('image')
    source.revision = '7'
    expect(
      must(
        await scripted.profiles.resolve({ ...access, route: 'default', required: requirement() }),
      ),
    ).toEqual(expected)
    const frozen = (value: unknown): boolean =>
      value === null ||
      typeof value !== 'object' ||
      (Object.isFrozen(value) && Object.values(value).every(frozen))
    expect(frozen(resolved)).toBe(true)
    const [call] = scripted.calls()
    expect(Object.isFrozen(call)).toBe(true)
    expect(Object.isFrozen(call?.input)).toBe(true)
    expect(frozen(call?.input.required)).toBe(true)
  })

  it('returns tenant and organization scopes whose identities the codecs still accept', async () => {
    const principal = new Agent('alice')
    const access: Access<Agent> = { tenant: tenantA(), principal }
    const scripted = createScriptedModelProfiles<Agent>()
    scripted.setAccess(access, 'allow')
    const own = organization('1')
    const tenantProfile = profileOf({ scope: { kind: 'tenant', tenant: access.tenant } })
    const organizationProfile = profileOf({
      route: 'shared',
      scope: { kind: 'organization', organization: own },
    })
    scripted.setResolution(
      { ...access, route: 'default', required: requirement() },
      { ok: resolvedOf(tenantProfile) },
    )
    scripted.setResolution(
      { ...access, route: 'shared', required: requirement() },
      { ok: resolvedOf(organizationProfile) },
    )
    const byTenant = must(
      await scripted.profiles.resolve({ ...access, route: 'default', required: requirement() }),
    )
    const byOrganization = must(
      await scripted.profiles.resolve({ ...access, route: 'shared', required: requirement() }),
    )
    if (byTenant.kind !== 'resolved' || byOrganization.kind !== 'resolved')
      throw new Error('expected resolved profiles')
    const tenantScope = byTenant.profile.identity.scope
    const organizationScope = byOrganization.profile.identity.scope
    if (tenantScope.kind !== 'tenant' || organizationScope.kind !== 'organization')
      throw new Error('expected the scripted scopes')
    expect(tenantCodec.encode(tenantScope.tenant).ok).toBe(true)
    expect(organizationCodec.encode(organizationScope.organization).ok).toBe(true)
    expect(tenantScope.tenant).toBe(access.tenant)
    expect(organizationScope.organization).toBe(own)
    // The negative control: a structured clone of the same scope loses the minted identity.
    const cloned = structuredClone(tenantProfile.identity.scope)
    if (cloned.kind !== 'tenant') throw new Error('expected a tenant scope')
    expect(tenantCodec.encode(cloned.tenant).ok).toBe(false)
  })

  it('counts list and resolve in one sequence, and an old calls array does not change', async () => {
    const principal = new Agent('alice')
    const access: Access<Agent> = { tenant: tenantA(), principal }
    const scripted = createScriptedModelProfiles<Agent>()
    await scripted.profiles.list({ ...access, selected: null, required: requirement() })
    const before = scripted.calls()
    await scripted.profiles.resolve({ ...access, route: 'default', required: requirement() })
    expect(before.map(call => [call.sequence, call.kind])).toEqual([[1, 'list']])
    expect(scripted.calls().map(call => [call.sequence, call.kind])).toEqual([
      [1, 'list'],
      [2, 'resolve'],
    ])
    expect(Object.isFrozen(before)).toBe(true)
  })
})
