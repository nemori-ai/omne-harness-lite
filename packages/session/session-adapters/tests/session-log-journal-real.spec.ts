// The production session-log Journal on the real sqlite-provider: real write Worker, real read
// Worker pool, real files. The first publication commits the Agent records and the Session message
// in one storage commit; a Session refusal rolls the Agent side back; the later interpretation
// commit is a Session commit alone; a new provider on the same storage answers from the durable
// records.
// @module-tag slow
// Why slow: real Workers and real files.
import { afterEach, describe, expect, it } from 'vitest'
import type { AgentJournal } from '@omne-harness/agent-contract'
import { decodeInputId } from '@omne-harness/agent-contract'
import {
  assistantMessage,
  evidence,
  operationId,
  ordinaryInput,
} from '@omne-harness/session-contract/testing'
import type { SessionEntriesObservation, WorkSnapshot } from '@omne-harness/session-contract'
import { ok, operation, submitAcceptance } from './fixtures/common-journal.ts'
import { sqlScene, type SqlScene } from './fixtures/sql-scene.ts'

const scenes: SqlScene[] = []
afterEach(async () => {
  for (const s of scenes.splice(0)) await s.close()
})

async function opened(name: string) {
  const s = await sqlScene(name, { storage: 'real' })
  scenes.push(s)
  return { s, open: ok(await s.view.journal.open(s.openInput)) }
}

const load = async (s: SqlScene) =>
  ok(await s.view.journal.load({ ...s.access, execution: s.execution }))
const work = async (s: SqlScene): Promise<WorkSnapshot> =>
  ok(await s.port.readWork(s.sessionAccess))

async function messageRequest(
  s: SqlScene,
  authority: Parameters<AgentJournal<string>['commit']>[0]['authority'],
): Promise<Parameters<AgentJournal<string>['commit']>[0]> {
  const loaded = await load(s)
  const message = assistantMessage('answer')
  return {
    ...s.access,
    execution: s.execution,
    operation: operation('message-tail'),
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

describe('the first publication point on the real sqlite-provider', () => {
  it('a message commit is one storage commit of both participants; a new provider reads the same records', async () => {
    const { s, open } = await opened('real-first')
    const before = (await work(s)).revision
    s.commits.length = 0
    const receipt = ok(await s.view.journal.commit(await messageRequest(s, open.authority)))
    expect(s.commits).toEqual([['execution-record', 'session']])
    expect(Number((await work(s)).revision)).toBeGreaterThan(Number(before))
    const reloaded = ok(await s.fresh().journal.load({ ...s.access, execution: s.execution }))
    expect(reloaded.revision).toBe(receipt.revision)
  })

  it('a Session refusal of the read-only check rolls the Agent records back', async () => {
    const { s } = await opened('real-refused')
    const value = ordinaryInput('never-admitted')
    const accepted = {
      id: ok(decodeInputId('never-admitted')),
      source: value.origin,
      content: value.message,
      priority: 'ordinary' as const,
    }
    const before = await load(s)
    expect(
      await s.view.journal.submit({
        ...s.access,
        execution: s.execution,
        operation: operation('submit-unknown'),
        value: accepted,
        lineage: {
          kind: 'new-input',
          original: submitAcceptance(s.execution, operation('submit-unknown'), accepted),
        },
      }),
    ).toEqual({ failure: { kind: 'denied', action: 'submit' } })
    expect(await s.fresh().journal.load({ ...s.access, execution: s.execution })).toEqual({
      ok: before,
    })
  })
})

describe('the combination the Journal commits under', () => {
  it('a manifest digest other than the registered one is unavailable, and nothing is written (fail closed)', async () => {
    const s = await sqlScene('real-manifest', { storage: 'real', manifest: 'b'.repeat(64) })
    scenes.push(s)
    expect(await s.view.journal.open(s.openInput)).toMatchObject({
      failure: { kind: 'unavailable' },
    })
    const fresh = s.fresh().journal
    expect(await fresh.load({ ...s.access, execution: s.execution })).toMatchObject({
      failure: { kind: 'denied' },
    })
  })
})

describe('the later interpretation commit on the real sqlite-provider', () => {
  it('a refused interpretation keeps the Agent records and the progress; an accepted one moves only the progress', async () => {
    const { s, open } = await opened('real-interpretation')
    ok(await s.view.journal.commit(await messageRequest(s, open.authority)))
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
              producer: { kind: 'tool', call: 'real-call' },
              action: 'action',
              consumer: { owner: 'session', work: 'work', position: 'at', purpose: 'action' },
              request: evidence('entries/request'),
              initiatingAttempt: null,
            },
          },
        },
        guards: [],
      }),
    )
    const observation = (after: string, through: string): SessionEntriesObservation => ({
      tenant: s.access.tenant,
      session: s.access.session,
      run: snapshot.run.kind === 'active' ? snapshot.run.run : (null as never),
      execution: s.execution,
      channel: 'tool-received',
      operation: operationId(`entries-${after}`),
      after,
      through,
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
            {
              kind: 'execution',
              producer: { kind: 'tool', call: 'real-call' },
              source: evidence('t'),
            },
          ],
        },
      ],
    })
    const agent = await load(s)
    const progress = (await work(s)).entriesProgress
    s.commits.length = 0
    // A range that does not start at the saved progress is refused by the Session participant.
    expect(
      await s.port.commitEntries({
        observation: observation('5', '6'),
        start: { kind: 'initial' },
      }),
    ).toHaveProperty('failure')
    expect(s.commits.every(item => item.length === 1 && item[0] === 'session')).toBe(true)
    expect(await load(s)).toEqual(agent)
    expect((await work(s)).entriesProgress).toEqual(progress)
    ok(
      await s.port.commitEntries({
        observation: observation('0', '1'),
        start: { kind: 'initial' },
      }),
    )
    expect((await work(s)).entriesProgress).not.toEqual(progress)
    expect(await load(s)).toEqual(agent)
  })
})
