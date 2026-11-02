import { expect, it } from 'vitest'
import { accepted, fixture } from './fixture.ts'

it('C03 stops only the selected live call while the other author continues', async () => {
  const completions = new Map<string, (value: string) => void>()
  const world = await fixture(
    (value, _environment, context) =>
      new Promise(resolve => {
        completions.set(value, resolve)
        context.signal.addEventListener('abort', () => resolve(`stopped:${value}`), { once: true })
      }),
  )
  try {
    const a = accepted(await world.api.invoke(world.invocation('a')))
    const b = accepted(await world.api.invoke(world.invocation('b')))
    await expect.poll(() => world.launches()).toBe(2)
    expect(
      await world.api.commands.control({ ...world.query(a), intent: { kind: 'stop' } }),
    ).toMatchObject({ kind: 'committed' })
    await expect.poll(() => world.signals.get('{"value":"a"}')?.aborted).toBe(true)
    expect(world.signals.get('{"value":"b"}')?.aborted).toBe(false)
    completions.get('{"value":"b"}')?.('continued-b')
    expect((await world.settled(b)).value.content).toMatchObject([{ text: 'continued-b' }])
    await world.settled(a)
  } finally {
    for (const complete of completions.values()) complete('cleanup')
    await world.close()
  }
})

it('a foreign control subject cannot send stop to an original author', async () => {
  let complete: (value: string) => void = () => {}
  const world = await fixture(
    () =>
      new Promise(resolve => {
        complete = resolve
      }),
  )
  try {
    const call = accepted(await world.api.invoke(world.invocation('original')))
    await expect.poll(() => world.launches()).toBe(1)
    expect(
      await world.api.commands.control({
        reference: call,
        access: { tenant: world.tenantA, principal: 'bob' },
        intent: { kind: 'stop' },
      }),
    ).toMatchObject({ kind: 'rejected', failure: { kind: 'denied' } })
    expect(world.signals.get('{"value":"original"}')?.aborted).toBe(false)
  } finally {
    complete('cleanup')
    await world.close()
  }
})
