// The close order of the group page on the resources of one entry, once: close the transport,
// stop the processes (the entry's own and the lingering ones), then release the credential
// handle (S9: a process handle after `stop()` returned, an HTTP handle with the close). A
// teardown asked while one is in flight joins it.
import type { StopScope } from '@omne-harness/mcp-contract'
import { keep, type Entry, type Scope } from './entry.ts'

const STOP_ORDER: readonly StopScope[] = ['unconfirmed', 'root-only', 'tree-confirmed']

/** The least confirmed of two stop ranges. */
function narrower(left: StopScope, right: StopScope): StopScope {
  return STOP_ORDER.indexOf(left) <= STOP_ORDER.indexOf(right) ? left : right
}

export function narrowest(scope: Scope, confirmed: StopScope): StopScope {
  return scope === 'no-process' ? confirmed : narrower(scope, confirmed)
}

/** Stops the process and every lingering one; keeps those not confirmed for the whole tree. */
async function stopProcesses(entry: Entry): Promise<Scope> {
  const own = entry.process
  entry.process = undefined
  const handles = [
    ...(own === undefined ? [] : [own]),
    ...entry.lingering.map(({ handle }) => handle),
  ]
  let scope: Scope = 'no-process'
  for (const handle of handles) {
    const confirmed = await handle.stop()
    entry.lingering = entry.lingering.filter(lingering => lingering.handle !== handle)
    keep(entry, handle, confirmed)
    scope = narrowest(scope, confirmed)
  }
  return scope
}

export function teardown(entry: Entry): Promise<Scope> {
  if (entry.tearing !== undefined) return entry.tearing
  const tearing = (async () => {
    const transport = entry.transport
    entry.transport = undefined
    await transport?.close()
    const scope = await stopProcesses(entry)
    const credential = entry.credential
    entry.credential = undefined
    await credential?.release()
    return scope
  })()
  entry.tearing = tearing
  return tearing.finally(() => {
    if (entry.tearing === tearing) entry.tearing = undefined
  })
}
