// cancelRun and stopCall (Session r2.2 section 4): one operation table for every form (SL07), the
// closed failure sets, the answer-only branch and the Tool refusal before any lookup.
import { describe, expect, it } from 'vitest'
import type {
  ConsumptionId,
  ProducerRef,
  RunId,
  SessionCallTerminal,
  SessionFailure,
} from '@omne-harness/session-contract'
import {
  creation,
  evidence,
  operationId,
  refused,
  succeeded,
} from '@omne-harness/session-contract/testing'
import { open, scene } from './scene.ts'

const MODEL: ProducerRef = { kind: 'model', call: 'model-call-1' }
const TOOL: ProducerRef = { kind: 'tool', call: 'tool-call-1' }

type Scene = ReturnType<typeof scene>

const cancel = (s: Scene, name: string, run: string, urgency: 'graceful' | 'force' = 'graceful') =>
  s.commit({
    kind: 'cancelRun',
    input: { ...s.base, operation: operationId(name), run: run as RunId, urgency },
  })
const stop = (s: Scene, name: string, producer: ProducerRef) =>
  s.commit({ kind: 'stopCall', input: { ...s.base, operation: operationId(name), producer } })
const change = (s: Scene, name: string, model: string) =>
  s.commit({
    kind: 'change',
    input: {
      ...s.base,
      operation: operationId(name),
      declaration: { kind: 'model', name: model, basis: evidence(`basis-${model}`) },
    },
  })
const archive = (s: Scene, name: string) =>
  s.commit({
    kind: 'control',
    input: { ...s.base, operation: operationId(name), intent: { kind: 'archive' } },
  })

/** An open Run with one bound call. */
async function withCall(producer: ProducerRef = MODEL) {
  const s = await open()
  const { run, advance } = await s.active()
  const purpose = producer.kind === 'tool' ? ('action' as const) : ('main' as const)
  const binding = {
    producer,
    action: 'act',
    consumer: { owner: 'session', work: 'w', position: 'p', purpose },
    request: evidence('request'),
    initiatingAttempt: advance.attempt,
  }
  succeeded(
    await s.project(
      {
        ...s.base,
        run: run.run,
        execution: run.execution.execution,
        revision: '1',
        sequence: '1',
        source: evidence('call'),
        consequences: [
          {
            kind: 'call-registration',
            consumption: `c-${producer.call}` as ConsumptionId,
            registration: { kind: 'associated', binding, purpose } as never,
          },
          { kind: 'waiting', waiting: [{ kind: 'producer', binding, position: 'p' }] },
        ],
      },
      operationId('call'),
    ),
    'call',
  )
  return { s, run: run.run }
}
const ended = (producer: ProducerRef): SessionCallTerminal => ({
  producer,
  version: '1',
  outcome: 'completed',
  source: evidence('owner-settled'),
  recorded: evidence('se19-commit'),
})

