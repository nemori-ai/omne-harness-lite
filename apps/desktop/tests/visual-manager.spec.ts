// @vitest-environment happy-dom
import { mkdtempSync, readFileSync, rmSync, writeFileSync, realpathSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it, onTestFinished, vi } from 'vitest'

import type { VisualMirrorSnapshot, VisualPushResult } from '../src/shared/desktop-bridge.ts'
import {
  visualRecordKernel as records,
  type VisualPreferences,
} from '../src/shared/visual-record.ts'
import {
  createVisualManager,
  desktopVisualSource,
  type NativeVisualSource,
  VISUAL_KEY as key,
} from '../src/page/shell/visual.ts'

type Mirror = NonNullable<ReturnType<NativeVisualSource['connect']>>

// Node's unconfigured localStorage shadows happy-dom's, whose methods bind per instance and defeat spies.
class MemoryStorage {
  readonly #items = new Map<string, string>()
  get length() {
    return this.#items.size
  }
  key(index: number) {
    return [...this.#items.keys()][index] ?? null
  }
  getItem(name: string) {
    return this.#items.get(name) ?? null
  }
  setItem(name: string, value: string) {
    this.#items.set(name, String(value))
  }
  removeItem(name: string) {
    this.#items.delete(name)
  }
  clear() {
    this.#items.clear()
  }
}
const store = new MemoryStorage()
Object.defineProperty(window, 'localStorage', { get: () => store, configurable: true })
const releases: (() => void)[] = []
function raw(t: number, preferences: Partial<VisualPreferences> = {}, id = 'a') {
  return records.encode({ version: 1, stamp: { t, id }, preferences })
}
function local() {
  return localStorage.getItem(key)
}
function tab(options: Parameters<typeof createVisualManager>[0] = {}) {
  const manager = createVisualManager({ host: window, warn: vi.fn(), ...options })
  releases.push(manager.connect())
  return manager
}
function signal() {
  window.dispatchEvent(new StorageEvent('storage', { key, newValue: raw(9999, { size: 'large' }) }))
}
function restore() {
  window.dispatchEvent(new Event('pageshow'))
}
function bootstrap(value: string | null) {
  window.omneVisualBootstrap = { storageKey: key, record: records.decode(value).record! }
}
function cleanupStores() {
  localStorage.clear()
  delete window.omneVisualBootstrap
  delete window.omneDesktop
}
// happy-dom still calls a listener removed during the same dispatch; the DOM spec and Chromium skip it.
const removed = new WeakSet<EventListenerOrEventListenerObject>()
const guards = new WeakMap<EventListenerOrEventListenerObject, EventListener>()
beforeEach(() => {
  cleanupStores()
  const add = window.addEventListener.bind(window)
  const remove = window.removeEventListener.bind(window)
  vi.spyOn(window, 'addEventListener').mockImplementation((type, listener, options) => {
    if (!listener) return
    const guard: EventListener = event => {
      if (removed.has(listener)) return
      if (typeof listener === 'function') listener.call(window, event)
      else listener.handleEvent(event)
    }
    removed.delete(listener)
    guards.set(listener, guard)
    add(type, guard, options)
  })
  vi.spyOn(window, 'removeEventListener').mockImplementation((type, listener, options) => {
    if (!listener) return
    removed.add(listener)
    remove(type, guards.get(listener) ?? listener, options)
  })
})
afterEach(() => {
  while (releases.length) releases.pop()!()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  cleanupStores()
})

function nativeSource(read: Mirror['read'], push: Mirror['push']): NativeVisualSource {
  return { connect: () => ({ read, push }) }
}
function sharedMirror(initial: string | null = null) {
  const mirror = { record: initial, pending: false }
  const push = vi.fn<(value: string) => Promise<VisualPushResult>>(async value => {
    mirror.record = value
    return 'ok'
  })
  return { mirror, push, source: nativeSource(() => ({ ...mirror }), push) }
}

it.each(['web', 'desktop'] as const)(
  'E18 creates no records on %s connect, event, retry or restore, even for invalid sources',
  shell => {
    localStorage.setItem(key, '{}')
    const write = vi.spyOn(MemoryStorage.prototype, 'setItem')
    const push = vi.fn<() => Promise<'ok'>>()
    const source = nativeSource(() => ({ record: null, pending: false }), push)
    const options = shell === 'desktop' ? { nativeSource: source } : {}
    const second = createVisualManager({ host: window, warn: vi.fn(), ...options })
    const read = localStorage.getItem.bind(localStorage)
    vi.spyOn(MemoryStorage.prototype, 'getItem').mockImplementationOnce(name => {
      const sampled = read(name)
      releases.push(second.connect())
      return sampled
    })
    const first = tab(options)
    signal()
    restore()
    first.actions.retry()
    expect(first.getSnapshot()).toEqual(second.getSnapshot())
    expect(first.getSnapshot().preferences).toEqual({})
    expect(write).not.toHaveBeenCalled()
    expect(push).not.toHaveBeenCalled()
  },
)

it.each(['missing', 'invalid', 'divergent'])(
  'E11/E18 interleave two connects with %s replicas',
  scenario => {
    const divergent = scenario === 'divergent'
    const winner = raw(2, { size: 'large' })
    const native = sharedMirror(divergent ? winner : null)
    if (divergent) localStorage.setItem(key, raw(1, { size: 'small' }))
    else if (scenario === 'invalid') localStorage.setItem(key, '{}')
    const write = vi.spyOn(MemoryStorage.prototype, 'setItem')
    const options = { nativeSource: native.source }
    const second = createVisualManager({ host: window, warn: vi.fn(), ...options })
    // The first connect has sampled local. Finish the second connect before the first selects a winner.
    const read = localStorage.getItem.bind(localStorage)
    vi.spyOn(MemoryStorage.prototype, 'getItem').mockImplementationOnce(name => {
      const sampled = read(name)
      releases.push(second.connect())
      return sampled
    })
    const first = tab(options)
    expect(second.getStatus().initialized).toBe(true)
    expect(first.getSnapshot()).toEqual(second.getSnapshot())
    expect(first.getSnapshot().preferences).toEqual(divergent ? { size: 'large' } : {})
    expect(local()).toBe(divergent ? winner : scenario === 'invalid' ? '{}' : null)
    expect(native.mirror.record).toBe(divergent ? winner : null)
    signal()
    restore()
    first.actions.retry()
    expect(write).toHaveBeenCalledTimes(divergent ? 1 : 0)
    expect(native.push).not.toHaveBeenCalled()
  },
)

it('resets individual size and theme choices and stamps even a repeated whole reset', () => {
  const manager = tab()
  manager.actions.setSize('large')
  manager.actions.setTheme('dark')
  manager.actions.resetTheme()
  expect(records.decode(local()).record?.preferences).toEqual({ size: 'large' })
  manager.actions.resetSize()
  const empty = records.decode(local()).record!
  expect(empty.preferences).toEqual({})
  manager.actions.resetVisualPreferences()
  expect(records.decode(local()).record!.stamp.t).toBeGreaterThan(empty.stamp.t)
})
it('A2 preserves an invalid SPA record until the first user edit', () => {
  localStorage.setItem(key, '{}')
  const write = vi.spyOn(MemoryStorage.prototype, 'setItem')
  const manager = tab()
  expect(manager.getSnapshot().preferences).toEqual({})
  expect(local()).toBe('{}')
  expect(write).not.toHaveBeenCalled()
  manager.actions.setSize('large')
  expect(write).toHaveBeenCalledOnce()
  expect(records.decode(local()).record?.preferences).toEqual({ size: 'large' })
})

it('E1/E13 reads the latest observable record before committing without backfilling intermediate values', () => {
  const native = sharedMirror()
  const first = tab({ nativeSource: native.source })
  const second = tab({ nativeSource: native.source })
  vi.spyOn(Date, 'now').mockReturnValue(500)
  first.actions.setSize('large')
  vi.mocked(Date.now).mockReturnValue(100)
  const writer = vi.spyOn(MemoryStorage.prototype, 'setItem')
  localStorage.removeItem(key)
  second.actions.setTheme('dark')
  expect(records.decode(local()).record).toMatchObject({
    stamp: { t: 501 },
    preferences: { size: 'large', theme: 'dark' },
  })
  expect(writer).toHaveBeenCalledTimes(1)
  expect(native.mirror.record).toBe(local())
  signal()
  expect(first.getSnapshot()).toEqual(second.getSnapshot())
})
it('re-reads storage on events, repairs deletion from memory and skips equal targets', () => {
  const manager = tab()
  const value = raw(4, { size: 'large' })
  localStorage.setItem(key, value)
  const write = vi.spyOn(MemoryStorage.prototype, 'setItem')
  signal()
  expect(manager.getSnapshot().preferences).toEqual({ size: 'large' })
  expect(write).not.toHaveBeenCalled()
  localStorage.clear()
  window.dispatchEvent(new StorageEvent('storage', { key: null }))
  expect(local()).toBe(value)
  signal()
  expect(write).toHaveBeenCalledTimes(1)
})
it('E3 rechecks local immediately before repair and skips a newly updated target', () => {
  const newer = raw(2, { size: 'medium' })
  bootstrap(raw(1, { size: 'large' }))
  localStorage.setItem(key, newer)
  vi.spyOn(MemoryStorage.prototype, 'getItem').mockReturnValueOnce(null)
  const write = vi.spyOn(MemoryStorage.prototype, 'setItem')
  const manager = tab()
  expect(local()).toBe(newer)
  expect(write).not.toHaveBeenCalled()
  expect(manager.getSnapshot().preferences).toEqual({ size: 'medium' })
  restore()
  expect(manager.getSnapshot().preferences).toEqual({ size: 'medium' })
})
it('E2 converges after two overlapping non-empty field edits based on the same snapshot', () => {
  const a = tab()
  const b = tab()
  const now = vi.spyOn(Date, 'now').mockReturnValue(10)
  const writes = vi.spyOn(MemoryStorage.prototype, 'setItem')
  // B samples local, then A completes its commit before B's read returns the old snapshot.
  const read = localStorage.getItem.bind(localStorage)
  vi.spyOn(MemoryStorage.prototype, 'getItem').mockImplementationOnce(name => {
    const sampled = read(name)
    a.actions.setSize('large')
    now.mockReturnValue(11)
    return sampled
  })
  b.actions.setTheme('dark')
  const commits = writes.mock.calls.map(([, value]) => records.decode(value).record)
  expect(commits).toMatchObject([
    { stamp: { t: 10 }, preferences: { size: 'large' } },
    { stamp: { t: 11 }, preferences: { theme: 'dark' } },
  ])
  expect(a.getSnapshot().preferences).toEqual({ size: 'large' })
  expect(b.getSnapshot().preferences).toEqual({ theme: 'dark' })
  const winner = writes.mock.calls[1]![1]
  signal()
  expect(a.getSnapshot().preferences).toEqual({ theme: 'dark' })
  expect(a.getSnapshot()).toEqual(b.getSnapshot())
  expect(local()).toBe(winner)
  expect(writes).toHaveBeenCalledTimes(2)
})

it.each([true, false])(
  'E14 simultaneous reset and field edit converge when winner remains observable: %s',
  survives => {
    const b = tab()
    const a = tab()
    vi.spyOn(Date, 'now').mockReturnValueOnce(10).mockReturnValue(20)
    const write = localStorage.setItem.bind(localStorage)
    // B has completed its read and stamp. Let A commit and optionally close before releasing B's write.
    vi.spyOn(MemoryStorage.prototype, 'setItem').mockImplementationOnce((k, v) => {
      a.actions.resetVisualPreferences()
      if (!survives) releases.pop()!()
      write(k, v)
    })
    b.actions.setSize('large')
    expect(records.decode(local()).record?.stamp.t).toBe(10)
    signal()
    expect(tab().getSnapshot().preferences).toEqual(survives ? {} : { size: 'large' })
    expect(records.decode(local()).record?.stamp.t).toBe(survives ? 20 : 10)
  },
)
it.each(['native', 'memory'])(
  'E3/E4 repairs a stale backfill when the winner survives in %s',
  survivor => {
    const native = sharedMirror()
    const options = { nativeSource: native.source }
    const a = tab(options)
    const closeA = releases.at(-1)!
    a.actions.setSize('large')
    const old = local()!
    localStorage.removeItem(key)
    const write = localStorage.setItem.bind(localStorage)
    vi.spyOn(MemoryStorage.prototype, 'setItem').mockImplementationOnce((k, v) => {
      a.actions.setTheme('dark')
      write(k, v)
    })
    tab(options) // B resumes its pending repair after A commits.
    releases.pop()!()
    const current = native.mirror.record!
    expect(records.decode(current).record?.preferences).toEqual({ size: 'large', theme: 'dark' })
    expect(local()).toBe(old)
    if (survivor === 'native') closeA()
    else native.mirror.record = old
    const observable = records.pick(
      [local(), native.mirror.record].map(value => records.decode(value).record),
    )!
    window.omneVisualBootstrap = { storageKey: key, record: observable }
    expect(records.encode(observable)).toBe(survivor === 'native' ? current : old)
    const reopened = tab(options)
    expect(reopened.getSnapshot().preferences).toEqual(observable.preferences)
    if (survivor === 'memory') restore()
    expect(reopened.getSnapshot().preferences).toEqual({ size: 'large', theme: 'dark' })
    expect([local(), native.mirror.record]).toEqual([current, current])
  },
)

it("E3 loses a closed SPA tab's commit if an interrupted backfill overwrites its last replica", () => {
  const old = raw(1, { size: 'large' })
  localStorage.setItem(key, old)
  tab() // B keeps the old record in memory and handles the storage event first.
  const closeB = releases.at(-1)!
  const a = tab()
  const closeA = releases.at(-1)!
  localStorage.removeItem(key)
  let lastReplica: string | null = null
  const write = localStorage.setItem.bind(localStorage)
  vi.spyOn(MemoryStorage.prototype, 'setItem').mockImplementationOnce((k, v) => {
    a.actions.setTheme('dark')
    lastReplica = local()
    closeA()
    write(k, v)
  })
  signal()
  closeB()
  const winner = records.decode(lastReplica).record!
  expect(winner.preferences).toEqual({ size: 'large', theme: 'dark' })
  expect(winner.stamp.t).toBeGreaterThan(1)
  expect(local()).toBe(old)
  expect(tab().getSnapshot().preferences).toEqual({ size: 'large' })
  expect(local()).toBe(old)
})
it('E12/E15/E16 reconciles whole records on pageshow and only visible visibilitychange', () => {
  const a = raw(5, { size: 'large' })
  const b = raw(5, { theme: 'dark' })
  const native = sharedMirror(b)
  const manager = tab({ nativeSource: native.source })
  localStorage.setItem(key, a)
  restore()
  expect(local()).toBe(b)
  expect(native.mirror.record).toBe(b)
  const peer = tab({ nativeSource: native.source })
  peer.actions.resetVisualPreferences()
  const newest = local()
  native.mirror.record = b
  const visibility = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden')
  document.dispatchEvent(new Event('visibilitychange'))
  expect(manager.getSnapshot().preferences).toEqual({ theme: 'dark' })
  expect(native.mirror.record).toBe(b)
  visibility.mockReturnValue('visible')
  document.dispatchEvent(new Event('visibilitychange'))
  expect(manager.getSnapshot().preferences).toEqual({})
  expect(native.mirror.record).toBe(newest)
  localStorage.setItem(key, a) // Manual regression to an older stamp.
  restore()
  expect([local(), native.mirror.record]).toEqual([newest, newest])
})
it.each(['retry', 'pageshow'])(
  'recovers local quota failure on %s without producing a new stamp',
  trigger => {
    const warn = vi.fn()
    const manager = tab({ warn })
    const setter = vi.spyOn(MemoryStorage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota')
    })
    manager.actions.setSize('large')
    expect(manager.getStatus().storage).toEqual({ local: 'failed', native: 'absent' })
    expect(manager.getSnapshot().preferences.size).toBe('large')
    expect(warn).toHaveBeenCalledExactlyOnceWith('visual preferences were not saved', {
      store: 'local',
    })
    const target = setter.mock.calls[0]![1]
    setter.mockRestore()
    if (trigger === 'retry') manager.actions.retry()
    else restore()
    expect(local()).toBe(target)
    expect(manager.getStatus().storage.local).toBe('ok')
  },
)
it.each([
  ['access', 'retry'],
  ['read', 'pageshow'],
] as const)(
  'E17 distinguishes local %s failure from a full quota and probes again on %s',
  (boundary, trigger) => {
    const manager = tab()
    const fault =
      boundary === 'access'
        ? vi.spyOn(window, 'localStorage', 'get')
        : vi.spyOn(MemoryStorage.prototype, 'getItem')
    fault.mockImplementation(() => {
      throw new Error('blocked')
    })
    manager.actions.setSize('large')
    expect(manager.getStatus().storage).toEqual({ local: 'unavailable', native: 'absent' })
    signal()
    expect(fault).toHaveBeenCalledOnce()
    fault.mockRestore()
    if (trigger === 'retry') manager.actions.retry()
    else restore()
    expect(manager.getStatus().storage.local).toBe('ok')
    expect(records.decode(local()).record?.preferences).toEqual({ size: 'large' })
  },
)
it.each([true, false])(
  "E19 retains other tabs' fields with local blocked and native=%s",
  withNative => {
    const native = sharedMirror()
    const options = withNative ? { nativeSource: native.source } : {}
    const fault = vi.spyOn(MemoryStorage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    const a = tab(options)
    const b = tab(options)
    a.actions.setSize('large')
    b.actions.setTheme('dark')
    expect(a.getSnapshot().preferences).toEqual({ size: 'large' })
    expect(a.getStatus().storage.local).toBe('unavailable')
    expect(b.getStatus().storage.local).toBe('unavailable')
    expect(records.decode(native.mirror.record).record?.preferences).toEqual(
      withNative ? { size: 'large', theme: 'dark' } : undefined,
    )
    expect(b.getSnapshot().preferences).toEqual(
      withNative ? { size: 'large', theme: 'dark' } : { theme: 'dark' },
    )
    fault.mockRestore()
    restore()
    expect(local()).not.toBeNull()
  },
)

it('loses a Web-only edit on refresh when the local write fails', () => {
  localStorage.setItem(key, raw(1, { size: 'medium' }))
  const manager = tab()
  const localFault = vi.spyOn(MemoryStorage.prototype, 'setItem').mockImplementation(() => {
    throw new Error('quota')
  })
  manager.actions.setSize('large')
  expect(manager.getSnapshot().preferences.size).toBe('large')
  expect(manager.getStatus().storage).toEqual({ local: 'failed', native: 'absent' })
  releases.pop()!()
  localFault.mockRestore()
  const refreshed = tab()
  expect(refreshed.getSnapshot().preferences.size).toBe('medium')
  refreshed.actions.setSize('large')
  expect(refreshed.getStatus().storage).toEqual({ local: 'ok', native: 'absent' })
  expect(tab().getSnapshot().preferences.size).toBe('large')
})

it("discovers the actual native bridge at connect, independently of the loader's shell", () => {
  expect(tab().getStatus().storage.native).toBe('absent')
  window.omneDesktop = {} as NonNullable<Window['omneDesktop']>
  const degraded = tab({ nativeSource: desktopVisualSource })
  degraded.actions.setSize('large')
  expect(degraded.getStatus().storage).toEqual({ local: 'ok', native: 'unavailable' })
  expect(records.decode(local()).record?.preferences).toEqual({ size: 'large' })
  expect(tab().getStatus().storage.native).toBe('unavailable')
  window.omneDesktop = {
    visual: {
      seed: null,
      read: () => ({ record: null, pending: false }),
      push: async () => 'ok',
    },
  }
  expect(tab({ nativeSource: desktopVisualSource }).getStatus().storage.native).toBe('ok')
})
function pushGate() {
  let resolve!: (value: 'ok' | 'failed') => void
  const promise = new Promise<'ok' | 'failed'>(accept => {
    resolve = accept
  })
  return { promise, resolve }
}
it('ignores late native push results from superseded operations', async () => {
  const first = pushGate()
  const second = pushGate()
  let mirror: string | null = null
  const push = vi
    .fn<(value: string) => Promise<'ok' | 'failed'>>(value => {
      mirror = value
      return Promise.resolve<'ok' | 'failed'>('ok')
    })
    .mockImplementationOnce(value => {
      mirror = value
      return first.promise
    })
    .mockImplementationOnce(value => {
      mirror = value
      return second.promise
    })
  const manager = tab({
    nativeSource: nativeSource(() => ({ record: mirror, pending: false }), push),
  })
  try {
    manager.actions.setSize('medium')
    manager.actions.setSize('large')
    second.resolve('failed')
    await second.promise
    expect(manager.getStatus().storage.native).toBe('failed')
    first.resolve('ok')
    await first.promise
    expect(manager.getStatus().storage.native).toBe('failed')
  } finally {
    first.resolve('ok')
    second.resolve('ok')
  }
})
it('keeps a restored native confirmation when the original failed push replies late', async () => {
  const reply = pushGate()
  let mirror: string | null = null
  let pending = false
  const push = vi.fn<(value: string) => typeof reply.promise>(value => {
    mirror = value
    pending = true
    return reply.promise
  })
  const manager = tab({ nativeSource: nativeSource(() => ({ record: mirror, pending }), push) })
  try {
    manager.actions.setSize('large')
    // Main retries the pending write before the original IPC reply reaches this window.
    pending = false
    restore()
    expect(push).toHaveBeenCalledExactlyOnceWith(local())
    expect(manager.getStatus().storage.native).toBe('ok')
    reply.resolve('failed')
    await reply.promise
    expect(manager.getStatus().storage.native).toBe('ok')
  } finally {
    reply.resolve('failed')
  }
})
it('E11 interleaves two window connections before the first repairs its stale local copy', () => {
  const winner = raw(3, { theme: 'dark', size: 'large' })
  localStorage.setItem(key, raw(1))
  const push = vi.fn<() => Promise<'ok'>>()
  const read = vi.fn<() => VisualMirrorSnapshot>(() => ({ record: winner, pending: false }))
  const options = { nativeSource: nativeSource(read, push), warn: vi.fn() }
  const first = createVisualManager({ host: window, ...options })
  const second = createVisualManager({ host: window, ...options })
  const writeLocal = vi.spyOn(MemoryStorage.prototype, 'setItem')
  // The first window has sampled the stale local copy. Finish the second connection
  // inside its synchronous native read, before it can start backfilling.
  read.mockImplementationOnce(() => {
    releases.push(second.connect())
    return { record: winner, pending: false }
  })
  releases.push(first.connect())
  expect(read).toHaveBeenCalledTimes(2)
  for (const manager of [first, second]) {
    expect(manager.getSnapshot().preferences).toEqual({ theme: 'dark', size: 'large' })
    expect(manager.getStatus().storage).toEqual({ local: 'ok', native: 'ok' })
  }
  expect(local()).toBe(winner)
  expect(writeLocal).toHaveBeenCalledExactlyOnceWith(key, winner)
  expect(push).not.toHaveBeenCalled()
})
it("E20/E21 repairs stale backfills from a peer's pending native mirror and confirms it only on explicit retry", async () => {
  const value = raw(5, { size: 'large' })
  const stale = raw(2, { size: 'medium' })
  let mirror = stale
  let pending = false
  const push = vi.fn<(value: string) => Promise<'ok'>>(async () => {
    pending = false
    return 'ok' as const
  })
  const peer = tab({ nativeSource: nativeSource(() => ({ record: mirror, pending }), push) })
  expect(local()).toBe(stale)
  // Another window advances N, then a stale backfill leaves the local copy behind.
  localStorage.setItem(key, value)
  mirror = value
  pending = true
  localStorage.setItem(key, stale)
  signal()
  expect(peer.getSnapshot().preferences).toEqual({ size: 'large' })
  expect(local()).toBe(value)
  signal()
  restore()
  expect(push).not.toHaveBeenCalled()
  expect(peer.getStatus().storage.native).toBe('failed')
  peer.actions.retry()
  await Promise.resolve()
  expect(push).toHaveBeenCalledExactlyOnceWith(value)
  expect(peer.getStatus().storage.native).toBe('ok')
})
it('E20/E21 repairs from the pending native mirror and confirms it only on explicit retry', async () => {
  const value = raw(5, { size: 'large' })
  localStorage.setItem(key, raw(3, { size: 'medium' }))
  let pending = true
  const push = vi.fn<(value: string) => Promise<'ok'>>(async () => {
    pending = false
    return 'ok' as const
  })
  const manager = tab({ nativeSource: nativeSource(() => ({ record: value, pending }), push) })
  expect(local()).toBe(value)
  signal()
  restore()
  expect(push).not.toHaveBeenCalled()
  expect(manager.getStatus().storage.native).toBe('failed')
  manager.actions.retry()
  await Promise.resolve()
  expect(push).toHaveBeenCalledExactlyOnceWith(value)
  expect(manager.getStatus().storage.native).toBe('ok')
})
it('re-probes native read and push transport failures without blocking the Web stores', async () => {
  const read = vi
    .fn<() => { record: null; pending: boolean }>(() => ({ record: null, pending: false }))
    .mockImplementationOnce(() => {
      throw new Error('ipc')
    })
  const push = vi
    .fn<() => Promise<VisualPushResult>>()
    .mockRejectedValueOnce(new Error('ipc'))
    .mockResolvedValue('ok')
  const manager = tab({ nativeSource: nativeSource(read, push) })
  expect(manager.getStatus().storage.native).toBe('unavailable')
  manager.actions.setSize('large')
  expect(records.decode(local()).record?.preferences).toEqual({ size: 'large' })
  manager.actions.retry()
  await Promise.resolve()
  expect(manager.getStatus().storage.native).toBe('unavailable')
  restore()
  await Promise.resolve()
  expect(manager.getStatus().storage.native).toBe('ok')
})

describe.each([
  ['D1', false, false],
  ['D2', true, false],
  ['D4', false, true],
  ['D6', true, true],
] as const)('%s', (_row, failLocal, failNative) => {
  it.each(['retry', 'refresh', 'cold restart'] as const)(
    'recovers the surviving record on %s',
    async restart => {
      const old = raw(1, { size: 'medium' })
      localStorage.setItem(key, old)
      const dir = realpathSync(mkdtempSync(join(tmpdir(), 'visual-restart-')))
      onTestFinished(() => rmSync(dir, { recursive: true, force: true }))
      const file = join(dir, 'visual.json')
      const readFile = () => readFileSync(file, 'utf8')
      writeFileSync(file, old)
      const persist = vi.fn<(value: string) => void>(value => writeFileSync(file, value))
      function openMirror() {
        let record = readFile()
        let pending = false
        const push = vi.fn<(value: string) => Promise<'ok' | 'failed'>>(async value => {
          record = value
          try {
            persist(value)
            pending = false
            return 'ok' as const
          } catch {
            pending = true
            return 'failed' as const
          }
        })
        return { source: nativeSource(() => ({ record, pending }), push), push }
      }
      const mirror = openMirror()
      const manager = tab({ nativeSource: mirror.source })
      const localFault = vi.spyOn(MemoryStorage.prototype, 'setItem')
      if (failLocal)
        localFault.mockImplementation(() => {
          throw new Error('quota')
        })
      if (failNative)
        persist.mockImplementationOnce(() => {
          throw new Error('disk full')
        })
      try {
        manager.actions.setSize('large')
        await Promise.resolve()
        expect(manager.getSnapshot().preferences.size).toBe('large')
        expect(manager.getStatus().storage).toEqual({
          local: failLocal ? 'failed' : 'ok',
          native: failNative ? 'failed' : 'ok',
        })
      } finally {
        localFault.mockRestore()
      }
      if (restart !== 'retry') releases.pop()!()
      expect(mirror.push).toHaveBeenCalledOnce()
      const edited = mirror.push.mock.calls[0]![0]
      expect(records.decode(edited).record?.preferences).toEqual({ size: 'large' })
      expect([local(), readFile()]).toEqual([failLocal ? old : edited, failNative ? old : edited])

      const cold = restart === 'cold restart'
      const surviving = cold && failLocal && failNative ? old : edited
      const next = cold ? openMirror() : mirror
      next.push.mockClear()
      const localWrite = vi.spyOn(MemoryStorage.prototype, 'setItem')
      const restored = restart === 'retry' ? manager : tab({ nativeSource: next.source })
      if (restart === 'retry') restored.actions.retry()
      await Promise.resolve()
      expect(restored.getSnapshot().preferences).toEqual(
        records.decode(surviving).record?.preferences,
      )
      expect(local()).toBe(surviving)
      expect(localWrite).toHaveBeenCalledTimes(Number(failLocal && surviving === edited))
      const retriesNative = restart !== 'refresh' && failNative && surviving === edited
      expect(next.push.mock.calls).toEqual(retriesNative ? [[edited]] : [])
      expect(restored.getStatus().storage).toEqual({
        local: 'ok',
        native: restart === 'refresh' && failNative ? 'failed' : 'ok',
      })
      expect(readFile()).toBe(restart === 'refresh' && failNative ? old : surviving)
      next.push.mockClear()
      restored.actions.retry()
      await Promise.resolve()
      expect(next.push.mock.calls).toEqual(restart === 'refresh' && failNative ? [[edited]] : [])
      expect(readFile()).toBe(surviving)
      expect(restored.getStatus().storage.native).toBe('ok')
    },
  )
})
