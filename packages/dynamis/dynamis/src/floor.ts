export type Floor = Readonly<{
  up: boolean
  want: readonly string[]
  live: readonly string[]
  strikes: number
}>

export type Stepped =
  | Readonly<{ kind: 'moved'; floor: Floor }>
  | Readonly<{
      kind: 'stayed'
      floor: Floor
      why: 'up' | 'down' | 'nothing' | 'held' | 'unsettled'
    }>

const setOf = (names: Iterable<string>): readonly string[] =>
  Object.freeze([...new Set(names)].sort())

const floorOf = (
  up: boolean,
  want: Iterable<string>,
  live: Iterable<string>,
  strikes: number,
): Floor => Object.freeze({ up, want: setOf(want), live: setOf(live), strikes })

export const ground: Floor = floorOf(false, [], [], 0)

const moved = (floor: Floor): Stepped => ({ kind: 'moved', floor })
const stayed = (floor: Floor, why: 'up' | 'down' | 'nothing' | 'held' | 'unsettled'): Stepped => ({
  kind: 'stayed',
  floor,
  why,
})

/** What is live is always among what is wanted, so the two are equal when nothing wanted is missing. */
const level = (floor: Floor): boolean => floor.want.every(name => floor.live.includes(name))

/** The process comes up with the floor alone; what is wanted is loaded by a sweep afterwards. */
export function boot(floor: Floor): Stepped {
  return floor.up ? stayed(floor, 'up') : moved(floorOf(true, floor.want, [], floor.strikes))
}

/** Loads what is wanted, unless the process went down too many times in a row. */
export function sweep(floor: Floor, limit: number): Stepped {
  if (!floor.up) return stayed(floor, 'down')
  if (level(floor)) return stayed(floor, 'nothing')
  if (floor.strikes >= limit) return stayed(floor, 'held')
  return moved(floorOf(true, floor.want, floor.want, floor.strikes))
}

export function settle(floor: Floor): Stepped {
  if (!floor.up) return stayed(floor, 'down')
  if (!level(floor)) return stayed(floor, 'unsettled')
  return floor.strikes === 0
    ? stayed(floor, 'nothing')
    : moved(floorOf(true, floor.want, floor.live, 0))
}

export function crash(floor: Floor): Stepped {
  return floor.up ? moved(floorOf(false, floor.want, [], floor.strikes + 1)) : stayed(floor, 'down')
}

export function want(floor: Floor, fiber: string): Stepped {
  if (!floor.up) return stayed(floor, 'down')
  if (floor.want.includes(fiber) && floor.live.includes(fiber)) return stayed(floor, 'nothing')
  return moved(floorOf(true, [...floor.want, fiber], [...floor.live, fiber], floor.strikes))
}

export function unwant(floor: Floor, fiber: string): Stepped {
  if (!floor.up) return stayed(floor, 'down')
  if (!floor.want.includes(fiber)) return stayed(floor, 'nothing')
  const rest = (names: readonly string[]): string[] => names.filter(name => name !== fiber)
  return moved(floorOf(true, rest(floor.want), rest(floor.live), floor.strikes))
}

/** After a person or an agent dealt with it on the floor, sweeping is allowed again. */
export function resume(floor: Floor, limit: number): Stepped {
  if (!floor.up) return stayed(floor, 'down')
  return floor.strikes >= limit
    ? moved(floorOf(true, floor.want, floor.live, 0))
    : stayed(floor, 'nothing')
}
