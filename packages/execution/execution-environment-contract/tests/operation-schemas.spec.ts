import { expect, it } from 'vitest'
import { tenantCodec } from '@omne-harness/legal-identity'
import * as contract from '@omne-harness/execution-environment-contract'
import {
  createScriptedEnvironmentProvider,
  createMemoryResourceLedger,
} from '@omne-harness/execution-environment-contract/testing'
const tenant = (() => {
  const t = tenantCodec.parse(
    JSON.stringify({
      organization: 'org_0123456789abcdefghjkmnpqrs',
      account: 'acc_0123456789abcdefghjkmnpqrs',
    }),
  )
  if (!t.ok) throw new Error('tenant fixture')
  return t.value
})()
const access = { principal: 'test', tenant }
const scope = { ref: 'scope' }
const requirement = {
  allowedBindings: [{ kind: 'host_machine' }],
  facilities: ['command'],
  isolation: [],
}
const placement = {
  kind: 'placement',
  requirement,
  binding: { kind: 'host_machine' },
  provider: { name: 'p', generation: 'g', version: 'v' },
  continuity: { kind: 'not_guaranteed' },
  quotaDomain: 'domain',
}
const adoption = {
  acquisition: 'acq',
  origin: 'origin',
  placement,
  provider: placement.provider,
  instance: { id: 'i', generation: 'g' },
  continuity: placement.continuity,
  evidence: { kind: 'boolean', value: true },
}
const ledger = {
  closed: new AbortController().signal,
  async plan() {
    return 'recorded' as const
  },
  async permit() {
    return 'confirmed' as const
  },
  async adopt() {
    return 'confirmed' as const
  },
  async stopped() {
    return 'recorded' as const
  },
}
const guard = {
  async authorize() {
    return 'authorized' as const
  },
}
const input = { acquisition: 'acq', origin: 'origin', scope, placement, ledger, guard }
const recovery = contract.createRecoveryAccess()
const original = { tenant, acquisition: 'acq', origin: 'origin', scope, placement }
const groups = { settledAcquisitions: [], pendingAcquisitions: [], unsupportedAcquisitions: [] }
const rejection = { kind: 'rejected', reason: 'callerMismatch' }
const cases = () =>
  [
    ['resolvePlacement', [access, { scope, requirement }], placement],
    [
      'acquire',
      [access, input],
      {
        kind: 'acquired',
        lease: {
          placement,
          instance: adoption.instance,
          continuity: placement.continuity,
          facility() {},
          release() {},
          invalidated: Promise.resolve({ source: 'registry', reason: 'released' }),
        },
        adoption,
      },
    ],
    [
      'inspectAcquisition',
      [access, { kind: 'local', acquisition: 'acq' }],
      { kind: 'known', state: { kind: 'provisional' } },
    ],
    [
      'inspectRecoveryAcquisition',
      [recovery, original],
      { kind: 'original', status: 'settled', original },
    ],
    [
      'describe',
      [access, scope],
      [
        {
          acquisition: 'acq',
          origin: 'origin',
          binding: placement.binding,
          provider: placement.provider,
          instance: adoption.instance,
          continuity: placement.continuity,
          facilities: ['command'],
          state: 'acquired',
        },
      ],
    ],
    [
      'recoverOwned',
      [scope, recovery],
      {
        kind: 'recovered',
        scope,
        stopped: [],
        pending: [],
        unsupported: [],
        unavailable: [],
        ...groups,
      },
    ],
    ['releaseScope', [scope, recovery], rejection],
    ['registerFacility', [contract.commandFacility]],
    ['registerProvider', [createScriptedEnvironmentProvider()]],
  ] as const
for (const name of [
  'resolvePlacement',
  'acquire',
  'inspectAcquisition',
  'inspectRecoveryAcquisition',
  'describe',
  'recoverOwned',
  'releaseScope',
  'registerFacility',
  'registerProvider',
] as const)
  it(name + ' accepts valid params, rejects arity and malformed elements', async () => {
    const test = cases().find(test => test[0] === name)
    if (!test) throw new Error('missing operation fixture')
    const [, params, result] = test
    const schemas = contract.operationSchemas[name]
    expect(await schemas.params['~standard'].validate(params)).toHaveProperty('value')
    expect(await schemas.params['~standard'].validate([...params, 0])).toHaveProperty('issues')
    const bad = await schemas.params['~standard'].validate([null, ...params.slice(1)])
    expect(bad).toMatchObject({ issues: [{ path: [0], message: expect.stringMatching(/\S/) }] })
    if ('result' in schemas) {
      expect(await schemas.result['~standard'].validate(result)).toHaveProperty('value')
      expect(await schemas.result['~standard'].validate({ kind: 'invented' })).toHaveProperty(
        'issues',
      )
    }
  })
