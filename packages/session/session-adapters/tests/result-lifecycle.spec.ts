import { expect, it } from 'vitest'
import { deriveSessionOperation } from '@omne-harness/session-contract'
import { evidence, instance, ok, operation, operationId, scene } from './fixtures/common-journal.ts'
import { memoryOtherAccess } from '@omne-harness/session-contract/testing'
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

async function lifecycle(
  name: string,
  state: Lifecycle,
  qualification = { agent: true, session: true },
) {
  const s = await resultCall(name, qualification)
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
          access: s.access,
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
        access: s.access,
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

for (const point of ['before-publish', 'after-publish'] as const)
  it(`keeps late custody and both operation answers atomic at ${point}`, async () => {
    const s = await lifecycle(`late-custody-${point}`, 'ended'),
      request = lateRequest(s, 'custody'),
      before = await observed(s, request)
    s.view.controls.faultWrite(request, 'recordResult', point)
    expect(await s.view.journal.recordResult(request)).toMatchObject({
      failure: { kind: point === 'before-publish' ? 'unavailable' : 'commit-unknown' },
    })
    const after = await observed(s, request)
    if (point === 'before-publish') expect(after).toEqual(before)
    else {
      expect(after.root).toBe(before.root + 1n)
      expect(after.agent.results[1]?.result).toEqual(request.result)
      expect(after.work.consumptions[0]?.results[1]?.custody).toEqual(evidence('late-custody'))
      expect(after.agentAnswer).toMatchObject({ ok: { kind: 'committed' } })
      expect(after.sessionAnswer).toMatchObject({ ok: { kind: 'committed' } })
    }
    const receipt = ok(await s.view.journal.recordResult(request)),
      recovered = await observed(s, request)
    expect(recovered.root).toBe(before.root + 1n)
    expect(recovered.agentAnswer).toEqual({ ok: { kind: 'committed', receipt } })
    expect(recovered.sessionAnswer).toMatchObject({ ok: { kind: 'committed' } })
    expect(recovered.rows.slice(before.rows.length).map(row => row.kind)).toEqual([
      'call.result-preserved',
    ])
    expect(recovered.work.run).toEqual(before.work.run)
  })

// The Session half of a `custody`/`processed` participation is a delegated same-log commit: the
// Agent qualification and the gap gate decide it at the execution point, and the Session access
// check is not asked a second time for the derived participation (session-contract SPEC
// 「当前操作的访问裁定」, delegated operations share the internal path).
for (const kind of ['custody', 'processed'] as const)
  it(`does not ask the Session access check for the delegated ${kind} participation`, async () => {
    const s = await lifecycle(`late-${kind}-delegated`, 'ended'),
      request = lateRequest(s, kind),
      before = s.accessCheck.controls.asked().length
    // Whatever the Session half answers (custody is preserved; processed conflicts with the
    // ended Run), the derived participation never reaches the Session access check.
    await s.view.journal.recordResult(request)
    expect(s.accessCheck.controls.asked().slice(before)).toEqual([])
  })

for (const kind of ['custody', 'processed'] as const)
  for (const boundary of ['agent', 'gap'] as const)
    it(`preserves the ${boundary} failure when ${kind} is paused before publication`, async () => {
      const qualification = { agent: true, session: true },
        s = await lifecycle(`late-${kind}-${boundary}`, 'ended', qualification),
        request = lateRequest(s, kind),
        before = await observed(s, request),
        pause = s.view.controls.pauseWrite(request, 'recordResult'),
        writing = s.view.journal.recordResult(request)
      await pause.reached
      if (boundary === 'gap') s.view.controls.quarantine('confirmed result history gap')
      else qualification[boundary] = false
      pause.release()
      expect(await writing).toMatchObject({
        failure: { kind: boundary === 'gap' ? 'unavailable' : 'denied' },
      })
      qualification.agent = true
      qualification.session = true
      expect(s.view.controls.root()).toBe(before.root)
      expect(s.backend.controls.entriesOf(s.access.tenant, s.access.session)).toEqual(before.rows)
      if (boundary === 'gap') {
        expect(await s.view.journal.load(request)).toMatchObject({
          failure: { kind: 'unavailable', diagnostic: 'confirmed result history gap' },
        })
        expect(await s.view.journal.query(request)).toEqual(before.agentAnswer)
      } else expect(await observed(s, request)).toEqual(before)
    })

for (const kind of ['custody', 'processed'] as const)
  it(`rechecks the original ${kind} position after a paused request loses its active Run`, async () => {
    const s = await lifecycle(`result-root-change-${kind}`, 'active'),
      request = lateRequest(s, kind),
      pause = s.view.controls.pauseWrite(request, 'recordResult'),
      writing = s.view.journal.recordResult(request)
    await pause.reached
    expect(ok(await end(s))).toMatchObject({ kind: 'ended' })
    ok(
      await s.backend.controls.interpret({
        ...s.access,
        execution: s.execution,
        sequence: '2',
        operation: operationId('concurrent-ended'),
      }),
    )
    await accept(s, 'successor-input')
    const successor = ok(await start(s, 'successor')),
      before = await observed(s, request),
      successorBefore = ok(
        await successor.view.journal.load({ ...s.access, execution: successor.execution }),
      )
    pause.release()
    const response = await writing
    if (kind === 'processed') {
      expect(response).toEqual({ failure: { kind: 'conflict', operation: request.operation } })
      expect(await observed(s, request)).toEqual(before)
    } else {
      expect(response, JSON.stringify(response)).toHaveProperty('ok')
      const after = await observed(s, request)
      expect(after.root).toBe(before.root + 1n)
      expect(after.work.run).toEqual(before.work.run)
      expect(after.work.consumptions[0]?.binding).toEqual(s.original.consumptions[0]?.binding)
      expect(after.agent.results[1]?.result).toEqual(request.result)
    }
    expect(
      ok(await successor.view.journal.load({ ...s.access, execution: successor.execution })),
    ).toEqual(successorBefore)
  })

it('does not replace missing original Pending material with the current execution or a claimed result', async () => {
  const s = await scene('missing-original-pending'),
    tool = toolCall(s.access.tenant, 'missing-original-pending'),
    request: ResultRequest = {
      ...s.access,
      execution: s.execution,
      operation: operation('missing-original'),
      consumption: tool.pending.consumption,
      result: tool.placeholder,
      release: { kind: 'pending' },
      transfer: {
        kind: 'custody',
        consumption: tool.pending.consumption,
        result: tool.placeholder,
        retained: evidence('claimed-custody'),
      },
    },
    root = s.view.controls.root(),
    agent = ok(await s.view.journal.load(request)),
    work = ok(await s.backend.transactions.readWork(s.access))
  expect(await s.view.journal.recordResult(request)).toMatchObject({
    failure: { kind: 'unavailable', diagnostic: 'result original pending and invocation' },
  })
  expect(s.view.controls.root()).toBe(root)
  expect(ok(await s.view.journal.load(request))).toEqual(agent)
  expect(ok(await s.backend.transactions.readWork(s.access))).toEqual(work)
  expect(await s.view.journal.query(request)).toEqual({ ok: { kind: 'unknown' } })
})

it('rejects a foreign tenant and an unrelated call without weakening late custody validation', async () => {
  const s = await lifecycle('late-custody-scope', 'ended'),
    request = lateRequest(s, 'custody'),
    before = await observed(s, request),
    other = toolCall(s.access.tenant, 'unrelated-binding'),
    mismatched: ResultRequest = {
      ...request,
      result: other.placeholder,
      transfer: {
        kind: 'custody',
        consumption: request.consumption,
        result: other.placeholder,
        retained: evidence('unrelated-custody'),
      },
    }
  expect(
    await s.view.journal.recordResult({ ...request, tenant: memoryOtherAccess('tester').tenant }),
  ).toMatchObject({ failure: { kind: 'denied' } })
  expect(await s.view.journal.recordResult(mismatched)).toMatchObject({
    failure: { kind: 'unavailable' },
  })
  expect(await observed(s, request)).toEqual(before)
})
