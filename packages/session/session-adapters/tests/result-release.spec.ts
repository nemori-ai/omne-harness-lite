import { expect, it } from 'vitest'
import { evidence, ok, operation, operationId } from './fixtures/common-journal.ts'
import { resultCall } from './fixtures/result-call.ts'
import { writeJsonText } from '@omne-harness/json-text'
import {
  decodeAgentExecutionId,
  decodeActionId,
  type PendingCall,
} from '@omne-harness/agent-contract'
import { sampleReceivedModelResult } from '@omne-harness/agent-contract/testing'
import { resolveModelInvocationRef } from '@omne-harness/model-contract'
import { deriveDriveOperation } from '@omne-harness/session-contract'
import { memoryAccess, memoryOtherAccess } from '@omne-harness/session-contract/testing'
import { toolCall } from './fixtures/tool-call.ts'
import { accept, end, start, take } from './fixtures/progression.ts'

type ResultScene = Awaited<ReturnType<typeof resultCall>>
type ResultRequest = Parameters<ResultScene['view']['journal']['recordResult']>[0]
const confirmation = (request: ResultRequest, name: string): ResultRequest => ({
  ...request,
  operation: operation(name),
  transfer: { kind: 'none' },
  release: { kind: 'confirmed', receipt: evidence(name) },
})
function releaseRows(s: ResultScene) {
  return s.backend.controls.entriesOf(s.access.tenant, s.access.session).flatMap(row => {
    if (row.kind !== 'call.execution-fact') return []
    const value: unknown = JSON.parse(writeJsonText(row.payload))
    if (typeof value !== 'object' || value === null || !('fact' in value))
      throw new Error('invalid committed fact payload')
    const fact = value.fact
    if (typeof fact !== 'object' || fact === null || !('kind' in fact))
      throw new Error('invalid committed producer fact')
    if (fact.kind !== 'release') return []
    if (!('source' in fact)) throw new Error('release without original source')
    return [{ row, source: fact.source }]
  })
}
async function confirmed(name: string, qualification = { agent: true, session: true }) {
  const s = await resultCall(name, qualification)
  ok(await s.view.journal.recordResult(s.request))
  const request = confirmation(s.request, 'confirmation')
  ok(await s.view.journal.recordResult(request))
  return {
    ...s,
    confirmation: request,
    reconcile: { ...s.access, execution: s.execution, operation: operationId('reconcile') },
  }
}

for (const retainedBy of ['custody', 'processed'] as const)
  it(`projects an original Tool release receipt after ${retainedBy} without repeating the result or either answer`, async () => {
    const s = await resultCall('release-original')
    ok(
      await s.view.journal.recordResult({
        ...s.request,
        transfer:
          retainedBy === 'custody'
            ? s.request.transfer
            : {
                kind: 'processed',
                consumption: s.request.consumption,
                result: s.request.result,
                completion: evidence('processed'),
              },
      }),
    )
    const request = {
      ...s.request,
      operation: operation('producer-release'),
      transfer: { kind: 'none' as const },
      release: { kind: 'confirmed' as const, receipt: evidence('producer-release') },
    }
    const confirmation = ok(await s.view.journal.recordResult(request)),
      agent = ok(await s.view.journal.load(request)),
      before = ok(await s.backend.transactions.readWork(s.access)),
      reconcile = { ...s.access, execution: s.execution, operation: operationId('reconcile') }
    expect(agent.results[0]?.release).toEqual(request.release)
    expect(before.consumptions[0]?.results[0]?.release).toBe('pending')
    const receipt = ok(await s.backend.controls.reconcile(reconcile)),
      after = ok(await s.backend.transactions.readWork(s.access))
    expect(after.consumptions[0]?.results[0]?.release).toBe('confirmed')
    expect(receipt).not.toBeNull()
    expect(releaseRows(s).map(item => item.source)).toEqual([request.release.receipt])
    expect(ok(await s.backend.transactions.queryOperation(reconcile))).toEqual({
      kind: 'committed',
      receipt,
    })
    const root = s.view.controls.root()
    expect(ok(await s.view.journal.recordResult(request))).toEqual(confirmation)
    expect(ok(await s.backend.controls.reconcile(reconcile))).toMatchObject({
      ...receipt,
      recovered: true,
    })
    expect(
      ok(
        await s.backend.controls.reconcile({
          ...reconcile,
          operation: operationId('already-released'),
        }),
      ),
    ).toBeNull()
    expect(s.view.controls.root()).toBe(root)
    expect(ok(await s.view.journal.load(request))).toEqual(agent)
    expect(after.consumptions[0]?.results).toHaveLength(1)
  })

