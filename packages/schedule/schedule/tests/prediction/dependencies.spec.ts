import { expect, test, vi } from 'vitest'
import {
  calendarGetResultSchema,
  calendarResolveResultSchema,
} from '@omne-harness/calendar-contract'
import { createSchedulePredictionService } from '@omne-harness/schedule'
import {
  context,
  definition,
  harness,
  input,
  instant,
  calendarFixture,
  selected,
  value,
  daily,
} from './fixtures.ts'

test.each(['latest', 'pinned'] as const)(
  '%s version is found across directory pages and all resolutions are pinned',
  async kind => {
    const fixture = calendarFixture({ firstPage: true })
    const { service } = harness({ calendar: fixture.queries })
    const rule = definition(daily('2026-02-01T00:00:00', '2026-02-05T23:59:59'), {
      binding: {
        ...selected,
        calendar: {
          calendarId: 'cn',
          version: kind === 'latest' ? { kind } : { kind, versionId: 'v1' },
        },
      },
      calendarOverlay: { predicate: 'workingDay', adjust: 'skip' },
    })
    const preview = value(await service.preview(context, input(rule)))
    expect(fixture.gets).toHaveLength(2)
    expect(preview.basis).toMatchObject({ calendarVersionId: 'v1', publicationGeneration: 3 })
    expect(
      fixture.requests.every(
        request =>
          request.selection.kind === 'explicit' &&
          request.version.kind === 'pinned' &&
          request.version.versionId === 'v1',
      ),
    ).toBe(true)
    expect(
      preview.candidates.every(candidate =>
        candidate.dateExplanation.every(
          item =>
            item.basis.publicationGeneration === 3 && item.basis.contentHash === 'a'.repeat(64),
        ),
      ),
    ).toBe(true)
  },
)

test('follow observes one atomic environment with matching owner, timezone, calendar and revision', async () => {
  const fixture = calendarFixture({ timezone: 'Asia/Shanghai' })
  const observe = vi.fn(async () => ({
    kind: 'ok' as const,
    value: {
      owner: context.owner,
      revision: 'env:7',
      timezone: 'Asia/Shanghai',
      calendar: selected.calendar,
    },
  }))
  const { service } = harness({ calendar: fixture.queries, environment: { observe } })
  const preview = value(
    await service.preview(
      context,
      input(definition(undefined, { binding: { kind: 'followUserEnvironment' } })),
    ),
  )
  expect(observe).toHaveBeenCalledTimes(1)
  expect(preview.basis).toMatchObject({
    timezone: 'Asia/Shanghai',
    environmentRevision: 'env:7',
    calendarVersionId: 'v1',
  })
  expect(preview.candidates[0]?.scheduledAt).toBe('2026-11-05T01:00:00.000Z')
})

test('follow without Calendar supports independent rules and rejects dependent ones', async () => {
  const observe = async () => ({
    kind: 'ok' as const,
    value: { owner: context.owner, revision: 'env:none', timezone: 'UTC', calendar: null },
  })
  const { service } = harness({ environment: { observe } })
  expect(
    value(
      await service.preview(
        context,
        input(definition(undefined, { binding: { kind: 'followUserEnvironment' } })),
      ),
    ).basis.calendarId,
  ).toBeNull()
  const dependent = definition(daily('2026-01-01T00:00:00', null), {
    binding: { kind: 'followUserEnvironment' },
    calendarOverlay: { predicate: 'workingDay', adjust: 'skip' },
  })
  expect(await service.preview(context, input(dependent))).toMatchObject({
    kind: 'error',
    error: { code: 'missing_environment' },
  })
})

test('wrong environment owner and Calendar timezone are rejected', async () => {
  const bad = harness({
    environment: {
      observe: async () => ({
        kind: 'ok',
        value: {
          owner: { kind: 'tenant', tenantId: 't2', ownerId: 'alice' },
          revision: 'env:1',
          timezone: 'UTC',
          calendar: null,
        },
      }),
    },
  })
  expect(
    await bad.service.preview(
      context,
      input(definition(undefined, { binding: { kind: 'followUserEnvironment' } })),
    ),
  ).toMatchObject({ kind: 'error', error: { code: 'environment_incoherent' } })
  expect(
    await harness({
      calendar: calendarFixture({ timezone: 'Asia/Shanghai' }).queries,
    }).service.preview(context, input(definition(undefined, { binding: selected }))),
  ).toMatchObject({ kind: 'error', error: { code: 'environment_incoherent' } })
})

test.each([
  'coverage_insufficient',
  'forbidden',
  'authority_unavailable',
  'provider_failure',
] as const)('Calendar %s is a failure, never an empty success', async code => {
  const fixture = calendarFixture()
  fixture.queries.resolve = async () => ({
    kind: 'error',
    error: {
      code,
      message: 'Dependency failure',
      retryable: true,
      requestId: 'calendar:r',
      details: { source: 'calendar' },
    },
  })
  expect(
    await harness({ calendar: fixture.queries }).service.preview(
      context,
      input(definition(undefined, { binding: selected })),
    ),
  ).toMatchObject({ kind: 'error', error: { code, details: { source: 'calendar' } } })
})

