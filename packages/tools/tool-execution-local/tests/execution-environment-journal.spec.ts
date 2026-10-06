import { expect, test, vi } from 'vitest'
import { instantFromRfc3339, type Clock } from '@omne-harness-lite/offer-expiry'
import { unwrap, parseOpaqueIdentifier, parseTenantId } from '@omne-harness-lite/identity-values'
import { createExecutionEnvironment } from '../src/execution-environment.ts'
import { at, scope, ref, request, access, fixture, deferred } from './execution-owner-fixture.ts'
import { environmentDefinition, environmentPorts } from './execution-environment-fixture.ts'

async function journalFixture(started = true) {
  const ports = environmentPorts(),
    f = await fixture(undefined, undefined, environmentDefinition)
  const selected = {
    capability: 'tool:echo',
    asset: 'echo-asset',
    version: '1',
    adoption: 'adopted',
    definition: environmentDefinition,
  }
  const initial = await f.journal.read(scope, ref.callId)
  if (initial.kind !== 'view') throw new Error('Original journal unavailable')
  const seeded = await f.journal.commit({
    ref,
    origin: request.origin,
    expected: initial.prefix,
    values: [
      {
        kind: 'execution_intended',
        revision: 1,
        ref,
        origin: request.origin,
        selected,
        input: { value: 'captured' },
      },
      ...(started ? [{ kind: 'execution_started' as const, revision: 1 as const, ref, at }] : []),
    ],
  })
  if (seeded.kind !== 'view') throw new Error(`Original journal seed rejected: ${seeded.reason}`)
  const closed = new AbortController(),
    retry = vi.fn(async () => {}),
    invalidate = vi.fn(),
    now = vi.fn<Clock['now']>(() => unwrap(instantFromRfc3339(at)))
  const journal = { ...f.journal, read: vi.fn(f.journal.read), commit: vi.fn(f.journal.commit) }
  const environment = createExecutionEnvironment({
    ref,
    origin: request.origin,
    selected,
    access,
    journal,
    environments: ports.operations,
    closed: closed.signal,
    clock: { now },
    attempts: 3,
    retry,
    invalidate,
  })
  return {
    ...f,
    ports,
    closed,
    retry,
    invalidate,
    now,
    environment,
    controlledJournal: journal,
    async cleanup() {
      await environment.release()
      await f.close()
    },
  }
}

async function history(f: Awaited<ReturnType<typeof journalFixture>>) {
  const read = await f.journal.read(scope, ref.callId)
  if (read.kind !== 'view') throw new Error('Original journal unreadable')
  return read.executions.get(ref.callId)!
}
const resource = {
  key: 'original-process',
  provider: 'controlled',
  reference: { invocation: 'original' },
}

test('closure before preparation does not read placement or acquire a lease', async () => {
  const f = await journalFixture()
  try {
    f.closed.abort()
    expect(await f.environment.prepare()).toEqual({
      kind: 'rejected',
      reason: 'environment:closed',
    })
    expect(f.ports.resolvePlacement).not.toHaveBeenCalled()
    expect(f.ports.acquire).not.toHaveBeenCalled()
  } finally {
    await f.cleanup()
  }
})

test.each(['notApplicable', 'rejected', 'throws'] as const)(
  'placement %s cannot produce an acquired environment',
  async result => {
    const f = await journalFixture()
    if (result === 'throws')
      f.ports.resolvePlacement.mockRejectedValueOnce(new Error('Original placement IO lost'))
    else
      f.ports.resolvePlacement.mockResolvedValueOnce(
        result === 'notApplicable'
          ? { kind: 'notApplicable' }
          : { kind: 'rejected', reason: 'notAuthorized' },
      )
    try {
      expect(await f.environment.prepare()).toEqual({
        kind: 'rejected',
        reason:
          result === 'throws'
            ? 'environment:unavailable'
            : result === 'notApplicable'
              ? 'environment:notApplicable'
              : 'environment:notAuthorized',
      })
      expect(f.ports.acquire).not.toHaveBeenCalled()
      expect((await history(f)).environment).toBeUndefined()
    } finally {
      await f.cleanup()
    }
  },
)

