import { afterEach, expect, it } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { parseTenantId, unwrap } from '@omne-harness-lite/identity-values'
import { checkSourceToken } from '@omne-harness-lite/session-log'
import { readJsonStrict } from '@omne-harness-lite/content-blocks'
import { openStorage, type SqlStorage } from '@omne-harness-lite/storage-sql'
import type {
  SessionStateChange,
  AttemptPermit,
  CoordinationAuthority,
} from '@omne-harness-lite/session-runtime'
import { createLocalSessionState } from '../src/state-participant.ts'
import { sessionStateMigrations } from '../src/state-migrations.ts'

const roots: string[] = [],
  stores: SqlStorage[] = []
const tenant = unwrap(parseTenantId({ organization: 'team', account: 'owner' }))
const checked = checkSourceToken({ tenant, session: 'session', journalGeneration: 'test', tail: 0 })
if ('failure' in checked) throw new Error('invalid fixture')
const scope = { tenant, session: checked.ok.session }
const authority = Object.freeze({}) as CoordinationAuthority
const policy = { maxPendingPerSession: 8, maxBatchSize: 4, maxRecordBytes: 4096 }
afterEach(async () => {
  for (const s of stores.splice(0)) await s.close()
  for (const p of roots.splice(0)) await rm(p, { recursive: true, force: true })
})
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'omne-session-state-'))
  roots.push(root)
  const storage = await openStorage({
    dialect: 'sqlite',
    file: join(root, 'tenant.sqlite'),
    synchronous: 'full',
  })
  stores.push(storage)
  for (const f of sessionStateMigrations) await storage.write(tx => f.migration.up(tx.db))
  let open = true
  let settled: 'settled' | 'pending' | 'unavailable' = 'settled'
  const state = createLocalSessionState({
    storage,
    tenant,
    policy,
    authority: {
      authorize: async (_unit, actual, requested) =>
        actual === authority &&
        requested.tenant.organization === tenant.organization &&
        requested.tenant.account === tenant.account
          ? { kind: 'authorized' as const }
          : { failure: 'denied' as const },
    },
    isOpen: () => open,
    workSettledIn: async () => settled,
  })
  const stage = (revision: string | null, change: SessionStateChange) =>
    storage.atomic(unit => state.participant.stageIn(unit, authority, scope, revision, change))
  return {
    storage,
    state,
    stage,
    stop: () => {
      open = false
    },
    unsettled: (value: typeof settled) => {
      settled = value
    },
  }
}
function accepted(
  key: string,
  position: Extract<SessionStateChange, { kind: 'acceptInput' }>['position'],
): SessionStateChange {
  return {
    kind: 'acceptInput',
    operation: {
      tenant,
      principal: 'owner',
      operation: 'submitInput',
      operationKey: key,
      session: scope.session,
    },
    semanticDigest: 'semantic-' + key,
    position,
  }
}
async function active() {
  const f = await fixture()
  await f.stage(null, { kind: 'initialize', stepKey: 'create' })
  await f.stage('0', accepted('input', 1))
  await f.stage('1', { kind: 'startRun', stepKey: 'run', run: 'run' as never, position: 1 })
  const attempt = await f.stage('2', {
    kind: 'startAttempt',
    stepKey: 'attempt',
    run: 'run' as never,
    attempt: 1,
    executionGeneration: 'generation-1',
    reason: 'first',
  })
  if ('failure' in attempt || attempt.permit === null) throw new Error('attempt unavailable')
  return { ...f, permit: attempt.permit }
}
it('initializes an empty persistent head without inventing a Run or pending input', async () => {
  const f = await fixture()
  const result = await f.stage(null, { kind: 'initialize', stepKey: 'create' })
  expect(result).toMatchObject({
    kind: 'staged',
    head: { ...scope, lifecycle: 'active', revision: '0', run: null },
    permit: null,
  })
  await f.storage.atomic(async unit => {
    expect(await f.state.participant.headIn(unit, authority, scope)).toMatchObject({
      kind: 'head',
      head: { revision: '0', run: null },
    })
    expect(await f.state.participant.pendingIn(unit, authority, scope, 4)).toEqual({
      kind: 'inputs',
      positions: [],
    })
  })
})
it('rolls back initialization and accepted qualification with the caller transaction', async () => {
  const f = await fixture()
  await expect(
    f.storage.atomic(async unit => {
      await f.state.participant.stageIn(unit, authority, scope, null, {
        kind: 'initialize',
        stepKey: 'create',
      })
      await f.state.participant.stageIn(unit, authority, scope, '0', accepted('one', 1))
      throw new Error('later participant failed')
    }),
  ).rejects.toThrow('later participant failed')
  await f.storage.atomic(async unit =>
    expect(await f.state.participant.headIn(unit, authority, scope)).toEqual({
      kind: 'head',
      head: null,
    }),
  )
})
it('reserves original qualified input for one Run and deletes its work row only on adoption', async () => {
  const f = await active()
  await f.storage.atomic(async unit =>
    expect(await f.state.participant.pendingIn(unit, authority, scope, 4)).toEqual({
      kind: 'inputs',
      positions: [1],
    }),
  )
  expect(
    await f.stage('3', {
      kind: 'adoptInput',
      stepKey: 'adopt',
      run: 'run' as never,
      attempt: 1,
      position: 1,
      permit: f.permit,
    }),
  ).toHaveProperty('kind', 'staged')
  await f.storage.atomic(async unit =>
    expect(await f.state.participant.pendingIn(unit, authority, scope, 4)).toEqual({
      kind: 'inputs',
      positions: [],
    }),
  )
})
it('allows only one contender to establish a Run against the current revision', async () => {
  const f = await fixture()
  await f.stage(null, { kind: 'initialize', stepKey: 'create' })
  await f.stage('0', accepted('one', 1))
  const result = await Promise.all(
    ['a', 'b'].map(run =>
      f.stage('1', { kind: 'startRun', stepKey: run, run: run as never, position: 1 }),
    ),
  )
  expect(result.filter(r => 'kind' in r)).toHaveLength(1)
  expect(result.filter(r => 'failure' in r)).toEqual([{ failure: 'conflict' }])
})
it('refuses terminal completion while a new accepted input or unsettled call remains', async () => {
  const f = await active()
  const finish: SessionStateChange = {
    kind: 'finish',
    stepKey: 'finish',
    run: 'run' as never,
    attempt: 1,
    terminal: 'completed',
    permit: f.permit,
  }
  expect(await f.stage('3', finish)).toEqual({ failure: 'pendingInput' })
  await f.stage('3', {
    kind: 'adoptInput',
    stepKey: 'adopt',
    run: 'run' as never,
    attempt: 1,
    position: 1,
    permit: f.permit,
  })
  f.unsettled('pending')
  expect(await f.stage('4', finish)).toEqual({ failure: 'conflict' })
  f.unsettled('unavailable')
  expect(await f.stage('4', finish)).toEqual({ failure: 'unavailable' })
  f.unsettled('settled')
  expect(await f.stage('4', finish)).toMatchObject({
    kind: 'staged',
    head: { run: { state: 'completed' } },
  })
})
it('refuses a copied permit, invalidates the old permit at terminal, and absorbs terminal state', async () => {
  const f = await active()
  const adopted: SessionStateChange = {
    kind: 'adoptInput',
    stepKey: 'adopt',
    run: 'run' as never,
    attempt: 1,
    position: 1,
    permit: { ...f.permit } as AttemptPermit,
  }
  expect(await f.stage('3', adopted)).toEqual({ failure: 'staleAttempt' })
  await f.stage('3', { ...adopted, permit: f.permit })
  await f.stage('4', {
    kind: 'finish',
    stepKey: 'finish',
    run: 'run' as never,
    attempt: 1,
    terminal: 'completed',
    permit: f.permit,
  })
  await f.storage.atomic(async unit =>
    expect(await f.state.checkPermitIn(unit, f.permit, scope, 'run' as never, 1)).toBe(false),
  )
  expect(
    await f.stage('5', {
      kind: 'startAttempt',
      stepKey: 'again',
      run: 'run' as never,
      attempt: 2,
      executionGeneration: 'new',
      reason: 'resumed_after_interruption',
    }),
  ).toEqual({ failure: 'terminal' })
})
it('does not activate a permit from a rolled-back attempt commit', async () => {
  const f = await fixture()
  await f.stage(null, { kind: 'initialize', stepKey: 'create' })
  await f.stage('0', accepted('one', 1))
  await f.stage('1', { kind: 'startRun', stepKey: 'run', run: 'run' as never, position: 1 })
  let old!: AttemptPermit
  await expect(
    f.storage.atomic(async unit => {
      const result = await f.state.participant.stageIn(unit, authority, scope, '2', {
        kind: 'startAttempt',
        stepKey: 'attempt',
        run: 'run' as never,
        attempt: 1,
        executionGeneration: 'same-generation',
        reason: 'first',
      })
      if ('failure' in result || result.permit === null) throw new Error('missing permit')
      old = result.permit
      throw new Error('rollback attempt')
    }),
  ).rejects.toThrow('rollback attempt')
  await f.stage('2', {
    kind: 'startAttempt',
    stepKey: 'retry',
    run: 'run' as never,
    attempt: 1,
    executionGeneration: 'same-generation',
    reason: 'first',
  })
  await f.storage.atomic(async unit =>
    expect(await f.state.checkPermitIn(unit, old, scope, 'run' as never, 1)).toBe(false),
  )
})
it('refuses forged authority and another tenant before exposing the head', async () => {
  const f = await fixture()
  await f.stage(null, { kind: 'initialize', stepKey: 'create' })
  await f.storage.atomic(async unit => {
    expect(await f.state.participant.headIn(unit, {} as CoordinationAuthority, scope)).toEqual({
      failure: 'denied',
    })
    expect(
      await f.state.participant.headIn(unit, authority, {
        ...scope,
        tenant: unwrap(parseTenantId({ organization: 'other', account: 'owner' })),
      }),
    ).toEqual({ failure: 'denied' })
  })
  f.stop()
  await f.storage.atomic(async unit =>
    expect(await f.state.participant.headIn(unit, authority, scope)).toEqual({
      failure: 'unavailable',
    }),
  )
})

