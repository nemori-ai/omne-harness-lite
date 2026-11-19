export type ToastTone = 'info' | 'attention'

export type ToastAction = Readonly<{ label: string; page: string; subject?: string }>

/** Data only: the shell draws it and decides how long it stays. */
export type Toast = Readonly<{
  id: string
  tone: ToastTone
  title: string
  body?: string
  action?: ToastAction
}>

export type ShownToast = Readonly<{ key: string; toast: Toast }>

export type ToastSchedule = (run: () => void, delayMs: number) => () => void

export type ToastConfig = Readonly<{ visible: number; durationMs: number; schedule: ToastSchedule }>

/** What the shell service needs from the store: show for a caller, withdraw all a caller showed. */
export interface ToastBoard {
  show(owner: object, toast: Toast): void
  withdraw(owner: object): void
}

export interface ToastStore extends ToastBoard {
  dismiss(key: string): void
  shown(): readonly ShownToast[]
  subscribe(listener: () => void): () => void
}

type Held = { readonly key: string; readonly owner: object; toast: Toast; stop?: () => void }

function positiveWhole(name: string, value: number): void {
  if (!Number.isInteger(value) || value < 1)
    throw new RangeError(`${name} must be a positive whole number, got ${value}`)
}

export function createToastStore(config: ToastConfig): ToastStore {
  positiveWhole('visible', config.visible)
  positiveWhole('durationMs', config.durationMs)
  const serials = new WeakMap<object, number>()
  let owners = 0
  const shown: Held[] = []
  const queued: Held[] = []
  const listeners = new Set<() => void>()
  let snapshot: readonly ShownToast[] = []

  const keyOf = (owner: object, id: string): string => {
    let serial = serials.get(owner)
    if (serial === undefined) {
      owners += 1
      serial = owners
      serials.set(owner, serial)
    }
    return `${serial}:${id}`
  }

  function changed(): void {
    snapshot = shown.map(({ key, toast }) => ({ key, toast }))
    for (const listener of Array.from(listeners)) listener()
  }

  function start(held: Held): void {
    held.stop?.()
    held.stop = config.schedule(() => take(held), config.durationMs)
  }

  function fill(): void {
    while (shown.length < config.visible && queued.length > 0) {
      const next = queued.shift()!
      shown.push(next)
      start(next)
    }
  }

  function take(held: Held): void {
    const at = shown.indexOf(held)
    if (at === -1) return
    shown.splice(at, 1)
    held.stop?.()
    fill()
    changed()
  }

  return {
    show(owner, toast) {
      const key = keyOf(owner, toast.id)
      const held = shown.find(item => item.key === key)
      if (held !== undefined) {
        held.toast = toast
        start(held)
        changed()
        return
      }
      const waiting = queued.find(item => item.key === key)
      if (waiting !== undefined) {
        waiting.toast = toast
        return
      }
      queued.push({ key, owner, toast })
      if (shown.length === config.visible) return
      fill()
      changed()
    },
    withdraw(owner) {
      const mine = (item: Held) => item.owner === owner
      const before = shown.length
      for (let at = queued.length - 1; at >= 0; at -= 1) if (mine(queued[at]!)) queued.splice(at, 1)
      for (const held of shown.filter(mine)) {
        held.stop?.()
        shown.splice(shown.indexOf(held), 1)
      }
      if (shown.length === before) return
      fill()
      changed()
    },
    dismiss(key) {
      const held = shown.find(item => item.key === key)
      if (held !== undefined) take(held)
    },
    shown: () => snapshot,
    subscribe(listener) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
  }
}