describe('one operation table for every form (SL07)', () => {
  it('OD-1: a batch identity reused by cancelRun is a conflict and the Run is untouched', async () => {
    const { s, run } = await withCall()
    succeeded(await change(s, 'X', 'model-b'), 'change')
    const failure = refused(await cancel(s, 'X', run), 'cancelRun')
    expect(failure).toEqual({ kind: 'conflict', operation: operationId('X') })
    expect((await s.read()).run.kind).toBe('active')
  })

  it('OD-2: an answer-only control identity reused by another command is a conflict', async () => {
    const s = await open()
    const answer = succeeded(await cancel(s, 'X', 'run_never'), 'cancelRun')
    expect(answer.answer).toEqual({ kind: 'not-found' })
    expect(refused(await archive(s, 'X'), 'archive')).toMatchObject({ kind: 'conflict' })
    expect((await s.read()).lifecycle).not.toBe('archived')
  })

  it('OD-3: cancelRun and stopCall share the identity space', async () => {
    const { s, run } = await withCall()
    succeeded(await cancel(s, 'C', run), 'cancelRun')
    expect(refused(await stop(s, 'C', MODEL), 'stopCall')).toMatchObject({ kind: 'conflict' })
  })

  it('OD-4: queryOperation on a control identity is a conflict and leaks nothing', async () => {
    const { s } = await withCall()
    s.port.controls.recordCallTerminal(s.base.tenant, s.base.session, ended(MODEL))
    succeeded(await stop(s, 'X', MODEL), 'stopCall')
    const answer = await s.port.queryOperation({ ...s.access, operation: operationId('X') })
    expect(refused(answer, 'queryOperation')).toEqual({
      kind: 'conflict',
      operation: operationId('X'),
    })
  })

  it('OD-5: two commands racing for one identity leave exactly one committed', async () => {
    const { s, run } = await withCall()
    const both = await Promise.all([change(s, 'X', 'model-b'), cancel(s, 'X', run)])
    expect(both.filter(item => 'ok' in item)).toHaveLength(1)
    expect(both.find(item => 'failure' in item)).toMatchObject({ failure: { kind: 'conflict' } })
  })

  it('OD-6: the same cancelRun twice recalls the original answer', async () => {
    const { s, run } = await withCall()
    const first = succeeded(await cancel(s, 'X', run), 'first')
    const second = succeeded(await cancel(s, 'X', run), 'second')
    expect(second).toEqual(first)
    expect(first.answer.kind).toBe('requested')
  })

  it('OD-8: each query port answers conflict for the other form', async () => {
    const { s, run } = await withCall()
    const batch = succeeded(await change(s, 'B', 'model-b'), 'change')
    succeeded(await cancel(s, 'K', run), 'cancelRun')
    const asControl = await s.port.queryControlOperation({
      ...s.access,
      operation: batch.operation,
    })
    expect(refused(asControl, 'queryControlOperation')).toMatchObject({ kind: 'conflict' })
    const asBatch = await s.port.queryOperation({ ...s.access, operation: operationId('K') })
    expect(refused(asBatch, 'queryOperation')).toMatchObject({ kind: 'conflict' })
    const own = succeeded(
      await s.port.queryControlOperation({ ...s.access, operation: operationId('K') }),
      'own',
    )
    expect(own).toMatchObject({ kind: 'committed', receipt: { answer: { kind: 'requested' } } })
    const unseen = succeeded(
      await s.port.queryControlOperation({ ...s.access, operation: operationId('none') }),
      'unseen',
    )
    expect(unseen).toEqual({ kind: 'unknown' })
  })
})

describe('Tool targets of stopCall', () => {
  it('OD-7: unsupported is returned before the identity lookup', async () => {
    const { s } = await withCall(TOOL)
    succeeded(await change(s, 'X', 'model-b'), 'change')
    expect(refused(await stop(s, 'X', TOOL), 'stopCall')).toEqual({ kind: 'unsupported' })
    const revision = (await s.read()).revision
    expect(refused(await stop(s, 'fresh', TOOL), 'stopCall')).toEqual({ kind: 'unsupported' })
    expect((await s.read()).revision).toBe(revision)
    const query = await s.port.queryControlOperation({
      ...s.access,
      operation: operationId('fresh'),
    })
    expect(succeeded(query, 'query')).toEqual({ kind: 'unknown' })
  })

  it('answers unsupported before the session is looked up, but only after access', async () => {
    const s = scene()
    const ghost = { ...s.base, session: 'ghost' as typeof s.base.session }
    const target = (name: string, producer: ProducerRef) =>
      s.port.commit({
        access: { ...s.access, session: ghost.session },
        command: {
          kind: 'stopCall',
          input: { ...ghost, operation: operationId(name), producer },
        },
        guards: [],
      })
    expect(refused(await target('t', TOOL), 'tool on an unknown session')).toEqual({
      kind: 'unsupported',
    })
    expect(refused(await target('m', MODEL), 'model on an unknown session')).toMatchObject({
      kind: 'denied',
    })
  })

  it('does not accept a Tool target and writes no control', async () => {
    const { s } = await withCall(TOOL)
    const before = await s.read()
    refused(await stop(s, 'X', TOOL), 'stopCall')
    const after = await s.read()
    expect(after.controls).toEqual(before.controls)
    expect(after.revision).toBe(before.revision)
  })
})

