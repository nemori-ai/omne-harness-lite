import { expect, it } from 'vitest'
import { resolveToolInvocationRef } from '@omne-harness/tool-contract'
import { accepted, fixture, unbox } from './fixture.ts'

it('C02 publishes a real handle and iterator return releases a pending observation', async () => {
  let finish: (value: string) => void = () => {}
  const world = await fixture(
    () =>
      new Promise(resolve => {
        finish = resolve
      }),
  )
  try {
    const reference = accepted(await world.api.invoke(world.invocation('observe')))
    await expect
      .poll(
        async () => unbox(await world.api.instances.current(world.streamQuery(reference))).current,
      )
      .not.toBeNull()
    const selection = unbox(await world.api.instances.current(world.streamQuery(reference)))
    if (selection.current === null) throw new Error('No published stream')
    const iterator = world.api.observation
      .observe({
        access: world.streamQuery(reference).access,
        ref: selection.current.ref,
        signal: new AbortController().signal,
      })
      [Symbol.asyncIterator]()
    expect((await iterator.next()).value).toMatchObject({ kind: 'snapshot' })
    const waiting = iterator.next()
    await iterator.return?.()
    expect(await waiting).toMatchObject({ done: true })
    expect(world.signals.get('{"value":"observe"}')?.aborted).toBe(false)
  } finally {
    finish('cleanup')
    await world.close()
  }
})

it('directory replacement changes the stream without restarting the original author', async () => {
  let finish: (value: string) => void = () => {}
  const world = await fixture(
    () =>
      new Promise(resolve => {
        finish = resolve
      }),
  )
  try {
    const reference = accepted(await world.api.invoke(world.invocation('directory')))
    await expect
      .poll(
        async () => unbox(await world.api.instances.current(world.streamQuery(reference))).current,
      )
      .not.toBeNull()
    const before = unbox(await world.api.instances.current(world.streamQuery(reference))).current
    if (before === null) throw new Error('Missing route')
    await world.directory.dispose()
    expect(await world.api.instances.current(world.streamQuery(reference))).toMatchObject({
      failure: { kind: 'unavailable' },
    })
    expect(unbox(await world.api.queries.lookup(world.query(reference))).kind).toBe('found')
    await world.root.plugin(world.plugins.instances)
    await expect
      .poll(async () => {
        const selection = await world.api.instances.current(world.streamQuery(reference))
        return (
          'ok' in selection &&
          selection.ok.current !== null &&
          selection.ok.current.ref !== before.ref
        )
      })
      .toBe(true)
    expect(world.launches()).toBe(1)
    const stale = world.api.observation
      .observe({
        access: world.streamQuery(reference).access,
        ref: before.ref,
        signal: new AbortController().signal,
      })
      [Symbol.asyncIterator]()
    expect((await stale.next()).value).toMatchObject({ kind: 'ended', reason: 'stale-stream' })
  } finally {
    finish('cleanup')
    await world.close()
  }
})

it('publishes process blocks only after the original fact reaches the ledger', async () => {
  let finish: (value: string) => void = () => {}
  let emit: () => Promise<void> = async () => {}
  const world = await fixture(
    (_value, _environment, context) =>
      new Promise(resolve => {
        finish = resolve
        emit = async () => {
          unbox(
            await context.emit({
              kind: 'append-text',
              index: 'output',
              text: 'confirmed output',
              close: true,
            }),
          )
        }
      }),
  )
  try {
    const reference = accepted(await world.api.invoke(world.invocation('process')))
    await expect
      .poll(
        async () => unbox(await world.api.instances.current(world.streamQuery(reference))).current,
      )
      .not.toBeNull()
    const current = unbox(await world.api.instances.current(world.streamQuery(reference))).current
    if (current === null) throw new Error('Missing stream')
    const iterator = world.api.observation
      .observe({
        access: world.streamQuery(reference).access,
        ref: current.ref,
        signal: AbortSignal.timeout(1500),
      })
      [Symbol.asyncIterator]()
    expect((await iterator.next()).value).toMatchObject({ kind: 'snapshot' })
    await emit()
    let observed = false
    for (let attempt = 0; attempt < 8 && !observed; attempt += 1) {
      const next = await iterator.next()
      if (next.done || next.value.kind === 'ended' || next.value.kind === 'gap') break
      const blocks =
        next.value.kind === 'snapshot' ? next.value.value.process : next.value.value.blocks
      observed = blocks.some(
        block => block.content.kind === 'text' && block.content.text === 'confirmed output',
      )
    }
    expect(observed).toBe(true)
    await iterator.return?.()
  } finally {
    finish('cleanup')
    await world.close()
  }
})

it('the published source rejects a foreign tenant even without the ordinary facade', async () => {
  let finish: (value: string) => void = () => {}
  const world = await fixture(
    () =>
      new Promise(resolve => {
        finish = resolve
      }),
  )
  try {
    const reference = accepted(await world.api.invoke(world.invocation('source-tenant')))
    await expect
      .poll(
        async () => unbox(await world.api.instances.current(world.streamQuery(reference))).current,
      )
      .not.toBeNull()
    const current = unbox(await world.api.instances.current(world.streamQuery(reference))).current
    const parts = unbox(resolveToolInvocationRef(reference, world.tenantA))
    const route = unbox(
      await world.root.toolInstanceHost.directory.connect({
        principal: 'alice',
        tenant: world.tenantA,
        call: parts.call,
      }),
    )
    if (route.kind !== 'live' || current === null) throw new Error('Missing real publication')
    const iterator = route.handle.observation
      .observe({
        ref: current.ref,
        access: { principal: 'bob', tenant: world.tenantB },
        signal: new AbortController().signal,
      })
      [Symbol.asyncIterator]()
    expect((await iterator.next()).value).toEqual({ kind: 'ended', reason: 'denied' })
  } finally {
    finish('cleanup')
    await world.close()
  }
})

it('an old registration release cannot remove the route of a later token', async () => {
  let finish: (value: string) => void = () => {}
  const world = await fixture(
    () =>
      new Promise(resolve => {
        finish = resolve
      }),
  )
  try {
    const reference = accepted(await world.api.invoke(world.invocation('publication-token')))
    await expect
      .poll(
        async () => unbox(await world.api.instances.current(world.streamQuery(reference))).current,
      )
      .not.toBeNull()
    const parts = unbox(resolveToolInvocationRef(reference, world.tenantA))
    const access = { principal: 'alice', tenant: world.tenantA, call: parts.call }
    const recovery = unbox(await world.root.toolCommands.loadRecovery(access))
    const route = unbox(await world.root.toolInstanceHost.directory.connect(access))
    if (route.kind !== 'live' || recovery.execution === null)
      throw new Error('Missing original execution')
    const first = unbox(
      await world.root.toolInstances.register({
        publication: [recovery.execution, route.handle],
        authority: recovery.state.source,
      }),
    )
    expect(await first.release()).toEqual({ removed: true })
    const second = unbox(
      await world.root.toolInstances.register({
        publication: [recovery.execution, route.handle],
        authority: recovery.state.source,
      }),
    )
    expect(second.receipt.registration).not.toBe(first.receipt.registration)
    expect(await first.release()).toEqual({ removed: false })
    expect(unbox(await world.root.toolInstances.connect(access)).kind).toBe('live')
  } finally {
    finish('cleanup')
    await world.close()
  }
})
