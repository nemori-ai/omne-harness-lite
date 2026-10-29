import { expect, it } from 'vitest'
import { deriveSessionOperation } from '@omne-harness/session-contract'
import { evidence, instance, ok, operation, operationId } from './fixtures/common-journal.ts'
import { resultCall } from './fixtures/result-call.ts'
import { accept, end, start, take } from './fixtures/progression.ts'
import { toolCall } from './fixtures/tool-call.ts'

type ResultScene = Awaited<ReturnType<typeof resultCall>>
type ResultRequest = Parameters<ResultScene['view']['journal']['recordResult']>[0]
type Lifecycle = 'active' | 'ended' | 'successor' | 'archived'

function lateRequest(s: ResultScene, kind: 'custody' | 'processed'): ResultRequest {
  const result = { ...s.request.result, version: 'late-v2', source: evidence('late-result') }
  return {
    ...s.request,
    operation: operation(`late-${kind}`),
    result,
    transfer:
      kind === 'custody'
        ? { kind, result, consumption: s.request.consumption, retained: evidence('late-custody') }
        : { kind, result, consumption: s.request.consumption, completion: evidence('late-done') },
  }
}

function sessionOperation(s: ResultScene, request: ResultRequest) {
  if (request.transfer.kind === 'none') throw new Error('result participation required')
  return {
    ...s.access,
    operation: deriveSessionOperation({
      kind: 'participation',
      execution: request.execution,
      operation: request.operation,
      joint: request.transfer.kind,
    }),
  }
}

async function observed(s: ResultScene, request: ResultRequest) {
  return {
    root: s.view.controls.root(),
    agent: ok(await s.view.journal.load(request)),
    work: ok(await s.backend.transactions.readWork(s.access)),
    rows: s.backend.controls.entriesOf(s.access.tenant, s.access.session),
    agentAnswer: await s.view.journal.query(request),
    sessionAnswer: await s.backend.transactions.queryOperation(sessionOperation(s, request)),
  }
}

async function lifecycle(name: string, state: Lifecycle) {
  const s = await resultCall(name)
  await take(s)
  ok(
    await s.backend.controls.interpret({
      ...s.access,
      execution: s.execution,
      sequence: '1',
      operation: operationId('original-taken'),
    }),
  )
  ok(await s.view.journal.recordResult(s.request))
  const original = ok(await s.backend.transactions.readWork(s.access))
  if (original.run.kind !== 'active') throw new Error('original active Run required')
  if (state !== 'active') {
    expect(ok(await end(s))).toMatchObject({ kind: 'ended' })
    ok(
      await s.backend.controls.interpret({
        ...s.access,
        execution: s.execution,
        sequence: '2',
        operation: operationId('original-ended'),
      }),
    )
    if (state === 'successor') {
      await accept(s, 'successor-input')
      ok(await start(s, 'successor'))
    }
    if (state === 'archived')
      ok(
        await s.backend.transactions.commit({
          command: {
            kind: 'control',
            input: { ...s.access, operation: operationId('archive'), intent: { kind: 'archive' } },
          },
          guards: [],
        }),
      )
  }
  return { ...s, original, originalRun: original.run.run }
}

for (const state of ['active', 'ended', 'successor', 'archived'] as const)
  it(`preserves qualified original Tool custody after ${state} without changing the current Run`, async () => {
    const s = await lifecycle(`late-custody-${state}`, state),
      request = lateRequest(s, 'custody'),
      before = await observed(s, request),
      response = await s.view.journal.recordResult(request)
    expect(response, JSON.stringify(response)).toHaveProperty('ok')
    const receipt = ok(response),
      after = await observed(s, request),
      originalPosition = s.original.consumptions[0],
      position = after.work.consumptions.find(item => item.id === originalPosition?.id)
    expect(after.root).toBe(before.root + 1n)
    expect(after.agent.results).toHaveLength(2)
    expect(after.agent.results[1]).toMatchObject({
      result: request.result,
      consumption: request.consumption,
      custody: evidence('late-custody'),
      completion: null,
      release: { kind: 'pending' },
    })
    expect(position?.binding).toEqual(originalPosition?.binding)
    expect(position?.results).toHaveLength(2)
    expect(position?.results[1]).toMatchObject({
      result: { ...request.result, producer: originalPosition?.binding.producer },
      custody: evidence('late-custody'),
      completion: null,
      release: 'pending',
    })
    expect(after.rows.slice(before.rows.length).map(row => row.kind)).toEqual([
      'call.result-preserved',
    ])
    expect(after.work.pending).toEqual(before.work.pending)
    expect(after.work.waiting).toEqual(before.work.waiting)
    if (state === 'active') {
      expect(after.work.run).toMatchObject({
        run: s.originalRun,
        execution: { execution: s.execution, readThrough: '1' },
      })
    } else expect(after.work.run).toEqual(before.work.run)
    expect(after.agentAnswer).toEqual({ ok: { kind: 'committed', receipt } })
    expect(after.sessionAnswer).toMatchObject({ ok: { kind: 'committed' } })
    expect(ok(await s.view.journal.recordResult(request))).toEqual(receipt)
    expect(s.view.controls.root()).toBe(after.root)
    expect(
      await s.view.journal.recordResult({
        ...request,
        release: { kind: 'confirmed', receipt: evidence('different-input') },
      }),
    ).toMatchObject({ failure: { kind: 'conflict', operation: request.operation } })
    expect(s.view.controls.root()).toBe(after.root)
  })

