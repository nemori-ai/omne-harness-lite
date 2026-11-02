import { expect, it } from 'vitest'

it('root entry exposes the independent host receiver and its retained state', async () => {
  const root = (await import('@omne-harness/agent-host-local')) as Record<string, unknown>
  expect(Object.keys(root).sort()).toEqual([
    'createLocalModelReceiver',
    'createLocalToolReceiver',
    'createModelReceiverState',
    'createToolReceiverState',
  ])
})

it('keeps the independent Tool receiver and its saved result across host reassembly', async () => {
  const { createLocalToolReceiver, createToolReceiverState } =
    await import('@omne-harness/agent-host-local')
  const { createToolReceiverFixture } = await import('@omne-harness/agent/testing')
  const fixture = await createToolReceiverFixture()
  const state = createToolReceiverState<string>()
  expect(
    createLocalToolReceiver(
      { ...fixture.dependencies, provider: { ...fixture.dependencies.provider, received: null } },
      state,
    ),
  ).toEqual({ failure: { kind: 'unsupported' } })
  const receiver = createLocalToolReceiver(fixture.dependencies, state)
  if ('failure' in receiver) throw new Error('Tool receiver unavailable')
  const input = {
    access: fixture.access,
    delivery: fixture.delivery,
    signal: new AbortController().signal,
  }
  const saved = await receiver.ok.push(input)
  expect(saved).toHaveProperty('ok')
  const rebuilt = createLocalToolReceiver(fixture.dependencies, state)
  if ('failure' in rebuilt) throw new Error('Tool receiver unavailable')
  expect(await rebuilt.ok.push(input)).toEqual(saved)
  const loaded = await fixture.journal.port.load({
    ...fixture.access,
    execution: fixture.execution,
  })
  expect(loaded).toHaveProperty('ok.entries', [
    expect.objectContaining({
      kind: 'received',
      delivery: expect.objectContaining({ producer: 'tool' }),
    }),
  ])
})

it('assembles the real host receiver, saves through the common provider and retries the same handoff', async () => {
  const { createLocalModelReceiver, createModelReceiverState } =
    await import('@omne-harness/agent-host-local')
  const { createModelReceiverFixture } = await import('@omne-harness/agent/testing')
  const fixture = await createModelReceiverFixture()
  const state = createModelReceiverState<string>()
  const unsupported = createLocalModelReceiver(
    { ...fixture.dependencies, provider: { ...fixture.dependencies.provider, received: null } },
    state,
  )
  expect(unsupported).toEqual({ failure: { kind: 'unsupported' } })
  const assembled = createLocalModelReceiver(fixture.dependencies, state)
  if ('failure' in assembled) throw new Error('supported provider refused')
  fixture.outlet({ kind: 'unknown' })
  const saved = await assembled.ok.push({
    access: fixture.access,
    delivery: fixture.delivery,
    signal: new AbortController().signal,
  })
  expect(saved).toHaveProperty('ok')
  await Promise.all(state.tasks)
  const loaded = await fixture.journal.port.load({
    ...fixture.access,
    execution: fixture.execution,
  })
  if ('failure' in loaded) throw new Error('saved execution unreadable')
  expect(loaded.ok.entries).toHaveLength(1)
  const entry = loaded.ok.entries?.[0]
  if (!entry || entry.kind !== 'received') throw new Error('received entry required')
  expect(
    await fixture.dependencies.provider.materials.read({
      ...fixture.access,
      source: entry.material,
    }),
  ).toHaveProperty('ok.kind', 'facts')
  expect(assembled.ok.inspect()).toMatchObject({ pending: 1, blocked: 0 })
  fixture.outlet({ kind: 'received' })
  const replay = createLocalModelReceiver(fixture.dependencies, state)
  if ('failure' in replay) throw new Error('reassembly refused')
  expect(
    await replay.ok.retry({
      access: fixture.access,
      execution: fixture.execution,
      signal: new AbortController().signal,
    }),
  ).toEqual({ ok: { pending: 0, blocked: 0, diagnostics: [] } })
  expect(fixture.sent).toHaveLength(2)
  expect(fixture.sent[1]).toEqual(fixture.sent[0])
  expect(
    await replay.ok.push({
      access: fixture.access,
      delivery: fixture.delivery,
      signal: new AbortController().signal,
    }),
  ).toEqual(saved)
  await Promise.all(state.tasks)
  expect(fixture.sent).toHaveLength(2)
})
