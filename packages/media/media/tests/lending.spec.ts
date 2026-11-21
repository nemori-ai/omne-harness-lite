import { describe, expect, it } from 'vitest'
import { createScriptedEngine } from '@omne-harness/media-contract/testing'
import { convertWithin } from '../src/lending.ts'
import { T1 } from './world.ts'

type Listener = Parameters<AbortSignal['addEventListener']>[1]

/** A signal and the abort listeners that are on it. */
function listened() {
  const { signal } = new AbortController()
  const on = new Set<unknown>()
  const add = signal.addEventListener.bind(signal)
  const remove = signal.removeEventListener.bind(signal)
  signal.addEventListener = ((type: string, listener: Listener) => {
    if (type === 'abort') on.add(listener)
    add(type, listener)
  }) as typeof signal.addEventListener
  signal.removeEventListener = ((type: string, listener: Listener) => {
    if (type === 'abort') on.delete(listener)
    remove(type, listener)
  }) as typeof signal.removeEventListener
  return { signal, on }
}

describe('one conversion within its bounds', () => {
  it('listens to both signals while the engine works and to neither once it has answered', async () => {
    const answer = Promise.withResolvers<{ kind: 'inconvertible' }>()
    const { engine } = createScriptedEngine(() => answer.promise)
    const withdrawn = listened()
    const stop = listened()
    const media = { mediaType: 'audio/wav', bytes: 0, open: async function* () {} }
    const converting = convertWithin(
      engine,
      { access: { tenant: T1, principal: null }, media, parameters: {} },
      {
        timer: { after: () => () => {} },
        timeoutMs: 1,
        withdrawn: withdrawn.signal,
        stop: stop.signal,
      },
    )
    expect([withdrawn.on.size, stop.on.size]).toEqual([1, 1])
    answer.resolve({ kind: 'inconvertible' })
    expect(await converting).toEqual({ kind: 'inconvertible' })
    expect([withdrawn.on.size, stop.on.size]).toEqual([0, 0])
  })
})
