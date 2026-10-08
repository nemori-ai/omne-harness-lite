import { expect, test, vi } from 'vitest'
import { encodeRunnerAdmissionToken, passKeys } from '@omne-harness-lite/loop-extension-runner'
import type { SessionLogBackingOperations } from '@omne-harness-lite/session-log'
import type { AccessIdentity } from '@omne-harness-lite/session-tenancy'
import { OFFICIAL_ADMISSION_NAME } from '@omne-harness-lite/tool-admission'
import { createToolAdmission } from '@omne-harness-lite/tool-admission-local'
import { createSessionAccessOwner } from '../src/session-access.ts'
import { toolActionHistory } from '../src/tool-driver-history.ts'
import {
  at,
  completeActions,
  historyFixture,
  scope,
  toolCall,
} from './tool-driver-history-fixture.ts'

async function fixture() {
  const f = await historyFixture()
  const identity: AccessIdentity = {
    scope,
    binding: 'actual-binding',
    principal: 'history-user',
    principalKind: 'human',
    consumer: 'tool',
    contextKeys: [],
  }
  const owner = createSessionAccessOwner({
    async check(identity) {
      return { kind: 'authorized', identity }
    },
  })
  const issuer = owner.issuerFor(identity)
  const issued = await issuer.issue({ ...identity, operations: ['tool.submit'] })
  if (issued.kind !== 'issued') throw new Error('issue failed')
  const access = issued.access,
    release = vi.fn(async () => {})
  let generation = 'owner-one'
  const backing: SessionLogBackingOperations = {
    get ownerGeneration() {
      return generation
    },
    borrow: () => ({ log: f.log, release }),
  }
  const create = () =>
    createToolAdmission({
      access: owner.operations,
      backing,
      history: toolActionHistory,
      source: {
        async read() {
          return { kind: 'rejected', reason: 'passUnavailable' }
        },
      },
    })
  let provider = create()
  const key = passKeys({
    position: 'before_action',
    anchor: 'action-call',
    extension: OFFICIAL_ADMISSION_NAME,
    occurrence: { kind: 'final' },
  })
  if ('invalidInput' in key) throw new Error('bad fixture key')
  const token = encodeRunnerAdmissionToken(f.calls[0], key.final)
  if (typeof token !== 'string') throw new Error('bad fixture token')
  return {
    f,
    owner,
    access,
    token,
    release,
    get provider() {
      return provider
    },
    verify: () => provider.verifyToken(access, scope, token, f.calls[0]!),
    async reopen() {
      await provider.close()
      await f.reopen()
      generation = 'owner-two'
      provider = create()
    },
    async close() {
      await provider.close()
      owner.stop()
      await f.close()
    },
  }
}

test('verifies actual SQL journal conclusions only after the whole original batch is complete with ordinary tool authority', async () => {
  const f = await fixture()
  try {
    expect(await f.owner.operations.authorize(f.access, scope, 'session.log.coordinate')).toEqual({
      kind: 'rejected',
      reason: 'notAuthorized',
    })
    expect(await f.verify()).toEqual({ kind: 'invalid', reason: 'not_admitted' })
    await completeActions(f.f)
    const prefix = await f.f.prefix()
    expect(await f.verify()).toEqual({
      kind: 'valid',
      checked: { scope, ownerGeneration: 'owner-one', tail: prefix.tail },
    })
    expect(await f.verify()).toHaveProperty('kind', 'valid')
    expect(await f.provider.verifyToken({ ...f.access }, scope, f.token, f.f.calls[0]!)).toEqual({
      kind: 'failed',
      reason: 'notAuthorized',
    })
  } finally {
    await f.close()
  }
})
test('rechecks the same durable locator after real log close and reopen in a new physical owner', async () => {
  const f = await fixture()
  try {
    await completeActions(f.f)
    const before = await f.verify(),
      old = f.provider
    await f.reopen()
    expect(await old.verifyToken(f.access, scope, f.token, f.f.calls[0]!)).toEqual({
      kind: 'failed',
      reason: 'unavailable',
    })
    expect(await f.verify()).toEqual({
      ...before,
      checked: { scope, ownerGeneration: 'owner-two', tail: (await f.f.prefix()).tail },
    })
    expect(f.release).toHaveBeenCalledTimes(1)
  } finally {
    await f.close()
  }
})
test('attempt advancement retains the original conclusion; actual Run end invalidates it', async () => {
  const f = await fixture()
  try {
    await completeActions(f.f)
    await f.f.attempt(2)
    expect(await f.verify()).toHaveProperty('kind', 'valid')
    const basis = await f.f.reply([])
    await f.f.append([
      f.f.driver({ kind: 'run_ended', run: 'run', reason: 'completed', basis: [basis], at }),
    ])
    expect(await f.verify()).toEqual({ kind: 'invalid', reason: 'run_ended' })
  } finally {
    await f.close()
  }
})
test.each([{}, { changed: true }])(
  'a later actual parameter rewrite permanently invalidates the locator: %j',
  async args => {
    const f = await fixture()
    try {
      await completeActions(f.f)
      const call = f.f.calls[0]!
      await f.f.conclusion(
        call,
        'late-rewriter',
        {
          kind: 'rewrite',
          subject: {
            call: { ...call, arguments: args },
            definition: { name: 'echo' },
            batch: [call.callId],
          },
        },
        'action-call',
        'rewrite',
      )
      expect(await f.verify()).toEqual({ kind: 'invalid', reason: 'arguments_changed' })
    } finally {
      await f.close()
    }
  },
)
test('a valid encoding for an absent official conclusion does not grant execution', async () => {
  const f = await fixture()
  try {
    await completeActions(f.f)
    const key = passKeys({
      position: 'before_action',
      anchor: 'invented',
      extension: OFFICIAL_ADMISSION_NAME,
      occurrence: { kind: 'final' },
    })
    if ('invalidInput' in key) throw new Error('key')
    const token = encodeRunnerAdmissionToken(toolCall(), key.final)
    if (typeof token !== 'string') throw new Error('token')
    expect(await f.provider.verifyToken(f.access, scope, token, toolCall())).toEqual({
      kind: 'invalid',
      reason: 'not_admitted',
    })
    expect(
      await f.provider.verifyToken(f.access, scope, f.token, { ...toolCall(), tool: 'renamed' }),
    ).toEqual({ kind: 'invalid', reason: 'arguments_changed' })
  } finally {
    await f.close()
  }
})
test('does not discard an unknown durable record to manufacture an admitted history', async () => {
  const f = await fixture()
  try {
    await completeActions(f.f)
    await f.f.append([
      { tenant: scope.tenant, dedupeKey: 'future', readKeys: [], payload: { format: 'future/1' } },
    ])
    expect(await f.verify()).toEqual({ kind: 'failed', reason: 'unavailable' })
  } finally {
    await f.close()
  }
})
