import type { Entry } from './entry.ts'
import { ask } from './port.ts'

export function teardown(entry: Entry): Promise<void> {
  if (entry.tearing !== undefined) return entry.tearing
  const tearing = closeOrder(entry)
  entry.tearing = tearing
  return tearing.finally(() => {
    if (entry.tearing === tearing) entry.tearing = undefined
  })
}

async function closeOrder(entry: Entry): Promise<void> {
  await closeTransport(entry)
  await releaseHeld(entry)
}

async function closeTransport(entry: Entry): Promise<void> {
  const { transport } = entry
  if (transport === undefined) return
  await ask(() => transport.close(), undefined)
  entry.transport = undefined
}

async function releaseHeld(entry: Entry): Promise<void> {
  const { credential } = entry
  if (credential === undefined) return
  await ask(() => credential.release(), undefined)
  entry.credential = undefined
}
