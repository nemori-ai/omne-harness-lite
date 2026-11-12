// The close order of the group page on the resources of one entry, once: close the transport,
// then release the credential handle (S9: an HTTP handle with the close). Each port is asked
// through `ask`, which reads a breach (a rejection, or a throw when called) as SPEC MC-14 says: a
// `close()` that breached is closed, a `release()` that breached is released and not retried. So
// no step fails on a port and every step runs. A resource leaves the entry only after its port
// answered: while a step waits, the entry still holds what the step works on. An error of this
// package is not absorbed: it rejects the teardown. A teardown asked while one is in flight
// joins it.
import type { Entry } from './entry.ts'
import { ask } from './port.ts'

/** The one entry point of the close order. */
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

/** Step 1. A `close()` that breached is closed: the transport leaves the entry either way. */
async function closeTransport(entry: Entry): Promise<void> {
  const { transport } = entry
  if (transport === undefined) return
  await ask(() => transport.close(), undefined)
  entry.transport = undefined
}

/** Step 2. A `release()` that breached is released and not retried: the handle leaves the entry. */
async function releaseHeld(entry: Entry): Promise<void> {
  const { credential } = entry
  if (credential === undefined) return
  await ask(() => credential.release(), undefined)
  entry.credential = undefined
}
