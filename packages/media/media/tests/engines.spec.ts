import { describe, expect, it } from 'vitest'
import { createScriptedEngine } from '@omne-harness/media-contract/testing'
import { createEngineRegistry } from '@omne-harness/media'

const engineNamed = (name: string) =>
  createScriptedEngine(async () => ({ kind: 'inconvertible' }), { name }).engine
const settled = async (work: Promise<unknown>): Promise<boolean> => {
  let done = false
  void work.then(() => (done = true))
  await new Promise(resolve => setImmediate(resolve))
  return done
}

describe('the registry of converter engines (media.engines)', () => {
  it('lends an engine by its name, read at each call, and none for a name nobody registered', () => {
    const registry = createEngineRegistry()
    expect(registry.borrow('voice.one')).toBeNull()
    const engine = engineNamed('voice.one')
    registry.contribute(engine)
    const lease = registry.borrow('voice.one')
    expect(lease?.engine).toBe(engine)
    expect(lease?.withdrawn.aborted).toBe(false)
    expect(registry.borrow('voice.two')).toBeNull()
  })

  it('takes one engine for a name: a second one is refused while the first is registered', () => {
    const registry = createEngineRegistry()
    registry.contribute(engineNamed('voice.one'))
    expect(() => registry.contribute(engineNamed('voice.one'))).toThrow(
      'a converter engine named "voice.one" is registered',
    )
    registry.contribute(engineNamed('voice.two'))
    expect(registry.borrow('voice.two')).not.toBeNull()
  })

  it('refuses an engine whose declaration does not hold, with what does not', () => {
    const registry = createEngineRegistry()
    const { engine } = createScriptedEngine(async () => ({ kind: 'inconvertible' }), {
      name: 'No Name',
    })
    expect(() => registry.contribute(engine)).toThrow('the name "No Name" is not an engine name')
    expect(registry.borrow('No Name')).toBeNull()
  })

  it('a withdrawn engine is lent no more, tells its leases, and is gone when they are all back', async () => {
    const registry = createEngineRegistry()
    const registration = registry.contribute(engineNamed('voice.one'))
    const first = registry.borrow('voice.one')!
    const second = registry.borrow('voice.one')!
    const gone = registration.release()
    expect(registry.borrow('voice.one')).toBeNull()
    expect([first.withdrawn.aborted, second.withdrawn.aborted]).toEqual([true, true])
    expect(await settled(gone)).toBe(false)
    first.release()
    first.release()
    expect(await settled(gone)).toBe(false)
    second.release()
    expect(await settled(gone)).toBe(true)
  })

  it('an engine nobody holds is gone at once; withdrawing it again changes nothing', async () => {
    const registry = createEngineRegistry()
    const registration = registry.contribute(engineNamed('voice.one'))
    expect(await settled(registration.release())).toBe(true)
    expect(await settled(registration.release())).toBe(true)
  })

  it('the name is free once its engine is withdrawn, even while leases of the old one are out', async () => {
    const registry = createEngineRegistry()
    const old = engineNamed('voice.one')
    const registration = registry.contribute(old)
    const lease = registry.borrow('voice.one')!
    const gone = registration.release()
    const next = engineNamed('voice.one')
    const later = registry.contribute(next)
    expect(registry.borrow('voice.one')?.engine).toBe(next)
    lease.release()
    expect(await settled(gone)).toBe(true)
    expect(registry.borrow('voice.one')?.engine).toBe(next)
    void later.release()
    expect(registry.borrow('voice.one')).toBeNull()
  })

  it('withdrawing the old engine again does not take the name from the new one', async () => {
    const registry = createEngineRegistry()
    const old = registry.contribute(engineNamed('voice.one'))
    await old.release()
    const next = engineNamed('voice.one')
    registry.contribute(next)
    await old.release()
    expect(registry.borrow('voice.one')?.engine).toBe(next)
  })

  it('withdrawing one engine leaves the others and their leases alone', () => {
    const registry = createEngineRegistry()
    const one = registry.contribute(engineNamed('voice.one'))
    registry.contribute(engineNamed('voice.two'))
    const other = registry.borrow('voice.two')!
    void one.release()
    expect(other.withdrawn.aborted).toBe(false)
    expect(registry.borrow('voice.two')).not.toBeNull()
  })
})
