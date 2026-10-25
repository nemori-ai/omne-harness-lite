// Boundary decoding through the public schemas: requirements, the two block values, the tool need
// declaration, tenant text and the small identity helpers. Each refusal is checked by the path of
// its one issue, which is what a caller sees as the per-item reason.
import { expect, it } from 'vitest'
import { tenantCodec } from '@omne-harness/legal-identity'
import {
  acquisitionRef,
  bindingScope,
  createRecoveryAccess,
  describeFacility,
  environmentNeedSchema,
  executionHostFactsBlock,
  executionPlacementBlock,
  judgeRequirement,
  matchProviders,
  originRef,
  type EnvironmentBinding,
  type ProviderCapabilities,
} from '@omne-harness/execution-environment-contract'

const tenantText = JSON.stringify({
  organization: 'org_0123456789abcdefghjkmnpqrs',
  account: 'acc_0123456789abcdefghjkmnpqrs',
})

function mintedTenant() {
  const parsed = tenantCodec.parse(tenantText)
  if (!parsed.ok) throw new Error('tenant fixture did not parse')
  return parsed.value
}

const placementEntry = {
  origin: 'call-1',
  binding: { kind: 'host_machine' },
  instance: { id: 'host', generation: '1' },
  continuity: { kind: 'not_guaranteed' },
  facilities: ['files'],
  observedAt: 1,
}

const facts = {
  provider: 'host-files',
  generation: 'g1',
  version: '0.0.0',
  platform: { os: 'linux', release: '5.15.0' },
  facilities: ['files'],
  isolation: ['process'],
  prerequisites: 'satisfied',
}

function placements(value: unknown) {
  return executionPlacementBlock.schema['~standard'].validate(value)
}

function hostFacts(value: unknown) {
  return executionHostFactsBlock.schema['~standard'].validate({
    date: '2026-10-22',
    providers: value,
  })
}

function need(value: unknown) {
  return environmentNeedSchema['~standard'].validate(value)
}

function refusedAt(path: readonly (string | number)[]) {
  return { issues: [{ path, message: expect.stringMatching(/\S/) }] }
}

function requirementWith(binding: unknown) {
  return judgeRequirement({ allowedBindings: [binding], facilities: [], isolation: [] })
}

function failedAt(path: readonly (string | number)[]) {
  return {
    failure: { reason: 'invalidInput', issues: [{ path, message: expect.stringMatching(/\S/) }] },
  }
}

it('decodes tenant text with the legal-identity codec into a tenant equal to the original', () => {
  const judged = requirementWith({ kind: 'tenant_sandbox', tenant: tenantText })
  if (!('ok' in judged)) throw new Error('expected the tenant text to decode')
  const binding = judged.ok.allowedBindings[0]
  if (binding?.kind !== 'tenant_sandbox') throw new Error('expected a tenant sandbox')
  expect(tenantCodec.encode(binding.tenant)).toEqual({ ok: true, value: tenantText })
})

it('keeps a tenant minted in this process as the same object', () => {
  const tenant = mintedTenant()
  const judged = requirementWith({ kind: 'tenant_sandbox', tenant })
  if (!('ok' in judged)) throw new Error('expected the minted tenant to decode')
  const binding = judged.ok.allowedBindings[0]
  expect(binding?.kind === 'tenant_sandbox' && binding.tenant).toBe(tenant)
})

it('refuses forged tenant objects, illegal tenant text and other values', () => {
  const tenant = mintedTenant()
  const forged = JSON.parse(JSON.stringify(tenant))
  const handBuilt = {
    name: 'TenantId',
    organization: { name: 'OrganizationId', text: 'x' },
    account: { name: 'AccountId', text: 'y' },
  }
  const badText = JSON.stringify({ organization: 'org_x', account: 'acc_y' })
  for (const value of [
    forged,
    handBuilt,
    badText,
    'not json',
    7,
    null,
    { ...tenant, role: 'admin' },
  ])
    expect(requirementWith({ kind: 'tenant_sandbox', tenant: value })).toEqual(
      failedAt(['allowedBindings', 0, 'tenant']),
    )
  expect(requirementWith({ kind: 'tenant_sandbox' })).toEqual(
    failedAt(['allowedBindings', 0, 'tenant']),
  )
})