it('has only nine parameter and seven result schemas; no invented request envelope', () => {
  expect(Object.keys(contract.operationSchemas)).toHaveLength(9)
  expect(Object.values(contract.operationSchemas).filter(s => 'result' in s)).toHaveLength(7)
  expect('facilityRequestSchema' in contract).toBe(false)
})
it('gives nested item reasons and does not coerce runtime ports or recovery access', async () => {
  const check = async (
    schema: typeof contract.acquireParamsSchema,
    value: unknown,
    path: readonly (string | number)[],
  ) =>
    expect(await schema['~standard'].validate(value)).toMatchObject({
      issues: [{ path, message: expect.stringMatching(/\S/) }],
    })
  await check(
    contract.acquireParamsSchema,
    [access, { ...input, ledger: { ...ledger, closed: {} } }],
    [1, 'ledger', 'closed'],
  )
  await check(
    contract.acquireParamsSchema,
    [access, { ...input, guard: {} }],
    [1, 'guard', 'authorize'],
  )
  await check(
    contract.acquireParamsSchema,
    [
      access,
      { ...input, placement: { ...placement, provider: { ...placement.provider, version: 1 } } },
    ],
    [1, 'placement', 'provider', 'version'],
  )
  expect(await contract.recoverOwnedParamsSchema['~standard'].validate([scope, {}])).toMatchObject({
    issues: [{ path: [1] }],
  })
  expect(
    await contract.registerFacilityParamsSchema['~standard'].validate([
      { key: 'command', operations: ['start'], guarded: ['other'] },
    ]),
  ).toMatchObject({ issues: [{ path: [0, 'guarded', 0] }] })
  expect(
    await contract.registerFacilityParamsSchema['~standard'].validate([
      { key: 'command', operations: ['start', 'start'], guarded: [] },
    ]),
  ).toMatchObject({ issues: [{ path: [0, 'operations', 1] }] })
  const result = await contract.acquireParamsSchema['~standard'].validate([access, input])
  if (result.issues) throw new Error('expected decode')
  expect(result.value[1].ledger).toBe(ledger)
  expect(result.value[1].guard).toBe(guard)
})
it('decodes every acquisition state and query answer, and refuses malformed nested facts', async () => {
  const inspection = contract.inspectAcquisitionResultSchema['~standard']
  const states = [
    { kind: 'acquiring' },
    { kind: 'provisional' },
    { kind: 'acquired', adoption },
    { kind: 'rejected', reason: 'invalidInput' },
    { kind: 'allocationFailed', reason: 'unsupportedFacility', cleanup: { kind: 'pending' } },
    { kind: 'invalidated', adoption, invalidation: { source: 'registry', reason: 'released' } },
    { kind: 'releasing', adoption },
    { kind: 'pendingRelease', adoption: null, resources: [] },
    { kind: 'released', adoption },
    { kind: 'allocationUnknown', acquisition: 'acq' },
    { kind: 'settled' },
  ]
  for (const state of states)
    expect(await inspection.validate({ kind: 'known', state })).toHaveProperty('value')
  const answers = [
    { kind: 'unrecorded' },
    { kind: 'invalidInput' },
    { kind: 'refused', reason: 'notAuthorized' },
    { kind: 'queryUnavailable', cause: 'provider' },
    { kind: 'queryUnknown', cause: 'scope-binding' },
    { kind: 'original', status: 'allocated', original, adoption: null },
    { kind: 'original', status: 'pending', original, adoption, phase: 'releasing', resources: [] },
    { kind: 'original', status: 'notAllocated', original },
    { kind: 'original', status: 'conflict', original },
    {
      kind: 'original',
      status: 'allocationFailed',
      original,
      reason: 'referenceExpired',
      cleanup: { kind: 'unknown' },
    },
  ]
  for (const answer of answers) expect(await inspection.validate(answer)).toHaveProperty('value')
  const recovery = contract.inspectRecoveryAcquisitionResultSchema['~standard']
  expect(await recovery.validate({ kind: 'unrecorded' })).toHaveProperty('issues')
  expect(await recovery.validate({ kind: 'known', state: { kind: 'settled' } })).toHaveProperty(
    'issues',
  )
  expect(await inspection.validate({ kind: 'unrecorded', state: null })).toHaveProperty('issues')
  expect(
    await inspection.validate({
      kind: 'known',
      state: {
        kind: 'invalidated',
        adoption,
        invalidation: { source: 'registry', reason: 'invented' },
      },
    }),
  ).toMatchObject({ issues: [{ path: ['state', 'invalidation', 'reason'] }] })
  expect(
    await inspection.validate({
      kind: 'known',
      state: {
        kind: 'pendingRelease',
        adoption: null,
        resources: [{ key: 'r', provider: 'p', reference: undefined }],
      },
    }),
  ).toMatchObject({ issues: [{ path: ['state', 'resources', 0, 'reference'] }] })
  expect(
    await inspection.validate({
      kind: 'original',
      status: 'settled',
      original: { ...original, tenant: { ...tenant } },
    }),
  ).toMatchObject({ issues: [{ path: ['original', 'tenant'] }] })
  expect(
    await contract.acquireResultSchema['~standard'].validate({
      kind: 'pending',
      state: { kind: 'invalidInput' },
    }),
  ).toHaveProperty('issues')
})