test.each(['scope', 'execution', 'tool', 'description', 'requirement'] as const)(
  'a returned lease with different %s cannot become the original adopted environment',
  async field => {
    const f = await journalFixture()
    const original = f.ports.acquired
    const placement = { ...original.adoption.placement }
    const adoption = { ...original.adoption, placement }
    if (field === 'scope')
      placement.scope = {
        ...scope,
        tenant: unwrap(parseTenantId({ organization: 'owner-org', account: 'other' })),
      }
    if (field === 'execution')
      placement.execution = unwrap(parseOpaqueIdentifier('other-call', 'CallId'))
    if (field === 'tool') placement.tool = { ...placement.tool, definition: 'different' }
    if (field === 'description')
      adoption.description = {
        ...adoption.description,
        instance: { id: 'other', generation: 'one' },
      }
    if (field === 'requirement')
      placement.requirement = { bindingLayer: 'session_sandbox', facilities: ['command'] }
    f.ports.acquire.mockResolvedValueOnce({ ...original, adoption })
    try {
      expect(await f.environment.prepare()).toEqual({
        kind: 'rejected',
        reason: 'environment:missingFacility',
      })
      expect((await history(f)).environment).toBeUndefined()
      expect(await f.environment.release()).toBe('released')
      expect(f.ports.release).toHaveBeenCalledOnce()
    } finally {
      await f.cleanup()
    }
  },
)

test.each(['written', 'notWritten'] as const)(
  'unknown adoption receipt %s retains the original lease and recognizes only original facts',
  async state => {
    const f = await journalFixture()
    f.controlledJournal.commit.mockImplementationOnce(async input => {
      if (state === 'written') await f.journal.commit(input)
      return { kind: 'rejected', reason: 'unavailable' }
    })
    try {
      expect(await f.environment.prepare()).toEqual({ kind: 'retained' })
      expect(Boolean((await history(f)).environment)).toBe(state === 'written')
      expect(f.ports.acquire).toHaveBeenCalledOnce()
      expect(f.ports.release).not.toHaveBeenCalled()
      expect(await f.environment.prepare()).toHaveProperty('kind', 'ready')
      expect(f.ports.acquire).toHaveBeenCalledOnce()
      expect((await history(f)).environment?.value.adoption).toEqual(f.ports.acquired.adoption)
    } finally {
      await f.cleanup()
    }
  },
)

test('adoption retries a real changed tail with the same lease and current prefix', async () => {
  const f = await journalFixture()
  f.controlledJournal.commit.mockImplementationOnce(async input => {
    await f.marker('concurrent-original-marker')
    return f.journal.commit(input)
  })
  try {
    expect(await f.environment.prepare()).toHaveProperty('kind', 'ready')
    expect(f.retry).toHaveBeenCalledExactlyOnceWith(0)
    expect(f.ports.acquire).toHaveBeenCalledOnce()
    expect(f.controlledJournal.commit).toHaveBeenCalledTimes(2)
    expect((await history(f)).environment?.value.adoption).toEqual(f.ports.acquired.adoption)
  } finally {
    await f.cleanup()
  }
})

test.each(['unreadable', 'retryExhausted', 'notStarted'] as const)(
  'adoption %s never reports usable facilities',
  async state => {
    const f = await journalFixture(state !== 'notStarted')
    if (state === 'unreadable')
      f.controlledJournal.read.mockResolvedValue({ kind: 'rejected', reason: 'unavailable' })
    if (state === 'retryExhausted')
      f.controlledJournal.commit.mockImplementation(async () => ({
        kind: 'rejected',
        reason: f.controlledJournal.commit.mock.calls.length <= 3 ? 'tailChanged' : 'unavailable',
      }))
    try {
      expect(await f.environment.prepare()).toEqual(
        state === 'notStarted'
          ? { kind: 'rejected', reason: 'environment:closed' }
          : { kind: 'retained' },
      )
      expect((await history(f)).environment).toBeUndefined()
      expect(f.ports.acquire).toHaveBeenCalledOnce()
      if (state === 'retryExhausted') {
        expect(f.controlledJournal.commit).toHaveBeenCalledTimes(3)
        expect(f.retry.mock.calls).toEqual([[0], [1], [2]])
      }
    } finally {
      await f.cleanup()
    }
  },
)

