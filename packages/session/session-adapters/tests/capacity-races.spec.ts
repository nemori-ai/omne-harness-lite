import { it, expect } from 'vitest'
import { scene, ok, operation, operationId, evidence } from './fixtures/common-journal.ts'
import { cancel, freeze } from './fixtures/progression.ts'

it('an indivisible final batch exceeding capacity leaves neither freeze nor release entries', async () => {
  const s = await scene('capacity-final', { entries: 8, bytes: 4096, capacityBytes: 1024 * 1024 })
  ok(await cancel(s))
  const root = s.view.controls.root(),
    result = await s.backend.transactions.commit({
      access: s.access,
      command: {
        kind: 'freeze',
        input: {
          tenant: s.access.tenant,
          session: s.access.session,
          operation: operationId('large-freeze'),
          verdict: {
            cause: 'tool-shape-lost',
            evidence: { ...evidence('freeze'), record: 'large-original-proof'.repeat(131072) },
          },
        },
      },
      guards: [],
    })
  expect(result).toMatchObject({ failure: { kind: 'unavailable' } })
  expect(s.view.controls.root()).toBe(root)
  const rows = s.backend.controls.entriesOf(s.access.tenant, s.access.session)
  expect(rows.some(row => row.kind === 'session.frozen' || row.kind === 'intake.released')).toBe(
    false,
  )
  expect(rows.filter(row => row.kind === 'run.terminal')).toHaveLength(1)
})
it('oversized required original material fails preparation without releasing its pending input', async () => {
  const s = await scene('capacity-original', {
      entries: 1,
      bytes: 256,
      capacityBytes: 1024 * 1024,
    }),
    waits = [{ kind: 'dependency' as const, owner: 'test', position: 'large'.repeat(300000) }]
  ok(
    await s.view.journal.commit({
      ...s.access,
      execution: s.execution,
      operation: operation('large-wait'),
      authority: s.opened.authority,
      expected: s.opened.receipt.revision,
      checkpoint: s.checkpoint,
      state: { kind: 'waiting', waits },
      events: [{ kind: 'waiting', waits }],
      effects: [],
      caller: { kind: 'none' },
      replyAdmission: null,
      handoff: null,
    }),
  )
  ok(await freeze(s))
  const root = s.view.controls.root()
  expect(await cancel(s)).toMatchObject({ failure: { kind: 'unavailable' } })
  expect(s.view.controls.root()).toBe(root)
  expect(
    s.backend.controls
      .entriesOf(s.access.tenant, s.access.session)
      .some(row => row.kind === 'run.terminal' || row.kind === 'intake.released'),
  ).toBe(false)
})
it('Session final publication wins before a paused business taken and the old grant is rejected', async () => {
  const s = await scene('session-wins'),
    loaded = ok(await s.view.journal.load({ ...s.access, execution: s.execution })),
    page = ok(
      await s.view.journal.inputs({
        ...s.access,
        execution: s.execution,
        watermark: loaded.inputWatermark,
      }),
    )
  const request = {
    ...s.access,
    execution: s.execution,
    operation: operation('paused-taken'),
    authority: s.opened.authority,
    expected: loaded.revision,
    checkpoint: { ...loaded.checkpoint, inputBatch: page.batch.id },
    state: { kind: 'advancing' as const },
    events: [{ kind: 'input-taken' as const, batch: page.batch }],
    effects: [],
    caller: { kind: 'none' as const },
    replyAdmission: null,
    handoff: null,
  }
  const pause = s.view.controls.pauseWrite(request, 'commit'),
    write = s.view.journal.commit(request)
  await pause.reached
  ok(await freeze(s))
  ok(await cancel(s))
  const root = s.view.controls.root()
  pause.release()
  expect(await write).toMatchObject({ failure: { kind: 'stale-advance' } })
  expect(s.view.controls.root()).toBe(root)
  expect(
    s.backend.controls
      .entriesOf(s.access.tenant, s.access.session)
      .filter(row => row.kind === 'intake.released'),
  ).toHaveLength(1)
})
