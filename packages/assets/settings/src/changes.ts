/** One committed change of a domain, with the revision the domain has after it. Repeating a committed operation repeats its signal. */
export type DomainChange<D> = Readonly<{ domain: D; revision: number }>

export interface ChangeSignal<D> {
  /** The listener runs after the commit. What it throws stays with it; the returned function leaves. */
  subscribe(listener: (change: DomainChange<D>) => void): () => void
}

export type ChangeEmitter<D> = ChangeSignal<D> & Readonly<{ emit(change: DomainChange<D>): void }>

export function createChangeSignal<D>(): ChangeEmitter<D> {
  const listeners = new Set<(change: DomainChange<D>) => void>()
  return {
    subscribe(listener) {
      const own = (change: DomainChange<D>) => listener(change)
      listeners.add(own)
      return () => void listeners.delete(own)
    },
    emit(change) {
      const present = [...listeners]
      for (const listener of present) {
        try {
          listener(change)
        } catch {
          continue
        }
      }
    },
  }
}
