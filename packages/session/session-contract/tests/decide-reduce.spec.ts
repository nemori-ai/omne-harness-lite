// `decide` and `reduce` on the first-path kinds, read directly: the creation with required
// identities, the initialization items, the recall and the conflict of one operation, the
// tenant check, the quarantine of an unknown entry kind, and the pure judgments at their edges.
import { describe, expect, it } from 'vitest'
import {
  decide,
  deriveDriveOperation,
  deriveSessionOperation,
  judgeAdvance,
  judgeCompletion,
  judgeIdle,
  judgeRunStart,
  openWork,
  reduce,
  resolveCascade,
  resolveControlScope,
  resolveOperation,
  routeInput,
  type CommittedBatch,
  type HistoryEntry,
  type SessionCommand,
  type WorkSnapshot,
} from '@omne-harness/session-contract'
import {
  creation,
  evidence,
  memoryAccess,
  memoryOtherAccess,
  operationId,
  createMemorySessionEvidenceBridge,
  guard,
  ordinaryInput,
} from '@omne-harness/session-contract/testing'

const access = memoryAccess('tester')
const base = { tenant: access.tenant, session: access.session }

/** Commits `command` on `previous` through decide and reduce, as a storage participant would. */
function commit(previous: WorkSnapshot | null, command: SessionCommand): WorkSnapshot {
  const guards =
    command.kind === 'startRun' ? [guard('evidence-bridge', 'login-entry', 'login')] : []
  const decision = decide(previous, command, guards, null, { compaction: null })
  if (decision.kind !== 'entries') throw new Error(`decide: ${JSON.stringify(decision)}`)
  const revision = String(
    previous === null ? 1 : Number(previous.revision) + 1,
  ) as WorkSnapshot['revision']
  const entries: HistoryEntry[] = decision.entries.map((entry, index) => ({
    ...entry,
    id: String(index + 1) as HistoryEntry['id'],
    revision,
  }))
  const reduced = reduce(previous, { revision, entries })
  if (reduced.kind !== 'reduced') throw new Error(`reduce: ${reduced.diagnostic}`)
  return reduced.snapshot
}

const createCommand = (overrides: Partial<ReturnType<typeof creation>> = {}): SessionCommand => ({
  kind: 'create',
  input: { ...base, operation: operationId('create'), creation: creation(overrides) },
})

describe('create and completeInitialization', () => {
  it('a creation with required identities is initializing until every item is ready', () => {
    const created = commit(
      null,
      createCommand({ requiredIdentities: [{ capability: 'login', name: 'account' }] }),
    )
    expect(created.lifecycle).toBe('initializing')
    expect(created.tasks).toEqual([
      expect.objectContaining({
        kind: 'initialization',
        item: 'account',
        owner: 'login',
        state: 'pending',
        originalOperation: operationId('create'),
      }),
    ])
    expect(judgeRunStart(created, 'interactive')).toEqual({ kind: 'not-ready' })
    const ready = commit(created, {
      kind: 'completeInitialization',
      input: {
        ...base,
        operation: operationId('init-1'),
        result: {
          item: 'account',
          owner: 'login',
          result: { kind: 'ready', evidence: evidence('login/ready') },
        },
      },
    })
    expect(ready.lifecycle).toBe('dormant')
    expect(ready.tasks).toEqual([])
  })

  it('a failed item keeps the task with its diagnostic and the session initializing is not claimed', () => {
    const created = commit(
      null,
      createCommand({ requiredIdentities: [{ capability: 'login', name: 'account' }] }),
    )
    const failed = commit(created, {
      kind: 'completeInitialization',
      input: {
        ...base,
        operation: operationId('init-1'),
        result: {
          item: 'account',
          owner: 'login',
          result: { kind: 'failed', diagnostic: 'no login', recovery: evidence('login/recovery') },
        },
      },
    })
    expect(failed.tasks).toEqual([
      expect.objectContaining({ state: 'failed', diagnostic: 'no login' }),
    ])
    expect(failed.lifecycle).toBe('dormant')
  })

  it('an item that is not pending is invalid', () => {
    const created = commit(null, createCommand())
    const decision = decide(
      created,
      {
        kind: 'completeInitialization',
        input: {
          ...base,
          operation: operationId('init-1'),
          result: {
            item: 'account',
            owner: 'login',
            result: { kind: 'ready', evidence: evidence('x') },
          },
        },
      },
      [],
      null,
      { compaction: null },
    )
    expect(decision).toEqual({
      kind: 'rejected',
      failure: { kind: 'invalid', field: 'result.item', reason: expect.any(String) },
    })
  })

  it('an initial input of the creation is accepted in the first batch', () => {
    const created = commit(null, createCommand({ initial: ordinaryInput('input-0') }))
    expect(created.pending).toEqual(['input-0'])
  })

  it('a creation on an existing session is invalid, and another tenant is denied', () => {
    const created = commit(null, createCommand())
    const second: SessionCommand = {
      kind: 'create',
      input: { ...base, operation: operationId('create-2'), creation: creation() },
    }
    expect(decide(created, second, [], null, { compaction: null })).toMatchObject({
      kind: 'rejected',
      failure: { kind: 'invalid', field: 'session' },
    })
    const other = memoryOtherAccess('stranger')
    const foreign: SessionCommand = {
      kind: 'accept',
      input: {
        tenant: other.tenant,
        session: other.session,
        operation: operationId('foreign'),
        value: ordinaryInput('x'),
      },
    }
    expect(decide(created, foreign, [], null, { compaction: null })).toEqual({
      kind: 'rejected',
      failure: { kind: 'denied', action: 'accept' },
    })
  })
})

