import { expect, it } from 'vitest'
import { tenantCodec } from '@omne-harness/legal-identity'
import {
  createMemoryRuntimeContext,
  createTestAuthorityPorts,
} from '@omne-harness/runtime-context-contract/testing'
import type { SupplyAnswer, SupplyCallback } from '@omne-harness/runtime-context-contract'
import { declaration, scope, openScope } from '../src/testing/fixtures.js'
const decoded = tenantCodec.parse(
  JSON.stringify({
    organization: 'org_00000000000000000000000000',
    account: 'acc_00000000000000000000000000',
  }),
)
if (!decoded.ok) throw new Error('Invalid fixture tenant')
const tenant = decoded.value
async function source(
  supply: SupplyCallback<unknown>,
  options: { perRequest?: boolean; required?: boolean } = {},
) {
  const ports = createTestAuthorityPorts<string>()
  const memory = createMemoryRuntimeContext<string>(ports)
  const target = scope('source-lifecycle')
  await openScope(memory, ports, 'source', target, tenant)
  const registration = {
    key: 'suite.value',
    tenant,
    producer: { producer: 'source' },
    scoped: false,
    supply,
  } as const
  const registered = options.perRequest
    ? await memory.registerProducer('source', {
        ...registration,
        declaration: declaration({ volatility: 'per-request', required: options.required ?? true }),
      })
    : await memory.registerProducer('source', {
        ...registration,
        declaration: declaration({ required: options.required ?? true }),
      })
  if (registered.kind !== 'registered') throw new Error('Producer refused')
  const commit = memory.applyCommit('source', {
    kind: 'registration',
    commit: { commit: 'register' },
    change: {
      kind: 'add',
      scope: target,
      tenant,
      key: 'suite.value',
      basedOn: 0,
      creating: true,
      required: true,
      parameters: undefined,
      bindings: [],
    },
  })
  const issued = await memory.issueEligibility('source', {
    scope: target,
    tenant,
    principal: 'source',
    consumer: 'model',
    keys: ['suite.value'],
    bindings: [],
    registrationRevision: 1,
    supersedes: null,
  })
  if (issued.kind !== 'issued') throw new Error('Eligibility refused')
  const bound = await memory.bind(issued.eligibility.id)
  if (bound.kind !== 'bound') throw new Error('Reader refused')
  return { memory, target, handle: registered.handle, reader: bound.reader, commit }
}
it('keeps a failed scope-independent source unknown and recovers on a later invalidation', async () => {
  let fail = true
  const s = await source(async () => {
    if (fail) throw new Error('Source failed')
    return { kind: 'value', value: 7 }
  })
  expect(await s.commit).toMatchObject({ kind: 'applied' })
  expect(await s.reader.snapshot()).toEqual({ kind: 'unknown', cause: 'source-unknown' })
  fail = false
  await s.handle.invalidate({ kind: 'scope', scope: s.target, tenant })
  expect(await s.reader.snapshot()).toMatchObject({
    kind: 'success',
    value: { blocks: [{ state: { kind: 'value', value: 7 } }], missing: [] },
  })
})
it('distinguishes explicit source unavailability from a known absence for stable blocks', async () => {
  let answer: SupplyAnswer<unknown> = { kind: 'unavailable' }
  const s = await source(async () => answer)
  await s.commit
  expect(await s.reader.snapshot()).toMatchObject({
    kind: 'success',
    value: { blocks: [], missing: [{ cause: 'source-unavailable' }] },
  })
  answer = { kind: 'none' }
  await s.handle.invalidate({ kind: 'scope', scope: s.target, tenant })
  expect(await s.reader.snapshot()).toMatchObject({
    kind: 'success',
    value: { blocks: [], missing: [{ cause: 'no-value' }] },
  })
})
for (const late of ['value', 'error'] as const) {
  it(`does not let a replaced producer's late ${late} overwrite the new generation`, async () => {
    const pending = Promise.withResolvers<SupplyAnswer<unknown>>()
    const s = await source(() => pending.promise)
    const replacement = await s.memory.registerProducer('source', {
      key: 'suite.value',
      tenant,
      producer: { producer: 'source' },
      declaration: declaration(),
      scoped: false,
      supply: async () => ({ kind: 'value', value: 99 }),
    })
    expect(replacement.kind).toBe('registered')
    if (late === 'value') pending.resolve({ kind: 'value', value: 7 })
    else pending.reject(new Error('Late source failure'))
    expect(await s.commit).toMatchObject({ kind: 'applied' })
    expect(await s.reader.snapshot()).toMatchObject({
      kind: 'success',
      value: { blocks: [{ state: { kind: 'value', value: 99 } }], missing: [] },
    })
  })
}
for (const required of [true, false]) {
  it(`keeps per-request source outcomes distinct with required=${required}`, async () => {
    let answer: 'throw' | SupplyAnswer<unknown> = 'throw'
    const s = await source(
      async () => {
        if (answer === 'throw') throw new Error('Request source failure')
        return answer
      },
      { perRequest: true, required },
    )
    await s.commit
    expect(await s.reader.snapshot()).toMatchObject({
      kind: 'success',
      value: { blocks: [], perRequest: [{ kind: 'unknown', cause: 'source-unknown' }] },
    })
    answer = { kind: 'unavailable' }
    expect(await s.reader.snapshot()).toMatchObject({
      kind: 'success',
      value: { perRequest: [{ kind: 'missing', cause: 'source-unavailable' }] },
    })
    answer = { kind: 'none' }
    expect(await s.reader.snapshot()).toMatchObject({
      kind: 'success',
      value: { perRequest: [required ? { kind: 'missing', cause: 'no-value' } : { kind: 'none' }] },
    })
    answer = { kind: 'value', value: 'wrong shape' }
    expect(await s.reader.snapshot()).toMatchObject({
      kind: 'success',
      value: { perRequest: [{ kind: 'missing', cause: 'uninterpretable' }] },
    })
    await s.handle.dispose()
    expect(await s.reader.snapshot()).toMatchObject({
      kind: 'success',
      value: {
        perRequest: [
          required ? { kind: 'missing', cause: 'producer-withdrawn' } : { kind: 'none' },
        ],
      },
    })
  })
}
