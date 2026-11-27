import type { OmneDesktopBridge, VisualPushResult } from '../../shared/desktop-bridge.ts'
import {
  visualRecordKernel as records,
  type VisualPreferences,
  type VisualRecord,
} from '../../shared/visual-record.ts'

export const VISUAL_KEY = 'omne.visual'

export interface VisualState {
  readonly preferences: Readonly<Partial<VisualPreferences>>
  readonly effective: Readonly<VisualPreferences>
}
export type StoreStatus = 'ok' | 'failed' | 'unavailable' | 'absent'
export interface VisualStatus {
  readonly initialized: boolean
  readonly storage: Readonly<Record<'local' | 'native', StoreStatus>>
}

/** Where the main process's mirror is found: the preload's bridge on the main window, nothing elsewhere. */
export interface NativeVisualSource {
  connect(host: Window): Pick<OmneDesktopBridge['visual'], 'read' | 'push'> | undefined
}

export const desktopVisualSource: NativeVisualSource = {
  connect(host) {
    const visual = host.omneDesktop?.visual
    if (typeof visual?.read !== 'function' || typeof visual.push !== 'function') return undefined
    return { read: visual.read, push: visual.push }
  },
}

function resolve(record: VisualRecord | undefined): VisualState {
  return Object.freeze({
    preferences: Object.freeze({ ...record?.preferences }),
    effective: Object.freeze(records.effective(record)),
  })
}
function needsRepair(current: VisualRecord | undefined, target: VisualRecord, start: boolean) {
  if (!current) return true
  const order = records.compare(current, target)
  return start ? order !== 0 : order < 0
}
function subscriptions() {
  const listeners = new Set<() => void>()
  return {
    subscribe(this: void, listener: () => void) {
      listeners.add(listener)
      return () => void listeners.delete(listener)
    },
    notify() {
      for (const listener of listeners) listener()
    },
  }
}

type VisualOptions = {
  host?: Window | undefined
  nativeSource?: NativeVisualSource | undefined
  warn?: (message: string, detail: Readonly<Record<string, unknown>>) => void
}
type Change = (preferences: Partial<VisualPreferences>) => Partial<VisualPreferences>

/** The page's one owner of the visual record. It keeps the copies in memory, in local storage and in the
 main process's mirror converged on the greatest record, and is the only one that writes them. */
class VisualRecordOwner {
  record: VisualRecord | undefined
  state: VisualState
  readonly storage: Record<keyof VisualStatus['storage'], StoreStatus> = {
    local: 'ok',
    native: 'absent',
  }
  initialized = false
  startPending = true
  status: VisualStatus
  readonly changes = subscriptions()
  readonly statusChanges = subscriptions()
  connections = 0
  cleanup: (() => void) | undefined
  native: ReturnType<NativeVisualSource['connect']>
  latestPush: { record: VisualRecord } | undefined
  readonly reasons: Record<keyof VisualStatus['storage'], string> = {
    local: 'unknown',
    native: 'not on disk in the main process',
  }
  readonly host: Window | undefined
  readonly nativeSource: NativeVisualSource | undefined
  readonly warn: NonNullable<VisualOptions['warn']>

  constructor({ host, nativeSource, warn }: VisualOptions) {
    this.host = host
    this.nativeSource = nativeSource
    this.warn = warn ?? ((message, detail) => console.warn(message, detail))
    const handoff = host?.omneVisualBootstrap
    this.record = handoff?.storageKey === VISUAL_KEY ? handoff.record : undefined
    this.state = resolve(this.record)
    this.status = Object.freeze({
      initialized: this.initialized,
      storage: Object.freeze({ ...this.storage }),
    })
  }

  publishStatus() {
    const { status, storage, initialized } = this
    if (
      status.initialized === initialized &&
      status.storage.local === storage.local &&
      status.storage.native === storage.native
    )
      return
    for (const store of ['local', 'native'] as const)
      if (storage[store] === 'failed' && status.storage[store] !== 'failed')
        this.warn('visual preferences were not saved', { store, reason: this.reasons[store] })
    this.status = Object.freeze({ initialized, storage: Object.freeze({ ...storage }) })
    this.statusChanges.notify()
  }

  publish() {
    const next = resolve(this.record)
    if (JSON.stringify(next) !== JSON.stringify(this.state)) {
      this.state = next
      this.changes.notify()
    }
    this.publishStatus()
  }

  connectNative() {
    this.latestPush = undefined
    const { host } = this
    if (!host) return
    try {
      this.native = this.nativeSource?.connect(host)
      this.storage.native = this.native
        ? 'ok'
        : host.omneDesktop !== undefined
          ? 'unavailable'
          : 'absent'
    } catch {
      this.native = undefined
      this.storage.native = 'unavailable'
    }
  }

  readLocal() {
    try {
      return records.decode(this.host!.localStorage.getItem(VISUAL_KEY))
    } catch {
      this.storage.local = 'unavailable'
      return undefined
    }
  }

  readNative() {
    if (!this.native || this.storage.native === 'unavailable') return undefined
    try {
      const mirror = this.native.read()
      const observed = records.decode(mirror.record).record
      if (this.latestPush && observed) {
        const order = records.compare(observed, this.latestPush.record)
        if (order > 0 || (order === 0 && !mirror.pending)) this.latestPush = undefined
      }
      this.storage.native = mirror.pending ? 'failed' : 'ok'
      return observed
    } catch {
      this.latestPush = undefined
      this.storage.native = 'unavailable'
      return undefined
    }
  }