for (const point of ['before-publish', 'after-publish'] as const)
  it(`keeps the Agent confirmation separate from a ${point} Session fault and recovers the original operation`, async () => {
    const s = await confirmed(`release-${point}`),
      agent = ok(await s.view.journal.load(s.request)),
      root = s.view.controls.root()
    s.backend.controls.faultSession(s.reconcile, point)
    expect(await s.backend.controls.reconcile(s.reconcile)).toMatchObject({
      failure: { kind: point === 'before-publish' ? 'unavailable' : 'commit-unknown' },
    })
    expect(ok(await s.view.journal.load(s.request))).toEqual(agent)
    expect(releaseRows(s)).toHaveLength(point === 'before-publish' ? 0 : 1)
    expect(s.view.controls.root()).toBe(root + (point === 'after-publish' ? 1n : 0n))
    expect(ok(await s.backend.transactions.queryOperation(s.reconcile)).kind).toBe(
      point === 'before-publish' ? 'unknown' : 'committed',
    )
    const receipt = ok(await s.backend.controls.reconcile(s.reconcile)),
      published = s.view.controls.root()
    expect(ok(await s.backend.controls.reconcile(s.reconcile))).toMatchObject({
      ...receipt,
      recovered: true,
    })
    expect(s.view.controls.root()).toBe(published)
    expect(releaseRows(s)).toHaveLength(1)
  })

for (const boundary of ['agent', 'session', 'gap'] as const)
  it(`rechecks ${boundary} after a paused release interpretation without publishing or losing Agent custody`, async () => {
    const qualification = { agent: true, session: true },
      s = await confirmed(`release-${boundary}`, qualification),
      root = s.view.controls.root(),
      pause = s.backend.controls.pauseSession(s.reconcile),
      pending = s.backend.controls.reconcile(s.reconcile)
    await pause.reached
    if (boundary === 'gap') s.view.controls.quarantine('release gap')
    else qualification[boundary] = false
    pause.release()
    expect(await pending).toMatchObject({
      failure: { kind: boundary === 'gap' ? 'quarantined' : 'denied' },
    })
    expect(s.view.controls.root()).toBe(root)
    expect(releaseRows(s)).toEqual([])
    qualification.agent = true
    qualification.session = true
    if (boundary !== 'gap')
      expect(ok(await s.view.journal.load(s.request)).results[0]?.release.kind).toBe('confirmed')
  })

it('keeps multiple Tool versions and consumptions distinct in one Session publication and one operation answer', async () => {
  const s = await resultCall('release-many')
  const requests: ResultRequest[] = []
  for (const version of ['one', 'two', 'still-pending']) {
    const result = { ...s.request.result, version, delivery: version, source: evidence(version) }
    const request = {
      ...s.request,
      operation: operation(`custody-${version}`),
      result,
      transfer: { ...s.request.transfer, result },
    }
    ok(await s.view.journal.recordResult(request))
    requests.push(request)
  }
  const other = toolCall(s.access.tenant, 'second-consumption'),
    loaded = ok(await s.view.journal.load(s.request))
  ok(
    await s.view.journal.commit({
      ...s.access,
      execution: s.execution,
      operation: operation('other-pending'),
      authority: s.opened.authority,
      expected: loaded.revision,
      checkpoint: { ...loaded.checkpoint, batch: other.batch },
      state: { kind: 'advancing' },
      events: [],
      effects: [
        { action: other.pending.action, pending: other.pending, authority: s.opened.authority },
      ],
      caller: { kind: 'none' },
      replyAdmission: null,
    }),
  )
  const otherRequest = {
    ...s.request,
    operation: operation('other-custody'),
    consumption: other.pending.consumption,
    result: other.placeholder,
    transfer: {
      ...s.request.transfer,
      consumption: other.pending.consumption,
      result: other.placeholder,
    },
  }
  ok(await s.view.journal.recordResult(otherRequest))
  requests.push(otherRequest)
  for (const [index, request] of requests.entries())
    if (request.result.version !== 'still-pending')
      ok(await s.view.journal.recordResult(confirmation(request, `confirm-${index}`)))
  const root = s.view.controls.root(),
    before = ok(await s.backend.transactions.readWork(s.access)),
    reconcile = { ...s.access, execution: s.execution, operation: operationId('many') }
  const receipt = ok(await s.backend.controls.reconcile(reconcile)),
    after = ok(await s.backend.transactions.readWork(s.access)),
    rows = releaseRows(s)
  expect(rows).toHaveLength(3)
  expect(new Set(rows.map(item => item.row.revision)).size).toBe(1)
  expect(new Set(rows.map(item => item.row.id)).size).toBe(3)
  expect(s.view.controls.root()).toBe(root + 1n)
  expect(BigInt(after.revision)).toBe(BigInt(before.revision) + 1n)
  expect(
    after.consumptions.flatMap(item =>
      item.results.map(value => [item.id, value.result.version, value.release]),
    ),
  ).toEqual([
    [s.request.consumption, 'one', 'confirmed'],
    [s.request.consumption, 'two', 'confirmed'],
    [s.request.consumption, 'still-pending', 'pending'],
    [otherRequest.consumption, otherRequest.result.version, 'confirmed'],
  ])
  expect(rows.map(item => item.source)).toEqual([
    evidence('confirm-0'),
    evidence('confirm-1'),
    evidence('confirm-3'),
  ])
  expect(ok(await s.backend.transactions.queryOperation(reconcile))).toEqual({
    kind: 'committed',
    receipt,
  })
})

