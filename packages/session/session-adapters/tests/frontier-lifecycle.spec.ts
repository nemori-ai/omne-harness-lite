import { ordinaryInput } from '@omne-harness/session-contract/testing'
import { it, expect } from 'vitest'
import { scene, ok, operation, operationId, evidence } from './fixtures/common-journal.ts'
import { take, cancel, start, freeze, accept, end, handed } from './fixtures/progression.ts'

it('interprets an old taken before selecting a successor and never admits the same input twice', async () => {
  const s = await scene('old-taken')
  await take(s)
  ok(await cancel(s))
  await accept(s, 'input-2')
  const successor = ok(await start(s)),
    snapshot = ok(await s.backend.transactions.readWork(s.access))
  expect(successor.execution).not.toBe(s.execution)
  expect(successor.input.initial.id).toBe('input-2')
  expect(snapshot.pending).toEqual(['input-2'])
  expect(
    s.backend.controls
      .entriesOf(s.access.tenant, s.access.session)
      .filter(row => row.kind === 'run.batch-taken'),
  ).toHaveLength(1)
  const before = snapshot.revision
  ok(
    await s.backend.controls.interpret({
      ...s.access,
      execution: s.execution,
      sequence: '1',
      operation: operationId('replay-old'),
    }),
  )
  expect(ok(await s.backend.transactions.readWork(s.access)).revision).toBe(before)
})
it('hands the original untaken input to a successor with a second actual admission in the same Session', async () => {
  const s = await scene('old-untaken')
  ok(await cancel(s))
  const successor = ok(await start(s))
  expect(successor.input.initial).toEqual(s.input.initial)
  const snapshot = ok(await s.backend.transactions.readWork(s.access)),
    directory = snapshot.historyIndex?.inputs.find(item => item.input === 'input-1')
  expect(directory?.members.map(item => item.execution)).toEqual([s.execution, successor.execution])
  await take(successor)
  ok(
    await s.backend.controls.interpret({
      ...s.access,
      execution: successor.execution,
      sequence: '1',
      operation: operationId('take-second'),
    }),
  )
  expect(ok(await s.backend.transactions.readWork(s.access)).pending).toEqual([])
  const root = s.view.controls.root()
  expect(
    await s.view.journal.commit({
      ...s.access,
      execution: s.execution,
      operation: operation('stale-old'),
      authority: s.opened.authority,
      expected: s.opened.receipt.revision,
      checkpoint: s.input.checkpoint,
      state: { kind: 'advancing' },
      events: [],
      effects: [],
      caller: { kind: 'none' },
      replyAdmission: null,
    }),
  ).toMatchObject({ failure: { kind: 'stale-advance' } })
  expect(s.view.controls.root()).toBe(root)
})
it('an inactive freeze excludes historical taken from the final release set', async () => {
  const s = await scene('inactive-freeze')
  await take(s)
  ok(await cancel(s))
  ok(await freeze(s))
  const rows = s.backend.controls.entriesOf(s.access.tenant, s.access.session),
    kinds = rows.map(row => row.kind)
  expect(kinds.indexOf('run.batch-taken')).toBeLessThan(kinds.indexOf('session.frozen'))
  expect(kinds).not.toContain('intake.released')
})
it('active freeze and ordinary cancel do not require unreadable old event material', async () => {
  const s = await scene('ordinary-no-frontier')
  s.view.controls.historyAvailable(s.execution, false)
  ok(await freeze(s))
  s.view.controls.historyAvailable(s.execution, true)
  const plain = await scene('plain-cancel'),
    state = ok(await plain.backend.transactions.readWork(plain.access))
  if (state.run.kind !== 'active') throw new Error('active expected')
  plain.view.controls.historyAvailable(plain.execution, false)
  const result = await plain.backend.transactions.commit({
    access: plain.access,
    command: {
      kind: 'control',
      input: {
        tenant: plain.access.tenant,
        session: plain.access.session,
        operation: operationId('cancel'),
        intent: { kind: 'cancel-run', run: state.run.run, urgency: 'force' },
      },
    },
    guards: [],
  })
  ok(result)
})
for (const taken of [false, true])
  it(`frozen active new admission ${taken ? 'taken' : 'only accepted'} is resolved exactly once`, async () => {
    const s = await scene(`frozen-new-${taken}`)
    await take(s)
    ok(
      await s.backend.controls.interpret({
        ...s.access,
        execution: s.execution,
        sequence: '1',
        operation: operationId('initial-taken'),
      }),
    )
    ok(await freeze(s))
    const value = await accept(s, 'input-2')
    ok(
      await s.view.journal.submit({
        ...s.access,
        execution: s.execution,
        operation: operation('submit-new'),
        value,
      }),
    )
    if (taken) await take(s, 'take-new')
    ok(await cancel(s))
    const rows = s.backend.controls.entriesOf(s.access.tenant, s.access.session)
    expect(rows.filter(row => row.kind === 'intake.released')).toHaveLength(taken ? 0 : 1)
    expect(ok(await s.backend.transactions.readWork(s.access)).pending).toEqual([])
  })