it('provider suite rejects facts that lie about capabilities', async () => {
  const { environmentProviderConformance, runConformanceCase } =
    await import('@omne-harness/execution-environment-contract/testing')
  const cases = environmentProviderConformance({
    subject() {
      const provider = createScriptedEnvironmentProvider()
      const describe = provider.describe.bind(provider)
      provider.describe = async () => ({ ...(await describe()), facilities: [] })
      return {
        provider,
        binding: { kind: 'host_machine' },
        scope: { ref: scopeRef('s') },
        tenant,
        facility: 'command',
      }
    },
  })
  const test = cases.find(c => c.name === 'V-EE18.facts-match-declaration')
  if (!test) throw new Error('missing case')
  await expect(runConformanceCase(test)).rejects.toThrow()
})
function scopeRef(text: string): contract.AcquireInput<unknown>['scope']['ref'] {
  function valid(value: string): value is contract.AcquireInput<unknown>['scope']['ref'] {
    return value.length > 0
  }
  if (!valid(text)) throw new TypeError('scope')
  return text
}

it('refuses malformed nested input and result fields at the boundary', async () => {
  const badParams: [
    keyof typeof contract.operationSchemas,
    unknown,
    readonly (string | number)[],
  ][] = [
    ['resolvePlacement', [access, { scope: { ref: '' }, requirement }], [1, 'scope', 'ref']],
    [
      'resolvePlacement',
      [access, { scope, requirement: { ...requirement, facilities: [''] } }],
      [1, 'requirement', 'facilities', 0],
    ],
    ['acquire', [access, { ...input, acquisition: '' }], [1, 'acquisition']],
    ['acquire', [access, { ...input, origin: '' }], [1, 'origin']],
    ['acquire', [access, { ...input, ledger: { ...ledger, plan: 0 } }], [1, 'ledger', 'plan']],
    [
      'inspectAcquisition',
      [
        { principal: 'p', tenant: { ...tenant } },
        { kind: 'local', acquisition: 'acq' },
      ],
      [0, 'tenant'],
    ],
    ['inspectAcquisition', [access, { kind: 'local', acquisition: '' }], [1, 'acquisition']],
    [
      'inspectRecoveryAcquisition',
      [recovery, { ...original, placement: { ...placement, quotaDomain: '' } }],
      [1, 'placement', 'quotaDomain'],
    ],
    ['recoverOwned', [scope, recovery, [{ ...original, origin: '' }]], [2, 0, 'origin']],
    ['describe', [access, { ref: 's', extra: 1 }], [1, 'extra']],
    ['releaseScope', [scope, JSON.parse(JSON.stringify(recovery))], [1]],
    [
      'registerFacility',
      [{ key: 'command', operations: ['start'], guarded: ['start', 'start'] }],
      [0, 'guarded', 1],
    ],
    ['registerProvider', [{ ...createScriptedEnvironmentProvider(), retire: 0 }], [0, 'retire']],
    [
      'registerProvider',
      [{ ...createScriptedEnvironmentProvider(), bindingKinds: ['cloud'] }],
      [0, 'bindingKinds', 0],
    ],
    [
      'registerProvider',
      [
        {
          ...createScriptedEnvironmentProvider(),
          listRecoveryResources: async () => ({ kind: 'unavailable' }),
        },
      ],
      [0, 'recover'],
    ],
  ]
  for (const [name, value, path] of badParams)
    expect(
      await contract.operationSchemas[name].params['~standard'].validate(value),
      name,
    ).toMatchObject({ issues: [{ path, message: expect.stringMatching(/\S/) }] })
  const badResults: [
    keyof contract.ExecutionEnvironment<unknown>,
    unknown,
    readonly (string | number)[],
  ][] = [
    [
      'resolvePlacement',
      { ...placement, provider: { ...placement.provider, generation: 1 } },
      ['provider', 'generation'],
    ],
    ['resolvePlacement', { kind: 'rejected', reason: 'other' }, ['reason']],
    ['acquire', { kind: 'pending', state: { kind: 'unrecorded' } }, ['state', 'kind']],
    [
      'acquire',
      { kind: 'allocationFailed', acquisition: 'acq', reason: 'x', cleanup: { kind: 'settled' } },
      ['reason'],
    ],
    ['acquire', { kind: 'unknown', acquisition: 'acq', phase: 'later' }, ['phase']],
    [
      'acquire',
      {
        kind: 'acquired',
        lease: {
          placement,
          instance: adoption.instance,
          continuity: placement.continuity,
          facility() {},
          release() {},
          invalidated: {},
        },
        adoption,
      },
      ['lease', 'invalidated'],
    ],
    [
      'acquire',
      {
        kind: 'acquired',
        lease: {
          placement,
          instance: adoption.instance,
          continuity: placement.continuity,
          facility: 0,
          release() {},
          invalidated: Promise.resolve(),
        },
        adoption,
      },
      ['lease', 'facility'],
    ],
    [
      'inspectAcquisition',
      {
        kind: 'known',
        state: { kind: 'released', adoption: { ...adoption, evidence: { raw: 'object' } } },
      },
      ['state', 'adoption', 'evidence', 'kind'],
    ],
    [
      'describe',
      [
        {
          acquisition: 'acq',
          origin: 'o',
          binding: placement.binding,
          provider: placement.provider,
          instance: adoption.instance,
          continuity: placement.continuity,
          facilities: ['command'],
          state: 'invalidInput',
        },
      ],
      [0, 'state'],
    ],
    [
      'recoverOwned',
      {
        kind: 'recovered',
        scope,
        stopped: [],
        pending: [],
        unsupported: [{ kind: 'provider', provider: { name: 'p', generation: 'g' } }],
        unavailable: [],
        ...groups,
      },
      ['unsupported', 0, 'provider', 'version'],
    ],
    [
      'releaseScope',
      {
        kind: 'recovered',
        scope,
        stopped: [],
        pending: [],
        unsupported: [],
        unavailable: [{ name: 1, generation: 'g', version: 'v' }],
        ...groups,
      },
      ['unavailable', 0, 'name'],
    ],
  ]
  for (const [name, value, path] of badResults)
    expect(
      await contract.operationSchemas[name].result['~standard'].validate(value),
      name,
    ).toMatchObject({ issues: [{ path, message: expect.stringMatching(/\S/) }] })
})

