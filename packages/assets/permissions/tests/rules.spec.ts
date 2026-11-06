import { expect, it } from 'vitest'
import {
  definePermission,
  evaluatePermission,
  projectPermissionSettings,
} from '@omne-harness/permissions'
import { definition, evaluation, source } from './fixtures.ts'

it('intersects default locks, all governing locks, and named external bounds', () => {
  for (const layer of ['organization', 'tenant', 'session']) {
    const locked = evaluation()
    expect(
      evaluatePermission({
        ...locked,
        sources: { ...locked.sources, [layer]: source('auto', ['ask']) },
      }),
    ).toMatchObject({ kind: 'effective', value: 'ask', allowedSet: ['ask'] })
  }
  const input = evaluation()
  input.declaration.definition.defaultRule = { pick: 'auto', allowedSet: ['deny', 'ask'] }
  input.sources.organization = source('ask', ['ask', 'auto'])
  expect(evaluatePermission(input)).toMatchObject({
    kind: 'effective',
    value: 'ask',
    allowedSet: ['ask'],
  })
  input.constraints[0].effect.allowedSet = ['deny']
  expect(evaluatePermission(input)).toMatchObject({ kind: 'denied', reason: 'empty-bound' })
  input.declaration.definition.defaultRule.allowedSet = null
  input.sources.organization = source('auto')
  input.constraints[0].effect.allowedSet = ['ask']
  expect(evaluatePermission(input)).toMatchObject({
    kind: 'effective',
    value: 'ask',
    allowedSet: ['ask'],
  })
})

it('uses the innermost legal pick before considering declared nearest distance', () => {
  const input = evaluation()
  input.declaration.definition.defaultRule.pick = 'auto'
  input.sources.tenant = source('ask')
  expect(evaluatePermission(input)).toMatchObject({
    kind: 'effective',
    value: 'ask',
    selection: 'pick',
  })
  input.constraints[0].effect.allowedSet = ['deny', 'auto']
  expect(evaluatePermission(input)).toMatchObject({
    kind: 'effective',
    value: 'auto',
    selection: 'pick',
  })
})

it('preserves every active prohibition but lets an inner pick replace a denied default', () => {
  expect(evaluatePermission(evaluation())).toMatchObject({ kind: 'effective', value: 'auto' })
  for (const layer of ['organization', 'tenant', 'session']) {
    const input = evaluation()
    expect(
      evaluatePermission({ ...input, sources: { ...input.sources, [layer]: source('deny') } }),
    ).toMatchObject({ kind: 'denied', reason: 'active-prohibition' })
  }
  const input = evaluation()
  expect(
    evaluatePermission({
      ...input,
      constraints: [{ ...input.constraints[0], effect: { kind: 'prohibition' } }],
    }),
  ).toMatchObject({ kind: 'denied', reason: 'active-prohibition' })
})

it('uses the declared nonuniform distance and strictness only for fallback', () => {
  const input = evaluation()
  input.declaration.definition.defaultRule.pick = 'ask'
  input.sources.tenant = source('ask')
  input.constraints[0].effect.allowedSet = ['deny', 'auto']
  input.declaration.definition.comparison.strictOrder = ['auto', 'ask', 'deny']
  expect(evaluatePermission(input)).toMatchObject({
    kind: 'effective',
    value: 'deny',
    permitsOperation: false,
    selection: 'nearest',
  })
  input.declaration.definition.comparison.distances = [
    [0, 1, 2],
    [1, 0, 1],
    [2, 1, 0],
  ]
  expect(evaluatePermission(input)).toMatchObject({ kind: 'effective', value: 'auto' })
  input.declaration.definition.comparison.strictOrder.reverse()
  expect(evaluatePermission(input)).toMatchObject({ kind: 'effective', value: 'deny' })
  expect(
    evaluatePermission({
      ...input,
      declaration: {
        kind: 'available',
        definition: { ...input.declaration.definition, comparison: null },
      },
    }),
  ).toMatchObject({ kind: 'unavailable', missingBasis: ['comparison'] })
})

