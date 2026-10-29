// The four derived Session participations of an Agent commit (`message`→`recordMessage`,
// `context-transition`→`commitDerived`, `custody`→`preserveResult`, `processed`→`completeConsumption`)
// are Session mutation commands: each public Agent write asks the Session access check once, before
// the joint publication; denied and unavailable leave both sides unwritten; the allowed evidence is
// recorded with the Session operation of the same commit (#680 ruling on review B-1).
import { expect, it } from 'vitest'
import {
  decodeActionId,
  type AgentJournal,
  type CommandReceipt,
  type Failure,
} from '@omne-harness/agent-contract'
import type { Outcome } from '@omne-harness/operation-result'
import { judgeMessage } from '@omne-harness/message'
import { deriveSessionOperation, type SessionAccessRequest } from '@omne-harness/session-contract'
import { assistantMessage, memoryOtherAccess } from '@omne-harness/session-contract/testing'
import {
  evidence,
  ok,
  operation,
  scene,
  type SceneQualification,
} from './fixtures/common-journal.ts'
import { resultCall } from './fixtures/result-call.ts'
import { take } from './fixtures/progression.ts'

type Scene = Awaited<ReturnType<typeof scene>>
type Joint = 'message' | 'context-transition' | 'custody' | 'processed'
type CommitRequest = Parameters<AgentJournal<string>['commit']>[0]
type ResultRequest = Parameters<AgentJournal<string>['recordResult']>[0]
type Prepared = Readonly<{
  s: Scene
  joint: Joint
  command: 'recordMessage' | 'commitDerived' | 'preserveResult' | 'completeConsumption'
  write(): Promise<Outcome<CommandReceipt, Failure>>
  request: CommitRequest | ResultRequest
}>

async function messageScene(name: string, qualification: SceneQualification): Promise<Prepared> {
  const s = await scene(name, undefined, qualification)
  const taken = await take(s)
  const message = assistantMessage('answer')
  const request: CommitRequest = {
    ...s.access,
    execution: s.execution,
    operation: operation('message-tail'),
    authority: s.opened.authority,
    expected: taken.revision,
    checkpoint: s.input.checkpoint,
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
  }
  return {
    s,
    joint: 'message',
    command: 'recordMessage',
    request,
    write: () => s.view.journal.commit(request),
  }
}

async function compactionScene(name: string, qualification: SceneQualification): Promise<Prepared> {
  const s = await scene(name, undefined, qualification)
  const rows = s.backend.controls.entriesOf(s.access.tenant, s.access.session),
    last = rows.findIndex(row => row.kind === 'run.started') - 1
  const judged = judgeMessage({
    id: 'msg_abcdefghijklmnopqrstuv',
    role: 'compaction',
    blocks: [
      {
        kind: 'text',
        id: 'summary',
        text: 'summary',
        visibility: { toHuman: true, toModel: true },
      },
    ],
    covers: { from: rows[0]!.id, to: rows[last]!.id },
    retained: rows.filter(row => row.kind.startsWith('message.')).map(row => row.id),
    derivation: evidence('summary'),
  })
  if (!('ok' in judged)) throw new Error('valid compaction message required')
  const request: CommitRequest = {
    ...s.access,
    execution: s.execution,
    operation: operation('compact'),
    authority: s.opened.authority,
    expected: s.opened.receipt.revision,
    checkpoint: s.input.checkpoint,
    state: { kind: 'advancing' },
    events: [],
    effects: [],
    replyAdmission: null,
    caller: {
      kind: 'context-transition',
      value: {
        preparation: ok(decodeActionId('compact')),
        message: judged.ok,
        source: evidence('model-summary'),
        derivation: evidence('derivation'),
        commitment: evidence('commitment'),
      },
      admission: evidence('admitted-summary'),
    },
  }
  return {
    s,
    joint: 'context-transition',
    command: 'commitDerived',
    request,
    write: () => s.view.journal.commit(request),
  }
}

async function resultScene(
  name: string,
  kind: 'custody' | 'processed',
  qualification: SceneQualification,
): Promise<Prepared> {
  const s = await resultCall(name, qualification)
  const request: ResultRequest =
    kind === 'custody'
      ? s.request
      : {
          ...s.request,
          transfer: {
            kind,
            consumption: s.request.consumption,
            result: s.request.result,
            completion: evidence('processed'),
          },
        }
  return {
    s,
    joint: kind,
    command: kind === 'custody' ? 'preserveResult' : 'completeConsumption',
    request,
    write: () => s.view.journal.recordResult(request),
  }
}

const scenes: Readonly<
  Record<Joint, (name: string, qualification: SceneQualification) => Promise<Prepared>>