it('rejecting one of several release commands leaves every release and the reconcile answer unpublished', async () => {
  let armed = false,
    checked = 0
  const qualification = {
      agent: true,
      get session() {
        return !armed || ++checked !== 2
      },
    },
    s = await resultCall('release-atomic-refusal', qualification)
  for (const version of ['one', 'two']) {
    const result = { ...s.request.result, version },
      request = {
        ...s.request,
        operation: operation(version),
        result,
        transfer: { ...s.request.transfer, result },
      }
    ok(await s.view.journal.recordResult(request))
    ok(await s.view.journal.recordResult(confirmation(request, `confirmed-${version}`)))
  }
  const root = s.view.controls.root(),
    reconcile = { ...s.access, execution: s.execution, operation: operationId('atomic') },
    before = ok(await s.backend.transactions.readWork(s.access))
  armed = true
  expect(await s.backend.controls.reconcile(reconcile)).toMatchObject({
    failure: { kind: 'denied' },
  })
  expect(checked).toBe(2)
  expect(s.view.controls.root()).toBe(root)
  expect(releaseRows(s)).toEqual([])
  expect(ok(await s.backend.transactions.readWork(s.access))).toEqual(before)
  expect(ok(await s.backend.transactions.queryOperation(reconcile))).toEqual({ kind: 'unknown' })
  armed = false
  ok(await s.backend.controls.reconcile(reconcile))
  expect(releaseRows(s)).toHaveLength(2)
})

it('does not release another version, consumption, execution or Session by reusing a confirmation', async () => {
  const s = await resultCall('release-isolation')
  ok(await s.view.journal.recordResult(s.request))
  for (const variant of ['version', 'delivery', 'source', 'consumption', 'call'] as const) {
    const request = confirmation(s.request, variant),
      root = s.view.controls.root()
    expect(
      await s.view.journal.recordResult({
        ...request,
        ...(variant === 'consumption'
          ? { consumption: toolCall(s.access.tenant, 'foreign').pending.consumption }
          : {
              result: {
                ...request.result,
                ...(variant === 'call'
                  ? {
                      producer: {
                        kind: 'tool' as const,
                        call: toolCall(s.access.tenant, 'other-call').call,
                      },
                    }
                  : variant === 'version'
                    ? { version: 'missing' }
                    : variant === 'delivery'
                      ? { delivery: 'foreign' }
                      : { source: evidence('foreign') }),
              },
            }),
      }),
    ).toMatchObject({ failure: { kind: 'conflict' } })
    expect(s.view.controls.root()).toBe(root)
  }
  ok(await s.view.journal.recordResult(confirmation(s.request, 'valid')))
  const root = s.view.controls.root(),
    reconcile = { ...s.access, execution: s.execution, operation: operationId('scope') }
  expect(
    await s.backend.controls.reconcile({
      ...reconcile,
      session: memoryAccess('tester', 'foreign-session').session,
    }),
  ).toMatchObject({ failure: { kind: 'denied' } })
  expect(
    await s.backend.controls.reconcile({ ...reconcile, tenant: memoryOtherAccess('other').tenant }),
  ).toMatchObject({ failure: { kind: 'denied' } })
  expect(
    await s.view.journal.recordResult({
      ...confirmation(s.request, 'foreign-tenant'),
      tenant: memoryOtherAccess('other').tenant,
    }),
  ).toMatchObject({ failure: { kind: 'denied' } })
  expect(
    await s.backend.controls.reconcile({
      ...reconcile,
      execution: ok(decodeAgentExecutionId('foreign-execution')),
    }),
  ).toMatchObject({ failure: { kind: 'denied' } })
  expect(s.view.controls.root()).toBe(root)
  ok(await s.backend.controls.reconcile(reconcile))
  expect(
    await s.backend.controls.reconcile({
      ...reconcile,
      execution: ok(decodeAgentExecutionId('foreign-execution')),
    }),
  ).toMatchObject({ failure: { kind: 'conflict' } })
  expect(releaseRows(s)).toHaveLength(1)
})

