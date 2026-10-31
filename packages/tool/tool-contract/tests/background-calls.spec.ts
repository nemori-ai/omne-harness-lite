import assert from 'node:assert/strict'
import { describe, expect, it } from 'vitest'
import {
  backgroundCallsBlock,
  backgroundCallsSchema,
  encodeToolInvocationRef,
  type ToolBackgroundCallsValue,
} from '@omne-harness/tool-contract'
import {
  decodeToolDeliveryId,
  projectToolBackgroundCalls,
  readToolInvocationRef,
  type ToolBackgroundCallsSource,
  type ToolTask,
} from '@omne-harness/tool-contract/provider'
import {
  callId,
  complete,
  input,
  operation,
  original,
  result,
  scope,
  settled,
  state,
  tenant,
} from './background-calls-fixture.ts'
import { evidence } from './tool-values.ts'

function value(source = complete()) {
  const answer = projectToolBackgroundCalls({ input, source })
  assert.equal(answer.kind, 'value')
  return answer.value
}
function entry(): ToolBackgroundCallsValue['calls'][number] {
  const call = value().calls[0]
  assert.ok(call)
  return call
}
const consumer = { owner: 'consumer', work: 'work', position: 'position', purpose: 'result' }
function released() {
  const id = decodeToolDeliveryId('delivery-1')
  assert.ok('ok' in id)
  return { kind: 'released' as const, delivery: id.ok, consumer, evidence: evidence('released') }
}

describe('Tool background value schema', () => {
  it('declares recomputation and forbids carrying previous values', () => {
    expect(backgroundCallsBlock).toMatchObject({
      key: 'tool.background-calls',
      kind: 'supplied',
      recovery: 'recompute',
      consumers: ['model', 'tool', 'extension'],
      volatility: 'stable',
      required: true,
      disclosure: 'eligibility-checked',
      carriesPrevious: false,
    })
    expect(backgroundCallsBlock.schema).toBe(backgroundCallsSchema)
  })
  it('decodes a closed serialized value with the original admission', async () => {
    const checked = await backgroundCallsSchema['~standard'].validate(
      JSON.parse(JSON.stringify(value())),
    )
    assert.equal(checked.issues, undefined)
    expect(checked.value).toEqual(value())
    expect(readToolInvocationRef(entry().reference)).toEqual({
      tenant: input.tenant,
      call: callId(),
      admission: operation(),
    })
  })
  it.each([
    ['unknown root', () => ({ ...value(), secret: 'secret' })],
    ['unknown item', () => ({ ...value(), calls: [{ ...entry(), arguments: {} }] })],
    ['unknown tenant', () => ({ ...value(), tenant: { ...input.tenant, extra: true } })],
    [
      'illegal tenant',
      () => ({
        ...value(),
        tenant: { ...input.tenant, account: { name: 'AccountId', text: 'not-an-account' } },
      }),
    ],
    ['illegal call', () => ({ ...value(), calls: [{ ...entry(), call: '' }] })],
    [
      'illegal reference',
      () => ({ ...value(), calls: [{ ...entry(), reference: 'not-a-reference' }] }),
    ],
    ['empty activity', () => ({ ...value(), calls: [{ ...entry(), activity: '' }] })],
    ['empty waiting', () => ({ ...value(), calls: [{ ...entry(), waiting: '' }] })],
    ['unknown waiting', () => ({ ...value(), calls: [{ ...entry(), waiting: undefined }] })],
    ['illegal revision', () => ({ ...value(), calls: [{ ...entry(), revision: '' }] })],
    ['illegal phase', () => ({ ...value(), calls: [{ ...entry(), phase: 'finished' }] })],
    ['illegal execution', () => ({ ...value(), calls: [{ ...entry(), execution: 'finished' }] })],
    ['illegal task', () => ({ ...value(), calls: [{ ...entry(), pending: ['done'] }] })],
    ['illegal delivery', () => ({ ...value(), calls: [{ ...entry(), delivery: 'done' }] })],
    ['wrong tenant', () => ({ ...value(), tenant: tenant('b') })],
    ['wrong call', () => ({ ...value(), calls: [{ ...entry(), call: callId('other-call') }] })],
  ])('rejects %s', async (_name, bad) => {
    expect((await backgroundCallsSchema['~standard'].validate(bad())).issues).toBeDefined()
  })
  it('does not mistake a shaped reference for proof of original admission', async () => {
    const other = encodeToolInvocationRef({
      tenant: input.tenant,
      call: callId(),
      admission: operation('other-admission'),
    })
    assert.ok('ok' in other)
    const shaped = await backgroundCallsSchema['~standard'].validate({
      ...value(),
      calls: [{ ...entry(), reference: other.ok }],
    })
    expect(shaped.issues).toBeUndefined()
    expect(entry().reference).not.toBe(other.ok)
  })
})

