// The production session-log Journal over the Session log combination in SQL (the node:sqlite
// double that runs the published modules): the first publication point commits the Agent records
// and the Session participation in one storage commit, all or nothing; the later interpretation
// commit is a Session commit alone that cannot undo the first; a Session check or refusal reaches
// the Journal as the AD-01 answer and writes nothing; an unknown is recognized by the original
// operation; another tenant is denied; an unregistered tenant is unavailable and nothing is written.
import { describe, expect, it } from 'vitest'
import type { AgentJournal } from '@omne-harness/agent-contract'
import { decodeInputId } from '@omne-harness/agent-contract'
import {
  assistantMessage,
  evidence,
  memoryOtherAccess,
  operationId,
  ordinaryInput,
} from '@omne-harness/session-contract/testing'
import type { SessionEntriesObservation, WorkSnapshot } from '@omne-harness/session-contract'
import { ok, operation } from './fixtures/common-journal.ts'
import { sqlScene, type SqlScene, type SqlSceneOptions } from './fixtures/sql-scene.ts'

const CALL = 'journal-call-1'

async function opened(name: string, options: SqlSceneOptions = {}) {
  const s = await sqlScene(name, options)
  const open = ok(await s.view.journal.open(s.openInput))
  return { s, open }
}

async function load(s: SqlScene) {
  return ok(await s.view.journal.load({ ...s.access, execution: s.execution }))
}

/** The Agent takes the initial input, as the coordinator's first step does. */
async function take(
  s: SqlScene,
  authority: Parameters<AgentJournal<string>['commit']>[0]['authority'],
) {
  const loaded = await load(s)
  const page = ok(
    await s.view.journal.inputs({
      ...s.access,
      execution: s.execution,
      watermark: loaded.inputWatermark,
    }),
  )
  return ok(
    await s.view.journal.commit({
      ...s.access,
      execution: s.execution,
      operation: operation('take'),
      authority,
      expected: loaded.revision,
      checkpoint: { ...loaded.checkpoint, inputBatch: page.batch.id },
      state: { kind: 'advancing' },
      events: [{ kind: 'input-taken', batch: page.batch }],
      effects: [],
      caller: { kind: 'none' },
      replyAdmission: null,
      handoff: null,
      finish: null,
    }),
  )
}

async function messageRequest(
  s: SqlScene,
  authority: Parameters<AgentJournal<string>['commit']>[0]['authority'],
  name = 'message-tail',
): Promise<Parameters<AgentJournal<string>['commit']>[0]> {
  const loaded = await load(s)
  const message = assistantMessage('answer')
  return {
    ...s.access,
    execution: s.execution,
    operation: operation(name),
    authority,
    expected: loaded.revision,
    checkpoint: loaded.checkpoint,
    state: { kind: 'advancing' },
    events: [{ kind: 'message', message, source: evidence('message-admission') }],
    effects: [],
    caller: {
      kind: 'message',
      message,
      source: evidence('message-source'),
      admission: evidence('message-admission'),
    },
    replyAdmission: null,
    handoff: null,
    finish: null,
  }
}

const count = (s: SqlScene, table: string): number =>
  Number(s.controls?.select(`SELECT COUNT(*) AS n FROM ${table}`).rows[0]?.[0] ?? -1)
const work = async (s: SqlScene): Promise<WorkSnapshot> =>
  ok(await s.port.readWork(s.sessionAccess))

describe('the first publication point', () => {
  it('a message commit saves the Agent records and the Session message in one storage commit', async () => {
    const { s, open } = await opened('first-joint')
    await take(s, open.authority)
    const before = { session: count(s, 'sl_entry'), agent: (await load(s)).revision }
    s.commits.length = 0
    const receipt = ok(await s.view.journal.commit(await messageRequest(s, open.authority)))
    expect(s.commits).toEqual([['execution-record', 'session']])
    expect(count(s, 'sl_entry')).toBeGreaterThan(before.session)
    expect((await load(s)).revision).toBe(receipt.revision)
    expect(Number(receipt.revision)).toBe(Number(before.agent) + 1)
  })

  for (const [where, pattern] of [
    ['the Session write', /INSERT INTO sl_operation/],
    ['the Agent records write', /INSERT OR REPLACE INTO er_root/],
  ] as const)
    it(`a failure at ${where} leaves neither side, and the same operation then commits once`, async () => {
      const { s, open } = await opened(`first-fault-${where.length}`)
      await take(s, open.authority)
      const request = await messageRequest(s, open.authority)
      const before = {
        session: count(s, 'sl_entry'),
        agent: (await load(s)).revision,
        published: count(s, 'er_operation'),
      }
      s.controls?.failWrite(pattern)
      const failed = await s.view.journal.commit(request)
      expect(failed).toHaveProperty('failure')
      expect(count(s, 'sl_entry')).toBe(before.session)
      expect(count(s, 'er_operation')).toBe(before.published)
      expect((await load(s)).revision).toBe(before.agent)
      const receipt = ok(await s.view.journal.commit(request))
      expect(Number(receipt.revision)).toBe(Number(before.agent) + 1)
      expect(count(s, 'er_operation')).toBe(before.published + 1)
    })
})

