// The kinds of the fact rows that the production Journal writes at its publication point (K-5,
// Agent side): each event's kinds are the kinds of the consequences that the shared normalization
// of the memory reference gives, and the Session pure layer accepts those consequences against the
// rows in the same commit (`commitLog` checks that the observation names the complete original
// consequence order). A control event, whose consequences Session decides when it interprets
// it, has the deferred marker and its Agent evidence; until it is interpreted, a Session decision
// that needs it answers `unavailable`. The storage is the
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
import {
  EXECUTION_RECORD_HANDLERS,
  SESSION_PROTOCOL,
  SESSION_WORK_HANDLER,
  decodeSessionWork,
} from '@omne-harness/session-storage-sql/participants'
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

describe('the reverse input directory row of an open names the original attempt', () => {
  it('the attempt of the open is the advance of the Run that started the execution', async () => {
    const s = await scene('kinds-attempt')
    const before = await work(s)
    if (before.run.kind !== 'active' || before.run.advance === null)
      throw new Error('an active Run with an advance is expected')
    ok(await s.view.journal.open(s.openInput))
    if (s.controls === null) throw new Error('the double storage is expected')
    const rows = s.controls.select('SELECT input, attempt FROM er_admission_attempt_idx').rows
    expect(rows.map(row => row.map(String))).toEqual([
      [String(s.initial.id), String(before.run.advance.attempt)],
    ])
  })
})

