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

export type FileFloor = FloorPort & Readonly<{ close(): void }>

const after: Later = run => {
  const timer = setTimeout(run, SETTLE_AFTER_MS)
  timer.unref()
  return () => clearTimeout(timer)
}

const names = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every(each => typeof each === 'string')

function read(path: string): Floor {
  try {
    const kept = JSON.parse(readFileSync(path, 'utf8')) as Partial<Floor> | null
    if (kept === null || typeof kept !== 'object') return ground
    const { up, strikes } = kept
    if (typeof up !== 'boolean' || !Number.isInteger(strikes) || !names(kept.want)) return ground
    return { up, want: kept.want, live: [], strikes: strikes ?? 0 }
  } catch {
    return ground
  }
}

type Risen = { floor: Floor; held: boolean; loading: boolean; settling: (() => void) | undefined }

/** The floor of the server, one file for each tenant. It is kept as up from the first load of a run until the run settled. */
export function fileFloor(options: FileFloorOptions): FileFloor {
  const { directory, warn } = options
  const later = options.later ?? after
  const risen = new Map<string, Risen>()
  const fileOf = (tenant: string): string =>
    join(directory, `${Buffer.from(tenant, 'utf8').toString('hex')}.json`)
  const keep = (tenant: string, now: Risen): void => {
    const path = fileOf(tenant)
    try {
      mkdirSync(directory, { recursive: true })
      writeFileSync(`${path}.next`, JSON.stringify({ ...now.floor, up: now.loading, live: [] }))
      renameSync(`${path}.next`, path)
    } catch (error) {
      warn(`tenant ${tenant}: the floor of its plugins was not kept: ${String(error)}`)
    }
  }
  const rise = (tenant: string): Risen => {
    const swept = sweep(boot(crash(read(fileOf(tenant))).floor).floor, FLOOR_LIMIT)
    const held = swept.kind === 'stayed' && swept.why === 'held'
    const now: Risen = { floor: swept.floor, held, loading: false, settling: undefined }
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
      return { want: now.floor.want, held: now.held }
    },
    want: (tenant, fiber) => move(tenant, true, floor => want(floor, fiber).floor),
    unwant: (tenant, fiber) => move(tenant, false, floor => unwant(floor, fiber).floor),
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
