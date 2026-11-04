/** @module-tag slow */
import { expect, it } from 'vitest'
import { commandFixture } from './fixture.ts'

it('bounds native stop plus a stalled durable recording and retains its original responsibility', async context => {
  if (process.platform !== 'win32') return context.skip()
  const f = commandFixture(process.cwd(), { stopBoundMs: 300 })
  let finish: (() => void) | undefined
  f.observeStops(
    () =>
      new Promise(resolve => {
        finish = () => resolve('recorded')
      }),
  )
  try {
    const command = await f.manager.facility.start({
      ...f.request,
      args: ['-e', 'setInterval(()=>{},1000)'],
    })
    expect(command.kind).toBe('done')
    if (command.kind !== 'done') return
    const began = performance.now()
    expect(await command.value.stop('forced')).toBe('unconfirmed')
    expect(performance.now() - began).toBeLessThan(1500)
    expect(f.manager.unconfirmed()).toEqual(f.plans)
    finish?.()
    f.observeStops(async () => 'recorded')
    expect(await command.value.stop('forced')).toBe('confirmed')
    expect(f.manager.unconfirmed()).toEqual([])
  } finally {
    finish?.()
    f.observeStops(async () => 'recorded')
    await f.manager.stopAll()
  }
}, 30_000)