it('rejects unavailable prerequisites without masking independently known denials', () => {
  const input = evaluation()
  expect(evaluatePermission({ ...input, constraints: [] })).toMatchObject({
    kind: 'unavailable',
    missingBasis: ['constraint/agent'],
  })
  for (const layer of ['organization', 'tenant', 'session']) {
    expect(
      evaluatePermission({
        ...input,
        sources: { ...input.sources, [layer]: { kind: 'unavailable', sourceRef: layer } },
      }),
    ).toMatchObject({ kind: 'unavailable', missingBasis: [layer] })
  }
  expect(
    evaluatePermission({ ...input, declaration: { kind: 'unavailable', sourceRef: 'provider' } }),
  ).toMatchObject({ kind: 'unavailable' })
  const missing = { ...input, declaration: { kind: 'unavailable', sourceRef: 'replacement' } }
  expect(
    evaluatePermission({
      ...missing,
      constraints: [{ ...input.constraints[0], effect: { kind: 'prohibition' } }],
    }),
  ).toMatchObject({ kind: 'denied', reason: 'active-prohibition' })
  expect(
    evaluatePermission({
      ...missing,
      constraints: [{ ...input.constraints[0], effect: { kind: 'bound', allowedSet: [] } }],
    }),
  ).toMatchObject({ kind: 'denied', reason: 'empty-bound' })
  expect(
    evaluatePermission({
      ...missing,
      constraints: [{ ...input.constraints[0], effect: { kind: 'bound', allowedSet: ['ask'] } }],
    }),
  ).toMatchObject({ kind: 'unavailable' })
})

it('rejects forged tenant, target, service, definition and capability bindings', () => {
  for (const field of [
    'tenantId',
    'targetId',
    'logicalServiceId',
    'deploymentId',
    'sessionId',
    'organizationId',
  ]) {
    const input = evaluation()
    expect(
      evaluatePermission({
        ...input,
        sources: {
          ...input.sources,
          tenant: { ...source('auto'), scope: { ...input.scope, [field]: 'other' } },
        },
      }),
    ).toMatchObject({ kind: 'invalid-input', reason: 'binding' })
  }
  const input = evaluation()
  const other = {
    ...source('auto'),
    definition: {
      ...input.definition,
      origin: { kind: 'independent', providerId: 'other', definitionRef: 'shell-v1' },
    },
  }
  expect(
    evaluatePermission({ ...input, sources: { ...input.sources, tenant: other } }),
  ).toMatchObject({ kind: 'invalid-input', reason: 'binding' })
  expect(
    evaluatePermission({
      ...input,
      constraints: [{ ...input.constraints[0], enforcementKey: 'other' }],
    }),
  ).toMatchObject({ kind: 'invalid-input', reason: 'binding' })
  expect(
    evaluatePermission({
      ...input,
      scope: { ...input.scope, sessionId: null },
      sources: { ...input.sources, session: source('auto') },
    }),
  ).toMatchObject({ kind: 'invalid-input' })
})

it('rejects undeclared values, invalid comparisons, duplicate identities and workspace assignments', () => {
  const input = evaluation()
  expect(
    evaluatePermission({ ...input, sources: { ...input.sources, workspace: source('auto') } }),
  ).toMatchObject({ kind: 'invalid-input' })
  expect(
    evaluatePermission({ ...input, sources: { ...input.sources, tenant: source('invented') } }),
  ).toMatchObject({ kind: 'invalid-input', reason: 'rule' })
  expect(
    evaluatePermission({ ...input, constraints: [...input.constraints, ...input.constraints] }),
  ).toMatchObject({ kind: 'invalid-input', reason: 'rule' })
  expect(
    definePermission({ ...definition(), comparison: { strictOrder: ['ask'], distances: [[0]] } }),
  ).toMatchObject({ kind: 'invalid-input', reason: 'definition' })
  expect(
    definePermission({
      ...definition(),
      comparison: {
        strictOrder: ['deny', 'ask', 'auto'],
        distances: [
          [0, 1, 4],
          [2, 0, 3],
          [4, 3, 0],
        ],
      },
    }),
  ).toMatchObject({ kind: 'invalid-input', reason: 'definition' })
  expect(definePermission({ ...definition(), enforcementKey: '' })).toMatchObject({
    kind: 'invalid-input',
  })
  expect(
    definePermission({ ...definition(), values: [...definition().values, ...definition().values] }),
  ).toMatchObject({ kind: 'invalid-input' })
})

it('supports asset declarations and nonpersistent items without inventing a Settings store', () => {
  const asset = {
    ...definition(),
    reference: {
      ...definition().reference,
      origin: { kind: 'asset', assetId: 'asset-a', releaseRef: 'release-1' },
    },
  }
  expect(definePermission(asset).kind).toBe('defined')
  expect(projectPermissionSettings({ ...asset, settings: null })).toEqual({
    kind: 'not-configurable',
  })
  const result = evaluatePermission(evaluation())
  expect(result).toMatchObject({
    scope: { tenantId: 'tenant-a' },
    definition: { revision: '1' },
    revisionVector: expect.arrayContaining([
      { axis: 'constraint/agent', sourceRef: 'agent-definition', revision: '1' },
    ]),
  })
})
