import type { StopScope } from '@omne-harness/mcp-contract'
import type { ProcessHandle } from '@omne-harness/mcp-contract/provider'
import { recordStop, type Entry, type Landing, type StopRange } from './entry.ts'
import { ask } from './port.ts'

const STOP_ORDER: readonly StopScope[] = ['unconfirmed', 'root-only', 'tree-confirmed']

export function narrowest(left: StopRange, right: StopRange): StopRange {
  if (left === 'no-process') return right
  if (right === 'no-process') return left
  return STOP_ORDER.indexOf(left) <= STOP_ORDER.indexOf(right) ? left : right
}

export function teardown(entry: Entry): Promise<StopRange> {
  if (entry.tearing !== undefined) return entry.tearing
  const tearing = closeOrder(entry)
  entry.tearing = tearing
  return tearing.finally(() => {
    if (entry.tearing === tearing) entry.tearing = undefined
  })
}

function confirmedOf(entry: Entry, stopped: StopRange): StopRange {
  const stops = entry.lingering.reduce<StopRange>(
    (narrowed, { confirmed }) => narrowest(narrowed, confirmed),
    stopped,
  )
  return entry.landings.length > 0 ? narrowest(stops, 'unconfirmed') : stops
}

async function closeOrder(entry: Entry): Promise<StopRange> {
  await closeTransport(entry)
  const stopped = await stopProcesses(entry)
  await releaseHeld(entry)
  return confirmedOf(entry, stopped)
}

async function closeTransport(entry: Entry): Promise<void> {
  const { transport } = entry
  if (transport === undefined) return
  await ask(() => transport.close(), undefined)
  entry.transport = undefined
}

async function stopProcesses(entry: Entry): Promise<StopRange> {
  const own = entry.process
  const handles = [
    ...(own === undefined ? [] : [own]),
    ...entry.lingering.map(({ handle }) => handle),
  ]
  let stopped: StopRange = 'no-process'
  for (const handle of handles) stopped = narrowest(stopped, await stopOne(entry, handle))
  return stopped
}

export async function stopOne(entry: Entry, handle: ProcessHandle): Promise<StopScope> {
  const confirmed = await ask(() => handle.stop(), 'unconfirmed')
  recordStop(entry, handle, confirmed)
  return confirmed
}

async function releaseHeld(entry: Entry): Promise<void> {
  const { credential } = entry
  if (credential === undefined) return
  await ask(() => credential.release(), undefined)
  entry.credential = undefined
}

export async function releaseLanding(landing: Landing): Promise<void> {
  const { credential } = landing
  landing.credential = undefined
  if (credential !== undefined) await ask(() => credential.release(), undefined)
}

export async function abandonLandings(entry: Entry): Promise<void> {
  const inFlight = entry.landings.filter(landing => !landing.landed)
  await Promise.all(inFlight.map(releaseLanding))
}
