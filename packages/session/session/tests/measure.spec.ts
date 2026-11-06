// SPEC「测量事件」: the Session segment of each face operation, the round-complete fact of a Run
// terminal, and the absence of any change when no observer is given.
import { afterEach, describe, expect, it } from 'vitest'
import type { ResidentKey, StartedRun } from '@omne-harness/session-contract'
import { creation, operationId, succeeded } from '@omne-harness/session-contract/testing'
import type { SessionMeasure, SessionMeasureEvent } from '../src/index.ts'
import { memoryBackend } from './fixtures/backends.ts'
import { harness, type Harness, type HarnessOptions } from './fixtures/harness.ts'

const open: Harness[] = []
afterEach(async () => {
  for (const h of open.splice(0)) await h.close()
})

async function service(
  options: Partial<HarnessOptions> = {},
): Promise<Readonly<{ h: Harness; events: SessionMeasureEvent[] }>> {
  const events: SessionMeasureEvent[] = []
  const h = await harness({
    backend: memoryBackend,
    measure: event => events.push(event),
    ...options,
  })
  open.push(h)
  return { h, events }
}

const candidate = creation().definition.candidate

async function startRun(h: Harness): Promise<StartedRun> {
  return succeeded(
    await h.faces('coordinator').work.startRun({
      ...h.access(),
      operation: operationId('start'),
      entry: 'interactive',
      candidate,
      instance: { owner: 'agent', id: 'instance-1' },
    }),
    'startRun',
  )
}

function finishRun(h: Harness, started: StartedRun, name = 'finish') {
  return h.faces('coordinator').work.finishRun({
    ...h.access(),
    operation: operationId(name),
    run: started.advance.run,
    expected: started.receipt.revision,
    bounded: {
      kind: 'admission-rejected',
      input: started.first,
      rejection: started.receipt.source,
    },
  })
}

describe('the Session segment', () => {
  it('a mutation emits start then end with one span, the operation and the session', async () => {
    const { h, events } = await service()
    await h.create()
    events.length = 0
    await h.accept('input-1')
    expect(events).toEqual([
      {
        kind: 'segment',
        segment: 'session',
        phase: 'start',
        span: expect.any(Number),
        operation: 'accept',
        session: h.access().session,
        tenant: h.access().tenant,
      },
      {
        kind: 'segment',
        segment: 'session',
        phase: 'end',
        span: expect.any(Number),
        operation: 'accept',
        session: h.access().session,
        tenant: h.access().tenant,
        outcome: 'ok',
      },
    ])
    const spans = events.map(event => (event.kind === 'segment' ? event.span : null))
    expect(spans[1]).toBe(spans[0])
  })

  it('a read and a directory read are segments too; a directory read names no session', async () => {
    const { h, events } = await service()
    await h.create()
    events.length = 0
    succeeded(await h.faces('coordinator').work.readWork(h.access()), 'readWork')
    succeeded(
      await h.faces('maintainer').reconciliation.pending({
        principal: 'a:tester',
        tenant: h.access().tenant,
        after: null,
        limit: 10,
      }),
      'pending',
    )
    expect(
      events.map(
        event => event.kind === 'segment' && [event.operation, event.phase, event.session],
      ),
    ).toEqual([
      ['readWork', 'start', h.access().session],
      ['readWork', 'end', h.access().session],
      ['pending', 'start', null],
      ['pending', 'end', null],
    ])
  })

  it('an answer that carries a failure ends the segment with the failure outcome', async () => {
    const { h, events } = await service()
    await h.create()
    events.length = 0
    expect(await h.faces('coordinator').work.readWork(h.other())).toHaveProperty('failure')
    expect(
      events.map(event => event.kind === 'segment' && event.phase === 'end' && event.outcome),
    ).toEqual([false, 'failure'])
  })

  it('concurrent operations get different spans, so each start finds its end', async () => {
    const { h, events } = await service()
    await h.create()
    events.length = 0
    await Promise.all([h.accept('one'), h.accept('two')])
    const starts = events.flatMap(event =>
      event.kind === 'segment' && event.phase === 'start' ? [event.span] : [],
    )
    const ends = events.flatMap(event =>
      event.kind === 'segment' && event.phase === 'end' ? [event.span] : [],
    )
    expect(new Set(starts).size).toBe(2)
    expect([...ends].sort()).toEqual([...starts].sort())
  })
})

