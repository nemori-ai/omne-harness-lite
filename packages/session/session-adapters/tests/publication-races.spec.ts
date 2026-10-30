import { it, expect } from 'vitest'
import { scene, ok, operation, operationId, evidence } from './fixtures/common-journal.ts'

async function frozen(name: string) {
  const s = await scene(name)
  ok(
    await s.backend.transactions.commit({
      access: s.access,
      command: {
        kind: 'freeze',
        input: {
          tenant: s.access.tenant,
          session: s.access.session,
          operation: operationId('freeze'),
          verdict: { cause: 'tool-shape-lost', evidence: evidence('freeze') },
        },
      },
      guards: [],
    }),
  )
  const snapshot = ok(await s.backend.transactions.readWork(s.access))
  if (snapshot.run.kind !== 'active') throw new Error('active expected')
  const command = {
    kind: 'control' as const,
    input: {
      tenant: s.access.tenant,
      session: s.access.session,
      operation: operationId('cancel'),
      intent: { kind: 'cancel-run' as const, run: snapshot.run.run, urgency: 'force' as const },
    },
  }
  return { ...s, command }
}

it('a taken publication wins against paused final preparation and forces a fresh complete prefix', async () => {
  const s = await frozen('taken-wins'),
    pause = s.backend.controls.pauseSession(s.command.input)
  const finishing = s.backend.transactions.commit({
    access: s.access,
    command: s.command,
    guards: [],
  })
  await pause.reached
  const loaded = ok(await s.view.journal.load({ ...s.access, execution: s.execution })),
    page = ok(
      await s.view.journal.inputs({
        ...s.access,
        execution: s.execution,
        watermark: loaded.inputWatermark,
      }),
    )
  ok(
    await s.view.journal.commit({
      ...s.access,
      execution: s.execution,
      operation: operation('late-taken'),
      authority: s.opened.authority,
      expected: loaded.revision,
      checkpoint: { ...s.checkpoint, inputBatch: page.batch.id },
      state: { kind: 'advancing' },
      events: [{ kind: 'input-taken', batch: page.batch }],
      effects: [],
      caller: { kind: 'none' },
      replyAdmission: null,
      handoff: null,
      finish: null,
    }),
  )
  pause.release()
  ok(await finishing)
  const rows = s.backend.controls.entriesOf(s.access.tenant, s.access.session)
  expect(rows.some(row => row.kind === 'run.batch-taken')).toBe(true)
  expect(rows.some(row => row.kind === 'intake.released')).toBe(false)
  expect(ok(await s.backend.transactions.readWork(s.access)).pending).toEqual([])
})

it('a shared quarantine gate blocks the final publication even without a root revision change', async () => {
  const s = await frozen('gate-wins'),
    pause = s.backend.controls.pauseSession(s.command.input)
  const finishing = s.backend.transactions.commit({
    access: s.access,
    command: s.command,
    guards: [],
  })
  await pause.reached
  const root = s.view.controls.root()
  s.view.controls.quarantine('confirmed independent gap')
  expect(s.view.controls.root()).toBe(root)
  pause.release()
  expect(await finishing).toMatchObject({ failure: { kind: 'quarantined' } })
  expect(
    s.backend.controls
      .entriesOf(s.access.tenant, s.access.session)
      .some(row => row.kind === 'run.terminal'),
  ).toBe(false)
  expect(s.view.controls.root()).toBe(root)
})

it('a Session publication with a lost reply is recognized before another preparation', async () => {
  const s = await frozen('lost-final')
  s.backend.controls.faultSession(s.command.input, 'after-publish')
  expect(
    await s.backend.transactions.commit({ access: s.access, command: s.command, guards: [] }),
  ).toMatchObject({
    failure: { kind: 'commit-unknown', operation: s.command.input.operation },
  })
  const root = s.view.controls.root(),
    metrics = s.backend.controls.frontierMetrics()
  expect(
    ok(await s.backend.transactions.commit({ access: s.access, command: s.command, guards: [] }))
      .receipt.recovered,
  ).toBe(true)
  expect(s.view.controls.root()).toBe(root)
  expect(s.backend.controls.frontierMetrics()).toEqual(metrics)
})

it('revoked Agent qualification is checked again after a publication pause', async () => {
  const qualification = { agent: true, session: true },
    s = await scene('revoked-agent', undefined, qualification)
  const request = {
    ...s.access,
    execution: s.execution,
    operation: operation('paused'),
    authority: s.opened.authority,
    expected: s.opened.receipt.revision,
    checkpoint: s.checkpoint,
    state: { kind: 'advancing' as const },
    events: [],
    effects: [],
    caller: { kind: 'none' as const },
    replyAdmission: null,
    handoff: null,
    finish: null,
  }
  const pause = s.view.controls.pauseWrite(request, 'commit'),
    writing = s.view.journal.commit(request)
  await pause.reached
  const root = s.view.controls.root()
  qualification.agent = false
  pause.release()
  expect(await writing).toMatchObject({ failure: { kind: 'denied' } })
  expect(s.view.controls.root()).toBe(root)
  expect(
    await s.view.journal.query({
      ...s.access,
      execution: s.execution,
      operation: operation('open'),
    }),
  ).toMatchObject({ failure: { kind: 'denied' } })
})

import { createMemorySessionJournal } from '../src/testing.ts'
import {
  createMemoryInitializationSource,
  createPolicySessionAccessCheck,
  memoryAccess,
} from '@omne-harness/session-contract/testing'

it('preserves unavailable qualification on Session reads and system directories', async () => {
  const backend = createMemorySessionJournal({
      initialization: createMemoryInitializationSource(),
      accessCheck: createPolicySessionAccessCheck(() => ({
        kind: 'unavailable',
        diagnostic: 'qualification source down',
      })),
      authorize: () => 'unavailable',
    }),
    access = memoryAccess('tester', 'unavailable')
  expect(await backend.transactions.readWork(access)).toMatchObject({
    failure: { kind: 'unavailable' },
  })
  expect(await backend.transactions.pending({ ...access, after: null, limit: 1 })).toMatchObject({
    failure: { kind: 'unavailable' },
  })
  expect(
    await backend.transactions.releasedScopes({
      principal: 'tester',
      scope: 'system',
      after: null,
      limit: 1,
    }),
  ).toMatchObject({ failure: { kind: 'unavailable' } })
})

it('rejects an unminted opaque tenant through routed reads, writes and live output without opening a root', async () => {
  const s = await scene('unminted-tenant'),
    view = s.backend.sessionView(s.access.session),
    access = { ...s.access, tenant: structuredClone(s.access.tenant) },
    root = s.view.controls.root()
  expect(await view.journal.load({ ...access, execution: s.execution })).toMatchObject({
    failure: { kind: 'denied' },
  })
  expect(await view.journal.open({ ...s.input, ...access })).toMatchObject({
    failure: { kind: 'denied' },
  })
  expect(
    (
      await view.journal.output
        .events({
          ...access,
          execution: s.execution,
          after: null,
          signal: new AbortController().signal,
        })
        [Symbol.asyncIterator]()
        .next()
    ).value,
  ).toMatchObject({ failure: { kind: 'denied' } })
  expect(s.view.controls.root()).toBe(root)
})
