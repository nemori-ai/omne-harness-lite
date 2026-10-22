import { runInNewContext } from 'node:vm'
import { types } from 'node:util'
import { expect, it } from 'vitest'
import type { StandardSchemaV1 } from '@standard-schema/spec'
import { judgeNeed, judgeRegistration, reduceStep } from '@omne-harness/runtime-context-contract'
import type { StatefulBlockDescriptor } from '@omne-harness/runtime-context-contract'
import { tenantCodec } from '@omne-harness/legal-identity'
import { declaration, scope } from '../src/testing/fixtures.js'

const foreignSchema: StandardSchemaV1 = {
  '~standard': {
    version: 1,
    vendor: 'foreign-realm',
    validate: value => runInNewContext('Promise.resolve({value})', { value }),
  },
}
function input(descriptor: StatefulBlockDescriptor<'suite.state', unknown, unknown>) {
  return {
    scope: scope('cross-realm'),
    step: { step: 'one' },
    updates: [
      { key: 'suite.state', writer: 'tool', origin: { origin: 'one' }, update: 1 },
    ] as const,
    descriptors: { get: () => descriptor },
    current: () => 0,
  }
}
const stateful: StatefulBlockDescriptor<'suite.state', unknown, unknown> = {
  ...declaration(),
  key: 'suite.state',
  kind: 'stateful',
  writers: ['tool'],
  reduce: () => 1,
  persistence: 'checkpointed',
  singleWriterPerStep: false,
}

it('uses a real foreign-realm Promise that does not pass instanceof Promise', () => {
  const result: unknown = runInNewContext('Promise.resolve({value:1})')
  expect(result instanceof Promise).toBe(false)
  expect(types.isPromise(result)).toBe(true)
})
it('refuses cross-realm asynchronous need schemas with the shape parameter path', () => {
  expect(
    judgeNeed({
      name: 'foreign',
      shape: foreignSchema,
      consumer: 'model',
      purpose: 'cross realm',
      necessity: 'required',
    }),
  ).toEqual({ failure: { reason: 'schema-not-synchronous', path: ['shape'] } })
})
it('refuses cross-realm asynchronous update and value definitions rather than accepting updates', () => {
  const update = reduceStep(input({ ...stateful, updateSchema: foreignSchema }))
  expect(update.committed).toEqual([])
  expect(update.rejected[0]?.rejection).toEqual({
    kind: 'definition',
    reason: 'schema-not-synchronous',
    path: ['updateSchema'],
  })
  const value = reduceStep(input({ ...stateful, schema: foreignSchema }))
  expect(value.committed).toEqual([])
  expect(value.rejected[0]?.rejection).toEqual({
    kind: 'definition',
    reason: 'schema-not-synchronous',
    path: ['schema'],
  })
})
it('refuses cross-realm asynchronous registration parameter definitions with their path', () => {
  const decoded = tenantCodec.parse(
    JSON.stringify({
      organization: 'org_00000000000000000000000000',
      account: 'acc_00000000000000000000000000',
    }),
  )
  if (!decoded.ok) throw new Error('Invalid fixture tenant')
  const result = judgeRegistration(
    {
      kind: 'add',
      key: 'suite.value',
      scope: scope('parameter'),
      tenant: decoded.value,
      basedOn: 0,
      creating: true,
      bindings: [],
      parameters: 1,
      required: true,
    },
    {
      descriptors: { get: () => declaration({ parameterSchema: foreignSchema }) },
      scopeTenant: null,
      existing: null,
      creating: true,
    },
  )
  expect(result).toEqual({ failure: [{ reason: 'schema-not-synchronous', path: ['parameters'] }] })
})
it('observes rejection of an asynchronous foreign schema without an unhandled rejection', async () => {
  const rejected: StandardSchemaV1 = {
    '~standard': {
      version: 1,
      vendor: 'foreign-rejected',
      validate: () => runInNewContext("Promise.reject(new Error('source definition rejection'))"),
    },
  }
  expect(
    judgeNeed({
      name: 'rejected',
      shape: rejected,
      consumer: 'model',
      purpose: 'test',
      necessity: 'required',
    }),
  ).toHaveProperty('failure.reason', 'schema-not-synchronous')
  await new Promise<void>(resolve => setImmediate(resolve))
})
it('keeps synchronous schema defects as their original Error object', () => {
  const defect = new Error('programming defect')
  const broken: StandardSchemaV1 = {
    '~standard': {
      version: 1,
      vendor: 'broken',
      validate: () => {
        throw defect
      },
    },
  }
  try {
    judgeNeed({
      name: 'broken',
      shape: broken,
      consumer: 'model',
      purpose: 'test',
      necessity: 'required',
    })
    throw new Error('Expected original defect')
  } catch (error) {
    expect(error).toBe(defect)
  }
  try {
    reduceStep(input({ ...stateful, updateSchema: broken }))
    throw new Error('Expected original defect')
  } catch (error) {
    expect(error).toBe(defect)
  }
})