it('cannot reopen a terminal Run identity or make its old committed permit current again', async () => {
  const f = await active()
  await f.stage('3', {
    kind: 'adoptInput',
    stepKey: 'adopt',
    run: 'run' as never,
    attempt: 1,
    position: 1,
    permit: f.permit,
  })
  await f.stage('4', {
    kind: 'finish',
    stepKey: 'finish',
    run: 'run' as never,
    attempt: 1,
    terminal: 'completed',
    permit: f.permit,
  })
  await f.stage('5', accepted('second', 2))
  expect(
    await f.stage('6', { kind: 'startRun', stepKey: 'reuse', run: 'run' as never, position: 2 }),
  ).toEqual({ failure: 'terminal' })
  expect(
    await f.stage('6', {
      kind: 'startRun',
      stepKey: 'fresh',
      run: 'fresh-run' as never,
      position: 2,
    }),
  ).toHaveProperty('kind', 'staged')
})

it('recognizes the original pending input and refuses the same operation with another semantic value', async () => {
  const f = await fixture()
  await f.stage(null, { kind: 'initialize', stepKey: 'create' })
  await f.stage('0', accepted('original', 1))
  expect(await f.stage('1', accepted('original', 1))).toMatchObject({
    kind: 'staged',
    head: { revision: '1' },
  })
  expect(
    await f.stage('1', {
      ...accepted('original', 1),
      semanticDigest: 'different',
    } as SessionStateChange),
  ).toEqual({ failure: 'conflict' })
  expect(await f.stage('1', accepted('original', 2))).toEqual({ failure: 'conflict' })
})

