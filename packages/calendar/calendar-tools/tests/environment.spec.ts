import { expect, it, vi } from 'vitest'
import { createCalendarToolEnvironment } from '@omne-harness/calendar-tools'
import { createMemoryToolEnvironment } from '@omne-harness/tool-contract/testing'
import type { CalendarToolContextResolver } from '@omne-harness/calendar-tools'
import { access, context, domainError, operationId, request, value, evidence } from './world.ts'

it('resolves each call identity again, including inspected preparation after revocation', async () => {
  const base = createMemoryToolEnvironment<string>()
  let revoked = false
  const resolve = vi.fn<CalendarToolContextResolver<string>['resolve']>(async input =>
    revoked ? domainError() : { kind: 'ok', value: context(input.principal) },
  )
  const environment = createCalendarToolEnvironment(base, { resolve })
  const fixed = await request()
  const inputs = ['alice', 'bob'].map(name => ({
    ...access(name),
    preparation: {
      tenant: access(name).tenant,
      call: access(name).call,
      operation: operationId(`prepare-${name}`),
      adoption: base.adoption,
      inputDigest: `digest-${name}`,
      purpose: 'initial' as const,
      request: fixed,
    },
  }))
  for (const input of inputs) {
    const prepared = value(await environment.prepare(input))
    expect(prepared).toMatchObject({
      kind: 'prepared',
      environment: { value: { calendarContext: { kind: 'ok', value: context(input.principal) } } },
    })
  }
  const alice = inputs[0]
  if (alice === undefined) throw new Error('fixture')
  revoked = true
  const refreshed = value(await environment.inspectPreparation(alice))
  expect(refreshed).toMatchObject({
    kind: 'prepared',
    environment: { value: { calendarContext: domainError() } },
  })
  expect(resolve.mock.calls.map(([call]) => call.principal)).toEqual(['alice', 'bob', 'alice'])
  if (refreshed.kind !== 'prepared') throw new Error('fixture')
  const release = {
    ...alice.preparation,
    operation: operationId('release'),
    preparation: alice.preparation.operation,
    resource: refreshed.environment.evidence,
    custody: evidence('custody'),
  }
  expect(value(await environment.release({ ...access(), release }))).toHaveProperty(
    'kind',
    'released',
  )
  expect(value(await environment.inspectRelease({ ...access(), release }))).toHaveProperty(
    'kind',
    'released',
  )
})

it('keeps missing environment explicit and does not resolve failed base preparation', async () => {
  const base = createMemoryToolEnvironment<string>()
  const resolve = vi.fn<CalendarToolContextResolver<string>['resolve']>(async () =>
    domainError('missing_environment'),
  )
  const environment = createCalendarToolEnvironment(base, { resolve })
  const preparation = {
    tenant: access().tenant,
    call: access().call,
    operation: operationId('prepare'),
    adoption: base.adoption,
    inputDigest: 'digest',
    purpose: 'initial' as const,
    request: await request(),
  }
  const input = { ...access(), preparation }
  expect(value(await environment.prepare(input))).toMatchObject({
    kind: 'prepared',
    environment: { value: { calendarContext: domainError('missing_environment') } },
  })
  base.controls.rejectNext('unavailable')
  expect(
    value(
      await environment.prepare({
        ...input,
        preparation: { ...preparation, operation: operationId('rejected') },
      }),
    ),
  ).toHaveProperty('kind', 'rejected')
  expect(resolve).toHaveBeenCalledOnce()
})

it('preserves the host resource receipt when a trusted resolver throws', async () => {
  const base = createMemoryToolEnvironment<string>()
  const environment = createCalendarToolEnvironment(base, {
    resolve: async () => {
      throw new Error('resolver offline')
    },
  })
  const preparation = {
    tenant: access().tenant,
    call: access().call,
    operation: operationId('prepare'),
    adoption: base.adoption,
    inputDigest: 'digest',
    purpose: 'initial' as const,
    request: await request(),
  }
  const prepared = value(await environment.prepare({ ...access(), preparation }))
  expect(prepared).toMatchObject({
    kind: 'prepared',
    environment: {
      value: {
        calendarContext: {
          kind: 'error',
          error: { code: 'provider_failure', requestId: access().call },
        },
      },
    },
  })
  if (prepared.kind !== 'prepared') throw new Error('Missing resource receipt')
  const release = {
    ...preparation,
    operation: operationId('release'),
    preparation: preparation.operation,
    resource: prepared.environment.evidence,
    custody: evidence('custody'),
  }
  expect(value(await environment.release({ ...access(), release }))).toHaveProperty(
    'kind',
    'released',
  )
})

it('rejects incoherent resolver output and preserves base authorization failures', async () => {
  const base = createMemoryToolEnvironment<string>()
  const resolve = vi.fn<CalendarToolContextResolver<string>['resolve']>(async () => ({
    kind: 'ok',
    value: { ...context(), requestId: '' },
  }))
  const environment = createCalendarToolEnvironment(base, { resolve })
  const preparation = {
    tenant: access().tenant,
    call: access().call,
    operation: operationId('prepare'),
    adoption: base.adoption,
    inputDigest: 'digest',
    purpose: 'initial' as const,
    request: await request(),
  }
  expect(value(await environment.prepare({ ...access(), preparation }))).toMatchObject({
    kind: 'prepared',
    environment: {
      value: { calendarContext: { kind: 'error', error: { code: 'environment_incoherent' } } },
    },
  })
  expect(await environment.prepare({ ...access('bob'), preparation })).toHaveProperty('failure')
  expect(resolve).toHaveBeenCalledOnce()
})
