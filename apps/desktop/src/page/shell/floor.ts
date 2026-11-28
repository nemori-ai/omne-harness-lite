import { boot, crash, ground, settle, sweep, unwant, want, type Floor } from '@omne-harness/dynamis'

export const FLOOR_KEY = 'omne.floor'
/** The page went down this many times in a row with something wanted: the floor holds it back. */
export const FLOOR_LIMIT = 2
/** How long the page must stay up after everything wanted has an outcome before that counts. */
export const SETTLE_AFTER_MS = 2000

type FloorStore = Pick<Storage, 'getItem' | 'setItem'>

/** The floor as whoever loads onto the page asks it; the names are whatever that one calls what it loads. */
export type PageFloor = Readonly<{
  rise(tenant: string): Readonly<{ want: readonly string[]; held: boolean }>
  want(tenant: string, name: string): void
  unwant(tenant: string, name: string): void
  settle(tenant: string): void
  /** Calls the listener each time it is told that everything wanted has an outcome. */
  outcomes(listener: () => void): () => void
}>
type Later = (run: () => void) => () => void

/** Runs after the wait, and only if the page has drawn by then what it shipped with. */
export function whenDrawn(drawn: () => boolean): Later {
  return run => {
    const timer = setTimeout(() => {
      if (drawn()) run()
    }, SETTLE_AFTER_MS)
    return () => clearTimeout(timer)
  }
}

const names = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every(each => typeof each === 'string')

function read(text: string | null): Floor {
  try {
    const kept = JSON.parse(text ?? 'null') as Partial<Floor> | null
    if (kept === null || typeof kept !== 'object') return ground
    const { up, strikes } = kept
    if (typeof up !== 'boolean' || !Number.isInteger(strikes) || !names(kept.want)) return ground
    return { up, want: kept.want, live: names(kept.live) ? kept.live : [], strikes: strikes ?? 0 }
  } catch {
    return ground
  }
}

type Risen = {
  floor: Floor
  held: boolean
  loading: boolean
  settling: (() => void) | undefined
}

/** The floor of the page, one for each tenant. It is kept as up from the first load of a run until the run settled. */
export function storedFloor(
  store: () => FloorStore,
  later: Later = whenDrawn(() => true),
): PageFloor {
  const risen = new Map<string, Risen>()
  const told = new Set<() => void>()
  const keep = (tenant: string, now: Risen): void => {
    try {
      const floor = { ...now.floor, up: now.loading, live: [] }
      store().setItem(`${FLOOR_KEY}:${tenant}`, JSON.stringify(floor))
    } catch {}
  }
  const kept = (tenant: string): Floor => {
    try {
      return read(store().getItem(`${FLOOR_KEY}:${tenant}`))
    } catch {
      return ground
    }
  }
  const rise = (tenant: string): Risen => {
    const up = boot(crash(kept(tenant)).floor).floor
    const swept = sweep(up, FLOOR_LIMIT)
    const held = swept.kind === 'stayed' && swept.why === 'held'
    const now = { floor: swept.floor, held, loading: false, settling: undefined }
    keep(tenant, now)
    return now
  }
  const move = (tenant: string, loading: boolean, step: (floor: Floor) => Floor): void => {
    const now = risen.get(tenant)
    if (now === undefined) return
    now.settling?.()
    now.settling = undefined
    now.floor = step(now.floor)
    now.loading ||= loading
    keep(tenant, now)
  }
  return {
    rise(tenant) {
      const now = risen.get(tenant) ?? rise(tenant)
      risen.set(tenant, now)
      return { want: now.floor.want, held: now.held }
    },
    want: (tenant, fiber) => move(tenant, true, floor => want(floor, fiber).floor),
    unwant: (tenant, fiber) => move(tenant, false, floor => unwant(floor, fiber).floor),
    outcomes(listener) {
      told.add(listener)
      return () => void told.delete(listener)
    },
    settle(tenant) {
      const now = risen.get(tenant)
      if (now === undefined) return
      for (const listener of told) listener()
      if (now.settling !== undefined) return
      now.settling = later(() => {
        now.settling = undefined
        now.loading = false
        now.floor = settle(now.floor).floor
        keep(tenant, now)
      })
    },
  }
}
