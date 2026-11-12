import { describe, expect, it, vi } from 'vitest'
import {
  ScheduleCommandSchema,
  ScheduleNotCommittedProofsSchema,
  type ScheduleOperationLocator,
} from '@omne-harness/schedule-contract'
import { createScheduleManagementIdentity } from '@omne-harness/schedule'
import { context, createInput, command, record, scope, now, observation } from './fixtures.ts'
import { error, protocolFixture } from './application-fixture.ts'

function createRequest() {
  const request = createInput().request
  if (request.kind !== 'create') throw new Error('fixture')
  return request.input
}
function identityLocator(request = createInput().request): ScheduleOperationLocator {
  const identity = createScheduleManagementIdentity(scope, request)
  return { kind: 'identity', identity: identity.address, expectedFingerprint: identity.fingerprint }
}

it('recovers before allocating ID, reading current CAS or resolving dependencies', async () => {
  const fixture = protocolFixture()
  const request = createRequest()
  const first = await fixture.commands.create(context, request)
  expect(first).toMatchObject({ kind: 'committed', replayed: false })
  expect(fixture.calls).toEqual([
    'recover-authority',
    'query',
    'authority',
    'now',
    'definition',
    'id',
    'quota',
    'commit',
  ])
  fixture.calls.length = 0
  vi.mocked(fixture.dependency.clock.now).mockImplementation(() => {
    throw new Error('clock unavailable')
  })
  const replayed = await fixture.commands.create(
    { ...context, requestId: 'new transport request' },
    request,
  )
  expect(replayed).toEqual({ ...first, replayed: true })
  expect(fixture.calls).toEqual(['recover-authority', 'query'])
  expect(fixture.dependency.persistence.commit).toHaveBeenCalledTimes(1)
})

it('returns original pause result after a later text edit changes current CAS', async () => {
  const fixture = protocolFixture(record())
  const pause = command('pause')
  const first = await fixture.commands.execute(context, pause)
  expect(first.kind).toBe('committed')
  const update = ScheduleCommandSchema.parse({
    ...command('update'),
    meta: { ...command('update').meta, expectedRevision: 5 },
  })
  expect(await fixture.commands.execute(context, update)).toMatchObject({
    kind: 'committed',
    value: { revision: 6 },
  })
  fixture.calls.length = 0
  expect(await fixture.commands.execute(context, pause)).toEqual({ ...first, replayed: true })
  expect(fixture.calls).toEqual(['recover-authority', 'query'])
})

it('recovers a lost first response by identity and refuses different content at the same address', async () => {
  const fixture = protocolFixture()
  const first = await fixture.commands.create(context, createRequest())
  const query = await fixture.commands.queryOperation(context, identityLocator())
  expect(query).toMatchObject({
    kind: 'ok',
    value: { kind: 'committed', result: first.kind === 'committed' ? first.value : null },
  })
  const changed = {
    ...createRequest(),
    definition: { ...createRequest().definition, label: 'Different intent' },
  }
  expect(await fixture.commands.create(context, changed)).toMatchObject({
    kind: 'rejected',
    error: { code: 'operation_key_conflict' },
  })
  expect(fixture.dependency.persistence.commit).toHaveBeenCalledTimes(1)
})

describe('unknown preserves the original address', () => {
  it.each(['absent', 'changed', 'pending', 'unknown', 'throw'] as const)(
    'does not commit after %s recovery',
    async kind => {
      const fixture = protocolFixture()
      const operation = createScheduleManagementIdentity(scope, createInput().request)
      vi.mocked(fixture.dependency.persistence.query).mockImplementation(async () => {
        if (kind === 'throw') throw new Error('lost read')
        if (kind === 'absent' || kind === 'changed') return { kind }
        return {
          kind: 'ok',
          value: {
            kind,
            operationRef: operation.operationRef,
            observedAt: now,
            result: null,
            error: null,
            notCommittedProofs: null,
          },
        }
      })
      expect(await fixture.commands.create(context, createRequest())).toMatchObject({
        kind: 'unknown',
        operationRef: operation.operationRef,
      })
      expect(fixture.dependency.persistence.commit).not.toHaveBeenCalled()
      expect(fixture.dependency.ids.schedule).not.toHaveBeenCalled()
      expect(fixture.dependency.clock.now).not.toHaveBeenCalled()
      expect(fixture.dependency.definitions.resolve).not.toHaveBeenCalled()
    },
  )
  it('does not infer a negative receipt from a missing ref index', async () => {
    const fixture = protocolFixture()
    vi.mocked(fixture.dependency.persistence.query).mockResolvedValue({ kind: 'absent' })
    const operationRef = createScheduleManagementIdentity(scope, createInput().request).operationRef
    expect(
      await fixture.commands.queryOperation(context, { kind: 'ref', operationRef }),
    ).toMatchObject({
      kind: 'ok',
      value: { kind: 'unknown', operationRef, notCommittedProofs: null },
    })
  })
  it.each(Object.keys(ScheduleNotCommittedProofsSchema.shape))(
    'requires negative proof %s',
    async missing => {
      const fixture = protocolFixture()
      const original = fixture.dependency.persistence.query
      vi.mocked(original).mockImplementationOnce(async () => {
        const operationRef = createScheduleManagementIdentity(
          scope,
          createInput().request,
        ).operationRef
        const proofs = {
          writerGenerationExcluded: true,
          oldTransactionTerminated: true,
          databaseRecoveryFinished: true,
          authoritativeReadSucceeded: true,
          operationNotQueued: true,
        }
        Reflect.deleteProperty(proofs, missing)
        // Fault injection models an invalid adapter response crossing the port.
        return JSON.parse(
          JSON.stringify({
            kind: 'ok',
            value: {
              kind: 'notCommitted',
              operationRef,
              observedAt: now,
              result: null,
              error: null,
              notCommittedProofs: proofs,
            },
          }),
        )
      })
      expect(await fixture.commands.create(context, createRequest())).toMatchObject({
        kind: 'unknown',
      })
      expect(fixture.dependency.persistence.commit).not.toHaveBeenCalled()
    },
  )
  it('preserves commit ambiguity and provider retry timing', async () => {
    const fixture = protocolFixture()
    vi.mocked(fixture.dependency.persistence.commit).mockRejectedValueOnce(new Error('commit lost'))
    const operationRef = createScheduleManagementIdentity(scope, createInput().request).operationRef
    expect(await fixture.commands.create(context, createRequest())).toMatchObject({
      kind: 'unknown',
      operationRef,
    })
    vi.mocked(fixture.dependency.persistence.commit).mockResolvedValue({
      kind: 'unknown',
      operationRef,
      retryAfterMs: 42,
    })
    expect(await fixture.commands.create(context, createRequest())).toEqual({
      kind: 'unknown',
      operationRef,
      retryAfterMs: 42,
    })
  })
})