it('keeps registered provider objects and recovery authority objects unchanged', async () => {
  const provider = createScriptedEnvironmentProvider()
  const parsed = await contract.registerProviderParamsSchema['~standard'].validate([provider])
  if (parsed.issues) throw new Error('valid provider refused')
  expect(parsed.value[0]).toBe(provider)
  const read = await contract.recoverOwnedParamsSchema['~standard'].validate([scope, recovery])
  if (read.issues) throw new Error('valid recovery refused')
  expect(read.value[1]).toBe(recovery)
})

it('provider facts compare facilities as sets rather than declaration order', async () => {
  const { environmentProviderConformance, runConformanceCase } =
    await import('@omne-harness/execution-environment-contract/testing')
  const cases = environmentProviderConformance({
    subject() {
      const provider = createScriptedEnvironmentProvider()
      const describe = provider.describe.bind(provider)
      provider.describe = async () => ({
        ...(await describe()),
        facilities: [...provider.facilities].reverse(),
      })
      return {
        provider,
        binding: { kind: 'host_machine' },
        scope: { ref: scopeRef('s') },
        tenant,
        facility: 'command',
      }
    },
  })
  const test = cases.find(c => c.name === 'V-EE18.facts-match-declaration')
  if (!test) throw new Error('missing case')
  expect(await runConformanceCase(test)).toMatchObject({ status: 'pass' })
})

