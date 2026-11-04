// The forget predicate of the connection table (SPEC decision 20): an entry leaves the table only
// when it holds nothing, and each of the five resources counts as holding.
import { describe, expect, it } from 'vitest'
import { holdsNothing, type Resources } from '../src/internal/entry.ts'
import { alice, generation, ref } from './doubles/values.ts'
import { MAIN, TARGET, world } from './doubles/world.ts'

const files = ref('files')

/** Real resources from the doubles: a transport, a process and a handle the table could hold. */
async function samples() {
  const w = world()
  const opened = await w.transports.open(
    {
      kind: 'streamable-http',
      target: TARGET,
      generation: generation(1),
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
    expect(holdsNothing({ ...nothing(), landings: [{ credential: undefined }] })).toBe(false)
  })
})