it('decodes every binding layer and refuses each malformed part at its own path', () => {
  const stateless = { kind: 'stateless_sandbox', scope: { ref: 's1' }, origin: 'call-1' }
  const nested = { kind: 'session_sandbox', scope: { ref: 's2', parent: { ref: 'root' } } }
  expect(
    judgeRequirement({ allowedBindings: [stateless, nested], facilities: [], isolation: [] }),
  ).toEqual({ ok: { allowedBindings: [stateless, nested], facilities: [], isolation: [] } })

  const at = (...rest: (string | number)[]) => failedAt(['allowedBindings', 0, ...rest])
  expect(requirementWith(null)).toEqual(at())
  expect(requirementWith([])).toEqual(at())
  expect(requirementWith('host_machine')).toEqual(at())
  expect(requirementWith({ kind: 'cloud' })).toEqual(at('kind'))
  expect(requirementWith({ kind: 7 })).toEqual(at('kind'))
  expect(requirementWith({ kind: 'host_machine', scope: { ref: 's' } })).toEqual(at('scope'))
  expect(requirementWith({ ...stateless, extra: 1 })).toEqual(at('extra'))
  expect(requirementWith({ kind: 'stateless_sandbox', scope: { ref: 's1' } })).toEqual(at('origin'))
  expect(requirementWith({ ...stateless, origin: '' })).toEqual(at('origin'))
  expect(requirementWith({ ...stateless, origin: 5 })).toEqual(at('origin'))
  expect(requirementWith({ ...stateless, scope: null })).toEqual(at('scope'))
  expect(requirementWith({ ...stateless, scope: { ref: '' } })).toEqual(at('scope', 'ref'))
  expect(requirementWith({ kind: 'session_sandbox' })).toEqual(at('scope'))
  expect(requirementWith({ kind: 'session_sandbox', scope: [] })).toEqual(at('scope'))
  expect(requirementWith({ kind: 'session_sandbox', scope: {} })).toEqual(at('scope', 'ref'))
  expect(requirementWith({ kind: 'session_sandbox', scope: { ref: 3 } })).toEqual(
    at('scope', 'ref'),
  )
  expect(requirementWith({ kind: 'session_sandbox', scope: { ref: 's', other: 1 } })).toEqual(
    at('scope', 'other'),
  )
  expect(
    requirementWith({ kind: 'session_sandbox', scope: { ref: 's', parent: { ref: '' } } }),
  ).toEqual(at('scope', 'parent', 'ref'))
  expect(requirementWith({ kind: 'tenant_sandbox', tenant: tenantText, extra: 1 })).toEqual(
    at('extra'),
  )
})

it('refuses a requirement that is not an object, or with empty keys or claims, at their path', () => {
  expect(judgeRequirement([])).toEqual(failedAt([]))
  expect(judgeRequirement(null)).toEqual(failedAt([]))
  expect(judgeRequirement({ allowedBindings: [], facilities: [''], isolation: [] })).toEqual(
    failedAt(['facilities', 0]),
  )
  expect(judgeRequirement({ allowedBindings: [], facilities: 'files', isolation: [] })).toEqual(
    failedAt(['facilities']),
  )
  expect(judgeRequirement({ allowedBindings: [], facilities: [], isolation: [''] })).toEqual(
    failedAt(['isolation', 0]),
  )
  expect(judgeRequirement({ allowedBindings: [], facilities: [], isolation: [1] })).toEqual(
    failedAt(['isolation', 0]),
  )
  expect(judgeRequirement({ allowedBindings: [], facilities: [] })).toEqual(failedAt(['isolation']))
})