it('retirement suite denies late admission and effects hidden behind a closed answer', async () => {
  const { environmentProviderConformance, runConformanceCase } =
    await import('@omne-harness/execution-environment-contract/testing')
  for (const fault of ['none', 'open', 'hidden-effect'] as const) {
    const broken = fault !== 'none'
    let effects = 0
    let retired = false
    let usedInput: contract.ProviderAcquireInput | undefined
    const provider = createScriptedEnvironmentProvider(
      broken
        ? {
            facilities: ['command'],
            async retire() {
              retired = true
              return { kind: 'drained' }
            },
            lease: {
              command: {
                async start(request) {
                  effects++
                  return retired && fault === 'hidden-effect'
                    ? { kind: 'rejected', requestId: request.requestId, reason: 'closed' }
                    : { kind: 'unknown', requestId: request.requestId }
                },
              },
            },
          }
        : {},
    )
    const cases = environmentProviderConformance({
      subject() {
        return {
          provider,
          binding: { kind: 'host_machine' },
          scope: { ref: scopeRef('retirement-scope') },
          tenant,
          facility: 'command',
          hooks: {
            async prepareHeldOperation({ lease, input }) {
              usedInput = input
              const command = lease.facility('command')
              if (!command) throw new Error('no command')
              return {
                run: () =>
                  command.start({
                    requestId: 'late',
                    origin: input.origin,
                    access,
                    binding: input.placement.binding,
                    executable: 'true',
                    args: [],
                    cwd: '.',
                    env: {},
                    outputMode: 'separate',
                  }),
                async effectSnapshot() {
                  return broken ? effects : provider.calls.start
                },
              }
            },
          },
        }
      },
    })
    const test = cases.find(
      c => c.name === 'V-EE18.held-facility-refuses-new-operations-after-retire',
    )
    if (!test) throw new Error('missing retirement case')
    if (broken) {
      await expect(runConformanceCase(test)).rejects.toThrow()
      expect(effects).toBe(1)
      if (!usedInput) throw new Error('no captured provider input')
      expect(await provider.acquire(usedInput)).toEqual({
        kind: 'rejected',
        reason: 'providerUnavailable',
      })
    } else {
      expect(await runConformanceCase(test)).toMatchObject({ status: 'pass' })
      expect(provider.calls.start).toBe(0)
    }
  }
})
it('marks the held-facility retirement case not applicable without the necessary hook', async () => {
  const { environmentProviderConformance, runConformanceCase } =
    await import('@omne-harness/execution-environment-contract/testing')
  const cases = environmentProviderConformance({
    subject() {
      return {
        provider: createScriptedEnvironmentProvider(),
        binding: { kind: 'host_machine' },
        scope: { ref: scopeRef('scope') },
        tenant,
        facility: 'command',
      }
    },
  })
  const test = cases.find(
    c => c.name === 'V-EE18.held-facility-refuses-new-operations-after-retire',
  )
  if (!test) throw new Error('missing retirement case')
  expect(await runConformanceCase(test)).toMatchObject({ status: 'not-applicable' })
})

it('rejects cyclic scope parents as issues and accepts a finite parent chain', async () => {
  type ScopeInput = { ref: string; parent?: ScopeInput }
  const self: ScopeInput = { ref: 'self' }
  self.parent = self
  const first: ScopeInput = { ref: 'first' }
  const second: ScopeInput = { ref: 'second', parent: first }
  first.parent = second
  for (const schema of [contract.recoverOwnedParamsSchema, contract.releaseScopeParamsSchema]) {
    expect(await schema['~standard'].validate([self, recovery])).toMatchObject({
      issues: [{ path: [0, 'parent'] }],
    })
    expect(await schema['~standard'].validate([first, recovery])).toMatchObject({
      issues: [{ path: [0, 'parent', 'parent'] }],
    })
    let finite: ScopeInput = { ref: 'root' }
    for (let index = 0; index < 32; index++) finite = { ref: String(index), parent: finite }
    expect(await schema['~standard'].validate([finite, recovery])).toHaveProperty('value')
  }
})