describe('resolveOperation and the recall of decide', () => {
  it('recalls the same intent and conflicts on another', () => {
    const created = commit(null, createCommand())
    const receipt = {
      operation: operationId('create'),
      revision: created.revision,
      first: '1' as HistoryEntry['id'],
      last: '1' as HistoryEntry['id'],
      recovered: false,
      source: evidence('receipt'),
    }
    const digest = 'd1'
    expect(resolveOperation(null, operationId('create'), digest)).toEqual({ kind: 'new' })
    expect(
      resolveOperation(
        { operation: operationId('create'), digest, receipt },
        operationId('create'),
        digest,
      ),
    ).toEqual({ kind: 'recovered', receipt })
    expect(
      resolveOperation(
        { operation: operationId('create'), digest, receipt },
        operationId('create'),
        'd2',
      ),
    ).toEqual({ kind: 'conflict', operation: operationId('create') })
  })

  it('derives the same operation from the same elements and another from other elements', () => {
    const a = deriveSessionOperation({
      kind: 'startRun',
      session: access.session,
      first: 'input-1' as never,
      predecessor: null,
    })
    const b = deriveSessionOperation({
      kind: 'startRun',
      session: access.session,
      first: 'input-1' as never,
      predecessor: null,
    })
    const c = deriveSessionOperation({
      kind: 'startRun',
      session: access.session,
      first: 'input-2' as never,
      predecessor: null,
    })
    expect(a).toBe(b)
    expect(a).not.toBe(c)
    expect(a).toMatch(/^sop_[0-9a-f]{64}$/u)
    const fact = deriveSessionOperation({
      kind: 'fact',
      fact: {
        kind: 'input-handover',
        execution: 'e',
        input: 'input-1' as never,
        result: { kind: 'accepted', receipt: evidence('r1') },
      },
    })
    const sameFact = deriveSessionOperation({
      kind: 'fact',
      fact: {
        kind: 'input-handover',
        execution: 'e',
        input: 'input-1' as never,
        result: { kind: 'rejected', reason: 'x', rejection: evidence('r2') },
      },
    })
    expect(fact).toBe(sameFact)
    expect(
      deriveDriveOperation({ kind: 'submit', execution: 'e', input: 'input-1' as never }),
    ).toMatch(/^dop_/u)
  })
})