test.each(['read', 'commit'] as const)(
  'closure during adoption %s never returns ready',
  async boundary => {
    const f = await journalFixture(),
      entered = deferred<void>(),
      resume = deferred<void>()
    if (boundary === 'read')
      f.controlledJournal.read.mockImplementationOnce(async (...args) => {
        const value = await f.journal.read(...args)
        entered.resolve()
        await resume.promise
        return value
      })
    else
      f.controlledJournal.commit.mockImplementationOnce(async input => {
        const value = await f.journal.commit(input)
        entered.resolve()
        await resume.promise
        return value
      })
    try {
      const pending = f.environment.prepare()
      await entered.promise
      f.closed.abort()
      resume.resolve()
      expect(await pending).toEqual({ kind: 'rejected', reason: 'environment:closed' })
      expect(Boolean((await history(f)).environment)).toBe(boundary === 'commit')
      expect(f.ports.acquire).toHaveBeenCalledOnce()
    } finally {
      resume.resolve()
      await f.cleanup()
    }
  },
)

test('adoption with different original evidence conflicts instead of being replaced', async () => {
  const f = await journalFixture()
  try {
    const view = await f.journal.read(scope, ref.callId)
    if (view.kind !== 'view') throw new Error('Original prefix unavailable')
    expect(
      await f.journal.commit({
        ref,
        origin: request.origin,
        expected: view.prefix,
        values: [
          {
            kind: 'execution_environment_adopted',
            revision: 1,
            ref,
            adoption: { ...f.ports.acquired.adoption, providerEvidence: { original: 'different' } },
          },
        ],
      }),
    ).toHaveProperty('kind', 'view')
    expect(await f.environment.prepare()).toEqual({
      kind: 'rejected',
      reason: 'environment:adoptionConflict',
    })
    expect((await history(f)).environment?.value.adoption.providerEvidence).toEqual({
      original: 'different',
    })
  } finally {
    await f.cleanup()
  }
})

test.each(['planned', 'permitted', 'stopped'] as const)(
  'an unknown %s receipt grants no success until the original physical fact is recognized',
  async operation => {
    const f = await journalFixture()
    try {
      expect(await f.environment.prepare()).toHaveProperty('kind', 'ready')
      const resources = f.ports.resources()!
      if (operation !== 'planned') expect(await resources.plan(resource)).toBe('recorded')
      if (operation === 'stopped') expect(await resources.permit(resource.key)).toBe('confirmed')
      f.controlledJournal.commit.mockImplementationOnce(async input => {
        await f.journal.commit(input)
        return { kind: 'rejected', reason: 'unavailable' }
      })
      const apply = () =>
        operation === 'planned'
          ? resources.plan(resource)
          : operation === 'permitted'
            ? resources.permit(resource.key)
            : resources.stopped(resource.key, 'confirmed')
      expect(await apply()).toBe('unavailable')
      expect((await history(f)).resources.get(resource.key)).toBeDefined()
      expect(await apply()).toBe(operation === 'permitted' ? 'confirmed' : 'recorded')
      expect(f.ports.acquire).toHaveBeenCalledOnce()
    } finally {
      await f.cleanup()
    }
  },
)

test('resource retry re-reads a real changed tail; same key different data conflicts', async () => {
  const f = await journalFixture()
  try {
    await f.environment.prepare()
    f.controlledJournal.commit.mockImplementationOnce(async input => {
      await f.marker('resource-concurrent-marker')
      return f.journal.commit(input)
    })
    const resources = f.ports.resources()!
    expect(await resources.plan(resource)).toBe('recorded')
    expect(f.retry).toHaveBeenCalledExactlyOnceWith(0)
    expect(await resources.plan(resource)).toBe('recorded')
    expect(await resources.plan({ ...resource, reference: { invocation: 'other' } })).toBe(
      'conflict',
    )
    expect(await resources.permit('not-planned')).toBe('unavailable')
    expect(await resources.stopped('not-planned', 'confirmed')).toBe('unavailable')
    expect((await history(f)).resources.get(resource.key)?.planned.value.resource).toEqual(resource)
  } finally {
    await f.cleanup()
  }
})

