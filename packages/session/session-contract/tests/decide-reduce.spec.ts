// `decide` and `reduce` on the first-path kinds, read directly: the creation with required
// identities, the initialization items, the recall and the conflict of one operation, the
// tenant check, the quarantine of an unknown entry kind, and the pure judgments at their edges.
import { describe, expect, it } from 'vitest'
import type { JsonValue } from '@omne-harness/json-text'
import { accountCodec, workspaceEquals } from '@omne-harness/legal-identity'
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
  adoption,
  creation,
  evidence,
  memoryAccess,
  memoryOtherAccess,
  operationId,
  createMemorySessionEvidenceBridge,
  guard,
  ordinaryInput,
  testingWorkspace,
} from '@omne-harness/session-contract/testing'
import { encodeEntry } from '../src/entries.ts'
import type { SessionEntry } from '../src/entries.ts'
import { initializationGuards } from './initialization-fixture.ts'

const access = memoryAccess('tester')
const base = { tenant: access.tenant, session: access.session }

/** Commits `command` on `previous` through decide and reduce, as a storage participant would. */
function commit(previous: WorkSnapshot | null, command: SessionCommand): WorkSnapshot {
  const guards =
    command.kind === 'startRun'
      ? [guard('evidence-bridge', 'login-entry', 'login')]
      : initializationGuards(command, previous)
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
    expect(failed.lifecycle).toBe('initializing')
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

const WORKSPACE_TEXT = 'wsp_c0nf0rmance000000000000000'
const workspace = () => testingWorkspace(WORKSPACE_TEXT)
const workspaceAttachment = { instance: 'host-1:/srv/work', basis: 'git:4f2a9c1' }

function decisionOf(
  command: SessionCommand,
  previous: WorkSnapshot | null = null,
  guards = initializationGuards(command, previous),
) {
  return decide(previous, command, guards, null, { compaction: null })
}

/** The member `key` of a json-text object tree, or undefined. */
function member(tree: JsonValue | undefined, key: string): JsonValue | undefined {
  return tree?.kind === 'object' ? tree.entries.find(entry => entry.key === key)?.value : undefined
}

/** The batch of one decided creation as log rows, with `edit` applied to each payload. */
function createdRows(edit: (payload: JsonValue) => JsonValue): CommittedBatch {
  const decision = decisionOf(createCommand({ workspace: workspace(), workspaceAttachment }))
  if (decision.kind !== 'entries') throw new Error(JSON.stringify(decision))
  const entries: HistoryEntry[] = decision.entries.map((entry, index) => ({
    ...entry,
    payload: edit(entry.payload),
    id: String(index + 1) as HistoryEntry['id'],
    revision: '1' as HistoryEntry['revision'],
  }))
  return { revision: '1' as never, entries }
}

const changeWorkspace = (value: unknown, attached: unknown): SessionCommand =>
  ({
    kind: 'change',
    input: {
      ...base,
      operation: operationId('change-workspace'),
      declaration: {
        kind: 'workspace',
        value,
        workspaceAttachment: attached,
        basis: evidence('select'),
      },
    },
  }) as SessionCommand

describe('the workspace selection: a sixth-family WorkspaceId with its attachment, or neither', () => {
  it('a creation with a legal workspace and a full attachment keeps both through the log', () => {
    const command = createCommand({ workspace: workspace(), workspaceAttachment })
    const decision = decisionOf(command)
    if (decision.kind !== 'entries') throw new Error(JSON.stringify(decision))
    const written = member(member(decision.entries[0]?.payload, 'creation'), 'workspace')
    expect(written).toEqual({ kind: 'string', value: WORKSPACE_TEXT })
    const created = commit(null, command)
    expect(created.creation.workspaceAttachment).toEqual(workspaceAttachment)
    const kept = created.creation.workspace
    expect(kept !== null && workspaceEquals(kept, workspace())).toBe(true)
  })

  /** The payload with the member `key` of its creation replaced by `value`, or removed. */
  const editCreation =
    (key: string, value?: JsonValue) =>
    (payload: JsonValue): JsonValue => {
      if (payload.kind !== 'object') return payload
      return {
        kind: 'object',
        entries: payload.entries.map(entry => {
          if (entry.key !== 'creation' || entry.value.kind !== 'object') return entry
          const rest = entry.value.entries.filter(item => item.key !== key)
          return {
            key: entry.key,
            value: {
              kind: 'object',
              entries: value === undefined ? rest : [...rest, { key, value }],
            },
          }
        }),
      }
    }
  const withoutCreation = (payload: JsonValue): JsonValue =>
    payload.kind === 'object'
      ? { kind: 'object', entries: payload.entries.filter(entry => entry.key !== 'creation') }
      : payload
  const nullCreation = (payload: JsonValue): JsonValue =>
    payload.kind === 'object'
      ? {
          kind: 'object',
          entries: payload.entries.map(entry =>
            entry.key === 'creation' ? { key: entry.key, value: { kind: 'null' } } : entry,
          ),
        }
      : payload
  const revisionOne = (payload: JsonValue): JsonValue =>
    editCreation('workspaceAttachment')(editCreation('workspace', { kind: 'null' })(payload))

  it.each([
    [
      'its workspace text does not parse',
      editCreation('workspace', { kind: 'string', value: 'wsp_not-legal' }),
    ],
    ['it has no creation', withoutCreation],
    ['its creation is null', nullCreation],
    ['its creation has no workspace key', editCreation('workspace')],
    ['its creation has no workspace attachment key', editCreation('workspaceAttachment')],
    ['it is a revision-1 row: a null workspace and no attachment key', revisionOne],
  ])('a creation row is quarantined when %s', (_case, edit) => {
    expect(reduce(null, createdRows(edit))).toEqual({
      kind: 'quarantined',
      diagnostic: expect.any(String),
    })
  })

  it('encoding a creation whose workspace legal-identity did not mint throws', () => {
    const forged = { name: 'WorkspaceId', text: WORKSPACE_TEXT } as unknown as ReturnType<
      typeof workspace
    >
    const entry = {
      kind: 'session.created' as const,
      tenant: access.tenant,
      session: access.session,
      operation: operationId('create'),
      creation: creation({ workspace: forged, workspaceAttachment }),
      items: [],
    }
    expect(() =>
      encodeEntry(entry as unknown as SessionEntry, {
        owner: 'session',
        via: 'direct',
        source: evidence('forged'),
      }),
    ).toThrow(TypeError)
  })

  const account = accountCodec.parse('acc_abcdefghjkmnpqrstvwxyz2345')
  if (!account.ok) throw new Error('the account sample does not parse')
  it.each([
    ['its wire text', WORKSPACE_TEXT],
    ['an identity of another family', account.value],
    [
      'a forged shape that legal-identity did not mint',
      { name: 'WorkspaceId', text: WORKSPACE_TEXT },
    ],
    ['an adoption', adoption('workspace')],
  ])('a creation whose workspace is %s is invalid', (_case, forged) => {
    expect(
      decisionOf(createCommand({ workspace: forged as never, workspaceAttachment }), null, []),
    ).toEqual({
      kind: 'rejected',
      failure: { kind: 'invalid', field: 'creation.workspace', reason: expect.any(String) },
    })
  })

  it.each([
    ['no attachment', null, 'creation.workspaceAttachment'],
    ['a missing attachment key', undefined, 'creation.workspaceAttachment'],
    ['an attachment that is a string', 'host-1:/srv/work', 'creation.workspaceAttachment'],
    ['an attachment that is a number', 7, 'creation.workspaceAttachment'],
    [
      'an empty instance',
      { ...workspaceAttachment, instance: '' },
      'creation.workspaceAttachment.instance',
    ],
    [
      'an instance that is not text',
      { ...workspaceAttachment, instance: 7 },
      'creation.workspaceAttachment.instance',
    ],
    ['an empty basis', { ...workspaceAttachment, basis: '' }, 'creation.workspaceAttachment.basis'],
    [
      'a basis that is not text',
      { ...workspaceAttachment, basis: null },
      'creation.workspaceAttachment.basis',
    ],
  ])('a creation with a workspace and %s is invalid', (_case, attached, field) => {
    expect(
      decisionOf(
        createCommand({ workspace: workspace(), workspaceAttachment: attached as never }),
        null,
        [],
      ),
    ).toEqual({ kind: 'rejected', failure: { kind: 'invalid', field, reason: expect.any(String) } })
  })

  it.each([
    ['an attachment', workspaceAttachment],
    ['a missing attachment key', undefined],
  ])('a creation with no workspace and %s is invalid', (_case, attached) => {
    expect(
      decisionOf(
        createCommand({ workspace: null, workspaceAttachment: attached as never }),
        null,
        [],
      ),
    ).toEqual({
      kind: 'rejected',
      failure: {
        kind: 'invalid',
        field: 'creation.workspaceAttachment',
        reason: expect.any(String),
      },
    })
  })

  it('workspace changes use the same validation and valid declarations commit', () => {
    const created = commit(null, createCommand())
    expect(decisionOf(changeWorkspace(WORKSPACE_TEXT, workspaceAttachment), created)).toMatchObject(
      { failure: { kind: 'invalid', field: 'declaration.value' } },
    )
    expect(decisionOf(changeWorkspace(workspace(), null), created)).toMatchObject({
      failure: { kind: 'invalid', field: 'declaration.workspaceAttachment' },
    })
    expect(
      decisionOf(changeWorkspace(workspace(), { ...workspaceAttachment, basis: '' }), created),
    ).toMatchObject({
      failure: { kind: 'invalid', field: 'declaration.workspaceAttachment.basis' },
    })
    expect(decisionOf(changeWorkspace(null, workspaceAttachment), created)).toMatchObject({
      failure: { kind: 'invalid', field: 'declaration.workspaceAttachment' },
    })
    for (const legal of [
      changeWorkspace(workspace(), workspaceAttachment),
      changeWorkspace(null, null),
      {
        kind: 'change',
        input: {
          ...base,
          operation: operationId('change-model'),
          declaration: { kind: 'model', name: 'other-model', basis: evidence('model') },
        },
      } satisfies SessionCommand,
    ])
      expect(decisionOf(legal, created)).toMatchObject({
        kind: 'entries',
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
    expect(reduce(created, { revision: created.revision, entries: [] })).toMatchObject({
      kind: 'quarantined',
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

  it('disabled idle and empty cascade have explicit decisions', () => {
    const snapshot = dormant()
    expect(
      resolveControlScope(snapshot, { kind: 'control', value: { kind: 'archive' } }),
    ).toMatchObject({ kind: 'scope', scopeRelease: true })
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
    ).toEqual({ kind: 'disabled' })
    expect(resolveCascade(snapshot, [])).toEqual([])
  })

  it('a rejected hand-over removes eligibility while exit reports remain observations', () => {
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
      kind: 'entries',
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
