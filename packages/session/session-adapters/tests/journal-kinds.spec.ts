// The kinds of the fact rows that the production Journal writes at its publication point (K-5,
// Agent side): each event's kinds are the kinds of the consequences that the shared normalization
// of the memory reference gives, and the Session pure layer accepts those consequences against the
// rows in the same commit (`commitLog` checks that the observation names the complete original
// consequence order). An event whose original fragments do not decide it (a control event) has
// empty kinds, and a Session decision that needs it answers `unavailable`. The storage is the
// node:sqlite double of the Session log combination; the Journal is the session-log provider.
import { afterEach, describe, expect, it } from 'vitest'
import {
  decodeActionId,
  decodeInputId,
  type AgentJournal,
  type DurableEvidence,
  type PendingCall,
  type Waiting,
} from '@omne-harness/agent-contract'
import { sampleReceivedModelResult } from '@omne-harness/agent-contract/testing'
import type { SessionLogCommitObservation, WorkSnapshot } from '@omne-harness/session-contract'
import {
  assistantMessage,
  guard,
  operationId,
  ordinaryInput,
} from '@omne-harness/session-contract/testing'
import { readExecutionInterpretation } from '../src/cordis/agent-journal.ts'
import { evidence, ok, operation, submitInput } from './fixtures/common-journal.ts'
import { handed, sqlScene, type SqlScene } from './fixtures/sql-scene.ts'

const scenes: SqlScene[] = []
afterEach(async () => {
  for (const s of scenes.splice(0)) await s.close()
})

async function scene(name: string) {
  const s = await sqlScene(name)
  scenes.push(s)
  return s
}

type CommitInput = Parameters<AgentJournal<string>['commit']>[0]

const work = async (s: SqlScene): Promise<WorkSnapshot> =>
  ok(await s.port.readWork(s.sessionAccess))

/** One Agent commit of the scene's execution at its current head. */
async function committed(
  s: SqlScene,
  label: string,
  change: (loaded: Awaited<ReturnType<typeof loadOf>>) => Partial<CommitInput>,
) {
  const loaded = await loadOf(s)
  const authority = loaded.executionAttachment
  if (authority === null) throw new Error('an active attachment is expected')
  return ok(
    await s.view.journal.commit({
      ...s.access,
      execution: s.execution,
      operation: operation(label),
      authority,
      expected: loaded.revision,
      checkpoint: loaded.checkpoint,
      state: { kind: 'advancing' },
      events: [],
      effects: [],
      caller: { kind: 'none' },
      replyAdmission: null,
      handoff: null,
      finish: null,
      ...change(loaded),
    }),
  )
}

const loadOf = async (s: SqlScene) =>
  ok(await s.view.journal.load({ ...s.access, execution: s.execution }))

/** Open, the handover of the initial input and the take of it: event 1, input-taken. */
async function started(s: SqlScene) {
  const opened = ok(await s.view.journal.open(s.openInput))
  ok(await handed(s, String(s.initial.id), opened.receipt.evidence))
  const loaded = await loadOf(s)
  const page = ok(
    await s.view.journal.inputs({
      ...s.access,
      execution: s.execution,
      watermark: loaded.inputWatermark,
    }),
  )
  await committed(s, 'take', () => ({
    checkpoint: { ...loaded.checkpoint, inputBatch: page.batch.id },
    events: [{ kind: 'input-taken', batch: page.batch }],
  }))
}

/** A wait on one Model call of the scene: its event registers the call (event kind waiting). */
function modelWait(s: SqlScene) {
  const result = sampleReceivedModelResult(s.access.tenant, 'kinds')
  if (result.delivery.producer !== 'model') throw new Error('fixture: a Model entry')
  const pending: Extract<PendingCall, { kind: 'model' }> = {
    kind: 'model',
    purpose: 'main',
    action: ok(decodeActionId('action')),
    reference: result.delivery.key.reference,
    consumption: result.consumption,
    position: result.consumer,
    fixed: evidence('request'),
  }
  return pending
}

/** The kinds column of every fact row of the scene's execution, by sequence. */
function factKinds(s: SqlScene): Record<string, readonly string[]> {
  if (s.controls === null) throw new Error('the double storage is expected')
  const rows = s.controls.select('SELECT sequence, kinds FROM er_fact_idx ORDER BY sequence').rows
  return Object.fromEntries(
    rows.map(([sequence, kinds]) => [String(sequence), JSON.parse(String(kinds)) as string[]]),
  )
}

const lookup = (s: SqlScene) => ({
  lookup: (input: { tenant: string }) =>
    Promise.resolve(
      input.tenant === s.domain.scope.tenant
        ? ({ kind: 'ready', domain: s.domain } as const)
        : ({ kind: 'unregistered' } as const),
    ),
})

