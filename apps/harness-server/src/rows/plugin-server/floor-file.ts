import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { boot, crash, ground, settle, sweep, unwant, want, type Floor } from '@omne-harness/dynamis'
import type { FloorPort } from '@omne-harness/plugin-protocol'

/** The server went down this many times in a row while loading a tenant's plugins: the floor holds them back. */
export const FLOOR_LIMIT = 2
/** How long the server must stay up after every load of a tenant has an outcome before that counts. */
export const SETTLE_AFTER_MS = 2000

type Later = (run: () => void) => () => void

export type FileFloorOptions = Readonly<{
  directory: string
  warn(message: string): void
  later?: Later
}>

export type FileFloor = FloorPort &
  Readonly<{
    close(): void
    /** The last process went down in a call of this plugin. Told before the tenant rises. */
    fell(tenant: string, fiber: string): void
  }>

type Falls = Readonly<Record<string, number>>

const after: Later = run => {
  const timer = setTimeout(run, SETTLE_AFTER_MS)
  timer.unref()
  return () => clearTimeout(timer)
}

const names = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every(each => typeof each === 'string')

function fallsOf(value: unknown): Falls {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return {}
  return Object.fromEntries(
    Object.entries(value).filter(([, count]) => Number.isInteger(count) && (count as number) > 0),
  ) as Falls
}

function read(path: string): { floor: Floor; falls: Falls } {
  try {
    const kept = JSON.parse(readFileSync(path, 'utf8')) as
      | (Partial<Floor> & { falls?: unknown })
      | null
    if (kept === null || typeof kept !== 'object') return { floor: ground, falls: {} }
    const { up, strikes } = kept
    const falls = fallsOf(kept.falls)
    if (typeof up !== 'boolean' || !Number.isInteger(strikes) || !names(kept.want))
      return { floor: ground, falls }
    return { floor: { up, want: kept.want, live: [], strikes: strikes ?? 0 }, falls }
  } catch {
    return { floor: ground, falls: {} }
  }
}

type Risen = {
  floor: Floor
  falls: Falls
  held: boolean
  loading: boolean
  settling: (() => void) | undefined
}

/** The floor of the server, one file for each tenant. It is kept as up from the first load of a run until the run settled. */
export function fileFloor(options: FileFloorOptions): FileFloor {
  const { directory, warn } = options
  const later = options.later ?? after
  const risen = new Map<string, Risen>()
  const fileOf = (tenant: string): string =>
    join(directory, `${Buffer.from(tenant, 'utf8').toString('hex')}.json`)
  const write = (tenant: string, floor: Floor, falls: Falls): void => {
    const path = fileOf(tenant)
    mkdirSync(directory, { recursive: true })
    writeFileSync(`${path}.next`, JSON.stringify({ ...floor, live: [], falls }))
    renameSync(`${path}.next`, path)
  }
  const stoppedOf = (falls: Falls): string[] =>
    Object.keys(falls)
      .filter(fiber => (falls[fiber] ?? 0) >= FLOOR_LIMIT)
      .sort()
  const keep = (tenant: string, now: Risen): void => {
    try {
      write(tenant, { ...now.floor, up: now.loading }, now.falls)
    } catch (error) {
      warn(`tenant ${tenant}: the floor of its plugins was not kept: ${String(error)}`)
    }
  }
  const rise = (tenant: string): Risen => {
    const kept = read(fileOf(tenant))
    const swept = sweep(boot(crash(kept.floor).floor).floor, FLOOR_LIMIT)
    const held = swept.kind === 'stayed' && swept.why === 'held'
    const now: Risen = {
      floor: swept.floor,
      falls: kept.falls,
      held,
      loading: false,
      settling: undefined,
    }
    for (const fiber of stoppedOf(kept.falls))
      warn(
        `tenant ${tenant}: the server went down ${FLOOR_LIMIT} times in calls of ${fiber}; it does not load it until there is a new version, or until it is disabled and enabled again`,
      )
    if (held)
      warn(
        `tenant ${tenant}: the server went down ${FLOOR_LIMIT} times in a row while loading its plugins; it does not load ${swept.floor.want.join(', ')} until there is a new version, or until it is disabled and enabled again`,
      )
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
      const stopped = stoppedOf(now.falls)
      return { want: now.floor.want, held: now.held, ...(stopped.length > 0 && { stopped }) }
    },
    fell(tenant, fiber) {
      const now = risen.get(tenant)
      const kept = now ?? read(fileOf(tenant))
      const falls = { ...kept.falls, [fiber]: (kept.falls[fiber] ?? 0) + 1 }
      if (now !== undefined) now.falls = falls
      try {
        write(tenant, now === undefined ? kept.floor : { ...now.floor, up: now.loading }, falls)
      } catch (error) {
        warn(`tenant ${tenant}: a fall in a call of ${fiber} was not kept: ${String(error)}`)
      }
    },
    want: (tenant, fiber) => move(tenant, true, floor => want(floor, fiber).floor),
    unwant(tenant, fiber) {
      const now = risen.get(tenant)
      if (now !== undefined && fiber in now.falls)
        now.falls = Object.fromEntries(Object.entries(now.falls).filter(([name]) => name !== fiber))
      move(tenant, false, floor => unwant(floor, fiber).floor)
    },
    settle(tenant) {
      const now = risen.get(tenant)
      if (now === undefined || now.settling !== undefined) return
      now.settling = later(() => {
        now.settling = undefined
        now.loading = false
        now.floor = settle(now.floor).floor
        keep(tenant, now)
      })
    },
    close() {
      for (const [tenant, now] of risen) {
        now.settling?.()
        now.settling = undefined
        now.loading = false
        keep(tenant, now)
      }
    },
  }
}
