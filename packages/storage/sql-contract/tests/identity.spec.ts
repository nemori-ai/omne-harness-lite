// The identity of the database behind a storage object (SPEC §2.6): what a member that keeps
// something for each database of a process finds it under.
import { describe, expect, it } from 'vitest'
import { databaseOf, wrapsStorage, type SqlStorage } from '@omne-harness/sql-contract'

const unused = (): never => {
  throw new Error('not called')
}
/** A storage as a provider makes it: its methods are closures of its own. */
const provider = (): SqlStorage => ({
  registerCombination: unused,
  commit: unused,
  query: unused,
  read: () => unused(),
})

describe('databaseOf', () => {
  it('is the same for an object that copies the methods of the provider', () => {
    const storage = provider()
    expect(databaseOf({ ...storage })).toBe(databaseOf(storage))
  })

  it('differs for two providers', () => {
    expect(databaseOf(provider())).not.toBe(databaseOf(provider()))
  })

  it('looks through a Cordis service proxy to the object it wraps', () => {
    const storage = provider()
    const proxy = Object.assign(provider(), { [Symbol.for('cordis.original')]: storage })
    expect(databaseOf(proxy)).toBe(databaseOf(storage))
  })

  it('takes a wrapper with its own read for another database', () => {
    const storage = provider()
    const wrapper: SqlStorage = {
      ...storage,
      read: (request, options) => storage.read(request, options),
    }
    expect(databaseOf(wrapper)).not.toBe(databaseOf(storage))
  })

  it('is the object itself when read is not an own function', () => {
    class Shared implements SqlStorage {
      registerCombination = unused
      commit = unused
      query = unused
      read(): never {
        return unused()
      }
    }
    const one = new Shared()
    expect(databaseOf(one)).toBe(one)
    expect(databaseOf(new Shared())).not.toBe(one)
  })
})

describe('wrapsStorage', () => {
  it('makes a wrapper with its own read the same database as the storage it forwards to', () => {
    const storage = provider()
    const wrapper = wrapsStorage(
      { ...storage, read: (request, options) => storage.read(request, options) },
      storage,
    )
    expect(databaseOf(wrapper)).toBe(databaseOf(storage))
  })

  it('holds for an object that copies the methods of the wrapper', () => {
    const storage = provider()
    const wrapper = wrapsStorage(
      { ...storage, read: (request, options) => storage.read(request, options) },
      storage,
    )
    expect(databaseOf({ ...wrapper })).toBe(databaseOf(storage))
  })

  it('holds through two wrappers', () => {
    const storage = provider()
    const inner = wrapsStorage({ ...storage, read: (r, o) => storage.read(r, o) }, storage)
    const outer = wrapsStorage({ ...inner, read: (r, o) => inner.read(r, o) }, inner)
    expect(databaseOf(outer)).toBe(databaseOf(storage))
  })
})