describe('projection of current authorized original facts', () => {
  it('includes suspended and every pre-start phase', () => {
    const before = ['accepted', 'preparing', 'queued', 'starting'] as const
    for (const phase of before) {
      expect(
        value(complete([original({ state: { ...state(), phase, wait: { kind: 'none' } } })]))
          .calls[0]?.phase,
      ).toBe(phase)
    }
    const suspended = original({
      state: {
        ...state(),
        phase: 'suspended',
        relation: 'background',
        wait: { kind: 'none' },
        checkpoint: evidence('checkpoint'),
        execution: { kind: 'suspended', checkpoint: evidence('checkpoint') },
      },
    })
    expect(value(complete([suspended])).calls[0]).toMatchObject({
      phase: 'suspended',
      execution: 'suspended',
    })
  })
  it('keeps a settled call until its physical execution reliably ends', () => {
    for (const kind of ['starting', 'live', 'unknown'] as const) {
      expect(
        value(
          complete([
            original({ state: { ...settled(), execution: { kind, start: operation('start') } } }),
          ]),
        ).calls[0]?.execution,
      ).toBe(kind)
    }
    expect(
      value(
        complete([
          original({
            state: {
              ...settled(),
              execution: { kind: 'lost', evidence: evidence('continuity-lost') },
            },
          }),
        ]),
      ).calls,
    ).toHaveLength(1)
  })
  it('keeps cleanup tasks, deduplicates their kinds and omits task evidence', () => {
    const tasks: ToolTask[] = [1, 2].map(index => ({
      kind: 'account',
      operation: operation(`account-${index}`),
      state: 'blocked',
      diagnostic: 'private diagnostic',
      basis: evidence('private evidence'),
    }))
    const projected = value(complete([original({ state: settled(), tasks })]))
    expect(projected.calls[0]).toMatchObject({ phase: 'settled', pending: ['account'] })
    expect(JSON.stringify(projected)).not.toContain('private')
  })
  it('retains pending supplemental delivery after original delivery was released', async () => {
    const delivery = released()
    const call = original({
      state: {
        ...settled(),
        delivery,
        supplements: [
          {
            result: result('late-result'),
            actual: { kind: 'completed' },
            delivery: { ...delivery, kind: 'pending' },
            source: evidence('late'),
          },
        ],
      },
    })
    expect(value(complete([call])).calls[0]?.delivery).toBe('pending')
    expect(
      value(complete([original({ state: { ...state(), delivery } })])).calls[0]?.delivery,
    ).toBe('released')
  })
  it('omits foreground and fully discharged calls, and accepts a complete empty directory', () => {
    expect(
      value(
        complete([
          original({ state: { ...state(), relation: 'foreground', foreground: null } }),
          original({ state: settled() }),
        ]),
      ).calls,
    ).toEqual([])
    expect(value(complete([])).calls).toEqual([])
  })
  it.each(['partial', 'unknown', 'unavailable', 'refused'] as const)(
    'does not turn %s into an empty value',
    kind => {
      expect(projectToolBackgroundCalls({ input, source: { kind } })).toEqual({
        kind: kind === 'partial' ? 'unknown' : kind,
      })
    },
  )
  it.each(['none', 'unknown', 'unavailable', 'refused'] as const)(
    'does not disclose a partial list when an original description is %s',
    kind => {
      const source = complete([original(), original({ description: { kind } })])
      expect(projectToolBackgroundCalls({ input, source })).toEqual({
        kind: kind === 'none' ? 'unknown' : kind,
      })
    },
  )
  it('does not fill in missing work or waiting facts', () => {
    const source = complete([
      original({ description: { kind: 'value', value: { activity: '', waiting: null } } }),
    ])
    expect(projectToolBackgroundCalls({ input, source })).toEqual({ kind: 'unknown' })
    expect(
      projectToolBackgroundCalls({
        input,
        source: complete([original({ description: { kind: 'unknown' } })]),
      }),
    ).toEqual({ kind: 'unknown' })
  })
  it.each([
    complete([original({ tenant: tenant('b') })]),
    complete([original({ requesterScope: scope('other-scope') })]),
    { kind: 'value', value: { tenant: tenant('b'), scope: input.scope, calls: [] } },
    { kind: 'value', value: { tenant: input.tenant, scope: scope('other-scope'), calls: [] } },
  ] satisfies ToolBackgroundCallsSource[])(
    'rejects a source bound to another tenant or scope',
    source => {
      expect(projectToolBackgroundCalls({ input, source })).toEqual({ kind: 'refused' })
    },
  )
})

it.each(['ended', 'not-started'] as const)(
  'removes discharged %s execution but keeps pending delivery',
  execution => {
    const base = settled()
    const physical = execution === 'ended' ? base.execution : { kind: 'not-started' as const }
    expect(
      value(complete([original({ state: { ...base, execution: physical, delivery: released() } })]))
        .calls,
    ).toEqual([])
    const delivery = { ...released(), kind: 'pending' as const }
    expect(
      value(complete([original({ state: { ...base, execution: physical, delivery } })])).calls[0]
        ?.delivery,
    ).toBe('pending')
    expect(
      value(
        complete([
          original({
            state: {
              ...state(),
              delivery: null,
              supplements: [
                {
                  result: result('supplement'),
                  actual: { kind: 'completed' },
                  delivery: released(),
                  source: evidence('supplement'),
                },
              ],
            },
          }),
        ]),
      ).calls[0]?.delivery,
    ).toBe('released')
  },
)

it('keeps an unencodable original admission unknown', () => {
  const invalid = original()
  Reflect.set(invalid, 'admission', '')
  expect(projectToolBackgroundCalls({ input, source: complete([invalid]) })).toEqual({
    kind: 'unknown',
  })
})