it('orders exact positions beyond JavaScript safe integers without rounding them', async () => {
  const f = await fixture()
  await f.stage(null, { kind: 'initialize', stepKey: 'create' })
  const greater = readJsonStrict('9007199254740993'),
    lesser = readJsonStrict('9007199254740992')
  if ('failed' in greater || 'failed' in lesser) throw new Error('invalid exact position fixture')
  await f.stage('0', accepted('greater', greater.ok as never))
  await f.stage('1', accepted('lesser', lesser.ok as never))
  await f.storage.atomic(async unit =>
    expect(await f.state.participant.pendingIn(unit, authority, scope, 4)).toEqual({
      kind: 'inputs',
      positions: [lesser.ok, greater.ok],
    }),
  )
})

it('leaves the queue intact when pending capacity or the read batch bound is exceeded', async () => {
  const f = await fixture()
  await f.stage(null, { kind: 'initialize', stepKey: 'create' })
  for (let i = 0; i < policy.maxPendingPerSession; i++)
    expect(await f.stage(String(i), accepted('input-' + i, i + 1))).toHaveProperty('kind', 'staged')
  expect(await f.stage('8', accepted('overflow', 9))).toEqual({ failure: 'unavailable' })
  await f.storage.atomic(async unit => {
    expect(await f.state.participant.pendingIn(unit, authority, scope, 5)).toEqual({
      failure: 'invalidInput',
    })
    expect(await f.state.participant.pendingIn(unit, authority, scope, 4)).toEqual({
      kind: 'inputs',
      positions: [1, 2, 3, 4],
    })
  })
})

