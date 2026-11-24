import {
  empty,
  install,
  remove,
  retire,
  type Entry,
  type Instance,
  type Registry,
} from '@omne-harness/dynamis'

export type Batch = Readonly<{ id: number; entries: readonly Entry[]; drains?: true }>

export type Seat = Readonly<{
  fiber: string
  instance: Instance
  seated: boolean
  /** On a seat that is being withdrawn: the batches that have not drained yet. */
  retiring?: readonly number[]
  batches: readonly Batch[]
}>

export type Seats = Readonly<{
  seats: readonly Seat[]
  issued: Readonly<Record<string, number>>
  batches: number
  registry: Registry
}>

export type Put =
  | Readonly<{ kind: 'put'; seats: Seats; batch: number }>
  | Readonly<{ kind: 'refused'; reason: 'invalid' | 'held'; detail: string }>

export const noSeats: Seats = Object.freeze({
  seats: Object.freeze([]),
  issued: Object.freeze({}),
  batches: 0,
  registry: empty,
})

const entriesOf = (seat: Seat): Entry[] => seat.batches.flatMap(batch => batch.entries)

const live = (seat: Seat): boolean => seat.retiring === undefined

const seatOf = (seats: Seats, fiber: string): Seat | undefined =>
  seats.seats.find(seat => seat.fiber === fiber && live(seat))

const drainingOf = (seats: Seats, fiber: string, batch: number): Seat | undefined =>
  seats.seats.find(seat => seat.fiber === fiber && seat.retiring?.includes(batch) === true)

/** The name is free when no live seat holds it; the one who comes second takes a suffix. */
function freeName(seats: Seats, name: string): string {
  const held = new Set(seats.seats.filter(live).map(seat => seat.instance.fiber))
  let candidate = name
  for (let suffix = 2; held.has(candidate); suffix += 1) candidate = `${name}~${suffix}`
  return candidate
}

export function instanceFor(seats: Seats, fiber: string, name: string): Instance {
  const held = seatOf(seats, fiber)
  if (held !== undefined) return held.instance
  const taken = freeName(seats, name)
  return { fiber: taken, generation: (seats.issued[taken] ?? 0) + 1 }
}

/** A seat is never seated with what `put` did not check, and names are unique, so this holds. */
function settled(registry: Registry, seat: Seat): Registry {
  const outcome = install(registry, seat.instance, entriesOf(seat))
  if (outcome.kind === 'refused') throw new Error(`seat ${seat.fiber}: ${outcome.detail}`)
  return outcome.registry
}

function withSeat(seats: Seats, seat: Seat, registry: Registry, batches = seats.batches): Seats {
  const { fiber, generation } = seat.instance
  const index = seats.seats.findIndex(
    ({ instance }) => instance.fiber === fiber && instance.generation === generation,
  )
  const kept = [...seats.seats]
  kept.splice(index === -1 ? kept.length : index, 1, Object.freeze(seat))
  return Object.freeze({
    seats: Object.freeze(kept),
    issued: Object.freeze({
      ...seats.issued,
      [fiber]: Math.max(seats.issued[fiber] ?? 0, generation),
    }),
    batches,
    registry,
  })
}

function withoutSeat(seats: Seats, seat: Seat): Seats {
  return Object.freeze({
    ...seats,
    seats: Object.freeze(seats.seats.filter(held => held !== seat)),
    registry: seat.seated ? remove(seats.registry, seat.instance) : seats.registry,
  })
}

/** Add one batch to the live seat of a fiber, opening one when there is none. */
export function put(
  seats: Seats,
  fiber: string,
  name: string,
  entries: readonly Entry[],
  drains = false,
): Put {
  const instance = instanceFor(seats, fiber, name)
  const alone = install(empty, instance, entries)
  if (alone.kind === 'refused') return { kind: 'refused', reason: 'invalid', detail: alone.detail }
  const seat = seatOf(seats, fiber) ?? { fiber, instance, seated: false, batches: [] }
  const id = seats.batches + 1
  const batch: Batch = { id, entries: [...entries], ...(drains && { drains: true as const }) }
  const next = { ...seat, batches: [...seat.batches, batch] }
  const fit = install(next.seated ? seats.registry : empty, instance, entriesOf(next))
  if (fit.kind === 'refused') return { kind: 'refused', reason: 'held', detail: fit.detail }
  const registry = next.seated ? fit.registry : seats.registry
  return { kind: 'put', seats: withSeat(seats, next, registry, id), batch: id }
}

/** Take one batch back. The seat that holds nothing more is gone. */
export function drop(seats: Seats, fiber: string, batch: number): Seats {
  const seat = seatOf(seats, fiber)
  if (seat === undefined || !seat.batches.some(held => held.id === batch)) return seats
  const next = { ...seat, batches: seat.batches.filter(held => held.id !== batch) }
  if (next.batches.length === 0) return withoutSeat(seats, seat)
  return withSeat(seats, next, next.seated ? settled(seats.registry, next) : seats.registry)
}

export function ready(seats: Seats, fiber: string): Seats {
  const seat = seatOf(seats, fiber)
  if (seat === undefined || seat.seated) return seats
  const next = { ...seat, seated: true }
  return withSeat(seats, next, settled(seats.registry, next))
}

/** The fiber left. What it served and must drain is withdrawn first; the rest is taken at once. */
export function gone(seats: Seats, fiber: string): Seats {
  const seat = seatOf(seats, fiber)
  if (seat === undefined) return seats
  const retiring = seat.batches.filter(batch => batch.drains === true).map(batch => batch.id)
  if (!seat.seated || retiring.length === 0) return withoutSeat(seats, seat)
  return withSeat(seats, { ...seat, retiring }, retire(seats.registry, seat.instance))
}

export function drained(seats: Seats, fiber: string, batch: number): Seats {
  const seat = drainingOf(seats, fiber, batch)
  if (seat === undefined) return seats
  const retiring = seat.retiring?.filter(id => id !== batch) ?? []
  if (!seat.seated || retiring.length === 0) return withoutSeat(seats, seat)
  return withSeat(seats, { ...seat, retiring }, seats.registry)
}

export const leaving = (seats: Seats, fiber: string, batch: number): Instance | undefined =>
  drainingOf(seats, fiber, batch)?.instance
