export type Queued = { readonly id: number; readonly target: number; slot: number }

const before = (left: Queued, right: Queued): boolean =>
  left.target < right.target || (left.target === right.target && left.id < right.id)

export class WaitQueue<T extends Queued> {
  readonly #items: T[] = []

  peek(): T | undefined {
    return this.#items[0]
  }

  add(item: T): void {
    this.#items.push(item)
    this.#rise(item, this.#items.length - 1)
  }

  remove(item: T): void {
    const last = this.#items.pop()!
    if (last !== item) this.#sink(last, this.#rise(last, item.slot))
  }

  #place(item: T, slot: number): void {
    this.#items[slot] = item
    item.slot = slot
  }

  #rise(item: T, from: number): number {
    let slot = from
    while (slot > 0) {
      const above = (slot - 1) >> 1
      const parent = this.#items[above]!
      if (!before(item, parent)) break
      this.#place(parent, slot)
      slot = above
    }
    this.#place(item, slot)
    return slot
  }

  #sink(item: T, from: number): void {
    let slot = from
    for (;;) {
      const below = this.#smallerChild(slot)
      if (below === undefined || !before(this.#items[below]!, item)) break
      this.#place(this.#items[below]!, slot)
      slot = below
    }
    this.#place(item, slot)
  }

  #smallerChild(slot: number): number | undefined {
    const left = 2 * slot + 1
    if (left >= this.#items.length) return undefined
    const right = left + 1
    return right < this.#items.length && before(this.#items[right]!, this.#items[left]!)
      ? right
      : left
  }
}