/** A bound external Tool call, so a Session entries commit has a range to interpret. */
async function bound(s: SqlScene) {
  const snapshot = await work(s)
  if (snapshot.run.kind !== 'active') throw new Error('active Run expected')
  ok(
    await s.port.commit({
      access: s.sessionAccess,
      command: {
        kind: 'bindExternalCall',
        input: {
          tenant: s.access.tenant,
          session: s.access.session,
          operation: operationId('entries-bind'),
          expected: snapshot.revision,
          qualification: evidence('entries/qualified'),
          binding: {
            producer: { kind: 'tool', call: CALL },
            action: 'action',
            consumer: { owner: 'session', work: 'work', position: 'entries-at', purpose: 'action' },
            request: evidence('entries/request'),
            initiatingAttempt: null,
          },
        },
      },
      guards: [],
    }),
  )
  const after = await work(s)
  if (after.run.kind !== 'active') throw new Error('active Run expected')
  const observation: SessionEntriesObservation = {
    tenant: s.access.tenant,
    session: s.access.session,
    run: after.run.run,
    execution: s.execution,
    channel: 'tool-received',
    operation: operationId('entries-1'),
    after: '0',
    through: '1',
    boundary: {
      execution: s.execution,
      channel: 'tool-received',
      revision: '1',
      executionEvidence: evidence('agent/head'),
      count: '1',
    },
    items: [
      {
        ordinal: '1',
        key: 'key-1',
        fact: evidence('agent/entry/1'),
        interpretation: [
          { kind: 'execution', producer: { kind: 'tool', call: CALL }, source: evidence('t/f') },
        ],
      },
    ],
  }
  return { observation, start: { kind: 'initial' as const } }
}

describe('the later interpretation commit', () => {
  it('is a Session commit alone: its failure keeps the Agent records and the progress, its success moves only the progress', async () => {
    const { s, open } = await opened('interpretation')
    ok(await s.view.journal.commit(await messageRequest(s, open.authority)))
    const input = await bound(s)
    const agent = await load(s)
    const progress = (await work(s)).entriesProgress
    s.commits.length = 0
    s.controls?.failWrite(/INSERT OR REPLACE INTO sl_state/)
    expect(await s.port.commitEntries(input)).toHaveProperty('failure')
    expect(s.commits).toEqual([['session']])
    expect(await load(s)).toEqual(agent)
    expect((await work(s)).entriesProgress).toEqual(progress)
    ok(await s.port.commitEntries(input))
    expect((await work(s)).entriesProgress).not.toEqual(progress)
    expect(await load(s)).toEqual(agent)
  })
})