> = {
  message: messageScene,
  'context-transition': compactionScene,
  custody: (name, qualification) => resultScene(name, 'custody', qualification),
  processed: (name, qualification) => resultScene(name, 'processed', qualification),
}

function sessionOperation(p: Prepared) {
  return deriveSessionOperation({
    kind: 'participation',
    execution: p.request.execution,
    operation: p.request.operation,
    joint: p.joint,
  })
}

async function observed(p: Prepared) {
  const { s } = p
  return {
    root: s.view.controls.root(),
    rows: s.backend.controls.entriesOf(s.access.tenant, s.access.session),
    agentAnswer: await s.view.journal.query(p.request),
    sessionAnswer: await s.backend.transactions.queryOperation({
      ...s.access,
      operation: sessionOperation(p),
    }),
    decision: s.backend.controls.decisionOf(s.access.tenant, s.access.session, sessionOperation(p)),
  }
}

function participationRequests(p: Prepared, from: number): readonly SessionAccessRequest<string>[] {
  return p.s.accessCheck.controls
    .asked()
    .slice(from)
    .filter(request => request.operation === p.command)
}

for (const joint of ['message', 'context-transition', 'custody', 'processed'] as const) {
  it(`asks the Session check once for the ${joint} participation and records its evidence with the joint commit`, async () => {
    const p = await scenes[joint](`${joint}-allowed`, { agent: true, session: true }),
      before = await observed(p),
      from = p.s.accessCheck.controls.asked().length
    const receipt = ok(await p.write())
    const asked = p.s.accessCheck.controls.asked().slice(from)
    expect(asked.map(request => request.operation)).toEqual([p.command])
    expect(asked[0]).toMatchObject({
      access: { principal: p.s.access.principal, tenant: p.s.access.tenant },
      operation: p.command,
      target: {
        kind: 'session',
        session: p.s.access.session,
        command: {
          kind: p.command,
          input: {
            tenant: p.s.access.tenant,
            session: p.s.access.session,
            operation: sessionOperation(p),
            participation: {
              execution: p.request.execution,
              operation: p.request.operation,
              joint,
              written: receipt.revision,
              handover: receipt.evidence,
            },
          },
        },
      },
    })
    const after = await observed(p)
    // A first custody or processed hand-over also publishes the result preparation of the Pending
    // before the joint commit, so the root advances by one or two positions.
    expect(after.root).toBeGreaterThan(before.root)
    expect(after.rows.length).toBeGreaterThan(before.rows.length)
    expect(after.agentAnswer).toEqual({ ok: { kind: 'committed', receipt } })
    expect(after.sessionAnswer).toMatchObject({ ok: { kind: 'committed' } })
    expect(after.decision).toEqual(evidence(`access/${p.command}/${from + 1}`))
  })

  it(`asks the Session check again when the ${joint} participation is recognized, without rewriting its evidence`, async () => {
    const p = await scenes[joint](`${joint}-recall`, { agent: true, session: true })
    const receipt = ok(await p.write()),
      after = await observed(p),
      from = p.s.accessCheck.controls.asked().length
    expect(ok(await p.write())).toEqual(receipt)
    expect(participationRequests(p, from)).toHaveLength(1)
    expect(await observed(p)).toEqual(after)
    expect(
      p.s.backend.controls.decisionOf(p.s.access.tenant, p.s.access.session, sessionOperation(p)),
    ).toEqual(after.decision)
  })

  for (const answer of ['denied', 'unavailable'] as const)
    it(`leaves both sides unwritten when the Session check answers ${answer} for ${joint}`, async () => {
      const qualification: SceneQualification = { agent: true, session: true }
      const p = await scenes[joint](`${joint}-${answer}`, qualification),
        before = await observed(p),
        from = p.s.accessCheck.controls.asked().length
      qualification.session = answer === 'denied' ? false : 'unavailable'
      const response = await p.write()
      qualification.session = true
      expect(response).toMatchObject({
        failure:
          answer === 'denied'
            ? { kind: 'denied', action: p.command }
            : { kind: 'unavailable', owner: 'session-qualification' },
      })
      expect(participationRequests(p, from)).toHaveLength(1)
      expect(await observed(p)).toEqual(before)
      expect(before.decision).toBeNull()
    })
}

it('the scene policy itself refuses a Session read of another tenant', async () => {
  const s = await scene('foreign-read'),
    foreign = { ...memoryOtherAccess('stranger'), session: s.access.session },
    from = s.accessCheck.controls.asked().length
  expect(await s.backend.transactions.readWork(foreign)).toEqual({
    failure: { kind: 'denied', action: 'readWork' },
  })
  expect(s.accessCheck.controls.asked().slice(from)).toEqual([
    {
      access: { principal: foreign.principal, tenant: foreign.tenant },
      operation: 'readWork',
      target: { kind: 'session', session: s.access.session },
    },
  ])
})