it('a normally ended execution can be cancelled before interpretation without changing its successor', async () => {
  const s = await scene('late-ended')
  await take(s)
  ok(
    await s.backend.controls.interpret({
      ...s.access,
      execution: s.execution,
      sequence: '1',
      operation: operationId('taken'),
    }),
  )
  expect(ok(await end(s)).kind).toBe('ended')
  ok(await cancel(s))
  await accept(s, 'input-2')
  const next = ok(await start(s))
  ok(
    await s.backend.controls.interpret({
      ...s.access,
      execution: s.execution,
      sequence: '2',
      operation: operationId('late-ended'),
    }),
  )
  const snapshot = ok(await s.backend.transactions.readWork(s.access))
  expect(snapshot.run.kind === 'active' && snapshot.run.execution.execution).toBe(next.execution)
})
for (const point of ['before-publish', 'after-publish'] as const)
  it(`interpretation ${point} failure preserves original event, cursor and operation identity`, async () => {
    const s = await scene(`interpret-${point}`)
    await take(s)
    const input = {
      ...s.access,
      execution: s.execution,
      sequence: '1',
      operation: operationId('interpret'),
    }
    s.backend.controls.faultSession(input, point)
    expect(await s.backend.controls.interpret(input)).toMatchObject({
      failure: { kind: point === 'before-publish' ? 'unavailable' : 'commit-unknown' },
    })
    expect(
      s.backend.controls
        .entriesOf(s.access.tenant, s.access.session)
        .filter(row => row.kind === 'run.batch-taken'),
    ).toHaveLength(point === 'before-publish' ? 0 : 1)
    await Promise.all([
      s.backend.controls.interpret(input),
      s.backend.controls.interpret(input),
    ]).then(results => results.forEach(ok))
    expect(
      s.backend.controls
        .entriesOf(s.access.tenant, s.access.session)
        .filter(row => row.kind === 'run.batch-taken'),
    ).toHaveLength(1)
  })
for (const final of ['cancel', 'finish', 'archive', 'ended'] as const)
  it(`frozen taken and ended prefixes precede the ${final} final decision`, async () => {
    const s = await scene(`ended-frontier-${final}`, {
      entries: 1,
      bytes: 256,
      capacityBytes: 1024 * 1024,
    })
    ok(await handed(s))
    await take(s)
    expect(ok(await end(s)).kind).toBe('ended')
    ok(await freeze(s))
    const state = ok(await s.backend.transactions.readWork(s.access))
    if (state.run.kind !== 'active') throw new Error('active expected')
    if (final === 'cancel') ok(await cancel(s))
    else if (final === 'finish') {
      const command = {
        kind: 'finishRun' as const,
        input: {
          tenant: s.access.tenant,
          session: s.access.session,
          operation: operationId('finish'),
          run: state.run.run,
          expected: state.revision,
          bounded: { kind: 'uninterpretable' as const, evidence: evidence('bounded') },
        },
      }
      expect(
        await s.backend.transactions.commit({ access: s.access, command, guards: [] }),
      ).toMatchObject({
        failure: { kind: 'changed' },
      })
      expect(
        s.backend.controls
          .entriesOf(s.access.tenant, s.access.session)
          .some(row => row.kind === 'run.terminal' || row.kind === 'intake.released'),
      ).toBe(false)
      const current = ok(await s.backend.transactions.readWork(s.access))
      ok(
        await s.backend.transactions.commit({
          access: s.access,
          command: {
            ...command,
            input: {
              ...command.input,
              operation: operationId('finish-fresh'),
              expected: current.revision,
            },
          },
          guards: [],
        }),
      )
    } else if (final === 'archive')
      ok(
        await s.backend.transactions.commit({
          access: s.access,
          command: {
            kind: 'control',
            input: {
              tenant: s.access.tenant,
              session: s.access.session,
              operation: operationId('archive'),
              intent: { kind: 'archive' },
            },
          },
          guards: [],
        }),
      )
    else
      ok(
        await s.backend.controls.interpret({
          ...s.access,
          execution: s.execution,
          sequence: '2',
          operation: operationId('ended'),
        }),
      )
    const rows = s.backend.controls.entriesOf(s.access.tenant, s.access.session),
      kinds = rows.map(row => row.kind)
    expect(kinds.indexOf('run.batch-taken')).toBeLessThan(kinds.indexOf('run.terminal'))
    expect(kinds).not.toContain('intake.released')
    if (final !== 'ended')
      ok(
        await s.backend.controls.interpret({
          ...s.access,
          execution: s.execution,
          sequence: '2',
          operation: operationId('late-ended'),
        }),
      )
    expect(
      s.backend.controls
        .entriesOf(s.access.tenant, s.access.session)
        .filter(row => row.kind === 'run.terminal'),
    ).toHaveLength(1)
  })
it('a required missing prefix fails the final decision without a partial release; recovery and confirmed gap differ', async () => {
  const s = await scene('unreadable-frontier')
  await take(s)
  ok(await freeze(s))
  const state = ok(await s.backend.transactions.readWork(s.access))
  if (state.run.kind !== 'active') throw new Error('active expected')
  const command = {
    kind: 'control' as const,
    input: {
      tenant: s.access.tenant,
      session: s.access.session,
      operation: operationId('cancel'),
      intent: { kind: 'cancel-run' as const, run: state.run.run, urgency: 'force' as const },
    },
  }
  s.view.controls.historyAvailable(s.execution, false)
  expect(
    await s.backend.transactions.commit({ access: s.access, command, guards: [] }),
  ).toMatchObject({
    failure: { kind: 'unavailable' },
  })
  expect(
    s.backend.controls
      .entriesOf(s.access.tenant, s.access.session)
      .some(row => row.kind === 'run.terminal' || row.kind === 'intake.released'),
  ).toBe(false)
  s.view.controls.historyAvailable(s.execution, true)
  s.view.controls.loseEvent(s.execution, '1')
  expect(
    await s.backend.transactions.commit({ access: s.access, command, guards: [] }),
  ).toMatchObject({
    failure: { kind: 'quarantined' },
  })
  expect(
    await s.backend.transactions.commit({
      access: s.access,
      command: {
        kind: 'accept',
        input: {
          tenant: s.access.tenant,
          session: s.access.session,
          operation: operationId('later'),
          value: ordinaryInput('later'),
        },
      },
      guards: [],
    }),
  ).toMatchObject({ failure: { kind: 'quarantined' } })
})
