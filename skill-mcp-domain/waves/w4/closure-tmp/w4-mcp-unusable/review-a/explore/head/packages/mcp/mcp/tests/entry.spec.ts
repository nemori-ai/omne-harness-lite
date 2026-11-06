// The forget predicate of the connection table (SPEC decision 20): an entry leaves the table only
// when it refuses requests and holds nothing, and each of the five resources counts as holding.
import { describe, expect, it } from 'vitest'
import type { ConnectionKey } from '@omne-harness/mcp-contract'
import { Connection } from '../src/internal/connection.ts'
import { forgettable, holdsNothing, type Resources } from '../src/internal/entry.ts'
import { adoptionRevisionOf, generationOf, endpointRefOf } from '@omne-harness/mcp-contract/testing'
import { alice, home } from './doubles/identities.ts'
import { MAIN, TARGET, world } from './doubles/world.ts'

const files = endpointRefOf('files')

/** Real resources from the doubles: a transport, a process and a handle the table could hold. */
async function samples() {
  const w = world()
  const opened = await w.transports.open(
    {
      kind: 'streamable-http',
      target: TARGET,
      generation: generationOf(1),
      instructionsByteLimit: 1,
    },
    new AbortController().signal,
  )
  if ('failure' in opened) throw new Error('the scripted transport did not open')
  const started = await w.landing.start(
    alice,
    { command: 'mcp-files', args: [], env: [], facilities: [] },
    { values: [], credentials: [] },
  )
  if ('failure' in started) throw new Error(`the memory landing refused: ${started.failure}`)
  w.credentials.store({ tenant: alice.tenant, holding: files.holding, binding: MAIN, secret: 's' })
  const acquired = await w.credentials.acquire(alice, files.holding, { kind: 'process-env' }, MAIN)
  if ('failure' in acquired) throw new Error(`the memory credentials refused: ${acquired.failure}`)
  return { transport: opened.ok, process: started.ok, credential: acquired.ok }
}

function nothing(): Resources {
  return {
    transport: undefined,
    process: undefined,
    credential: undefined,
    lingering: [],
    landings: [],
  }
}

describe('holdsNothing: the one condition an entry is forgotten on', () => {
  it('is true with no transport, no process, no handle, no lingering process and no landing in flight', () => {
    expect(holdsNothing(nothing())).toBe(true)
  })

  it('is false while the entry holds a transport', async () => {
    const { transport } = await samples()
    expect(holdsNothing({ ...nothing(), transport })).toBe(false)
  })

  it('is false while the entry holds a process handle', async () => {
    const { process } = await samples()
    expect(holdsNothing({ ...nothing(), process })).toBe(false)
  })

  it('is false while the entry holds a credential handle', async () => {
    const { credential } = await samples()
    expect(holdsNothing({ ...nothing(), credential })).toBe(false)
  })

  it('is false while a process whose stop was not confirmed lingers', async () => {
    const { process } = await samples()
    const lingering = [{ handle: process, confirmed: 'unconfirmed' as const }]
    expect(holdsNothing({ ...nothing(), lingering })).toBe(false)
  })

  it('is false while a landing is still in flight, even without a handle', () => {
    expect(
      holdsNothing({ ...nothing(), landings: [{ credential: undefined, landed: false }] }),
    ).toBe(false)
  })
})

describe('forgettable: closed, and holding nothing', () => {
  const key: ConnectionKey = {
    tenant: home,
    holding: files.holding,
    adoptionRevision: adoptionRevisionOf('r1'),
    account: { kind: 'anonymous' },
  }

  function connection(closed: boolean): Connection {
    const made = new Connection(key, 'on-attempt')
    if (closed) made.close()
    return made
  }

  it('is false for an entry that holds nothing but still takes requests', () => {
    expect(forgettable({ ...nothing(), connection: connection(false) })).toBe(false)
  })

  it('is true for a closed entry that holds nothing', () => {
    expect(forgettable({ ...nothing(), connection: connection(true) })).toBe(true)
  })

  it('is false for a closed entry that still waits on a landing', () => {
    const landings = [{ credential: undefined, landed: false }]
    expect(forgettable({ ...nothing(), landings, connection: connection(true) })).toBe(false)
  })
})
