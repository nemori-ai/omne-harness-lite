import { it, expect } from 'vitest'
import { scene, ok, operation, evidence } from './fixtures/common-journal.ts'
import { toolCall } from './fixtures/tool-call.ts'

async function prepared(name: string) {
  const s = await scene(name),
    tool = toolCall(s.access.tenant, name)
  ok(
    await s.view.journal.commit({
      ...s.access,
      execution: s.execution,
      operation: operation('original-pending'),
      authority: s.opened.authority,
      expected: s.opened.receipt.revision,
      checkpoint: { ...s.checkpoint, batch: tool.batch },
      state: { kind: 'advancing' },
      events: [],
      effects: [
        { action: tool.pending.action, pending: tool.pending, authority: s.opened.authority },
      ],
      caller: { kind: 'none' },
      replyAdmission: null,
      handoff: null,
    }),
  )
  const request = {
    ...s.access,
    execution: s.execution,
    operation: operation('result'),
    consumption: tool.pending.consumption,
    result: tool.placeholder,
    release: { kind: 'pending' as const },
    transfer: {
      kind: 'custody' as const,
      consumption: tool.pending.consumption,
      result: tool.placeholder,
      retained: evidence('custody'),
    },
  }
  const preparation = {
    ...s.access,
    operation: s.view.controls.resultPreparationOperation(request, 'recordResult'),
  }
  return { ...s, tool, request, preparation }
}
for (const kind of ['custody', 'processed'] as const)
  it(`the first ${kind} registers only a previously committed Pending before publishing the result jointly`, async () => {
    const s = await prepared(`first-${kind}`)
    const request = {
      ...s.request,
      transfer:
        kind === 'custody'
          ? s.request.transfer
          : {
              kind,
              consumption: s.tool.pending.consumption,
              result: s.tool.placeholder,
              completion: evidence('processed'),
            },
    }
    expect(ok(await s.backend.transactions.readWork(s.access)).consumptions).toEqual([])
    const receipt = ok(await s.view.journal.recordResult(request))
    const rows = s.backend.controls.entriesOf(s.access.tenant, s.access.session),
      bound = rows.find(row => row.kind === 'call.bound'),
      result = rows.find(
        row => row.kind === `call.result-${kind === 'custody' ? 'preserved' : 'processed'}`,
      )
    expect(bound).toBeDefined()
    expect(result).toBeDefined()
    expect(bound?.revision).not.toBe(result?.revision)
    const loaded = ok(await s.view.journal.load({ ...s.access, execution: s.execution }))
    expect(loaded.results).toHaveLength(1)
    expect(ok(await s.backend.transactions.readWork(s.access)).waiting).toEqual([])
    const root = s.view.controls.root()
    expect(ok(await s.view.journal.recordResult(request))).toEqual(receipt)
    expect(s.view.controls.root()).toBe(root)
    expect(
      await s.view.journal.recordResult({
        ...request,
        result: { ...request.result, version: 'different' },
      }),
    ).toMatchObject({ failure: { kind: 'conflict' } })
    expect(s.view.controls.root()).toBe(root)
  })
it('an unknown preparation stops the new result; retry recognizes the old registration', async () => {
  const s = await prepared('preparation-unknown')
  s.backend.controls.faultSession(s.preparation, 'after-publish')
  expect(await s.view.journal.recordResult(s.request)).toMatchObject({
    failure: { kind: 'commit-unknown' },
  })
  expect(ok(await s.view.journal.load({ ...s.access, execution: s.execution })).results).toEqual([])
  const rows = s.backend.controls.entriesOf(s.access.tenant, s.access.session)
  expect(rows.filter(row => row.kind === 'call.bound')).toHaveLength(1)
  expect(rows.some(row => row.kind === 'call.result-preserved')).toBe(false)
  ok(await s.view.journal.recordResult(s.request))
  expect(
    s.backend.controls
      .entriesOf(s.access.tenant, s.access.session)
      .filter(row => row.kind === 'call.bound'),
  ).toHaveLength(1)
})
for (const point of ['before-publish', 'after-publish'] as const)
  it(`the new joint ${point} fault preserves the two distinct publication boundaries`, async () => {
    const s = await prepared(`joint-${point}`)
    s.view.controls.faultWrite(s.request, 'recordResult', point)
    expect(await s.view.journal.recordResult(s.request)).toMatchObject({
      failure: { kind: point === 'before-publish' ? 'unavailable' : 'commit-unknown' },
    })
    const rows = s.backend.controls.entriesOf(s.access.tenant, s.access.session),
      loaded = ok(await s.view.journal.load({ ...s.access, execution: s.execution }))
    expect(rows.filter(row => row.kind === 'call.bound')).toHaveLength(1)
    expect(rows.some(row => row.kind === 'call.result-preserved')).toBe(point === 'after-publish')
    expect(loaded.results.length).toBe(point === 'after-publish' ? 1 : 0)
    ok(await s.view.journal.recordResult(s.request))
    expect(
      s.backend.controls
        .entriesOf(s.access.tenant, s.access.session)
        .filter(row => row.kind === 'call.result-preserved'),
    ).toHaveLength(1)
  })
it('malformed and mismatched requests cannot trigger registration', async () => {
  const s = await prepared('malformed-result'),
    root = s.view.controls.root()
  expect(
    await s.view.journal.recordResult({
      ...s.request,
      transfer: { ...s.request.transfer, retained: { ...evidence('bad'), record: '' } },
    }),
  ).toMatchObject({ failure: { kind: 'invalid' } })
  expect(
    await s.view.journal.recordResult({
      ...s.request,
      result: { ...s.request.result, version: 'mismatch' },
    }),
  ).toMatchObject({ failure: { kind: 'conflict' } })
  expect(s.view.controls.root()).toBe(root)
  expect(ok(await s.backend.transactions.readWork(s.access)).consumptions).toEqual([])
})

for (const boundary of ['before-publish', 'gate'] as const)
  it(`stops result preparation at ${boundary} without either new batch`, async () => {
    const s = await prepared(`preparation-${boundary}`),
      root = s.view.controls.root()
    if (boundary === 'before-publish')
      s.backend.controls.faultSession(s.preparation, 'before-publish')
    const pause = boundary === 'gate' ? s.backend.controls.pauseSession(s.preparation) : null,
      writing = s.view.journal.recordResult(s.request)
    if (pause) {
      await pause.reached
      s.view.controls.quarantine('gap during preparation')
      pause.release()
    }
    expect(await writing).toMatchObject({ failure: { kind: 'unavailable' } })
    expect(s.view.controls.root()).toBe(root)
    expect(
      s.backend.controls
        .entriesOf(s.access.tenant, s.access.session)
        .some(row => row.kind === 'call.bound' || row.kind === 'call.result-preserved'),
    ).toBe(false)
  })