it('checks recovery permission even for already committed operations', async () => {
  const fixture = protocolFixture()
  await fixture.commands.create(context, createRequest())
  vi.mocked(fixture.dependency.authorizer.authorizeRecovery).mockResolvedValue({
    kind: 'unavailable',
    error: error('forbidden'),
  })
  expect(await fixture.commands.create(context, createRequest())).toMatchObject({
    kind: 'rejected',
    error: { code: 'forbidden' },
  })
  expect(await fixture.commands.queryOperation(context, identityLocator())).toMatchObject({
    kind: 'error',
    error: { code: 'forbidden' },
  })
  expect(fixture.dependency.persistence.query).toHaveBeenCalledTimes(1)
})

it('rejects forged context and cross-owner records before exposing them to decisions', async () => {
  const fixture = protocolFixture(record())
  vi.mocked(fixture.dependency.authorizer.authorizeRecovery).mockResolvedValueOnce({
    kind: 'ok',
    value: { ...scope, principalRef: 'different' },
  })
  expect(await fixture.commands.execute(context, command('pause'))).toMatchObject({
    kind: 'rejected',
    error: { code: 'forbidden' },
  })
  const other = record()
  vi.mocked(fixture.dependency.store.readSchedule).mockResolvedValue({
    kind: 'ok',
    value: {
      observationRevision: 'other',
      value: {
        ...other,
        view: { ...other.view, owner: { kind: 'tenant', tenantId: 'other', ownerId: 'other' } },
      },
    },
  })
  expect(await fixture.commands.execute(context, command('pause'))).toMatchObject({
    kind: 'rejected',
    error: { code: 'not_found' },
  })
  expect(fixture.dependency.authorizer.authorize).not.toHaveBeenCalled()
  expect(fixture.dependency.persistence.commit).not.toHaveBeenCalled()
})

it.each(['pause', 'resume', 'stop', 'discard'] as const)(
  '%s works without a definition resolver',
  async action => {
    const fixture = protocolFixture(record(action === 'discard' ? 'draft' : 'active'))
    vi.mocked(fixture.dependency.definitions.resolve).mockRejectedValue(
      new Error('definition provider removed'),
    )
    const result = await fixture.commands.execute(context, command(action))
    expect(result.kind).toBe(action === 'resume' ? 'noChange' : 'committed')
    expect(fixture.dependency.definitions.resolve).not.toHaveBeenCalled()
  },
)

it.each([
  'search_limit',
  'coverage_insufficient',
  'missing_environment',
  'consent_required',
] as const)('preserves %s as a definite rejection with zero commits', async code => {
  const fixture = protocolFixture(record('draft'))
  vi.mocked(fixture.dependency.definitions.resolve).mockResolvedValue({
    kind: 'unavailable',
    error: error(code),
  })
  expect(await fixture.commands.execute(context, command('promote'))).toMatchObject({
    kind: 'rejected',
    error: { code },
  })
  expect(fixture.dependency.persistence.commit).not.toHaveBeenCalled()
})

it('rejects terminal resume before resolving any definition, ID or quota', async () => {
  const fixture = protocolFixture(record('stopped'))
  expect(await fixture.commands.execute(context, command('resume'))).toMatchObject({
    kind: 'rejected',
    error: { code: 'invalid_transition' },
  })
  expect(fixture.dependency.definitions.resolve).not.toHaveBeenCalled()
  expect(fixture.dependency.quota.inspect).not.toHaveBeenCalled()
  expect(fixture.dependency.persistence.commit).not.toHaveBeenCalled()
})

it('rejects promote without future with zero commit and no state change', async () => {
  const fixture = protocolFixture(record('draft'))
  vi.mocked(fixture.dependency.definitions.resolve).mockResolvedValue({
    kind: 'ok',
    value: { ...observation(record().view.definition, 2), next: null },
  })
  expect(await fixture.commands.execute(context, command('promote'))).toMatchObject({
    kind: 'rejected',
    error: { code: 'no_future_slot' },
  })
  expect(fixture.current()?.view.control).toBe('draft')
  expect(fixture.dependency.persistence.commit).not.toHaveBeenCalled()
})