describe('an event whose consequences the publication does not decide', () => {
  it('a control event has the deferred marker and its evidence; until it is interpreted, a Session decision that needs it answers unavailable', async () => {
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
    expect(view.events[0]?.control?.records.map(record => record.command)).toEqual(['cancel'])
    expect(factKinds(s)['2']).toEqual(['deferred'])
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

describe('path P: AD-02 reads the events after its progress from the fact rows (C-WORKCACHE)', () => {
  /** A scene with an input-taken, an observed message, a Model call wait and a control event. */
  async function eventful(name: string) {
    const s = await scene(name)
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
    ok(
      await s.view.journal.control({
        ...s.access,
        execution: s.execution,
        operation: operation('control-cancel'),
        command: { kind: 'cancel', reason: evidence('cancel-reason') },
      }),
    )
    return s
  }

  /** The reads of `handler` the storage served while `run` ran. */
  async function readsDuring<T>(s: SqlScene, handler: string, run: () => Promise<T>) {
    if (s.controls === null) throw new Error('the double storage is expected')
    const from = s.controls.reads.length
    const value = await run()
    return { value, reads: s.controls.reads.slice(from).filter(item => item === handler).length }
  }

  type Facts = { facts: { consequences: unknown; control: unknown; sequence: string }[] }
  const rewriteFacts = (s: SqlScene, change: (output: Facts) => Facts) => {
    s.rewriteReads.current = (request, answer) =>
      request.handler === EXECUTION_RECORD_HANDLERS.executionFacts && answer.kind === 'read'
        ? { ...answer, output: change(structuredClone(answer.output) as Facts) as never }
        : answer
  }

  it('gives what the records of the execution give, from every progress, and reads no part', async () => {
    const s = await eventful('facts-equal')
    for (const after of ['0', '1', '2', '3', '4']) {
      const facts = await readsDuring(s, EXECUTION_RECORD_HANDLERS.parts, () =>
        interpretation(s, after),
      )
      expect(facts.reads).toBe(0)
      // The same read with every body made absent goes to the records of the execution.
      rewriteFacts(s, output => ({
        ...output,
        facts: output.facts.map(fact => ({ ...fact, consequences: 'absent', control: 'absent' })),
      }))
      const records = await readsDuring(s, EXECUTION_RECORD_HANDLERS.parts, () =>
        interpretation(s, after),
      )
      s.rewriteReads.current = null
      // A read with no event after the progress has no body to miss, so it reads no part either.
      expect(records.reads > 0).toBe(after !== '4')
      expect(facts.value).toEqual(records.value)
      expect(facts.value.events.map(event => event.sequence)).toEqual(
        ['1', '2', '3', '4'].slice(Number(after)),
      )
    }
  })

  it('reads one fact row per event after the progress, however many came before', async () => {
    const s = await eventful('facts-rows')
    if (s.controls === null) throw new Error('the double storage is expected')
    const rows = (after: string) =>
      s.controls!.select(
        `SELECT COUNT(*) FROM er_fact_idx WHERE sequence > ${after} AND execution = '${s.execution}'`,
      ).rows[0]?.[0]
    for (const after of ['0', '3']) {
      let returned = -1
      rewriteFacts(s, output => {
        returned = output.facts.length
        return output
      })
      await interpretation(s, after)
      s.rewriteReads.current = null
      expect(BigInt(returned)).toBe(BigInt(rows(after) as bigint))
    }
  })

  it('a missing fact row is a gap: unavailable, never the events after it', async () => {
    const s = await eventful('facts-gap')
    rewriteFacts(s, output => ({
      ...output,
      facts: output.facts.filter(fact => fact.sequence !== '2'),
    }))
    const read = await readExecutionInterpretation(
      { storage: s.storage, tenantDomainLookup: lookup(s) },
      { tenant: s.access.tenant, session: s.access.session, execution: s.execution, after: '0' },
    )
    expect(read).toMatchObject({
      kind: 'unavailable',
      diagnostic: expect.stringContaining('gap at sequence 2'),
    })
  })

  /** Every page holds one fact at most, and names the next: the read follows the pages. */
  type Page = Facts & { next: string | null; revision: string; emittedThrough: string }
  const onePerPage = (page: Page): Page =>
    page.facts.length <= 1
      ? page
      : { ...page, facts: page.facts.slice(0, 1), next: page.facts[0]!.sequence }
  const rewritePages = (s: SqlScene, change: (page: Page, after: string) => Page) => {
    const asked: string[] = []
    s.rewriteReads.current = (request, answer) => {
      if (request.handler !== EXECUTION_RECORD_HANDLERS.executionFacts || answer.kind !== 'read')
        return answer
      const after = (request.input as { after: string }).after
      asked.push(after)
      return { ...answer, output: change(structuredClone(answer.output) as Page, after) as never }
    }
    return asked
  }
  const readOf = (s: SqlScene, after = '0') =>
    readExecutionInterpretation(
      { storage: s.storage, tenantDomainLookup: lookup(s) },
      { tenant: s.access.tenant, session: s.access.session, execution: s.execution, after },
    )

  it('a missing last fact row is not the end: unavailable, not a shorter read', async () => {
    const s = await eventful('facts-tail')
    rewriteFacts(s, output => ({
      ...output,
      facts: output.facts.filter(fact => fact.sequence !== '4'),
    }))
    expect(await readOf(s)).toMatchObject({
      kind: 'unavailable',
      diagnostic: expect.stringContaining('end at sequence 3, before 4'),
    })
  })

  it('facts over several pages are read page by page to the end, as one read gives them', async () => {
    const s = await eventful('facts-pages')
    const whole = await interpretation(s)
    const asked = rewritePages(s, page => onePerPage(page))
    expect(await interpretation(s)).toEqual(whole)
    expect(asked).toEqual(['0', '1', '2', '3'])
  })

  it('T-P7: a head that moves between pages starts the read again; one that keeps moving is unavailable after three tries', async () => {
    const s = await eventful('facts-moving')
    const whole = await interpretation(s)
    let firsts = 0
    const movingFor = (tries: number) => (page: Page, after: string) => {
      if (after === '0') firsts += 1
      const shrunk = onePerPage(page)
      return after !== '0' && firsts <= tries
        ? { ...shrunk, revision: String(BigInt(shrunk.revision) + 1n) }
        : shrunk
    }
    rewritePages(s, movingFor(1))
    expect(await interpretation(s)).toEqual(whole)
    expect(firsts).toBe(2)
    firsts = 0
    rewritePages(s, movingFor(Number.POSITIVE_INFINITY))
    expect(await readOf(s)).toMatchObject({
      kind: 'unavailable',
      diagnostic: expect.stringContaining('kept changing'),
    })
    expect(firsts).toBe(3)
  })

  it('T-P6: facts a writer stored without a body are read from the records, counted as part reads', async () => {
    const s = await eventful('facts-legacy')
    const fresh = await interpretation(s)
    if (s.controls === null) throw new Error('the double storage is expected')
    // As a writer before the body table left them: the index rows without their bodies.
    s.controls.select('DELETE FROM er_fact_body')
    const legacy = await readsDuring(s, EXECUTION_RECORD_HANDLERS.parts, () => interpretation(s))
    expect(legacy.reads).toBeGreaterThan(0)
    expect(legacy.value).toEqual(fresh)
  })

  it('an execution of another session reads as none', async () => {
    const s = await eventful('facts-other-session')
    const read = await readExecutionInterpretation(
      { storage: s.storage, tenantDomainLookup: lookup(s) },
      {
        tenant: s.access.tenant,
        session: 'another-session' as never,
        execution: s.execution,
        after: '0',
      },
    )
    expect(read).toEqual({ kind: 'read', execution: null })
  })
})

describe('a publication replaces the index of the held Session snapshot (session-storage-sql RT-04)', () => {
  it('the next readWork reads no whole snapshot, and answers what a whole read gives', async () => {
    const s = await scene('publish-index')
    if (s.controls === null) throw new Error('the double storage is expected')
    await started(s)
    await work(s)
    await committed(s, 'message', () => ({
      events: [{ kind: 'message', message: assistantMessage('m'), source: evidence('message') }],
    }))
    const from = s.controls.reads.length
    const held = await work(s)
    expect(s.controls.reads.slice(from).filter(item => item === SESSION_WORK_HANDLER)).toEqual([])
    const whole = await s.storage.read({
      domain: s.domain,
      handler: SESSION_WORK_HANDLER,
      protocol: SESSION_PROTOCOL,
      requestKey: 'publish-index-whole',
      input: { tenant: s.domain.scope.tenant, session: s.access.session },
    })
    if (whole.kind !== 'read') throw new Error('the whole read failed')
    const decoded = decodeSessionWork(whole.output)
    expect(decoded?.kind).toBe('state')
    expect(held).toEqual(decoded?.kind === 'state' ? decoded.snapshot : null)
  })
})