it('keeps data records closed across all operation families while retaining runtime ports', async () => {
  const recovered = {
    kind: 'recovered',
    scope,
    stopped: [],
    pending: [],
    unsupported: [],
    unavailable: [],
    ...groups,
  }
  const closed: [
    (
      | typeof contract.resolvePlacementResultSchema
      | typeof contract.acquireParamsSchema
      | typeof contract.recoverOwnedResultSchema
      | typeof contract.registerFacilityParamsSchema
    ),
    unknown,
  ][] = [
    [contract.resolvePlacementResultSchema, { ...placement, unexpected: true }],
    [
      contract.resolvePlacementResultSchema,
      { ...placement, provider: { ...placement.provider, unexpected: true } },
    ],
    [
      contract.resolvePlacementResultSchema,
      { ...placement, requirement: { ...requirement, unexpected: true } },
    ],
    [contract.acquireParamsSchema, [access, { ...input, unexpected: true }]],
    [contract.acquireParamsSchema, [{ ...access, unexpected: true }, input]],
    [
      contract.registerFacilityParamsSchema,
      [{ key: 'command', operations: ['start'], guarded: [], unexpected: true }],
    ],
    [contract.recoverOwnedResultSchema, { ...recovered, unexpected: true }],
    [
      contract.recoverOwnedResultSchema,
      {
        ...recovered,
        stopped: [
          {
            key: 'r',
            provider: 'p',
            reference: { kind: 'boolean', value: true },
            unexpected: true,
          },
        ],
      },
    ],
    [
      contract.recoverOwnedResultSchema,
      {
        ...recovered,
        unsupported: [{ kind: 'provider', provider: placement.provider, unexpected: true }],
      },
    ],
  ]
  for (const [schema, value] of closed)
    expect(await schema['~standard'].validate(value)).toMatchObject({
      issues: [{ path: expect.arrayContaining(['unexpected']) }],
    })
  for (const name of ['inspectAcquisition', 'describe', 'recoverOwned', 'releaseScope'] as const)
    expect(
      await contract.operationSchemas[name].result['~standard'].validate({
        kind: 'rejected',
        reason: 'invalidInput',
        unexpected: true,
      }),
    ).toHaveProperty('issues')
  for (const [name, params] of cases()) {
    for (const malformed of [null, {}, [], params.slice(0, -1)])
      expect(
        await contract.operationSchemas[name].params['~standard'].validate(malformed),
        name,
      ).toHaveProperty('issues')
  }
})

it('requires authentic recovery authority and complete paired provider recovery capabilities', async () => {
  for (const schema of [contract.recoverOwnedParamsSchema, contract.releaseScopeParamsSchema]) {
    for (const forged of [null, {}, JSON.parse(JSON.stringify(recovery)), JSON.stringify(recovery)])
      expect(await schema['~standard'].validate([scope, forged])).toMatchObject({
        issues: [{ path: [1] }],
      })
    expect(
      await schema['~standard'].validate([scope, contract.createRecoveryAccess()]),
    ).toHaveProperty('value')
  }
  const provider = createScriptedEnvironmentProvider()
  for (const method of [
    'describe',
    'quota',
    'acquire',
    'inspectAcquisition',
    'listAcquisitions',
    'settleAcquisition',
    'retire',
    'listRecoveryResources',
    'recover',
  ]) {
    const value = { ...provider, [method]: null }
    expect(
      await contract.registerProviderParamsSchema['~standard'].validate([value]),
      method,
    ).toHaveProperty('issues')
  }
  for (const pair of [
    { listRecoveryResources: async () => ({ kind: 'unavailable' }) },
    { recover: async () => ({ kind: 'unavailable' }) },
  ])
    expect(
      await contract.registerProviderParamsSchema['~standard'].validate([{ ...provider, ...pair }]),
    ).toHaveProperty('issues')
  expect(
    await contract.registerProviderParamsSchema['~standard'].validate([
      {
        ...provider,
        listRecoveryResources: async () => ({ kind: 'unavailable' }),
        recover: async () => ({ kind: 'unavailable' }),
      },
    ]),
  ).toHaveProperty('value')
  for (const field of [
    'name',
    'generation',
    'version',
    'quotaDomain',
    'bindingKinds',
    'facilities',
    'isolation',
    'continuity',
  ])
    expect(
      await contract.registerProviderParamsSchema['~standard'].validate([
        { ...provider, [field]: null },
      ]),
      field,
    ).toHaveProperty('issues')
})

