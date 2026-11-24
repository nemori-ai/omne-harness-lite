import type {
  CanvasId,
  Instant,
  Item,
  ItemId,
  Mover,
  Pile,
  PileId,
  Spot,
} from '@omne-harness/canvas-contract'
import type { CanvasFacts } from './facts.ts'
import { freeSpot, roomOf, takenRects } from './geometry.ts'
import type { Rules } from './store.ts'

/** A value in one canonical text, so that two equal values compare equal whatever the order of their keys. */
function canonical(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'undefined'
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  const keys = Object.keys(value).sort()
  const record = value as Record<string, unknown>
  return `{${keys.map(key => `${JSON.stringify(key)}:${canonical(record[key])}`).join(',')}}`
}

const arrangementOnly = ({ by: _by, when: _when, ...rest }: Item | Pile) => canonical(rest)

/** One canvas while a script runs; `save` writes the difference. An equal change is none and is not stamped. */
export class Work {
  readonly items = new Map<ItemId, Item>()
  readonly piles = new Map<PileId, Pile>()
  private readonly before = new Map<string, string>()
  private readonly dropped = new Set<ItemId>()
  private rank: number
  private readonly revision: number
  private readonly facts: CanvasFacts
  readonly canvas: CanvasId
  readonly by: Mover
  readonly when: Instant
  readonly rules: Rules

  constructor(facts: CanvasFacts, canvas: CanvasId, by: Mover, when: Instant, rules: Rules) {
    this.facts = facts
    this.canvas = canvas
    this.by = by
    this.when = when
    this.rules = rules
    for (const item of facts.items(canvas, 'on')) this.load(item)
    for (const pile of facts.piles(canvas)) {
      this.piles.set(pile.id, pile)
      this.before.set(`pile:${pile.id}`, canonical(pile))
    }
    this.rank = facts.nextRank(canvas)
    this.revision = facts.revision(canvas)
  }

  private load(item: Item): Item {
    this.items.set(item.id, item)
    this.before.set(`item:${item.id}`, canonical(item))
    return item
  }

  item(id: ItemId): Item | null {
    const known = this.items.get(id)
    if (known !== undefined) return known
    if (this.dropped.has(id)) return null
    const stored = this.facts.item(this.canvas, id)
    return stored === null ? null : this.load(stored)
  }

  nextRank(): number {
    const rank = this.rank
    this.rank += 1
    return rank
  }

  topRank(): number {
    let top = 0
    for (const item of this.items.values()) if (item.state === 'on') top = Math.max(top, item.rank)
    return top
  }

  /** Changes an item; it is stamped only when its arrangement differs. */
  update(item: Item, change: Partial<Item>): Item {
    const next = { ...item, ...change }
    if (arrangementOnly(next) === arrangementOnly(item)) return item
    const stamped = { ...next, by: this.by, when: this.when }
    this.items.set(stamped.id, stamped)
    return stamped
  }

  put(item: Item): Item {
    const stamped = { ...item, by: this.by, when: this.when }
    this.items.set(stamped.id, stamped)
    return stamped
  }

  updatePile(pile: Pile, change: Partial<Pile>): void {
    const next = { ...pile, ...change }
    if (arrangementOnly(next) === arrangementOnly(pile)) return
    this.piles.set(pile.id, { ...next, by: this.by, when: this.when })
  }

  createPile(id: PileId, at: Spot): void {
    this.piles.set(id, { id, name: null, at, by: this.by, when: this.when })
  }

  prune(id: PileId | null): void {
    if (id === null) return
    for (const item of this.items.values()) if (item.state === 'on' && item.pile === id) return
    this.piles.delete(id)
  }

  drop(id: ItemId): void {
    this.items.delete(id)
    this.dropped.add(id)
  }

  freeNear(want: Spot, size: Item['size'], except: ItemId | null = null): Spot {
    const { sheet, footprint } = this.rules
    const others = [...this.items.values()].filter(item => item.id !== except)
    const taken = takenRects(others, this.piles.values(), sheet, footprint)
    return freeSpot(sheet, taken, roomOf(size, footprint), want)
  }

  /** Null when nothing changed: nothing is written. */
  save(): number | null {
    const items = this.saveItems()
    const piles = this.savePiles()
    if (!items && !piles) return null
    const revision = this.revision + 1
    this.facts.setHead(this.canvas, revision, this.rank)
    return revision
  }

  private saveItems(): boolean {
    let changed = false
    for (const id of this.dropped) {
      if (this.before.has(`item:${id}`) || this.facts.item(this.canvas, id) !== null) {
        this.facts.dropItem(this.canvas, id)
        changed = true
      }
    }
    for (const item of this.items.values())
      if (this.before.get(`item:${item.id}`) !== canonical(item)) {
        this.facts.putItem(this.canvas, item)
        changed = true
      }
    return changed
  }

  private savePiles(): boolean {
    let changed = false
    for (const [mark] of this.before)
      if (mark.startsWith('pile:') && !this.piles.has(mark.slice(5) as PileId)) {
        this.facts.dropPile(this.canvas, mark.slice(5) as PileId)
        changed = true
      }
    for (const pile of this.piles.values())
      if (this.before.get(`pile:${pile.id}`) !== canonical(pile)) {
        this.facts.putPile(this.canvas, pile)
        changed = true
      }
    return changed
  }
}
