/** The message a person asked to be shown: a session and an entry of its history. */
export type FocusTarget = Readonly<{ session: string; entry: string }>

// The row to show for an entry: its own row, or the nearest row before it. A tool result is drawn
// inside the reply that called it, and some entries are not drawn at all.
export function rowFor(rows: readonly string[], entry: string): string | null {
  if (!/^\d+$/u.test(entry)) return null
  const wanted = BigInt(entry)
  let best: string | null = null
  for (const row of rows) {
    if (!/^\d+$/u.test(row) || BigInt(row) > wanted) continue
    if (best === null || BigInt(row) > BigInt(best)) best = row
  }
  return best
}

// One target at a time, taken by whoever shows it: a jump happens once, not at every render.
export class EntryFocus {
  private target: FocusTarget | null = null
  private readonly listeners = new Set<() => void>()

  read = (): FocusTarget | null => this.target

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  set(target: FocusTarget | null): void {
    this.target = target
    for (const listener of this.listeners) listener()
  }
}
