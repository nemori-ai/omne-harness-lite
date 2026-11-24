import type {
  CanvasChange,
  CanvasChangeFeed,
  CanvasChangeListener,
  TenantId,
} from '@omne-harness/canvas-contract'
import type { CanvasStore, StoreAnswer } from './store.ts'

export type CanvasChanges = CanvasChangeFeed &
  Readonly<{
    emit(change: CanvasChange): void
    /** Tells every listener the feed is gone; later ones are told when they subscribe. */
    close(): void
  }>

/** A listener that throws is reported and does not keep the others, or the commit, from going on. */
export function createCanvasChanges(report: (error: unknown) => void): CanvasChanges {
  const listeners = new Set<Readonly<{ tenant: TenantId; listener: CanvasChangeListener }>>()
  let closed = false
  const tell = (call: () => void) => {
    try {
      call()
    } catch (error) {
      report(error)
    }
  }
  return {
    subscribe(tenant, listener) {
      const mine = { tenant, listener }
      if (closed) tell(() => listener.closed())
      else listeners.add(mine)
      return () => void listeners.delete(mine)
    },
    emit(change) {
      for (const { tenant, listener } of [...listeners])
        if (tenant === change.tenant) tell(() => listener.changed(change))
    },
    close() {
      closed = true
      const told = [...listeners]
      listeners.clear()
      for (const { listener } of told) tell(() => listener.closed())
    },
  }
}

const WRITES = ['place', 'arrange', 'take', 'pile', 'scatter', 'lock'] as const

type Write = (
  tenant: TenantId,
  command: Readonly<{ canvas: CanvasChange['canvas'] }>,
) => Promise<StoreAnswer<Readonly<{ kind: string }>>>

/** The store that tells the observers after each commit that changed an arrangement, or may have. */
export function observed(store: CanvasStore, changes: Pick<CanvasChanges, 'emit'>): CanvasStore {
  const wrapped: Partial<Record<(typeof WRITES)[number], Write>> = {}
  for (const name of WRITES) {
    const write = store[name].bind(store) as Write
    wrapped[name] = async (tenant, command) => {
      const tell = () => changes.emit({ tenant, canvas: command.canvas })
      let answer: Awaited<ReturnType<Write>>
      try {
        answer = await write(tenant, command)
      } catch (error) {
        tell()
        throw error
      }
      if (
        answer.kind === 'unknown' ||
        (answer.kind === 'committed' && answer.value.kind === 'changed')
      )
        tell()
      return answer
    }
  }
  return { ...store, ...wrapped } as CanvasStore
}