describe('reduce', () => {
  it('quarantines an unknown kind, a gap in revisions and a batch that does not start with the creation', () => {
    const created = commit(null, createCommand())
    const unknown: CommittedBatch = {
      revision: '2' as never,
      entries: [
        {
          id: '2' as never,
          revision: '2' as never,
          kind: 'session.exotic',
          schema: created.interpreter,
          payload: { kind: 'object', entries: [] },
          origin: { owner: 'session', via: null, source: evidence('x') },
        },
      ],
    }
    expect(reduce(created, unknown)).toEqual({
      kind: 'quarantined',
      diagnostic: expect.stringContaining('session.exotic'),
    })
    expect(reduce(created, { ...unknown, revision: '4' as never })).toMatchObject({
      kind: 'quarantined',
    })
    expect(reduce(null, unknown)).toMatchObject({ kind: 'quarantined' })
    expect(reduce(created, { revision: created.revision, entries: [] })).toEqual({
      kind: 'reduced',
      snapshot: created,
    })
  })
})

describe('the pure judgments at their edges', () => {
  const dormant = () => commit(null, createCommand())
  const accepted = () =>
    commit(dormant(), {
      kind: 'accept',
      input: { ...base, operation: operationId('accept'), value: ordinaryInput('input-1') },
    })
  const started = () =>
    commit(accepted(), {
      kind: 'startRun',
      input: {
        ...base,
        operation: operationId('start'),
        entry: 'interactive',
        candidate: creation().definition.candidate,
        instance: { owner: 'agent', id: 'i' },
      },
    })

  it('routeInput queues for the next Run while no Run is unfinished, and for the current one while one is', () => {
    expect(routeInput(dormant(), ordinaryInput('a'))).toEqual({
      kind: 'queue',
      destination: 'next-run',
    })
    expect(routeInput(started(), ordinaryInput('b'))).toEqual({
      kind: 'queue',
      destination: 'current-run',
    })
    expect(routeInput({ ...dormant(), lifecycle: 'archived' }, ordinaryInput('c'))).toEqual({
      kind: 'rejected',
      reason: 'archived',
    })
    const frozen = {
      ...dormant(),
      frozen: { cause: 'tool-shape-lost' as const, evidence: evidence('f'), commit: evidence('c') },
    }
    expect(routeInput(frozen, ordinaryInput('d'))).toEqual({ kind: 'rejected', reason: 'frozen' })
    expect(
      routeInput(dormant(), {
        kind: 'card-decision',
        card: evidence('card'),
        decision: evidence('dec'),
        destination: evidence('dest'),
      }),
    ).toEqual({ kind: 'card', destination: evidence('dest') })
  })

  it('judgeAdvance refuses a stale attempt, a changed revision and a terminal Run', () => {
    const active = started()
    if (active.run.kind !== 'active' || active.run.advance === null) throw new Error('no advance')
    const { advance } = active.run
    expect(judgeAdvance(active, { kind: 'attempt', advance, expected: active.revision })).toEqual({
      kind: 'ok',
    })
    expect(judgeAdvance(active, { kind: 'attempt', advance, expected: '0' as never })).toEqual({
      kind: 'changed',
      revision: active.revision,
    })
    expect(
      judgeAdvance(active, {
        kind: 'attempt',
        advance: { ...advance, attempt: 'other' as never },
        expected: active.revision,
      }),
    ).toEqual({ kind: 'stale-advance', current: advance })
    expect(
      judgeAdvance(active, { kind: 'participation', execution: 'other', joint: 'message' }),
    ).toEqual({ kind: 'stale-advance', current: advance })
    expect(
      judgeAdvance(dormant(), { kind: 'participation', execution: 'x', joint: 'message' }),
    ).toEqual({ kind: 'stale-advance', current: null })
    const ended = commit(active, {
      kind: 'finishRun',
      input: {
        ...base,
        operation: operationId('finish'),
        run: advance.run,
        expected: active.revision,
        bounded: { kind: 'uninterpretable', evidence: evidence('u') },
      },
    })
    expect(ended.run).toMatchObject({ kind: 'terminal', terminal: { outcome: 'failed' } })
    expect(ended.lifecycle).toBe('dormant')
    expect(
      judgeAdvance(ended, {
        kind: 'bounded',
        run: advance.run,
        expected: ended.revision,
        basis: { kind: 'uninterpretable', evidence: evidence('u') },
      }),
    ).toMatchObject({ kind: 'terminal' })
  })

  it('judgeCompletion blocks on inputs accepted for the Run and not handed over', () => {
    const active = started()
    if (active.run.kind !== 'active') throw new Error('no run')
    const execution = active.run.execution.execution
    expect(judgeCompletion(active, execution)).toEqual({
      kind: 'blocked',
      pendingInputs: ['input-1'],
    })
    const handed = commit(active, {
      kind: 'receive',
      input: {
        ...base,
        operation: operationId('handover'),
        fact: {
          kind: 'input-handover',
          execution,
          input: 'input-1' as never,
          result: { kind: 'accepted', receipt: evidence('r') },
        },
      },
    })
    expect(judgeCompletion(handed, execution)).toEqual({ kind: 'allowed' })
    expect(openWork(handed)).toMatchObject({
      pending: ['input-1'],
      handed: ['input-1'],
      unreadEvents: [{ execution, after: '0' }],
    })
    expect(judgeCompletion(dormant(), 'none')).toEqual({ kind: 'allowed' })
  })

  it('the evidence bridge double hands the login-entry material to startRun unless scripted out, and decide follows it', async () => {
    const previous = accepted()
    const command: SessionCommand = {
      kind: 'startRun',
      input: {
        ...base,
        operation: operationId('start-bridge'),
        entry: 'interactive',
        candidate: creation().definition.candidate,
        instance: { owner: 'agent', id: 'i' },
      },
    }
    const bridge = createMemorySessionEvidenceBridge()
    const withLogin = await bridge.prepare(command)
    if (!('ok' in withLogin)) throw new Error('prepare failed')
    expect(withLogin.ok.map(material => material.owner)).toContain('login-entry')
    expect(decide(previous, command, withLogin.ok, null, { compaction: null }).kind).toBe('entries')
    bridge.controls.loginEntry(false)
    const without = await bridge.prepare(command)
    if (!('ok' in without)) throw new Error('prepare failed')
    expect(without.ok.map(material => material.owner)).not.toContain('login-entry')
    expect(decide(previous, command, without.ok, null, { compaction: null })).toEqual({
      kind: 'rejected',
      failure: { kind: 'login-required' },
    })
  })

  it('judgeIdle answers unavailable naming #756; resolveControlScope and resolveCascade throw naming it', () => {
    const snapshot = dormant()
    expect(() =>
      resolveControlScope(snapshot, { kind: 'control', value: { kind: 'archive' } }),
    ).toThrow(/#756/u)
    expect(
      judgeIdle(snapshot, {
        observation: {
          kind: 'unknown',
          at: { at: 'x', protocol: creation().entryContract, source: evidence('s') },
          scope: evidence('sc'),
          source: evidence('so'),
        },
        policy: { kind: 'disabled' },
        coverage: {
          own: evidence('o'),
          relations: evidence('r'),
          children: [],
          calls: [],
          completeScope: evidence('c'),
        },
      }),
    ).toEqual({ kind: 'unavailable', reason: expect.stringContaining('#756') })
    expect(() => resolveCascade(snapshot, [])).toThrow(/#756/u)
  })

  it('a rejected hand-over removes the eligibility, and a fact off the path is refused naming #756', () => {
    const active = started()
    if (active.run.kind !== 'active') throw new Error('no run')
    const decision = decide(
      active,
      {
        kind: 'receive',
        input: {
          ...base,
          operation: operationId('x'),
          fact: { kind: 'agent-exit', advance: active.run.advance as never, source: evidence('e') },
        },
      },
      [],
      null,
      { compaction: null },
    )
    expect(decision).toMatchObject({
      kind: 'rejected',
      failure: { kind: 'unavailable', diagnostic: expect.stringContaining('#756') },
    })
    const rejected = commit(active, {
      kind: 'receive',
      input: {
        ...base,
        operation: operationId('reject'),
        fact: {
          kind: 'input-handover',
          execution: active.run.execution.execution,
          input: 'input-1' as never,
          result: { kind: 'rejected', reason: 'admission', rejection: evidence('rej') },
        },
      },
    })
    expect(rejected.pending).toEqual([])
  })
})