describe('the Session side reaches the Journal as the AD-01 answer and writes nothing', () => {
  it('a submit of an input Session never admitted is denied by the read-only check (PA-01 item 2)', async () => {
    const { s } = await opened('submit-check')
    const value = ordinaryInput('never-admitted')
    const before = count(s, 'er_operation')
    const answer = await s.view.journal.submit({
      ...s.access,
      execution: s.execution,
      operation: operation('submit-unknown'),
      value: {
        id: ok(decodeInputId('never-admitted')),
        source: value.origin,
        content: value.message,
        priority: 'ordinary',
      },
      lineage: {
        kind: 'new-input',
        original: (await import('./fixtures/common-journal.ts')).submitAcceptance(
          s.execution,
          operation('submit-unknown'),
          {
            id: ok(decodeInputId('never-admitted')),
            source: value.origin,
            content: value.message,
            priority: 'ordinary',
          },
        ),
      },
    })
    expect(answer).toEqual({ failure: { kind: 'denied', action: 'submit' } })
    expect(count(s, 'er_operation')).toBe(before)
  })

  it('P6: a derived Session participation the access check refuses is denied; nothing is committed', async () => {
    const { s, open } = await opened('p6-denied', {
      decide: request =>
        request.operation === 'recordMessage'
          ? { kind: 'denied' }
          : { kind: 'allowed', evidence: evidence(`access/${request.operation}`) },
    })
    const request = await messageRequest(s, open.authority)
    const before = { commits: s.commits.length, agent: (await load(s)).revision }
    expect(await s.view.journal.commit(request)).toEqual({
      failure: { kind: 'denied', action: 'commit' },
    })
    expect(s.commits.length).toBe(before.commits)
    expect((await load(s)).revision).toBe(before.agent)
  })

  it('P6: an unavailable access check is unavailable, and the same operation can be retried', async () => {
    let refuse = true
    const { s, open } = await opened('p6-unavailable', {
      decide: request =>
        refuse && request.operation === 'recordMessage'
          ? { kind: 'unavailable', diagnostic: 'check down' }
          : { kind: 'allowed', evidence: evidence(`access/${request.operation}`) },
    })
    const request = await messageRequest(s, open.authority)
    expect(await s.view.journal.commit(request)).toMatchObject({
      failure: { kind: 'unavailable' },
    })
    refuse = false
    expect(await s.view.journal.commit(request)).toHaveProperty('ok')
  })
})

describe('unknown, tenancy and registration', () => {
  it('a lost reply is commit-unknown; the same operation then answers the original, once', async () => {
    const { s, open } = await opened('lost-reply')
    const request = await messageRequest(s, open.authority)
    const before = (await load(s)).revision
    s.controls?.loseNextReply()
    expect(await s.view.journal.commit(request)).toEqual({
      failure: { kind: 'commit-unknown', operation: request.operation },
    })
    const recalled = ok(await s.view.journal.commit(request))
    expect(Number(recalled.revision)).toBe(Number(before) + 1)
    expect((await load(s)).revision).toBe(recalled.revision)
    const again = ok(await s.fresh().journal.commit(request))
    expect(again).toEqual(recalled)
  })

  it('two providers that race on the same operation give one revision and the same answer', async () => {
    const { s, open } = await opened('race')
    const request = await messageRequest(s, open.authority)
    const [left, right] = await Promise.all([
      s.fresh().journal.commit(request),
      s.fresh().journal.commit(request),
    ])
    expect(ok(left)).toEqual(ok(right))
    expect(count(s, 'er_operation')).toBe(2)
    const other = await s
      .fresh()
      .journal.commit({ ...request, checkpoint: { ...request.checkpoint, position: 'E9' } })
    expect(other).toEqual({ failure: { kind: 'conflict', operation: request.operation } })
  })

  it('two providers that keep their copies take turns: each one sees the writes of the other', async () => {
    const { s, open } = await opened('turns')
    const left = s.fresh().journal
    const right = s.fresh().journal
    const first = ok(await left.commit(await messageRequest(s, open.authority, 'turn-1')))
    const loaded = ok(await right.load({ ...s.access, execution: s.execution }))
    expect(loaded.revision).toBe(first.revision)
    const second = ok(await right.commit(await messageRequest(s, open.authority, 'turn-2')))
    expect(ok(await left.load({ ...s.access, execution: s.execution })).revision).toBe(
      second.revision,
    )
    expect(Number(second.revision)).toBe(Number(first.revision) + 1)
  })

  it('another tenant is denied on reads and writes, and nothing is committed', async () => {
    const { s, open } = await opened('tenancy')
    const other = memoryOtherAccess('intruder', 'tenancy')
    const commits = s.commits.length
    expect(await s.view.journal.load({ ...other, execution: s.execution })).toEqual({
      failure: { kind: 'denied', action: 'load' },
    })
    const request = await messageRequest(s, open.authority)
    expect(await s.view.journal.commit({ ...request, ...other })).toEqual({
      failure: { kind: 'denied', action: 'commit' },
    })
    expect(s.commits.length).toBe(commits)
  })

  it('a tenant without a transaction domain is unavailable; nothing is read, committed or registered', async () => {
    const s = await sqlScene('unregistered', { registered: 'none' })
    const commits = s.commits.length
    expect(await s.view.journal.open(s.openInput)).toMatchObject({
      failure: { kind: 'unavailable' },
    })
    expect(s.commits.length).toBe(commits)
  })
})
