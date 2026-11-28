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
import { bootVisual } from '../src/page/theme-boot.ts'

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
function page(options: Parameters<typeof createVisualManager>[0] = {}) {
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
  'creates no records on %s connect, event, retry or restore, even for invalid sources',
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
    const first = page(options)
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
  'interleave two connects with %s replicas',
  scenario => {
    const divergent = scenario === 'divergent'
    const winner = raw(1, { size: 'large' })
    const native = sharedMirror(divergent ? winner : null)
    if (divergent) localStorage.setItem(key, raw(2, { size: 'small' }))
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
    const first = page(options)
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
  const manager = page()
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
it('preserves an invalid local record until the first edit', () => {
  localStorage.setItem(key, '{}')
  const write = vi.spyOn(MemoryStorage.prototype, 'setItem')
  const manager = page()
  expect(manager.getSnapshot().preferences).toEqual({})
  expect(local()).toBe('{}')
  expect(write).not.toHaveBeenCalled()
  manager.actions.setSize('large')
  expect(write).toHaveBeenCalledOnce()
  expect(records.decode(local()).record?.preferences).toEqual({ size: 'large' })
})

it('reads the latest observable record before committing without backfilling intermediate values', () => {
  const native = sharedMirror()
  const first = page({ nativeSource: native.source })
  const second = page({ nativeSource: native.source })
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
  const manager = page()
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
it('rechecks local immediately before repair and skips a newly updated target', () => {
  const newer = raw(2, { size: 'medium' })
  localStorage.setItem(key, raw(1, { size: 'large' }))
  const manager = page()
  localStorage.setItem(key, newer)
  vi.spyOn(MemoryStorage.prototype, 'getItem').mockReturnValueOnce(null)
  const write = vi.spyOn(MemoryStorage.prototype, 'setItem')
  restore()
  expect(local()).toBe(newer)
  expect(write).not.toHaveBeenCalled()
  expect(manager.getSnapshot().preferences).toEqual({ size: 'medium' })
  restore()
  expect(manager.getSnapshot().preferences).toEqual({ size: 'medium' })
})
it('converges after two overlapping non-empty field edits based on the same snapshot', () => {
  const a = page()
  const b = page()
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
  'simultaneous reset and field edit converge when winner remains observable: %s',
  survives => {
    const b = page()
    const a = page()
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
    expect(page().getSnapshot().preferences).toEqual(survives ? {} : { size: 'large' })
    expect(records.decode(local()).record?.stamp.t).toBe(survives ? 20 : 10)
  },
)
it.each(['native', 'memory'])(
  'repairs a stale backfill when the winner survives in %s',
  survivor => {
    const native = sharedMirror()
    const options = { nativeSource: native.source }
    const a = page(options)
    const closeA = releases.at(-1)!
    a.actions.setSize('large')
    const old = local()!
    localStorage.removeItem(key)
    const write = localStorage.setItem.bind(localStorage)
    vi.spyOn(MemoryStorage.prototype, 'setItem').mockImplementationOnce((k, v) => {
      a.actions.setTheme('dark')
      write(k, v)
    })
    page(options) // B resumes its pending repair after A commits.
    releases.pop()!()
    const current = native.mirror.record!
    expect(records.decode(current).record?.preferences).toEqual({ size: 'large', theme: 'dark' })
    expect(local()).toBe(old)
    if (survivor === 'native') closeA()
    else native.mirror.record = old
    const observable = records.atStart({
      native: records.decode(native.mirror.record).record,
      local: records.decode(local()).record,
    })!
    window.omneVisualBootstrap = { storageKey: key, record: observable }
    expect(records.encode(observable)).toBe(survivor === 'native' ? current : old)
    const reopened = page(options)
    expect(reopened.getSnapshot().preferences).toEqual(observable.preferences)
    if (survivor === 'memory') restore()
    expect(reopened.getSnapshot().preferences).toEqual({ size: 'large', theme: 'dark' })
    expect([local(), native.mirror.record]).toEqual([current, current])
  },
)

it("loses a closed window's commit if an interrupted backfill overwrites its last replica", () => {
  const old = raw(1, { size: 'large' })
  localStorage.setItem(key, old)
  page() // B keeps the old record in memory and handles the storage event first.
  const closeB = releases.at(-1)!
  const a = page()
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
  expect(page().getSnapshot().preferences).toEqual({ size: 'large' })
  expect(local()).toBe(old)
})
it('reconciles whole records on pageshow and only visible visibilitychange', () => {
  const a = raw(5, { size: 'large' })
  const b = raw(5, { theme: 'dark' })
  const native = sharedMirror(b)
  const manager = page({ nativeSource: native.source })
  localStorage.setItem(key, a)
  restore()
  expect(local()).toBe(b)
  expect(native.mirror.record).toBe(b)
  const peer = page({ nativeSource: native.source })
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
    const manager = page({ warn })
    const setter = vi.spyOn(MemoryStorage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota')
    })
    manager.actions.setSize('large')
    expect(manager.getStatus().storage).toEqual({ local: 'failed', native: 'absent' })
    expect(manager.getSnapshot().preferences.size).toBe('large')
    expect(warn).toHaveBeenCalledExactlyOnceWith('visual preferences were not saved', {
      store: 'local',
      reason: 'Error',
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
  'distinguishes local %s failure from a full quota and probes again on %s',
  (boundary, trigger) => {
    const manager = page()
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
  "retains other windows' fields with local blocked and native=%s",
  withNative => {
    const native = sharedMirror()
    const options = withNative ? { nativeSource: native.source } : {}
    const fault = vi.spyOn(MemoryStorage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    const a = page(options)
    const b = page(options)
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

it('loses an edit on refresh when the local write fails and there is no mirror', () => {
  localStorage.setItem(key, raw(1, { size: 'medium' }))
  const manager = page()
  const localFault = vi.spyOn(MemoryStorage.prototype, 'setItem').mockImplementation(() => {
    throw new Error('quota')
  })
  manager.actions.setSize('large')
  expect(manager.getSnapshot().preferences.size).toBe('large')
  expect(manager.getStatus().storage).toEqual({ local: 'failed', native: 'absent' })
  releases.pop()!()
  localFault.mockRestore()
  const refreshed = page()
  expect(refreshed.getSnapshot().preferences.size).toBe('medium')
  refreshed.actions.setSize('large')
  expect(refreshed.getStatus().storage).toEqual({ local: 'ok', native: 'absent' })
  expect(page().getSnapshot().preferences.size).toBe('large')
})

it("discovers the actual native bridge at connect, independently of the loader's shell", () => {
  expect(page().getStatus().storage.native).toBe('absent')
  window.omneDesktop = {} as NonNullable<Window['omneDesktop']>
  const degraded = page({ nativeSource: desktopVisualSource })
  degraded.actions.setSize('large')
  expect(degraded.getStatus().storage).toEqual({ local: 'ok', native: 'unavailable' })
  expect(records.decode(local()).record?.preferences).toEqual({ size: 'large' })
  expect(page().getStatus().storage.native).toBe('unavailable')
  window.omneDesktop = {
    visual: {
      seed: null,
      read: () => ({ record: null, pending: false }),
      push: async () => 'ok',
    },
  }
  expect(page({ nativeSource: desktopVisualSource }).getStatus().storage.native).toBe('ok')
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
  const manager = page({
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
  const manager = page({ nativeSource: nativeSource(() => ({ record: mirror, pending }), push) })
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
it('interleaves two window connections before the first repairs its stale local copy', () => {
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
it("repairs stale backfills from a peer's pending native mirror and confirms it only on explicit retry", async () => {
  const value = raw(5, { size: 'large' })
  const stale = raw(2, { size: 'medium' })
  let mirror = stale
  let pending = false
  const push = vi.fn<(value: string) => Promise<'ok'>>(async () => {
    pending = false
    return 'ok' as const
  })
  const peer = page({ nativeSource: nativeSource(() => ({ record: mirror, pending }), push) })
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
it('repairs from the pending native mirror and confirms it only on explicit retry', async () => {
  const value = raw(5, { size: 'large' })
  localStorage.setItem(key, raw(3, { size: 'medium' }))
  let pending = true
  const push = vi.fn<(value: string) => Promise<'ok'>>(async () => {
    pending = false
    return 'ok' as const
  })
  const manager = page({ nativeSource: nativeSource(() => ({ record: value, pending }), push) })
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
it('re-probes native read and push transport failures without blocking local storage', async () => {
  const read = vi
    .fn<() => { record: null; pending: boolean }>(() => ({ record: null, pending: false }))
    .mockImplementationOnce(() => {
      throw new Error('ipc')
    })
  const push = vi
    .fn<() => Promise<VisualPushResult>>()
    .mockRejectedValueOnce(new Error('ipc'))
    .mockResolvedValue('ok')
  const manager = page({ nativeSource: nativeSource(read, push) })
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
  ['both saved', false, false],
  ['local write failed', true, false],
  ['mirror write failed', false, true],
  ['both writes failed', true, true],
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
      const manager = page({ nativeSource: mirror.source })
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
      const surviving = cold && failNative ? old : edited
      const next = cold ? openMirror() : mirror
      next.push.mockClear()
      const localWrite = vi.spyOn(MemoryStorage.prototype, 'setItem')
      const restored = restart === 'retry' ? manager : page({ nativeSource: next.source })
      if (restart === 'retry') restored.actions.retry()
      await Promise.resolve()
      expect(restored.getSnapshot().preferences).toEqual(
        records.decode(surviving).record?.preferences,
      )
      expect(local()).toBe(surviving)
      expect(localWrite).toHaveBeenCalledTimes(Number((failLocal ? old : edited) !== surviving))
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

function prepaint() {
  bootVisual(records, window, { dataset: {}, style: { setProperty: () => {} } }, key)
}
function desktopBridge(
  read: () => VisualMirrorSnapshot,
  push: (raw: string) => Promise<VisualPushResult>,
) {
  window.omneDesktop = { visual: { seed: read(), read, push } }
}

it.each([
  ['cold restart', 'native', 'newer', 'native'],
  ['cleared local storage', 'native', null, 'native'],
  ['missing mirror', null, 'newer', 'newer'],
  ['invalid mirror', 'invalid', 'newer', 'newer'],
  ['first launch', null, null, null],
] as const)(
  'starts from the first valid replica and repairs its peers after %s',
  (_, nativeValue, localValue, expected) => {
    const wires = {
      native: raw(1, { size: 'large' }),
      newer: raw(3, { theme: 'dark' }),
      invalid: '{}',
    }
    let mirror: string | null = nativeValue && wires[nativeValue]
    if (localValue) localStorage.setItem(key, wires[localValue])
    const push = vi.fn<(value: string) => Promise<'ok'>>(async value => {
      mirror = value
      return 'ok'
    })
    desktopBridge(() => ({ record: mirror, pending: false }), push)
    const winner = expected && wires[expected]
    const localWrite = vi.spyOn(MemoryStorage.prototype, 'setItem')
    prepaint()
    expect(window.omneVisualBootstrap?.record).toEqual(records.decode(winner).record)
    const manager = page({ nativeSource: desktopVisualSource })
    expect(manager.getSnapshot().preferences).toEqual(
      records.decode(winner).record?.preferences ?? {},
    )
    expect([mirror, local()]).toEqual([winner, winner])
    expect(push).toHaveBeenCalledTimes(Number(nativeValue !== expected))
    expect(localWrite).toHaveBeenCalledTimes(Number(localValue !== expected))
  },
)

it.each([null, raw(1, { size: 'small' })])(
  'first connect re-reads every store after prepaint (mirror %s)',
  current => {
    localStorage.setItem(key, raw(2, { size: 'large' }))
    prepaint()
    const native = sharedMirror(current)
    const manager = createVisualManager({
      host: window,
      warn: vi.fn(),
      nativeSource: native.source,
    })
    expect(manager.getSnapshot().preferences.size).toBe('large')
    localStorage.clear()
    releases.push(manager.connect())
    expect(manager.getSnapshot().preferences).toEqual(
      records.decode(current).record?.preferences ?? {},
    )
    expect([native.mirror.record, local()]).toEqual([current, current])
  },
)

it('preserves a command before first connect and uses runtime ordering on reconnect', () => {
  const old = raw(1, { size: 'small' })
  const native = sharedMirror(old)
  localStorage.setItem(key, raw(2, { theme: 'dark' }))
  const manager = createVisualManager({ host: window, warn: vi.fn(), nativeSource: native.source })
  manager.actions.setSize('large')
  const edit = local()
  expect(records.decode(edit).record?.preferences).toEqual({ theme: 'dark', size: 'large' })
  for (let i = 0; i < 2; i++) {
    native.mirror.record = old
    localStorage.removeItem(key)
    const disconnect = manager.connect()
    try {
      expect([native.mirror.record, local()]).toEqual([edit, edit])
      expect(manager.getSnapshot().preferences).toEqual(records.decode(edit).record!.preferences)
    } finally {
      disconnect()
    }
  }
})

it('starts the native push before writing local storage', () => {
  const native = sharedMirror()
  const manager = page({ nativeSource: native.source })
  const write = vi.spyOn(MemoryStorage.prototype, 'setItem')
  manager.actions.setTheme('dark')
  expect(native.push).toHaveBeenCalledOnce()
  expect(native.push.mock.invocationCallOrder[0]).toBeLessThan(write.mock.invocationCallOrder[0]!)
  expect(local()).toBe(native.mirror.record)
})

it('keeps an equal pending native retry live across pageshow', async () => {
  const reply = pushGate()
  const value = raw(1, { size: 'large' })
  localStorage.setItem(key, value)
  let pending = true
  const push = vi.fn<() => typeof reply.promise>(() => reply.promise)
  const manager = page({ nativeSource: nativeSource(() => ({ record: value, pending }), push) })
  try {
    manager.actions.retry()
    restore()
    expect(push).toHaveBeenCalledExactlyOnceWith(value)
    expect(manager.getStatus().storage.native).toBe('failed')
    pending = false
    reply.resolve('ok')
    await reply.promise
    expect(manager.getStatus().storage.native).toBe('ok')
  } finally {
    reply.resolve('ok')
  }
})

it.each([false, true])(
  'invalidates a push after a native read failure (rediscovery: %s)',
  async rediscover => {
    const reply = pushGate()
    const read = vi.fn<() => VisualMirrorSnapshot>(() => ({ record: local(), pending: false }))
    desktopBridge(read, () => reply.promise)
    const adapter: NativeVisualSource = { connect: host => desktopVisualSource.connect(host) }
    const manager = page({ nativeSource: adapter })
    const discovery = vi.spyOn(adapter, 'connect')
    try {
      manager.actions.setSize('large')
      read.mockImplementationOnce(() => {
        throw new Error('ipc')
      })
      restore()
      if (rediscover) {
        discovery.mockReturnValueOnce(undefined)
        manager.actions.retry()
      }
      expect(manager.getStatus().storage.native).toBe('unavailable')
      reply.resolve('ok')
      await reply.promise
      expect(manager.getStatus().storage.native).toBe('unavailable')
    } finally {
      discovery.mockRestore()
      reply.resolve('ok')
    }
    manager.actions.retry()
    expect(manager.getStatus().storage.native).toBe('ok')
  },
)

it('first connection retires the pre-connect push when it rediscovers the bridge', async () => {
  const reply = pushGate()
  let mirror: string | null = null
  const adapter = nativeSource(
    () => ({ record: mirror, pending: true }),
    value => {
      mirror = value
      return reply.promise
    },
  )
  const manager = createVisualManager({ host: window, warn: vi.fn(), nativeSource: adapter })
  try {
    manager.actions.setSize('large')
    releases.push(manager.connect())
    expect(manager.getStatus().storage.native).toBe('failed')
    reply.resolve('ok')
    await reply.promise
    expect(manager.getStatus().storage.native).toBe('failed')
    manager.actions.retry()
    await reply.promise
    expect(manager.getStatus().storage.native).toBe('ok')
  } finally {
    reply.resolve('ok')
  }
})