test.each(['version', 'generation', 'hash', 'range'] as const)(
  'inconsistent Calendar %s fails after basis capture',
  async fault => {
    const fixture = calendarFixture()
    const resolve = fixture.queries.resolve
    fixture.queries.resolve = async (ctx, request) => {
      const result = await resolve(ctx, request)
      if (result.kind !== 'ok' || fixture.requests.length === 1) return result
      const original = result.value.result.value.basis
      const basis = {
        ...original,
        ...(fault === 'generation'
          ? { publicationGeneration: original.publicationGeneration + 1 }
          : {}),
        ...(fault === 'hash' ? { contentHash: 'b'.repeat(64) } : {}),
        ...(fault === 'range'
          ? { inspectedRange: { from: result.value.coverageStart, to: result.value.coverageStart } }
          : {}),
      }
      return calendarResolveResultSchema.parse({
        ...result,
        value: {
          ...result.value,
          ...(fault === 'version' ? { versionId: 'wrong' } : {}),
          result: { ...result.value.result, value: { ...result.value.result.value, basis } },
        },
      })
    }
    const rule = definition(daily('2026-04-01T00:00:00', '2026-04-03T23:59:59'), {
      binding: selected,
      calendarOverlay: { predicate: 'workingDay', adjust: 'skip' },
    })
    expect(
      await harness({ calendar: fixture.queries }).service.preview(context, input(rule)),
    ).toMatchObject({ kind: 'error', error: { code: 'provider_failure' } })
  },
)

test('missing publication/version and malformed directory fail explicitly', async () => {
  const fixture = calendarFixture()
  const get = fixture.queries.get
  fixture.queries.get = async (ctx, request) => {
    const result = await get(ctx, request)
    if (result.kind === 'error') return result
    return calendarGetResultSchema.parse({
      ...result,
      value: { ...result.value, publishedVersionId: null },
    })
  }
  expect(
    await harness({ calendar: fixture.queries }).service.preview(
      context,
      input(definition(undefined, { binding: selected })),
    ),
  ).toMatchObject({ kind: 'error', error: { code: 'unknown_calendar_version' } })
  expect(
    await harness({ calendar: calendarFixture().queries }).service.preview(
      context,
      input(
        definition(undefined, {
          binding: {
            ...selected,
            calendar: { calendarId: 'cn', version: { kind: 'pinned', versionId: 'absent' } },
          },
        }),
      ),
    ),
  ).toMatchObject({ kind: 'error', error: { code: 'unknown_calendar_version' } })
})

test('management resolution requires completeness and obtains only the external guard', async () => {
  const prepare = vi.fn(async () => ({
    kind: 'ok' as const,
    value: { guardRef: 'external:basis:3' },
  }))
  const { service } = harness({ basisGuards: { prepare } })
  const request = {
    context,
    definition: definition(),
    definitionRevision: 2,
    referenceExclusive: instant('2026-11-05T09:00:00.000Z'),
    activationExclusive: null,
    eligibleConsumed: 0,
    acceptedJobCount: 0,
  }
  expect(await service.definitions.resolve(request)).toMatchObject({
    kind: 'ok',
    value: { kind: 'resolved', complete: true, next: null, basisGuardRef: 'external:basis:3' },
  })
  expect(prepare).toHaveBeenCalledTimes(1)
  const limited = harness({
    basisGuards: { prepare },
    calculator: { enumerate: async () => ({ kind: 'unavailable', reason: 'deadline' }) },
  })
  expect(await limited.service.definitions.resolve(request)).toMatchObject({
    kind: 'unavailable',
    error: { code: 'search_limit', details: { reason: 'deadline_exceeded' } },
  })
  expect(prepare).toHaveBeenCalledTimes(1)
})

test('invalid counts and missing or excessive factory limits are rejected', async () => {
  const { service, dependencies } = harness()
  expect(await service.preview(context, input(definition(), { count: 101 }))).toMatchObject({
    kind: 'error',
    error: { code: 'invalid_input' },
  })
  for (const limits of [
    { ...dependencies.limits, maxCandidates: 100001 },
    { ...dependencies.limits, maxYears: 401 },
    { ...dependencies.limits, timeoutMs: 2147483648 },
    { ...dependencies.limits, maxCalendarCalls: 0 },
  ])
    expect(() => createSchedulePredictionService({ ...dependencies, limits })).toThrow(TypeError)
})

test('lookback cannot skip an original date outside Calendar coverage', async () => {
  const fixture = calendarFixture({ coverageStart: '2026-04-06', coverageEnd: '2026-12-31' })
  const { service } = harness({ calendar: fixture.queries })
  const rule = definition(daily('2026-04-04T00:00:00', '2026-04-08T23:59:59'), {
    binding: selected,
    calendarOverlay: { predicate: 'workingDay', adjust: 'nextWorkingDay' },
  })
  expect(
    await service.preview(
      context,
      input(rule, { after: instant('2026-04-06T00:00:00.000Z'), count: 1 }),
    ),
  ).toMatchObject({ kind: 'error', error: { code: 'coverage_insufficient' } })
})