it('accepts placement entries with every continuity kind and refuses each malformed field', () => {
  const continuous = {
    ...placementEntry,
    continuity: { kind: 'continuous', data: 'd', revision: '3' },
  }
  const lost = { ...placementEntry, continuity: { kind: 'lost', previous: 'd' } }
  expect(placements([continuous, lost])).toEqual({ value: [continuous, lost] })

  const at = (...rest: (string | number)[]) => refusedAt([0, ...rest])
  expect(placements([null])).toEqual(at())
  expect(placements([[]])).toEqual(at())
  expect(placements([{ ...placementEntry, extra: 1 }])).toEqual(at('extra'))
  expect(placements([{ ...placementEntry, origin: 1 }])).toEqual(at('origin'))
  expect(placements([{ ...placementEntry, binding: { kind: 'cloud' } }])).toEqual(
    at('binding', 'kind'),
  )
  expect(placements([{ ...placementEntry, instance: 'host' }])).toEqual(at('instance'))
  expect(placements([{ ...placementEntry, instance: { id: 'host' } }])).toEqual(
    at('instance', 'generation'),
  )
  expect(placements([{ ...placementEntry, instance: { id: 1, generation: '1' } }])).toEqual(
    at('instance', 'id'),
  )
  expect(placements([{ ...placementEntry, instance: { id: 'h', generation: 1 } }])).toEqual(
    at('instance', 'generation'),
  )
  expect(placements([{ ...placementEntry, continuity: null }])).toEqual(at('continuity'))
  expect(placements([{ ...placementEntry, continuity: { kind: 'forever' } }])).toEqual(
    at('continuity', 'kind'),
  )
  expect(
    placements([{ ...placementEntry, continuity: { kind: 'not_guaranteed', data: 'd' } }]),
  ).toEqual(at('continuity', 'data'))
  expect(placements([{ ...continuous, continuity: { kind: 'continuous', data: 'd' } }])).toEqual(
    at('continuity', 'revision'),
  )
  expect(
    placements([{ ...continuous, continuity: { kind: 'continuous', data: 1, revision: '3' } }]),
  ).toEqual(at('continuity', 'data'))
  expect(
    placements([{ ...continuous, continuity: { kind: 'continuous', data: 'd', revision: 3 } }]),
  ).toEqual(at('continuity', 'revision'))
  expect(placements([{ ...lost, continuity: { kind: 'lost' } }])).toEqual(
    at('continuity', 'previous'),
  )
  expect(placements([{ ...lost, continuity: { kind: 'lost', previous: 2 } }])).toEqual(
    at('continuity', 'previous'),
  )
  expect(placements([{ ...placementEntry, facilities: [''] }])).toEqual(at('facilities', 0))
  expect(placements([{ ...placementEntry, observedAt: '1' }])).toEqual(at('observedAt'))
  expect(placements([{ ...placementEntry, observedAt: Number.POSITIVE_INFINITY }])).toEqual(
    at('observedAt'),
  )
  expect(placements({ 0: placementEntry })).toEqual(refusedAt([]))
})

it('accepts host facts and refuses each malformed field', () => {
  const unsatisfied = { ...facts, prerequisites: 'unsatisfied' }
  const unknown = { ...facts, prerequisites: 'unknown' }
  expect(hostFacts([facts, unsatisfied, unknown])).toEqual({
    value: { date: '2026-10-22', providers: [facts, unsatisfied, unknown] },
  })
  const at = (...rest: (string | number)[]) => refusedAt(['providers', 0, ...rest])
  expect(hostFacts(['facts'])).toEqual(at())
  expect(hostFacts([{ ...facts, extra: true }])).toEqual(at('extra'))
  expect(hostFacts([{ ...facts, provider: 1 }])).toEqual(at('provider'))
  expect(hostFacts([{ ...facts, generation: 1 }])).toEqual(at('generation'))
  expect(hostFacts([{ ...facts, version: 1 }])).toEqual(at('version'))
  expect(hostFacts([{ ...facts, platform: null }])).toEqual(at('platform'))
  expect(hostFacts([{ ...facts, platform: 'linux' }])).toEqual(at('platform'))
  expect(hostFacts([{ ...facts, platform: { os: 'linux' } }])).toEqual(at('platform', 'release'))
  expect(hostFacts([{ ...facts, platform: { os: 1, release: '5' } }])).toEqual(at('platform', 'os'))
  expect(hostFacts([{ ...facts, platform: { os: 'linux', release: 5 } }])).toEqual(
    at('platform', 'release'),
  )
  expect(hostFacts([{ ...facts, facilities: [''] }])).toEqual(at('facilities', 0))
  expect(hostFacts([{ ...facts, isolation: [''] }])).toEqual(at('isolation', 0))
  expect(hostFacts([{ ...facts, prerequisites: 'maybe' }])).toEqual(at('prerequisites'))
  const { version: _version, ...withoutVersion } = facts
  expect(hostFacts([withoutVersion])).toEqual(at('version'))
})

it('describes the two blocks as optional, plain, stable and recomputed, read by model, tool and extension', () => {
  for (const block of [executionPlacementBlock, executionHostFactsBlock])
    expect(block).toMatchObject({
      kind: 'supplied',
      consumers: ['model', 'tool', 'extension'],
      required: false,
      disclosure: 'plain',
      carriesPrevious: true,
      volatility: 'stable',
      recovery: 'recompute',
    })
  expect(executionPlacementBlock.schema['~standard'].vendor).toBe('omne-harness')
})