  adopt(...observed: (VisualRecord | undefined)[]) {
    this.record = records.pick([this.record, ...observed])
    if (this.latestPush && this.record && records.behind(this.latestPush.record, this.record))
      this.latestPush = undefined
  }

  observe(start = false) {
    const mirror = this.readNative()
    const local = this.available('local') ? this.readLocal()?.record : undefined
    const observed = { native: mirror, local }
    if (start) this.record = records.atStart(observed)
    else this.adopt(mirror, local)
    return observed
  }

  writeLocal(raw: string) {
    let target: Storage
    try {
      target = this.host!.localStorage
    } catch {
      this.storage.local = 'unavailable'
      return
    }
    try {
      target.setItem(VISUAL_KEY, raw)
      this.storage.local = 'ok'
    } catch (err) {
      this.reasons.local = err instanceof Error ? err.name : String(err)
      this.storage.local = 'failed'
    }
  }

  async push(target: VisualRecord) {
    const { native } = this
    if (!native) return
    const operation = { record: target }
    this.latestPush = operation
    let result: VisualPushResult
    try {
      result = await native.push(records.encode(target))
    } catch {
      result = 'unavailable'
    }
    if (this.latestPush !== operation) return
    this.latestPush = undefined
    this.storage.native = result
    this.publishStatus()
  }

  available(store: keyof VisualStatus['storage']) {
    return this.storage[store] !== 'absent' && this.storage[store] !== 'unavailable'
  }

  repairLocal(observed: VisualRecord | undefined, start: boolean) {
    const target = this.record
    if (!target || !this.available('local')) return
    if (!needsRepair(observed, target, start)) {
      this.storage.local = 'ok'
      return
    }
    // Another window can update local storage between selection and repair.
    const current = this.readLocal()
    if (!current) return
    if (!needsRepair(current.record, target, start)) {
      if (!start) this.adopt(current.record)
      this.storage.local = 'ok'
      return
    }
    this.writeLocal(records.encode(target))
  }

  reconcile(trigger: 'start' | 'connect' | 'event' | 'restore' | 'retry') {
    const { storage } = this
    const start = trigger === 'start'
    if (trigger !== 'event') {
      if (storage.local === 'unavailable') storage.local = 'ok'
      if (start || trigger === 'connect' || storage.native === 'unavailable') this.connectNative()
    }
    const observed = this.observe(start)
    let beforeRepair: VisualRecord | undefined
    // A later read can reveal a newer winner after the repair was checked.
    do {
      beforeRepair = this.record
      this.repairLocal(observed.local, start)
    } while (this.record !== beforeRepair)
    if (
      this.record &&
      this.available('native') &&
      (records.behind(observed.native, this.record) ||
        (trigger === 'retry' && storage.native === 'failed'))
    )
      void this.push(this.record)
    this.publish()
  }

  commit(change: Change) {
    // A command can come before the connection.
    if (!this.initialized) this.connectNative()
    this.observe()
    this.latestPush = undefined
    const record: VisualRecord = {
      version: 1,
      stamp: records.nextStamp([this.record]),
      preferences: change({ ...this.record?.preferences }),
    }
    this.record = record
    this.startPending = false
    if (this.available('native')) void this.push(record)
    if (this.available('local')) this.writeLocal(records.encode(record))
    this.publish()
  }

  reset(field: keyof VisualPreferences) {
    this.commit(preferences => {
      delete preferences[field]
      return preferences
    })
  }

  attach(window: Window) {
    const trigger = this.startPending ? 'start' : 'connect'
    this.startPending = false
    this.initialized = true
    this.reconcile(trigger)
    const onStorage = (event: StorageEvent) => {
      if (event.key === VISUAL_KEY || event.key === null) this.reconcile('event')
    }
    const onRestore = () => this.reconcile('restore')
    const onVisibility = () => {
      if (window.document.visibilityState === 'visible') onRestore()
    }
    window.addEventListener('storage', onStorage)
    window.addEventListener('pageshow', onRestore)
    window.document.addEventListener('visibilitychange', onVisibility)
    return () => {
      window.removeEventListener('storage', onStorage)
      window.removeEventListener('pageshow', onRestore)
      window.document.removeEventListener('visibilitychange', onVisibility)
      this.latestPush = undefined
    }
  }
}

export function createVisualManager(options: VisualOptions = {}) {
  const owner = new VisualRecordOwner(options)
  const actions = Object.freeze({
    setTheme: (theme: VisualPreferences['theme']) => owner.commit(base => ({ ...base, theme })),
    setSize: (size: VisualPreferences['size']) => owner.commit(base => ({ ...base, size })),
    resetTheme: () => owner.reset('theme'),
    resetSize: () => owner.reset('size'),
    resetVisualPreferences: () => owner.commit(() => ({})),
    retry: () => owner.reconcile('retry'),
  })
  return {
    actions,
    getSnapshot: () => owner.state,
    getStatus: () => owner.status,
    subscribe: owner.changes.subscribe,
    subscribeStatus: owner.statusChanges.subscribe,
    connect() {
      const { host } = options
      if (!host) return () => {}
      if (++owner.connections === 1) owner.cleanup = owner.attach(host)
      let released = false
      return () => {
        if (released) return
        released = true
        if (--owner.connections === 0) owner.cleanup?.()
      }
    },
  }
}

export type VisualManager = ReturnType<typeof createVisualManager>
