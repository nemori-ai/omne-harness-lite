import { it, expect } from 'vitest'
import { assistantMessage } from '@omne-harness/session-contract/testing'
import { scene, ok, operation, evidence } from './fixtures/common-journal.ts'
import { toolCall } from './fixtures/tool-call.ts'

it('receives a Tool account using the actual committed Pending binding without the suite bind control', async () => {
  const s = await scene('actual-tool-reception'),
    tool = toolCall(s.access.tenant)
  ok(
    await s.view.journal.commit({
      ...s.access,
      execution: s.execution,
      operation: operation('pending'),
      authority: s.opened.authority,
      expected: s.opened.receipt.revision,
      checkpoint: { ...s.input.checkpoint, batch: tool.batch },
      state: { kind: 'advancing' },
      events: [],
      effects: [
        { action: tool.pending.action, pending: tool.pending, authority: s.opened.authority },
      ],
      caller: { kind: 'none' },
      replyAdmission: null,
    }),
  )
  const { material: _material, ...entry } = tool.entry,
    material = {
      kind: 'facts' as const,
      schema: s.input.checkpoint.schema,
      value: { kind: 'string' as const, value: 'complete Tool account fixture' },
    },
    request = {
      ...s.access,
      execution: s.execution,
      operation: operation('receive'),
      entry,
      material,
    }
  const committed = ok(await s.view.received.commit(request))
  if (committed.kind !== 'committed') throw new Error('commit expected')
  expect(
    ok(await s.view.materials.read({ ...s.access, source: committed.value.entry.material })),
  ).toEqual(material)
  const snapshot = ok(await s.view.journal.load({ ...s.access, execution: s.execution }))
  expect(snapshot.entries).toEqual([committed.value.entry])
  expect(snapshot.results).toEqual([])
  const root = s.view.controls.root()
  expect(ok(await s.view.received.query(request))).toMatchObject({
    kind: 'committed',
    value: { saved: committed.value.saved },
  })
  expect(s.view.controls.root()).toBe(root)
})
it('live output wakes only after the joint root is published and abort releases its wait', async () => {
  const s = await scene('live-output'),
    signal = new AbortController(),
    iterator = s.view.journal.output
      .events({ ...s.access, execution: s.execution, after: null, signal: signal.signal })
      [Symbol.asyncIterator](),
    next = iterator.next()
  const message = assistantMessage('published'),
    request = {
      ...s.access,
      execution: s.execution,
      operation: operation('message'),
      authority: s.opened.authority,
      expected: s.opened.receipt.revision,
      checkpoint: s.input.checkpoint,
      state: { kind: 'advancing' as const },
      events: [{ kind: 'message' as const, message, source: evidence('message') }],
      effects: [],
      replyAdmission: null,
      caller: {
        kind: 'message' as const,
        message,
        source: evidence('message'),
        admission: evidence('admission'),
      },
    }
  const pause = s.view.controls.pauseWrite(request, 'commit'),
    writing = s.view.journal.commit(request)
  await pause.reached
  expect(
    s.backend.controls
      .entriesOf(s.access.tenant, s.access.session)
      .some(row => row.kind === 'message.assistant'),
  ).toBe(false)
  expect(
    ok(await s.view.journal.load({ ...s.access, execution: s.execution })).output.emittedThrough,
  ).toBeNull()
  pause.release()
  const receipt = ok(await writing),
    published = await next
  expect(published.done).toBe(false)
  expect(published.value).toMatchObject({
    ok: { kind: 'page', events: [{ cause: receipt.evidence }] },
  })
  expect(
    s.backend.controls
      .entriesOf(s.access.tenant, s.access.session)
      .filter(row => row.kind === 'message.assistant'),
  ).toHaveLength(1)
  const waiting = iterator.next()
  signal.abort()
  expect((await waiting).done).toBe(true)
})