it('refuses a need declaration that is not an object or carries an empty isolation claim', () => {
  expect(need(null)).toEqual(refusedAt([]))
  expect(need({ facilities: [], isolation: [''], layers: [] })).toEqual(refusedAt(['isolation', 0]))
  expect(need({ facilities: [], isolation: 'process', layers: [] })).toEqual(
    refusedAt(['isolation']),
  )
})

it('reports the closest miss over all layers when no provider qualifies', () => {
  const hostCommand: ProviderCapabilities = {
    bindingKinds: ['host_machine'],
    facilities: ['command'],
    isolation: [],
  }
  const sandboxFiles: ProviderCapabilities = {
    bindingKinds: ['session_sandbox'],
    facilities: ['files'],
    isolation: ['process'],
  }
  const session: EnvironmentBinding = { kind: 'session_sandbox', scope: { ref: scopeText('s') } }
  expect(
    matchProviders([hostCommand, sandboxFiles], {
      allowedBindings: [{ kind: 'host_machine' }, session],
      facilities: ['command'],
      isolation: ['process'],
    }),
  ).toEqual({ kind: 'rejected', reason: 'isolationUnconfirmed' })
})

it('lists every operation and marks only the guarded ones', () => {
  const descriptor = describeFacility('command', { start: 'open' })
  expect(descriptor).toEqual({ key: 'command', operations: ['start'], guarded: [] })
})

it('finds the owning scope of a binding only for the sandbox layers that have one', () => {
  const owned = { ref: scopeText('s1') }
  expect(bindingScope({ kind: 'stateless_sandbox', scope: owned, origin: originRef('c') })).toBe(
    owned,
  )
  expect(bindingScope({ kind: 'session_sandbox', scope: owned })).toBe(owned)
  expect(bindingScope({ kind: 'host_machine' })).toBeUndefined()
  expect(bindingScope({ kind: 'tenant_sandbox', tenant: mintedTenant() })).toBeUndefined()
})

it('accepts non-empty origin and acquisition references and throws TypeError on empty text', () => {
  expect(originRef('call-1')).toBe('call-1')
  expect(acquisitionRef('acq-1')).toBe('acq-1')
  expect(() => originRef('')).toThrow(TypeError)
  expect(() => acquisitionRef('')).toThrow(TypeError)
})

it('creates a fresh frozen recovery access object each time', () => {
  const first = createRecoveryAccess()
  expect(Object.isFrozen(first)).toBe(true)
  expect(createRecoveryAccess()).not.toBe(first)
})

function scopeText(text: string) {
  const decoded = judgeRequirement({
    allowedBindings: [{ kind: 'session_sandbox', scope: { ref: text } }],
    facilities: [],
    isolation: [],
  })
  if (!('ok' in decoded)) throw new Error('expected a scope')
  const binding = decoded.ok.allowedBindings[0]
  if (binding?.kind !== 'session_sandbox') throw new Error('expected a session sandbox')
  return binding.scope.ref
}

it('validates a real host calendar date and requires a block envelope', async () => {
  const validate = executionHostFactsBlock.schema['~standard'].validate
  expect(await validate({ date: '2024-02-29', providers: [] })).toHaveProperty('value')
  for (const date of ['2026-02-29', '2026-02-30', '2026-13-01', 'today', 42])
    expect(await validate({ date, providers: [] })).toMatchObject({ issues: [{ path: ['date'] }] })
  expect(await validate([])).toHaveProperty('issues')
})

it('uses real calendar dates including leap centuries and years below one hundred', async () => {
  const schema = executionHostFactsBlock.schema['~standard']
  for (const date of [
    '0000-02-29',
    '0099-01-01',
    '2000-02-29',
    '2024-02-29',
    '2026-04-30',
    '9999-12-31',
  ])
    expect(await schema.validate({ date, providers: [] })).toEqual({
      value: { date, providers: [] },
    })
  for (const date of [
    '1900-02-29',
    '2100-02-29',
    '2026-02-29',
    '2026-04-31',
    '2026-00-01',
    '2026-13-01',
    '2026-01-00',
    '2026-01-32',
    '2026-1-01',
    'x2026-01-01',
    '2026-01-01T00:00:00Z',
    20260101,
    null,
  ])
    expect(await schema.validate({ date, providers: [] })).toEqual(refusedAt(['date']))
  for (const value of [
    null,
    [],
    { date: '2026-01-01' },
    { date: '2026-01-01', providers: [], extra: true },
  ])
    expect(await schema.validate(value)).toHaveProperty('issues')
})