/** The events of the scene's execution with the consequences the publication normalized. */
async function interpretation(s: SqlScene, after = '0') {
  const read = await readExecutionInterpretation(
    { storage: s.storage, tenantDomainLookup: lookup(s) },
    { tenant: s.access.tenant, session: s.access.session, execution: s.execution, after },
  )
  if (read.kind !== 'read' || read.execution === null) throw new Error('the execution is not read')
  return read.execution
}

/** Commits the non-observed events after the saved progress, one `commitLog` each, in order. */
async function commitEvents(s: SqlScene) {
  const snapshot = await work(s)
  if (snapshot.run.kind !== 'active') throw new Error('an active Run is expected')
  const view = await interpretation(s, snapshot.run.execution.readThrough)
  for (const event of view.events) {
    if (event.consequences === null) throw new Error(`event ${event.sequence} is not decided`)
    if (event.consequences.every(item => item.kind === 'observed')) continue
    const observation: SessionLogCommitObservation = {
      tenant: s.access.tenant,
      session: s.access.session,
      run: snapshot.run.run,
      execution: s.execution,
      sequence: event.sequence,
      revision: view.revision,
      executionEvidence: view.head ?? (null as never),
      source: event.source,
      consequences: event.consequences,
      operation: operationId(`log-${event.sequence}`),
    }
    const commitLog = s.port.commitLog
    if (commitLog === undefined) throw new Error('the storage port offers commitLog')
    ok(await commitLog({ observation }))
  }
}

describe('the kinds of a fact row are the kinds of its normalized consequences', () => {
  it('input-taken, an observed message, a Model call wait and a dependency wait: equal kinds, and Session accepts the consequences', async () => {
    const s = await scene('kinds-equal')
    await started(s)
    await committed(s, 'message', () => ({
      events: [{ kind: 'message', message: assistantMessage('m'), source: evidence('message') }],
    }))
    const pending = modelWait(s)
    const modelWaits: Waiting[] = [{ kind: 'producer', pending }]
    await committed(s, 'model-wait', loaded => ({
      checkpoint: { ...loaded.checkpoint, calls: [pending] },
      state: { kind: 'waiting', waits: modelWaits },
      events: [{ kind: 'waiting', waits: modelWaits }],
      effects: [
        {
          pending,
          action: pending.action,
          authority: loaded.executionAttachment ?? (null as never),
        },
      ],
    }))
    const dependency: Waiting[] = [{ kind: 'dependency', owner: 'test', position: 'p' }]
    await committed(s, 'dependency-wait', () => ({
      state: { kind: 'waiting', waits: dependency },
      events: [{ kind: 'waiting', waits: dependency }],
    }))

    const view = await interpretation(s)
    const kinds = factKinds(s)
    expect(kinds).toEqual({
      '1': ['input-taken'],
      '2': ['observed'],
      '3': ['call-registration', 'registered-waiting'],
      '4': ['registered-waiting'],
    })
    for (const event of view.events)
      expect(event.consequences?.map(item => item.kind)).toEqual(kinds[event.sequence])

    // The pure layer compares the observation with the fact row of the same commit: it accepts
    // each event, and the Model call is registered as the event said.
    await commitEvents(s)
    const snapshot = await work(s)
    expect(snapshot.run.kind === 'active' ? snapshot.run.execution.readThrough : null).toBe('4')
    expect(
      snapshot.callRegistrations?.some(item => item.consumption === String(pending.consumption)),
    ).toBe(true)
  })
})

describe('an event whose original fragments do not decide it', () => {
  it('a control event has empty kinds and no consequences; a Session decision that needs it answers unavailable', async () => {
    const s = await scene('kinds-control')
    await started(s)
    await commitEvents(s)
    ok(
      await s.view.journal.control({
        ...s.access,
        execution: s.execution,
        operation: operation('control-cancel'),
        command: { kind: 'cancel', reason: evidence('cancel-reason') },
      }),
    )
    const view = await interpretation(s, '1')
    expect(view.events.map(event => [event.sequence, event.consequences])).toEqual([['2', null]])
    expect(factKinds(s)['2']).toEqual([])
    // Session accepts input-2 and the Agent submits it; its handover needs the unread event 2.
    const value = ordinaryInput('input-2')
    const accepted = ok(
      await s.port.commit({
        access: s.sessionAccess,
        command: {
          kind: 'accept',
          input: {
            tenant: s.access.tenant,
            session: s.access.session,
            operation: operationId('accept-2'),
            value,
          },
        },
        guards: [guard('evidence-bridge', 'ordinary-intake', value)],
      }),
    )
    const input = {
      id: ok(decodeInputId('input-2')),
      source: (accepted as { source: DurableEvidence }).source,
      content: value.message,
      priority: 'ordinary' as const,
    }
    const receipt = ok(
      await s.view.journal.submit(submitInput(s.access, s.execution, operation('submit-2'), input)),
    )
    expect(await handed(s, 'input-2', receipt.evidence)).toMatchObject({
      failure: { kind: 'unavailable' },
    })
  })
})