describe('the round-complete event', () => {
  it('a Run terminal commit emits it inside the finishRun segment with run, outcome and the commit', async () => {
    const { h, events } = await service()
    await h.create()
    await h.accept('input-1')
    const started = await startRun(h)
    events.length = 0
    const answer = succeeded(await finishRun(h, started), 'finishRun')
    const receipt = answer.receipt
    expect(
      events.map(event =>
        event.kind === 'segment' ? `${event.operation}:${event.phase}` : event.kind,
      ),
    ).toEqual(['finishRun:start', 'round-complete', 'finishRun:end'])
    expect(events[1]).toEqual({
      kind: 'round-complete',
      session: h.access().session,
      tenant: h.access().tenant,
      run: started.advance.run,
      outcome: 'failed',
      revision: receipt.revision,
      entry: expect.any(String),
      operation: operationId('finish'),
    })
  })

  it('an input accept closes no Run and emits none; a recalled finishRun emits none again', async () => {
    const { h, events } = await service()
    await h.create()
    await h.accept('input-1')
    expect(events.filter(event => event.kind === 'round-complete')).toEqual([])
    const started = await startRun(h)
    succeeded(await finishRun(h, started), 'finishRun')
    expect(events.filter(event => event.kind === 'round-complete')).toHaveLength(1)
    succeeded(await finishRun(h, started), 'recall')
    expect(events.filter(event => event.kind === 'round-complete')).toHaveLength(1)
  })

  it('an instance with an observer and no notifier still reads the committed entries for it', async () => {
    const { h, events } = await service({ notifier: false })
    await h.create()
    await h.accept('input-1')
    const started = await startRun(h)
    succeeded(await finishRun(h, started), 'finishRun')
    expect(events.filter(event => event.kind === 'round-complete')).toHaveLength(1)
  })
})

describe('no observer, or an observer that fails', () => {
  it('no observer builds nothing and reads no entries when there is no notifier either', async () => {
    const h = await harness({ backend: memoryBackend, notifier: false })
    open.push(h)
    await h.create()
    await h.accept('input-1')
    const started = await startRun(h)
    h.view.reset()
    succeeded(await finishRun(h, started), 'finishRun')
    expect(h.view.calls().map(call => call.method)).not.toContain('history.begin')
  })

  it('answers are the same with and without an observer', async () => {
    const run = async (measure: SessionMeasure | undefined) => {
      const h = await harness({
        backend: memoryBackend,
        ...(measure === undefined ? {} : { measure }),
      })
      open.push(h)
      await h.create()
      await h.accept('input-1')
      const started = await startRun(h)
      const answer = succeeded(await finishRun(h, started), 'finishRun')
      return { started: started.advance.run, outcome: answer.terminal }
    }
    const events: SessionMeasureEvent[] = []
    const observed = await run(event => events.push(event))
    const plain = await run(undefined)
    expect(events.length).toBeGreaterThan(0)
    expect(observed).toEqual(plain)
  })

  it('an observer that throws changes no answer', async () => {
    const h = await harness({
      backend: memoryBackend,
      measure: () => {
        throw new Error('observer crashed')
      },
    })
    open.push(h)
    await h.create()
    const receipt = await h.accept('input-1')
    expect(receipt.recovered).toBe(false)
    const started = await startRun(h)
    expect(await finishRun(h, started)).toHaveProperty('ok')
  })
})

describe('the tenant of the events', () => {
  it('a mutation segment carries the tenant of the access at start and at end', async () => {
    const { h, events } = await service()
    await h.create()
    events.length = 0
    await h.accept('input-1')
    expect(events.map(event => (event.kind === 'segment' ? event.tenant : null))).toEqual([
      h.access().tenant,
      h.access().tenant,
    ])
  })

  it('a single-session read carries the tenant of the access', async () => {
    const { h, events } = await service()
    await h.create()
    events.length = 0
    succeeded(await h.faces('coordinator').work.readWork(h.access()), 'readWork')
    expect(events).toHaveLength(2)
    for (const event of events) expect(event.tenant).toEqual(h.access().tenant)
  })

  it('a `pending` directory read carries the tenant of its input and no system scope', async () => {
    const { h, events } = await service()
    await h.create()
    events.length = 0
    succeeded(
      await h.faces('maintainer').reconciliation.pending({
        principal: 'a:tester',
        tenant: h.access().tenant,
        after: null,
        limit: 10,
      }),
      'pending',
    )
    expect(events).toHaveLength(2)
    for (const event of events) {
      expect(event.tenant).toEqual(h.access().tenant)
      expect(event).not.toHaveProperty('scope')
    }
  })

  it('`references` and `releasedScopes` are system-scope reads: their segments carry `system` and no tenant', async () => {
    const { h, events } = await service()
    await h.create()
    events.length = 0
    const maintainer = h.faces('maintainer').reconciliation
    await maintainer.references({
      principal: 'a:tester',
      scope: 'system',
      key: 'resident-1' as ResidentKey,
      after: null,
      limit: 10,
    })
    await maintainer.releasedScopes({
      principal: 'a:tester',
      scope: 'system',
      after: null,
      limit: 10,
    })
    expect(
      events.map(event => event.kind === 'segment' && [event.operation, event.phase, event.scope]),
    ).toEqual([
      ['references', 'start', 'system'],
      ['references', 'end', 'system'],
      ['releasedScopes', 'start', 'system'],
      ['releasedScopes', 'end', 'system'],
    ])
    for (const event of events) expect(event).not.toHaveProperty('tenant')
  })

  it('the round-complete event carries the tenant of the finishing access', async () => {
    const { h, events } = await service()
    await h.create()
    await h.accept('input-1')
    const started = await startRun(h)
    events.length = 0
    succeeded(await finishRun(h, started), 'finishRun')
    const rounds = events.filter(event => event.kind === 'round-complete')
    expect(rounds).toHaveLength(1)
    expect(rounds[0]?.tenant).toEqual(h.access().tenant)
  })
})
