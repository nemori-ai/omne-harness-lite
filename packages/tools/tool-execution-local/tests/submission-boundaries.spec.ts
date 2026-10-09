import { expect, test, vi } from 'vitest'
import { LosslessNumber } from '@omne-harness-lite/content-blocks'
import { parseOpaqueIdentifier, parseTenantId, unwrap } from '@omne-harness-lite/identity-values'
import {
  captureToolJournalValue,
  prepareToolJournalEntry,
  projectToolJournal,
} from '@omne-harness-lite/tool-execution-runtime'
import { captureSubmission, submissionIdentity } from '../src/submission.ts'
import { access, ref, request, scope } from './execution-owner-fixture.ts'
import { admissionFixture } from './submission-boundaries-fixture.ts'

const originalCall = request.call
if (originalCall.unparseable === true) throw new Error('expected parsed original call')

test.each(['access', 'scope', 'origin', 'call'])(
  'submission rejects a %s accessor before business IO without invoking it',
  async field => {
    const f = await admissionFixture()
    const get = vi.fn(() => {
      throw new Error('caller getter')
    })
    const supplied = { ...request }
    Object.defineProperty(supplied, field, { enumerable: true, get })
    try {
      expect(await f.check(supplied)).toEqual({ kind: 'rejected', reason: 'invalidInput' })
      expect(get).not.toHaveBeenCalled()
      expect(f.authorize).not.toHaveBeenCalled()
      expect(f.read).not.toHaveBeenCalled()
    } finally {
      await f.close()
    }
  },
)

test('opaque access is retained without inspecting its prototype, keys or properties', () => {
  const trap = vi.fn((): never => {
    throw new Error('opaque access inspected')
  })
  const live = new Proxy(access, { getPrototypeOf: trap, ownKeys: trap, get: trap })
  const captured = captureSubmission({ ...request, access: live })
  if ('reason' in captured) throw new Error('valid ordinary submission rejected')
  expect(captured.access).toBe(live)
  expect(trap).not.toHaveBeenCalled()
})

test('all ordinary coordinates and arguments are captured before the first authorization await', async () => {
  const f = await admissionFixture()
  const supplied = {
    ...request,
    scope: { ...scope },
    origin: { ...request.origin },
    call: { ...originalCall, arguments: { value: 'captured' } },
  }
  const allowed = await f.authorize(request.access, scope, 'tool.submit')
  f.authorize.mockClear()
  const gate = Promise.withResolvers<typeof allowed>()
  f.authorize.mockImplementationOnce(() => gate.promise)
  try {
    const pending = f.check(supplied)
    supplied.scope.session = unwrap(parseOpaqueIdentifier('changed-session', 'SessionRef'))
    supplied.origin.run = 'changed-run'
    supplied.adoption = 'changed-adoption'
    supplied.call.arguments.value = 'changed-value'
    gate.resolve(allowed)
    const decision = await pending
    expect(decision.kind).toBe('admitted')
    if (decision.kind !== 'admitted') throw new Error('expected original admitted input')
    expect(decision.request.scope).toEqual(scope)
    expect(decision.request.origin).toEqual(request.origin)
    expect(decision.request.adoption).toBe(request.adoption)
    expect(decision.request.call).toEqual(request.call)
    expect(decision.request.access).toBe(access)
    expect(f.verifyToken.mock.calls[0]?.[3]).toEqual(request.call)
  } finally {
    gate.resolve(allowed)
    await f.close()
  }
})

test('foreign tenant rejection precedes object lookup or token verification', async () => {
  const f = await admissionFixture()
  try {
    const tenant = unwrap(parseTenantId({ organization: 'foreign', account: 'foreign-user' }))
    expect(await f.check({ ...request, scope: { ...scope, tenant } })).toEqual({
      kind: 'rejected',
      reason: 'notAuthorized',
    })
    expect(f.read).not.toHaveBeenCalled()
    expect(f.admission).not.toHaveBeenCalled()
    expect(f.verifyToken).not.toHaveBeenCalled()
  } finally {
    await f.close()
  }
})