it('projects late custody release on an ended execution and its original Run after a successor starts', async () => {
  const s = await resultCall('release-old-run')
  ok(await s.view.journal.recordResult(s.request))
  await take(s)
  expect(await end(s)).toMatchObject({ failure: { kind: 'changed' } })
  expect(ok(await s.view.journal.load(s.request)).state.kind).not.toBe('ended')
  ok(
    await s.backend.controls.interpret({
      ...s.access,
      execution: s.execution,
      sequence: '1',
      operation: operationId('taken'),
    }),
  )
  expect(ok(await end(s, 'end-after-taken')).kind).toBe('ended')
  ok(
    await s.backend.controls.interpret({
      ...s.access,
      execution: s.execution,
      sequence: '2',
      operation: operationId('ended'),
    }),
  )
  await accept(s, 'successor-input')
  const successor = ok(await start(s)),
    before = ok(await s.backend.transactions.readWork(s.access))
  ok(await s.view.journal.recordResult(confirmation(s.request, 'late-confirmation')))
  ok(
    await s.backend.controls.reconcile({
      ...s.access,
      execution: s.execution,
      operation: operationId('late-reconcile'),
    }),
  )
  const after = ok(await s.backend.transactions.readWork(s.access))
  expect(after.run).toEqual(before.run)
  expect(after.run).toMatchObject({ kind: 'active', execution: { execution: successor.execution } })
  expect(after.executions?.find(item => item.execution.execution === s.execution)?.run).toBe(
    before.executions?.find(item => item.execution.execution === s.execution)?.run,
  )
  expect(releaseRows(s).map(item => item.source)).toEqual([evidence('late-confirmation')])
})

it('publishes independently proved control progress and Tool release in one fully reduced Session batch', async () => {
  const s = await confirmed('release-and-control'),
    control = operationId('stop'),
    target = operation(deriveDriveOperation({ kind: 'control', execution: s.execution, control }))
  ok(
    await s.backend.transactions.commit({
      command: {
        kind: 'control',
        input: {
          ...s.access,
          operation: control,
          intent: { kind: 'stop-call', producer: { kind: 'tool', call: s.tool.pending.reference } },
        },
      },
      guards: [],
    }),
  )
  ok(
    await s.view.journal.control({
      ...s.access,
      execution: s.execution,
      operation: target,
      command: { kind: 'interrupt-tool', call: s.tool.call, reason: evidence('stop') },
    }),
  )
  ok(
    await s.view.journal.recordControl({
      ...s.access,
      execution: s.execution,
      operation: operation('intent'),
      target,
      stage: 'intent-established',
      state: 'reached',
      source: evidence('intent'),
    }),
  )
  ok(
    await s.view.journal.recordControl({
      ...s.access,
      execution: s.execution,
      operation: operation('stop-confirmed'),
      target,
      stage: 'producer-confirmed',
      state: 'reached',
      source: evidence('stop-confirmed'),
    }),
  )
  const root = s.view.controls.root(),
    before = ok(await s.backend.transactions.readWork(s.access)),
    offset = s.backend.controls.entriesOf(s.access.tenant, s.access.session).length
  ok(await s.backend.controls.reconcile(s.reconcile))
  const after = ok(await s.backend.transactions.readWork(s.access)),
    rows = s.backend.controls.entriesOf(s.access.tenant, s.access.session).slice(offset)
  expect(rows.map(row => row.kind)).toEqual([
    'control.progress',
    'history.annotated',
    'call.execution-fact',
  ])
  expect(new Set(rows.map(row => row.revision)).size).toBe(1)
  expect(new Set(rows.map(row => row.id)).size).toBe(3)
  expect(s.view.controls.root()).toBe(root + 1n)
  expect(BigInt(after.revision)).toBe(BigInt(before.revision) + 1n)
  expect(after.controls[0]).toMatchObject({ state: 'reconciled' })
  expect(after.controls[0]?.pending).toEqual([])
  expect(after.consumptions[0]?.results[0]?.release).toBe('confirmed')
  expect(releaseRows(s).map(item => item.source)).toEqual([evidence('confirmation')])
  expect(rows.at(-1)?.origin.source).toEqual(evidence('confirmation'))
  expect(
    ok(await s.view.journal.load(s.request)).controls[0]?.stages['duty-released'],
  ).toBeUndefined()
})

