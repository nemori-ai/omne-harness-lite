import { describe, expect, it } from 'vitest'
import { LOGIN, SESSION, TENANT, world } from './fixtures/world.ts'
import { bodyOf } from './fixtures/world.ts'

const KEY = `${TENANT}/${SESSION}`

function opened(of: ReturnType<typeof world>, controller = new AbortController()) {
  const open = bodyOf('read-goal', { tenant: TENANT, session: SESSION })
  const context = { principal: LOGIN, messageId: 'm-1', revision: 1, signal: controller.signal }
  return of.contribution.observations['observe-goal'](context, open)
}
const framesOf = async (of: ReturnType<typeof world>, controller?: AbortController) => {
  const answer = await opened(of, controller)
  if (answer.outcome !== 'succeeded') throw new Error(answer.outcome)
  return answer.frames
}

describe('observe-goal', () => {
  it('says at once that the goal is to be read, then once for each time it changed, however often that was', async () => {
    const of = world()
    const frames = await framesOf(of)
    expect(await frames.next()).toEqual({ done: false, value: { kind: 'changed' } })
    const listener = of.listeners.get(KEY)!
    listener.changed()
    listener.changed()
    expect(await frames.next()).toEqual({ done: false, value: { kind: 'changed' } })
    const next = frames.next()
    const waited = await Promise.race([next, Promise.resolve('waiting')])
    expect(waited).toBe('waiting')
    listener.changed()
    expect(await next).toEqual({ done: false, value: { kind: 'changed' } })
  })

  it('ends as unavailable when the feed closes, and lets go of the feed', async () => {
    const of = world()
    const frames = await framesOf(of)
    await frames.next()
    of.listeners.get(KEY)!.closed()
    expect(await frames.next()).toEqual({ done: true, value: 'unavailable' })
    expect(of.listeners.has(KEY)).toBe(false)
  })

  it('lets go of the feed when the subscriber goes away', async () => {
    const of = world()
    const controller = new AbortController()
    const frames = await framesOf(of, controller)
    await frames.next()
    controller.abort()
    expect(of.listeners.has(KEY)).toBe(false)
    expect(await frames.next()).toEqual({ done: true, value: 'unavailable' })
  })

  it('ends as denied when the login is no longer admitted at the next change', async () => {
    const of = world()
    const frames = await framesOf(of)
    await frames.next()
    of.script.entry = { kind: 'denied' }
    of.listeners.get(KEY)!.changed()
    expect(await frames.next()).toEqual({ done: true, value: 'denied' })
  })

  it('is not opened for a login that is not admitted, nor without a basis', async () => {
    const of = world()
    of.script.entry = { kind: 'denied' }
    expect(await opened(of)).toEqual({ outcome: 'denied' })
    of.script.entry = new Error('identity is down')
    expect(await opened(of)).toEqual({ outcome: 'basis-unavailable' })
    of.script.entry = { kind: 'admitted', subject: {}, by: 'acc-1' }
    of.script.fed = false
    expect(await opened(of)).toEqual({ outcome: 'basis-unavailable' })
    expect(of.listeners.size).toBe(0)
  })
})
