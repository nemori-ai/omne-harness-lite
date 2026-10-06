import { expect, test, vi } from 'vitest'
import type { SessionLogOwnerOperations } from '@omne-harness-lite/session-log'
import type { AccessIdentity } from '@omne-harness-lite/session-tenancy'
import type { AuthorizationContext } from '@omne-harness-lite/tool-admission'
import { createSessionAccessOwner } from '../src/session-access.ts'
import { readToolActionSource } from '../src/tool-action-source.ts'
import { historyFixture, origin, scope, toolCall, at } from './tool-driver-history-fixture.ts'

async function fixture(calls = [toolCall()]) {
  const f = await historyFixture(calls)
  let authorized = true
  const authorization = createSessionAccessOwner({
    async check(identity) {
      return authorized
        ? { kind: 'authorized', identity }
        : { kind: 'rejected', reason: 'notAuthorized' }
    },
  })
  const identity: AccessIdentity = {
    scope,
    binding: 'driver',
    principal: 'history-user',
    principalKind: 'human',
    consumer: 'coordinator',
    contextKeys: [],
  }
  const issued = await authorization
    .issuerFor(identity)
    .issue({ ...identity, operations: ['run.advance', 'session.log.coordinate'] })
  if (issued.kind !== 'issued') throw new Error('access fixture')
  const readPrefix = vi.fn<SessionLogOwnerOperations['readPrefix']>(async () => ({
    kind: 'prefix',
    prefix: await f.prefix(),
  }))
  const owner: SessionLogOwnerOperations = {
    readPrefix,
    async borrow() {
      return { kind: 'rejected', reason: 'unavailable' }
    },
    async enumerate() {
      return { kind: 'rejected', reason: 'notAuthorized' }
    },
  }
  const authority = {
    scope,
    access: issued.access,
    coordinator: issued.access,
    policy: {
      grants: Object.freeze({}) as AuthorizationContext,
      runMode: 'auto_permission' as const,
    },
  }
  const read = (selected = origin) =>
    readToolActionSource({
      owner,
      authority,
      authorization: authorization.operations,
      origin: selected,
    })
  return {
    f,
    authority,
    read,
    readPrefix,
    revoke() {
      authorized = false
    },
    async close() {
      authorization.stop()
      await f.close()
    },
  }
}

test('derives the complete batch and stable anchors from actual JSONL provenance, retaining opaque authority', async () => {
  const f = await fixture([toolCall('a'), toolCall('b', true)])
  try {
    const first = await f.read()
    if ('failure' in first) throw new Error(first.failure)
    expect(first.source.calls.map(call => call.callId)).toEqual(['a', 'b'])
    expect(first.request.actions.map(item => item.call.callId)).toEqual(['a'])
    expect(first.request.actions[0]?.batch).toEqual(['a', 'b'])
    expect(first.source.grants).toBe(f.authority.policy.grants)
    expect(first.source.access).toBe(f.authority.access)
    expect(first.source.report).toEqual(first.request.admission.report)
    await f.f.reopen()
    expect(await f.read()).toEqual(first)
    expect(await f.read({ ...origin, assistantMessage: 'fabricated' })).toEqual({
      failure: 'unavailable',
    })
  } finally {
    await f.close()
  }
})
test('allows empty dispatch actions only for an actual nonempty fully unparseable batch', async () => {
  const f = await fixture([toolCall('bad', true)])
  try {
    expect(await f.read()).toMatchObject({
      request: { actions: [], anchors: [] },
      source: { calls: [{ callId: 'bad' }] },
    })
  } finally {
    await f.close()
  }
})
test('uses the durable latest attempt and actual Run ending, not an active-Run map', async () => {
  const f = await fixture()
  try {
    await f.f.attempt(2)
    expect(await f.read()).toEqual({ failure: 'attemptSuperseded' })
    const reply = await f.f.reply([])
    await f.f.append([
      f.f.driver({ kind: 'run_ended', run: 'run', reason: 'completed', basis: [reply], at }),
    ])
    expect(await f.read({ ...origin, attempt: 2, assistantMessage: 'reply-2' })).toEqual({
      failure: 'unavailable',
    })
  } finally {
    await f.close()
  }
})
test('revocation is checked before history IO and again after it', async () => {
  const f = await fixture()
  try {
    f.readPrefix.mockImplementationOnce(async () => {
      const prefix = await f.f.prefix()
      f.revoke()
      return { kind: 'prefix', prefix }
    })
    expect(await f.read()).toEqual({ failure: 'unavailable' })
    expect(f.readPrefix).toHaveBeenCalledTimes(1)
    expect(await f.read()).toEqual({ failure: 'unavailable' })
    expect(f.readPrefix).toHaveBeenCalledTimes(1)
  } finally {
    await f.close()
  }
})