it('uses the same write order for a new accepted input and completion', async () => {
  const f = await active()
  await f.stage('3', {
    kind: 'adoptInput',
    stepKey: 'adopt',
    run: 'run' as never,
    attempt: 1,
    position: 1,
    permit: f.permit,
  })
  const result = await Promise.all([
    f.stage('4', accepted('new-input', 2)),
    f.stage('4', {
      kind: 'finish',
      stepKey: 'finish',
      run: 'run' as never,
      attempt: 1,
      terminal: 'completed',
      permit: f.permit,
    }),
  ])
  expect(result.filter(r => 'kind' in r)).toHaveLength(1)
  expect(result.filter(r => 'failure' in r)).toEqual([{ failure: 'conflict' }])
  await f.storage.atomic(async unit => {
    const pending = await f.state.participant.pendingIn(unit, authority, scope, 4)
    const head = await f.state.participant.headIn(unit, authority, scope)
    if ('failure' in pending || 'failure' in head || head.head === null)
      throw new Error('state unavailable')
    expect(head.head.run?.state === 'completed' && pending.positions.length > 0).toBe(false)
  })
})

it('rejects a foreign storage unit and rolls back its whole transaction', async () => {
  const f = await fixture(),
    other = await fixture()
  await expect(
    other.storage.atomic(unit =>
      f.state.participant.stageIn(unit, authority, scope, null, {
        kind: 'initialize',
        stepKey: 'wrong-storage',
      }),
    ),
  ).rejects.toThrow()
  await other.storage.atomic(async unit =>
    expect(await other.state.participant.headIn(unit, authority, scope)).toEqual({
      kind: 'head',
      head: null,
    }),
  )
})

it('does not execute caller accessors while validating a state change or its permit', async () => {
  const f = await fixture()
  await f.stage(null, { kind: 'initialize', stepKey: 'create' })
  let calls = 0
  const kindGetter = {
    get kind() {
      calls++
      throw new Error('untrusted kind')
    },
    stepKey: 'wrong',
  } as unknown as SessionStateChange
  expect(await f.stage('0', kindGetter)).toEqual({ failure: 'invalidInput' })
  const permitGetter = {
    kind: 'adoptInput',
    stepKey: 'wrong',
    run: 'run',
    attempt: 1,
    position: 1,
    get permit() {
      calls++
      throw new Error('untrusted permit')
    },
  } as unknown as SessionStateChange
  expect(await f.stage('0', permitGetter)).toEqual({ failure: 'invalidInput' })
  expect(calls).toBe(0)
  await f.storage.atomic(async unit =>
    expect(await f.state.participant.headIn(unit, authority, scope)).toMatchObject({
      kind: 'head',
      head: { revision: '0', run: null },
    }),
  )
})
it('refuses represented objects in reason and terminal fields without coercion', async () => {
  const f = await fixture()
  await f.stage(null, { kind: 'initialize', stepKey: 'create' })
  const invalidReason = {
    kind: 'startAttempt',
    stepKey: 'attempt',
    run: 'run',
    attempt: 1,
    executionGeneration: 'generation',
    reason: { toString: null },
  } as unknown as SessionStateChange
  expect(await f.stage('0', invalidReason)).toEqual({ failure: 'invalidInput' })
  const invalidTerminal = {
    kind: 'finish',
    stepKey: 'finish',
    run: 'run',
    attempt: 1,
    terminal: { toString: null },
    permit: {},
  } as unknown as SessionStateChange
  expect(await f.stage('0', invalidTerminal)).toEqual({ failure: 'invalidInput' })
})