test('origin, adoption and completed-batch failures retain their original competing rejection order', async () => {
  const f = await admissionFixture()
  try {
    f.replaceFacts({
      origin: { ...request.origin, run: 'another-run' },
      adoption: { ...f.view.facts!.adoption, key: 'another-adoption' },
      batch: { kind: 'pending' },
    })
    expect(await f.check(request)).toEqual({ kind: 'rejected', reason: 'originUnavailable' })
    f.replaceFacts({
      adoption: { ...f.view.facts!.adoption, key: 'another-adoption' },
      batch: { kind: 'pending' },
      runState: 'ended',
    })
    expect(await f.check(request)).toEqual({ kind: 'rejected', reason: 'adoptionUnavailable' })
    f.replaceFacts({ batch: { kind: 'pending' }, runState: 'ended' })
    expect(await f.check(request)).toEqual({ kind: 'rejected', reason: 'admissionMissing' })
    expect(f.admission).not.toHaveBeenCalled()
    expect(f.verifyToken).not.toHaveBeenCalled()
  } finally {
    await f.close()
  }
})

test('the same persisted execution remains recognizable after Run end, attempt change and tool withdrawal', async () => {
  const f = await admissionFixture()
  const value = captureToolJournalValue({
    revision: 1,
    kind: 'execution_intended',
    ref,
    origin: request.origin,
    input: { format: 'tool-input/1', submission: submissionIdentity(request) },
  })
  if ('invalid' in value) throw new Error('invalid original intent')
  const prepared = prepareToolJournalEntry({ origin: request.origin, value })
  if ('invalid' in prepared) throw new Error('invalid original entry')
  const row = { ...prepared.entry, session: scope.session, position: 1 }
  const projection = projectToolJournal(scope, [row])
  if ('invalid' in projection) throw new Error('invalid original projection')
  const history = f.view.facts!
  f.replaceView({
    ...f.view,
    prefix: { ...f.view.prefix, tail: 1, entries: [row] },
    executions: projection.executions,
    facts: {
      ...history,
      runState: 'ended',
      latestAttempt: 2,
      route: { kind: 'execution', intentKey: row.dedupeKey! },
      adoption: { ...history.adoption, tools: [] },
    },
  })
  f.withdraw()
  try {
    const decision = await f.check({
      ...request,
      origin: { ...request.origin, attempt: new LosslessNumber('1.0') },
    })
    expect(decision.kind).toBe('existing')
    if (decision.kind !== 'existing') throw new Error('expected original execution')
    expect(decision.view).toBe(f.view)
    expect(decision.execution).toBe(projection.executions.get(ref.callId))
    expect(f.authorize).toHaveBeenCalledTimes(2)
    expect(f.admission).not.toHaveBeenCalled()
    expect(f.verifyToken).not.toHaveBeenCalled()
    expect(
      await f.check({ ...request, call: { ...originalCall, arguments: { value: 'foreign' } } }),
    ).toEqual({
      kind: 'rejected',
      reason: 'callConflict',
    })
  } finally {
    await f.close()
  }
})

test('token rejection precedes current-provider withdrawal', async () => {
  const f = await admissionFixture()
  f.verifyToken.mockImplementationOnce(async () => {
    f.withdraw()
    return { kind: 'invalid', reason: 'run_ended' }
  })
  try {
    expect(await f.check(request)).toEqual({ kind: 'rejected', reason: 'runEnded' })
    expect(f.admission).toHaveBeenCalledOnce()
    expect(f.authorize).toHaveBeenCalledTimes(2)
  } finally {
    await f.close()
  }
})

test('a valid token cannot retain admission after the original provider is withdrawn', async () => {
  const f = await admissionFixture()
  f.verifyToken.mockImplementationOnce(async () => {
    f.withdraw()
    return { kind: 'valid', checked: f.view.prefix }
  })
  try {
    expect(await f.check(request)).toEqual({ kind: 'rejected', reason: 'admissionMissing' })
    expect(f.authorize).toHaveBeenCalledTimes(2)
    expect(f.admission).toHaveBeenCalledTimes(2)
    expect(f.verifyToken).toHaveBeenCalledOnce()
  } finally {
    await f.close()
  }
})