describe('the answers of cancelRun', () => {
  it('requested cancels the active Run and keeps its answer after the Run ended', async () => {
    const { s, run } = await withCall()
    const first = succeeded(await cancel(s, 'X', run, 'force'), 'cancelRun')
    expect(first.answer).toMatchObject({
      kind: 'requested',
      progress: { operation: first.operation },
    })
    expect((await s.read()).run).toMatchObject({
      kind: 'terminal',
      terminal: { outcome: 'cancelled' },
    })
    expect(succeeded(await cancel(s, 'X', run, 'force'), 'again').answer.kind).toBe('requested')
  })

  it('an ended Run answers ended, saves only the answer and never advances the revision', async () => {
    const { s, run } = await withCall()
    succeeded(await cancel(s, 'first', run), 'cancel once')
    const before = await s.read()
    const rows = s.port.controls.entriesOf(s.base.tenant, s.base.session).length
    const answered = succeeded(await cancel(s, 'late', run), 'cancel again')
    expect(answered.answer).toMatchObject({
      kind: 'ended',
      terminal: { run, outcome: 'cancelled' },
    })
    expect(answered.source).toEqual(
      before.run.kind === 'terminal' ? before.run.terminal.evidence : null,
    )
    expect((await s.read()).revision).toBe(before.revision)
    expect(s.port.controls.entriesOf(s.base.tenant, s.base.session)).toHaveLength(rows)
    expect(succeeded(await cancel(s, 'late', run), 'replay')).toEqual(answered)
  })

  it('an archived session still answers ended for its cancelled Run, and a live call fails inside the set', async () => {
    const { s, run } = await withCall()
    succeeded(await archive(s, 'archive'), 'archive')
    const allowed: SessionFailure['kind'][] = [
      'denied',
      'invalid',
      'conflict',
      'commit-unknown',
      'unavailable',
      'quarantined',
    ]
    expect(succeeded(await cancel(s, 'X', run), 'cancelRun after archive').answer.kind).toBe(
      'ended',
    )
    expect(allowed).toContain(refused(await stop(s, 'Y', MODEL), 'stopCall after archive').kind)
  })
})

describe('the answers of stopCall', () => {
  it('requested for a live call, ended with the original source once the log ended it', async () => {
    const { s } = await withCall()
    expect(succeeded(await stop(s, 'one', MODEL), 'stopCall').answer.kind).toBe('requested')
    s.port.controls.recordCallTerminal(s.base.tenant, s.base.session, ended(MODEL))
    const revision = (await s.read()).revision
    const answered = succeeded(await stop(s, 'two', MODEL), 'stopCall after the end')
    expect(answered.answer).toEqual({ kind: 'ended', terminal: ended(MODEL) })
    expect(answered.source).toEqual(ended(MODEL).source)
    expect((await s.read()).revision).toBe(revision)
    expect(succeeded(await stop(s, 'one', MODEL), 'replay').answer.kind).toBe('requested')
  })

  it('a call that never belonged to the session answers not-found', async () => {
    const { s } = await withCall()
    const answer = succeeded(await stop(s, 'X', { kind: 'model', call: 'stranger' }), 'stopCall')
    expect(answer.answer).toEqual({ kind: 'not-found' })
  })
})

describe('the saved model selection', () => {
  it('is not-ready until a selection exists, then follows the saved value', async () => {
    const s = scene()
    await s.create()
    expect(refused(await s.port.readModelSelection(s.access), 'before')).toEqual({
      kind: 'not-ready',
    })
    const saved = succeeded(await change(s, 'pick', 'route-a'), 'change')
    const read = succeeded(await s.port.readModelSelection(s.access), 'read')
    expect(read.selection).toEqual({ name: 'route-a', basis: evidence('basis-route-a') })
    expect(read.source).toEqual(saved.source)
    await s.accept('later')
    const later = succeeded(await s.port.readModelSelection(s.access), 'later')
    expect(later.source).toEqual(saved.source)
    expect(later.revision).toBe((await s.read()).revision)
    expect(BigInt(later.revision) > BigInt(saved.revision)).toBe(true)
  })

  it('starts from the initial selection of the creation', async () => {
    const s = scene()
    await s.create(
      creation({ initialModelSelection: { name: 'default-route', basis: evidence('default') } }),
    )
    const read = succeeded(await s.port.readModelSelection(s.access), 'read')
    expect(read.selection.name).toBe('default-route')
  })

  it('reads an archived session and refuses an unknown one as denied', async () => {
    const s = scene()
    await s.create(creation({ initialModelSelection: { name: 'r', basis: evidence('b') } }))
    succeeded(await archive(s, 'archive'), 'archive')
    succeeded(await s.port.readModelSelection(s.access), 'archived read')
    const ghost = { ...s.access, session: 'ghost' as typeof s.access.session }
    expect(refused(await s.port.readModelSelection(ghost), 'ghost')).toMatchObject({
      kind: 'denied',
    })
  })
})