for (const state of ['ended', 'successor', 'archived'] as const)
  it(`reports a recordResult position conflict after ${state} without publishing either result answer`, async () => {
    const s = await lifecycle(`late-processed-${state}`, state),
      request = lateRequest(s, 'processed'),
      before = await observed(s, request),
      response = await s.view.journal.recordResult(request)
    expect(response).toEqual({ failure: { kind: 'conflict', operation: request.operation } })
    expect(await observed(s, request)).toEqual(before)
  })

it('processes a new version at the active original execution and recognizes the same operation', async () => {
  const s = await lifecycle('active-processed', 'active'),
    request = lateRequest(s, 'processed'),
    before = await observed(s, request),
    receipt = ok(await s.view.journal.recordResult(request)),
    after = await observed(s, request)
  expect(after.root).toBe(before.root + 1n)
  expect(after.agent.results[1]).toMatchObject({
    result: request.result,
    consumption: request.consumption,
    completion: evidence('late-done'),
  })
  expect(after.work.consumptions[0]?.results[1]?.completion).toEqual(evidence('late-done'))
  expect(after.rows.slice(before.rows.length).map(row => row.kind)).toEqual([
    'call.result-processed',
  ])
  expect(after.agentAnswer).toEqual({ ok: { kind: 'committed', receipt } })
  expect(after.sessionAnswer).toMatchObject({ ok: { kind: 'committed' } })
  expect(ok(await s.view.journal.recordResult(request))).toEqual(receipt)
  expect(s.view.controls.root()).toBe(after.root)
})

for (const kind of ['custody', 'processed'] as const)
  it(`keeps ${kind} on the original call after a new attempt takes over the same active execution`, async () => {
    const s = await lifecycle(`same-execution-${kind}`, 'active'),
      before = ok(await s.backend.transactions.readWork(s.access))
    if (before.run.kind !== 'active') throw new Error('active Run required')
    const claimed = ok(
      await s.backend.transactions.commit({
        command: {
          kind: 'claim',
          input: {
            ...s.access,
            operation: operationId('claim'),
            run: before.run.run,
            instance: { owner: 'agent', id: 'successor-instance' },
            continuity: evidence('continuity'),
          },
        },
        guards: [],
      }),
    )
    ok(
      await s.view.journal.attach({
        ...s.access,
        execution: s.execution,
        operation: operation('reattach'),
        instance: instance('successor-instance'),
        grant: claimed.receipt.source,
        recovery: evidence('recovery'),
        takeover: evidence('takeover'),
      }),
    )
    const request = lateRequest(s, kind),
      response = await s.view.journal.recordResult(request)
    expect(response, JSON.stringify(response)).toHaveProperty('ok')
    const after = ok(await s.backend.transactions.readWork(s.access))
    expect(after.consumptions[0]?.binding).toEqual(before.consumptions[0]?.binding)
    expect(after.run).toMatchObject({ run: before.run.run, execution: { execution: s.execution } })
    if (after.run.kind !== 'active') throw new Error('active Run required')
    expect(after.run.advance?.attempt).not.toBe(before.run.advance?.attempt)
    expect(after.consumptions[0]?.binding.initiatingAttempt).toBe(before.run.advance?.attempt)
    expect(ok(await s.view.journal.load(request)).results[1]?.result).toEqual(request.result)
    expect(after.consumptions[0]?.results).toHaveLength(2)
  })

it('custody does not interpret an unrelated waiting event or advance its readThrough', async () => {
  const s = await lifecycle('custody-independent-interpretation', 'active'),
    other = toolCall(s.access.tenant, 'unrelated'),
    loaded = ok(await s.view.journal.load(s.request)),
    waits = [{ kind: 'producer' as const, pending: other.pending }]
  ok(
    await s.view.journal.commit({
      ...s.access,
      execution: s.execution,
      operation: operation('unrelated-wait'),
      authority: s.opened.authority,
      expected: loaded.revision,
      checkpoint: { ...loaded.checkpoint, calls: [other.pending] },
      state: { kind: 'waiting', waits },
      events: [{ kind: 'waiting', waits }],
      effects: [
        { action: other.pending.action, pending: other.pending, authority: s.opened.authority },
      ],
      caller: { kind: 'none' },
      replyAdmission: null,
    }),
  )
  const request = lateRequest(s, 'custody'),
    before = await observed(s, request),
    metrics = s.backend.controls.frontierMetrics()
  ok(await s.view.journal.recordResult(request))
  const after = await observed(s, request)
  expect(after.work.run).toMatchObject({ execution: { readThrough: '1' } })
  expect(after.work.waiting).toEqual(before.work.waiting)
  expect(after.work.consumptions.map(item => item.binding)).toEqual(
    before.work.consumptions.map(item => item.binding),
  )
  expect(after.rows.slice(before.rows.length).map(row => row.kind)).toEqual([
    'call.result-preserved',
  ])
  expect(s.backend.controls.frontierMetrics()).toEqual(metrics)
})
