import { expect, it } from 'vitest'
import {
  decodeModelCallId,
  type ModelInputMeter,
  type ModelPreparationResources,
} from '@omne-harness/model-contract'
import { judgeMessage } from '@omne-harness/message'
import { fail, succeed } from '@omne-harness/operation-result'
import { assembledFor, measureDefaultInput } from '../src/default-measurement.ts'
import { access, adoption, ok, request } from './request-fixture.ts'

function fixture(options: { measure?: ModelInputMeter['measure']; releaseFailure?: boolean } = {}) {
  const value = request().input
  const supplier = value.target.profile.profile.definition.suppliers[0]
  const basis = {
    supplier,
    meter: adoption,
    tokenization: { kind: 'not-used' as const, method: adoption },
    prompt: { kind: 'provider-private' as const, estimation: adoption },
    projection: adoption,
    mediaTransform: adoption,
    replay: adoption,
    evidence: adoption,
  }
  const acquisitions: Parameters<ModelPreparationResources<string>['acquire']>[0][] = []
  const measurements: Parameters<ModelInputMeter['measure']>[0][] = []
  let releases = 0
  const resources: ModelPreparationResources<string> = {
    acquire: async input => {
      acquisitions.push(input)
      return succeed({
        release: async () => {
          releases++
          return options.releaseFailure
            ? {
                failure: {
                  kind: 'unavailable',
                  dependency: 'release',
                  diagnostic: 'release failed',
                },
              }
            : {}
        },
        bindings: [
          {
            supplier: { ...supplier, credential: { layer: 'official' } },
            rules: {
              plan: given => {
                expect(given.assembled.representation).toEqual(
                  value.target.profile.profile.definition.representation,
                )
                return succeed({
                  parameters: [],
                  representation: {
                    kind: 'materialized',
                    requestBytes: '100',
                    adoption,
                    tokenInput: { kind: 'null' },
                    media: [],
                  },
                })
              },
            },
            meter: {
              basis,
              measure: async given => {
                measurements.push(given)
                return (
                  options.measure?.(given) ??
                  succeed({
                    kind: 'complete',
                    inputDigest: 'fixture',
                    counting: [basis],
                    checks: [
                      {
                        supplier: supplier.adoption,
                        metric: 'input-tokens',
                        subject: 'request',
                        measurement: {
                          kind: 'exact',
                          amount: String(measurements.length),
                          method: adoption,
                        },
                        limit: '990',
                        constraint: { profile: adoption, upstream: { kind: 'unknown' } },
                      },
                    ],
                  })
                )
              },
            },
          },
        ],
      })
    },
  }
  return { value, resources, acquisitions, measurements, releases: () => releases }
}

it('uses a fresh measurement and exact access/profile/lineage for every candidate', async () => {
  const f = fixture()
  const first = f.value.history.entries[0]!
  const call = ok(decodeModelCallId('mcall_original'))
  const input = {
    ...f.value,
    history: { ...f.value.history, entries: [{ ...first, sourceCall: call }] },
  }
  const assembled = assembledFor(input, [first.message], true)
  const one = ok(await measureDefaultInput(f.resources, access, input, assembled))
  const two = ok(await measureDefaultInput(f.resources, access, input, assembled))
  expect(one[0]?.measurement.amount).toBe('1')
  expect(two[0]?.measurement.amount).toBe('2')
  expect(f.acquisitions).toEqual(
    [1, 2].map(() => ({
      ...access,
      profile: input.target.profile.profile,
      lineage: { sources: [{ message: first.message.id, call }] },
    })),
  )
  expect(f.measurements.every(given => given.assembled === assembled)).toBe(true)
  expect(f.releases()).toBe(2)
})

function judged(value: unknown) {
  const outcome = judgeMessage(value)
  if (!('ok' in outcome)) throw new Error(`fixture message: ${JSON.stringify(outcome)}`)
  return outcome.ok
}

function carried(letter: string, call: string) {
  return judged({
    id: `msg_${letter.repeat(22)}`,
    role: 'assistant',
    blocks: [
      { kind: 'text', id: 't', visibility: { toHuman: true, toModel: true }, text: 'answer' },
      {
        kind: 'reasoning_state',
        id: 's',
        visibility: { toHuman: false, toModel: true },
        payload: 'p',
        pairs: [],
      },
    ],
    replay: { scope: 'A', format: 'f1', at: [1], call },
  })
}

it('cites the call a carried reply in the request names in its replay mark, and nothing else', async () => {
  const f = fixture()
  const first = f.value.history.entries[0]!
  const measured = carried('b', 'mcall_marked')
  const elsewhere = carried('c', 'mcall_elsewhere')
  const user = judged({
    id: `msg_${'d'.repeat(22)}`,
    role: 'user',
    blocks: [{ kind: 'text', id: 'u', visibility: { toHuman: true, toModel: true }, text: 'q' }],
  })
  const entries = [measured, elsewhere, user].map(message => ({
    ...first,
    message,
    represented: [message],
  }))
  const input = { ...f.value, history: { ...f.value.history, entries } }
  const assembled = assembledFor(input, [measured, user], true)
  ok(await measureDefaultInput(f.resources, access, input, assembled))
  expect(f.acquisitions[0]?.lineage).toEqual({
    sources: [{ message: measured.id, call: ok(decodeModelCallId('mcall_marked')) }],
  })
})

it('waits for a pending meter before releasing its lease', async () => {
  const started = Promise.withResolvers<void>()
  const finished = Promise.withResolvers<void>()
  const f = fixture({
    measure: async () => {
      started.resolve()
      await finished.promise
      return fail({ kind: 'unavailable', dependency: 'meter', diagnostic: 'meter failed' })
    },
  })
  const pending = measureDefaultInput(f.resources, access, f.value, assembledFor(f.value, [], true))
  await started.promise
  expect(f.releases()).toBe(0)
  finished.resolve()
  expect(await pending).toHaveProperty('failure.kind', 'unavailable')
  expect(f.releases()).toBe(1)
})

it('does not replace a primary measurement failure with a release failure', async () => {
  const f = fixture({
    releaseFailure: true,
    measure: async () =>
      fail({ kind: 'unavailable', dependency: 'meter', diagnostic: 'primary meter failed' }),
  })
  const result = await measureDefaultInput(
    f.resources,
    access,
    f.value,
    assembledFor(f.value, [], false),
  )
  expect(result).toHaveProperty(
    'failure.diagnostic',
    expect.stringContaining('primary meter failed'),
  )
  expect(f.releases()).toBe(1)
})

it('does not publish a successful measurement when releasing the lease fails', async () => {
  const f = fixture({ releaseFailure: true })
  const result = await measureDefaultInput(
    f.resources,
    access,
    f.value,
    assembledFor(f.value, [], false),
  )
  expect(result).toHaveProperty('failure.diagnostic', expect.stringContaining('release failed'))
})
