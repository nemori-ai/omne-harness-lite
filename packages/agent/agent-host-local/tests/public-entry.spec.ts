import { expect, it } from 'vitest'

it('root entry exposes the independent host receiver and its retained state', async () => {
  const root = (await import('@omne-harness/agent-host-local')) as Record<string, unknown>
  expect(Object.keys(root).sort()).toEqual(['createLocalModelReceiver', 'createModelReceiverState'])
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