test.each(['unreadable', 'retryExhausted'] as const)(
  'resource %s returns unavailable and leaves no fabricated plan',
  async state => {
    const f = await journalFixture()
    try {
      await f.environment.prepare()
      f.controlledJournal.commit.mockClear()
      if (state === 'unreadable')
        f.controlledJournal.read.mockResolvedValue({ kind: 'rejected', reason: 'unavailable' })
      else
        f.controlledJournal.commit.mockImplementation(async () => ({
          kind: 'rejected',
          reason: f.controlledJournal.commit.mock.calls.length <= 3 ? 'tailChanged' : 'unavailable',
        }))
      expect(await f.ports.resources()!.plan(resource)).toBe('unavailable')
      expect((await history(f)).resources.has(resource.key)).toBe(false)
      if (state === 'retryExhausted') {
        expect(f.controlledJournal.commit).toHaveBeenCalledTimes(3)
        expect(f.retry.mock.calls).toEqual([[0], [1], [2]])
      }
    } finally {
      await f.cleanup()
    }
  },
)

test('closure after physical permit append preserves the fact but returns closed and permits cleanup', async () => {
  const f = await journalFixture(),
    entered = deferred<void>(),
    resume = deferred<void>()
  try {
    await f.environment.prepare()
    const resources = f.ports.resources()!
    expect(await resources.plan(resource)).toBe('recorded')
    f.controlledJournal.commit.mockImplementationOnce(async input => {
      const value = await f.journal.commit(input)
      entered.resolve()
      await resume.promise
      return value
    })
    const pending = resources.permit(resource.key)
    await entered.promise
    f.closed.abort()
    resume.resolve()
    expect(await pending).toBe('closed')
    expect((await history(f)).resources.get(resource.key)?.permitted).toBeDefined()
    expect(await resources.plan({ ...resource, key: 'new' })).toBe('closed')
    expect(await resources.permit(resource.key)).toBe('closed')
    expect(await resources.stopped(resource.key, 'confirmed')).toBe('recorded')
    expect((await history(f)).resources.get(resource.key)?.observations).toHaveLength(1)
  } finally {
    resume.resolve()
    await f.cleanup()
  }
})

test('closure while a resource prefix is read rejects the plan before physical append', async () => {
  const f = await journalFixture(),
    entered = deferred<void>(),
    resume = deferred<void>()
  try {
    await f.environment.prepare()
    f.controlledJournal.read.mockImplementationOnce(async (...args) => {
      const view = await f.journal.read(...args)
      entered.resolve()
      await resume.promise
      return view
    })
    const pending = f.ports.resources()!.plan(resource)
    await entered.promise
    f.closed.abort()
    resume.resolve()
    expect(await pending).toBe('closed')
    expect((await history(f)).resources.has(resource.key)).toBe(false)
  } finally {
    resume.resolve()
    await f.cleanup()
  }
})

test('closure during placement read rejects before acquiring any physical lease', async () => {
  const f = await journalFixture(),
    entered = deferred<void>(),
    resume = deferred<void>()
  f.ports.resolvePlacement.mockImplementationOnce(async () => {
    entered.resolve()
    await resume.promise
    return { kind: 'placement', placement: f.ports.placement }
  })
  try {
    const pending = f.environment.prepare()
    await entered.promise
    f.closed.abort()
    resume.resolve()
    expect(await pending).toEqual({ kind: 'rejected', reason: 'environment:closed' })
    expect(f.ports.acquire).not.toHaveBeenCalled()
    expect((await history(f)).environment).toBeUndefined()
  } finally {
    resume.resolve()
    await f.cleanup()
  }
})