test.each(['tenant', 'session', 'generation'] as const)(
  'token checked against another %s cannot authorize the original prefix',
  async changed => {
    const f = await admissionFixture()
    f.verifyToken.mockImplementationOnce(async () => ({
      kind: 'valid',
      checked: {
        ...f.view.prefix,
        scope: {
          tenant:
            changed === 'tenant'
              ? unwrap(parseTenantId({ organization: 'foreign', account: 'foreign-user' }))
              : scope.tenant,
          session:
            changed === 'session'
              ? unwrap(parseOpaqueIdentifier('foreign-session', 'SessionRef'))
              : scope.session,
        },
        ownerGeneration:
          changed === 'generation' ? 'foreign-generation' : f.view.prefix.ownerGeneration,
      },
    }))
    try {
      expect(await f.check(request)).toEqual({ kind: 'rejected', reason: 'runtimeUnavailable' })
      expect(f.read).toHaveBeenCalledOnce()
      expect(f.authorize).toHaveBeenCalledTimes(2)
      expect(f.verifyToken).toHaveBeenCalledOnce()
    } finally {
      await f.close()
    }
  },
)

test('a tail conflict rechecks complete history and stops before verifying another token after Run end', async () => {
  const f = await admissionFixture()
  f.verifyToken.mockImplementationOnce(async () => {
    f.replaceFacts({ runState: 'ended' })
    return { kind: 'valid', checked: { ...f.view.prefix, tail: 1 } }
  })
  try {
    expect(await f.check(request)).toEqual({ kind: 'rejected', reason: 'runEnded' })
    expect(f.read).toHaveBeenCalledTimes(2)
    expect(f.authorize).toHaveBeenCalledTimes(3)
    expect(f.verifyToken).toHaveBeenCalledOnce()
  } finally {
    await f.close()
  }
})

test('tail mismatch exhausts the configured bound without accepting an older checked view', async () => {
  const f = await admissionFixture()
  f.verifyToken.mockImplementation(async () => ({
    kind: 'valid',
    checked: { ...f.view.prefix, tail: 1 },
  }))
  try {
    expect(await f.check(request)).toEqual({ kind: 'rejected', reason: 'runtimeUnavailable' })
    expect(f.read).toHaveBeenCalledTimes(2)
    expect(f.authorize).toHaveBeenCalledTimes(4)
    expect(f.verifyToken).toHaveBeenCalledTimes(2)
  } finally {
    await f.close()
  }
})

test('only the completed notExecutable route bypasses an unavailable token provider', async () => {
  const f = await admissionFixture()
  const facts = f.view.facts
  if (facts === undefined || facts.batch.kind !== 'complete')
    throw new Error('missing complete batch')
  f.replaceFacts({
    batch: {
      kind: 'complete',
      completion: {
        ...facts.batch.completion,
        items: [
          {
            ...facts.batch.completion.items[0],
            decision: { kind: 'notExecutable', reason: 'no_such_entry' },
          },
        ],
      },
    },
  })
  f.withdraw()
  const { admissionToken: _token, ...withoutToken } = request
  try {
    expect(await f.check(withoutToken)).toMatchObject({
      kind: 'admitted',
      notExecutable: 'no_such_entry',
    })
    expect(f.authorize).toHaveBeenCalledTimes(2)
    expect(f.admission).not.toHaveBeenCalled()
    expect(f.verifyToken).not.toHaveBeenCalled()
    f.replaceFacts({ batch: { kind: 'pending' } })
    expect(await f.check(withoutToken)).toEqual({ kind: 'rejected', reason: 'admissionMissing' })
  } finally {
    await f.close()
  }
})

test('post-verification revocation precedes token rejection and never admits against an older authorization', async () => {
  const f = await admissionFixture()
  f.verifyToken.mockImplementationOnce(async () => {
    f.authorize.mockResolvedValue({ kind: 'rejected', reason: 'notAuthorized' })
    return { kind: 'invalid', reason: 'run_ended' }
  })
  try {
    expect(await f.check(request)).toEqual({ kind: 'rejected', reason: 'notAuthorized' })
    expect(f.admission).toHaveBeenCalledOnce()
  } finally {
    await f.close()
  }
})

test.each([false, true])(
  'a throwing token port preserves availability versus stopped-owner classification: %s',
  async stopped => {
    const f = await admissionFixture()
    f.verifyToken.mockImplementationOnce(async () => {
      if (stopped) f.stop()
      throw new Error('original token IO failure')
    })
    try {
      expect(await f.check(request)).toEqual({
        kind: 'rejected',
        reason: stopped ? 'ownerStopped' : 'runtimeUnavailable',
      })
      expect(f.authorize).toHaveBeenCalledOnce()
      expect(f.admission).toHaveBeenCalledOnce()
    } finally {
      await f.close()
    }
  },
)
