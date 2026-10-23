import { it, expect } from 'vitest'
import { tenantCodec } from '@omne-harness/legal-identity'
import { declarationDigest, judgeRegistration } from '@omne-harness/runtime-context-contract'
import { declaration, numberSchema, scope } from '../src/testing/fixtures.js'
const decoded = tenantCodec.parse(
  JSON.stringify({
    organization: 'org_00000000000000000000000000',
    account: 'acc_00000000000000000000000000',
  }),
)
if (!decoded.ok) throw new Error('Invalid fixture')
const tenant = decoded.value
const head = {
  scope: scope('registration'),
  tenant,
  key: 'suite.value',
  basedOn: 0,
  creating: true,
} as const
const change = {
  ...head,
  kind: 'add',
  bindings: [],
  parameters: undefined,
  required: true,
} as const
const context = {
  descriptors: { get: () => declaration() },
  scopeTenant: null,
  existing: null,
  creating: true,
} as const
it('uses structural metadata digest and excludes validator/reducer function identity', () => {
  const original = declaration()
  expect(declarationDigest(original)).toMatch(/^[a-f0-9]{64}$/)
  expect(declarationDigest(original)).toBe(
    declarationDigest({ ...original, schema: { '~standard': { ...numberSchema['~standard'] } } }),
  )
  expect(declarationDigest(original)).not.toBe(declarationDigest({ ...original, required: false }))
  const state = {
    ...original,
    kind: 'stateful',
    writers: ['tool'],
    reduce: () => 1,
    singleWriterPerStep: false,
    persistence: 'checkpointed',
  } as const
  expect(declarationDigest(state)).toBe(declarationDigest({ ...state, reduce: () => 2 }))
  expect(declarationDigest(state)).not.toBe(
    declarationDigest({ ...state, updateSchema: numberSchema }),
  )
})
it('does not infer creation from prior registrations and refuses late mandatory additions', () => {
  expect(judgeRegistration(change, context)).toHaveProperty('ok')
  expect(judgeRegistration({ ...change, basedOn: 9 }, context)).toHaveProperty('ok')
  expect(judgeRegistration({ ...change, creating: false }, context)).toHaveProperty(
    'failure.0.reason',
    'required-after-creation',
  )
  expect(judgeRegistration(change, { ...context, creating: false })).toHaveProperty(
    'failure.0.reason',
    'required-after-creation',
  )
})
it('rejects cross-block bindings and invalid need declarations even when descriptors are present', () => {
  const need = {
    name: 'value',
    shape: numberSchema,
    consumer: 'model',
    purpose: 'test',
    necessity: 'required',
  } as const
  expect(
    judgeRegistration({ ...change, bindings: [{ key: 'suite.other', need }] }, context),
  ).toHaveProperty('failure')
  expect(
    judgeRegistration(
      { ...change, bindings: [{ key: 'suite.value', need: { ...need, name: '' } }] },
      context,
    ),
  ).toHaveProperty('failure')
})
it('refuses duplicate add that could downgrade an existing mandatory registration', () => {
  const existing = { ...head, bindings: [], parameters: undefined, required: true, revision: 1 }
  expect(
    judgeRegistration({ ...change, required: false }, { ...context, existing }),
  ).toHaveProperty('failure.0.reason', 'identity-changed')
})
it('rejects invalid revisions and async parameter definitions with precise paths', () => {
  expect(judgeRegistration({ ...change, basedOn: -1 }, context)).toHaveProperty('failure')
  const asyncSchema = {
    '~standard': { version: 1, vendor: 'async', validate: async (value: unknown) => ({ value }) },
  } as const
  const result = judgeRegistration(
    { ...change, parameters: 1 },
    { ...context, descriptors: { get: () => declaration({ parameterSchema: asyncSchema }) } },
  )
  expect(result).toHaveProperty('failure.0.reason', 'schema-not-synchronous')
  expect(result).toHaveProperty('failure.0.path', ['parameters'])
})