it('rechecks a gap raised by the final qualification callback before publishing the release batch', async () => {
  let armed = false,
    reads = 0,
    closeGate = () => {}
  const qualification = {
      agent: true,
      get session() {
        if (armed && ++reads === 2) closeGate()
        return true
      },
    },
    s = await confirmed('release-final-gap', qualification)
  closeGate = () => s.view.controls.quarantine('qualification observed gap')
  const root = s.view.controls.root()
  armed = true
  expect(await s.backend.controls.reconcile(s.reconcile)).toMatchObject({
    failure: { kind: 'quarantined' },
  })
  expect(reads).toBe(2)
  expect(s.view.controls.root()).toBe(root)
  expect(releaseRows(s)).toEqual([])
})

it('leaves Model confirmation unresolved through reconciliation and the existing receive release boundary', async () => {
  const s = await resultCall('release-model-boundary'),
    entry = sampleReceivedModelResult(s.access.tenant, 'release-model')
  if (entry.delivery.producer !== 'model') throw new Error('Model fixture expected')
  const call = ok(resolveModelInvocationRef(entry.delivery.key.reference, s.access.tenant)).call,
    pending: Extract<PendingCall, { kind: 'model' }> = {
      kind: 'model',
      purpose: 'main',
      action: ok(decodeActionId('model-action')),
      reference: entry.delivery.key.reference,
      consumption: entry.consumption,
      position: entry.consumer,
      fixed: evidence('model-request'),
    },
    loaded = ok(await s.view.journal.load(s.request)),
    result = {
      producer: { kind: 'model' as const, call },
      version: 'model-result',
      delivery: 'delivery',
      source: evidence('model-settlement'),
    }
  ok(
    await s.view.journal.commit({
      ...s.access,
      execution: s.execution,
      operation: operation('model-pending'),
      authority: s.opened.authority,
      expected: loaded.revision,
      checkpoint: { ...loaded.checkpoint, calls: [pending] },
      state: { kind: 'advancing' },
      events: [],
      effects: [{ pending, action: pending.action, authority: s.opened.authority }],
      caller: { kind: 'none' },
      replyAdmission: null,
    }),
  )
  const request = {
    ...s.request,
    operation: operation('model-result'),
    consumption: pending.consumption,
    result,
    transfer: { kind: 'none' as const },
  }
  ok(await s.view.journal.recordResult(request))
  ok(
    await s.backend.controls.reconcile({
      ...s.access,
      execution: s.execution,
      operation: operationId('model-snapshot'),
    }),
  )
  const snapshot = ok(await s.backend.transactions.readWork(s.access)),
    position = snapshot.consumptions.find(item => String(item.id) === String(pending.consumption))
  if (!position?.results[0]) throw new Error('original Model result expected')
  const root = s.view.controls.root()
  expect(position.results[0].release).toBe('pending')
  expect(
    await s.view.journal.recordResult(confirmation(request, 'unsupported-model-confirmation')),
  ).toMatchObject({ failure: { kind: 'conflict' } })
  expect(
    await s.backend.transactions.commit({
      command: {
        kind: 'receive',
        input: {
          ...s.access,
          operation: operationId('model-release'),
          fact: {
            kind: 'release',
            consumption: position.id,
            result: position.results[0].result,
            source: evidence('claimed-ack'),
          },
        },
      },
      guards: [],
    }),
  ).toMatchObject({
    failure: { kind: 'unavailable', diagnostic: expect.stringContaining('MODEL-ACK-ARRIVAL') },
  })
  expect(s.view.controls.root()).toBe(root)
  expect(releaseRows(s)).toEqual([])
})