it('preserves access identity and refuses forged tenants before invoking any runtime port', async () => {
  const parsed = await contract.describeParamsSchema['~standard'].validate([access, scope])
  expect(parsed).toEqual({ value: [access, scope] })
  if (parsed.issues) throw new Error('valid access refused')
  expect(parsed.value[0].tenant).toBe(tenant)
  for (const forged of [null, {}, { ...tenant }, JSON.parse(JSON.stringify(tenant)), 'not-json'])
    expect(
      await contract.describeParamsSchema['~standard'].validate([
        { ...access, tenant: forged },
        scope,
      ]),
    ).toHaveProperty('issues')
  for (const operations of [[''], [7], 'start'])
    expect(
      await contract.registerFacilityParamsSchema['~standard'].validate([
        { key: 'command', operations, guarded: [] },
      ]),
    ).toHaveProperty('issues')
  for (const schema of [contract.recoverOwnedResultSchema, contract.releaseScopeResultSchema]) {
    const report = {
      kind: 'recovered',
      scope,
      stopped: [{ key: 'r', provider: 'p', reference: { kind: 'boolean', value: true } }],
      pending: [],
      unsupported: [],
      unavailable: [],
      ...groups,
    }
    expect(await schema['~standard'].validate(report)).toHaveProperty('value')
    expect(
      await schema['~standard'].validate({
        ...report,
        stopped: [{ ...report.stopped[0], reference: undefined }],
      }),
    ).toHaveProperty('issues')
  }
})

it('exercises scripted provider lifecycle and the memory ledger close boundary', async () => {
  const decoded = await contract.acquireParamsSchema['~standard'].validate([access, input])
  if (decoded.issues) throw new Error('valid acquisition refused')
  const providerInput = { ...decoded.value[1], tenant }
  const provider = createScriptedEnvironmentProvider()
  const acquired = await provider.acquire(providerInput)
  if (acquired.kind !== 'acquired') throw new Error('scripted acquisition refused')
  expect(provider.calls.acquire).toBe(1)
  expect(acquired.lease.placement).toEqual(placement)
  expect(await acquired.lease.release()).toEqual({ kind: 'released' })
  expect(provider.calls.release).toBe(1)
  expect(await provider.retire()).toEqual({ kind: 'drained' })
  expect(await provider.acquire(providerInput)).toEqual({
    kind: 'rejected',
    reason: 'providerUnavailable',
  })
  const unsupported = createScriptedEnvironmentProvider({ bindingKinds: [] })
  expect(await unsupported.acquire(providerInput)).toEqual({
    kind: 'rejected',
    reason: 'noMatchingEnvironment',
  })
  const scripted = createScriptedEnvironmentProvider({
    acquire: async () => ({ kind: 'rejected', reason: 'unavailable' }),
  })
  expect(await scripted.acquire(providerInput)).toEqual({ kind: 'rejected', reason: 'unavailable' })
  const memory = createMemoryResourceLedger()
  const decodedResource = await contract.managedResourceSchema['~standard'].validate({
    key: 'r',
    provider: 'p',
    reference: { kind: 'boolean', value: true },
  })
  if (decodedResource.issues) throw new Error('valid resource refused')
  const resource = decodedResource.value
  expect(await memory.ledger.plan(resource)).toBe('recorded')
  expect(await memory.ledger.permit('r')).toBe('confirmed')
  expect(await memory.ledger.adopt('r')).toBe('confirmed')
  memory.close()
  expect(memory.ledger.closed.aborted).toBe(true)
  expect(await memory.ledger.plan(resource)).toBe('closed')
  expect(await memory.ledger.permit('r')).toBe('closed')
  expect(await memory.ledger.adopt('r')).toBe('closed')
  expect(await memory.ledger.stopped('r', 'confirmed')).toBe('recorded')
  expect(memory.calls.map(call => call.method)).toEqual([
    'plan',
    'permit',
    'adopt',
    'plan',
    'permit',
    'adopt',
    'stopped',
  ])
})