test('provider acquisition rejection cannot fabricate an adoption or release a lease', async () => {
  const f = await journalFixture()
  f.ports.acquire.mockResolvedValueOnce({ kind: 'rejected', reason: 'notAuthorized' })
  try {
    expect(await f.environment.prepare()).toEqual({
      kind: 'rejected',
      reason: 'environment:notAuthorized',
    })
    expect((await history(f)).environment).toBeUndefined()
    expect(await f.environment.release()).toBe('released')
    expect(f.ports.release).not.toHaveBeenCalled()
  } finally {
    await f.cleanup()
  }
})

test('original lease invalidation forwards the reason without acquiring a successor', async () => {
  const f = await journalFixture()
  try {
    await f.environment.prepare()
    f.ports.invalidated.resolve({ reason: 'original-provider-withdrawn' })
    await f.ports.invalidated.promise
    expect(f.invalidate).toHaveBeenCalledExactlyOnceWith('original-provider-withdrawn')
    expect(f.ports.acquire).toHaveBeenCalledOnce()
  } finally {
    await f.cleanup()
  }
})

test('failed original release stays pending; confirmation blocks later prepare and repeat release', async () => {
  const f = await journalFixture()
  try {
    await f.environment.prepare()
    f.ports.release.mockRejectedValueOnce(new Error('Original cleanup IO lost'))
    expect(await f.environment.release()).toBe('pending')
    expect(await f.environment.release()).toBe('released')
    expect(await f.environment.release()).toBe('released')
    expect(await f.environment.prepare()).toEqual({
      kind: 'rejected',
      reason: 'environment:closed',
    })
    expect(f.ports.release).toHaveBeenCalledTimes(2)
    expect(f.ports.acquire).toHaveBeenCalledOnce()
  } finally {
    await f.cleanup()
  }
})

test('unavailable stop timestamp does not append a physical observation', async () => {
  const f = await journalFixture()
  try {
    await f.environment.prepare()
    const resources = f.ports.resources()!
    await resources.plan(resource)
    f.now.mockReturnValueOnce('unavailable')
    expect(await resources.stopped(resource.key, 'confirmed')).toBe('unavailable')
    expect((await history(f)).resources.get(resource.key)?.observations).toHaveLength(0)
  } finally {
    await f.cleanup()
  }
})

test('malformed resource identity is rejected before any durable append', async () => {
  const f = await journalFixture()
  try {
    await f.environment.prepare()
    const resources = f.ports.resources()!
    const before = f.controlledJournal.commit.mock.calls.length
    expect(await resources.plan({ ...resource, key: '' })).toBe('conflict')
    expect(await resources.permit('')).toBe('unavailable')
    expect(f.controlledJournal.commit).toHaveBeenCalledTimes(before)
    expect((await history(f)).resources.size).toBe(0)
  } finally {
    await f.cleanup()
  }
})

test('resource callback before execution starts cannot grant plan or permit', async () => {
  const f = await journalFixture(false)
  try {
    expect(await f.environment.prepare()).toEqual({
      kind: 'rejected',
      reason: 'environment:closed',
    })
    const resources = f.ports.resources()!
    expect(await resources.plan(resource)).toBe('unavailable')
    expect(await resources.permit(resource.key)).toBe('unavailable')
    expect((await history(f)).resources.size).toBe(0)
  } finally {
    await f.cleanup()
  }
})

test('an unconfirmed adoption cannot grant permission for an original planned resource', async () => {
  const f = await journalFixture()
  f.controlledJournal.commit.mockResolvedValueOnce({ kind: 'rejected', reason: 'unavailable' })
  try {
    expect(await f.environment.prepare()).toEqual({ kind: 'retained' })
    const resources = f.ports.resources()!
    expect(await resources.plan(resource)).toBe('recorded')
    expect(await resources.permit(resource.key)).toBe('unavailable')
    expect((await history(f)).resources.get(resource.key)?.permitted).toBeUndefined()
    expect((await history(f)).environment).toBeUndefined()
  } finally {
    await f.cleanup()
  }
})
