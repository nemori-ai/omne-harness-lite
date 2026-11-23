import type { JsonValue } from '@omne-harness/json-text'
import type { Access } from '@omne-harness/legal-identity'
import { toContentBlocks, type InvokeResult } from '@omne-harness/mcp-contract'
import { generationOf, jsonOf, revisionOf, taskIdOf } from '@omne-harness/mcp-contract/testing'
import { fail, succeed } from '@omne-harness/operation-result'
import type { ToolCommandDeclaration } from '@omne-harness/tool-contract'
import type { ToolSourceCall, ToolSourceListing } from '@omne-harness/tool-contract/provider'
import { runConformanceCase, toolEntrySourceConformance } from '@omne-harness/tool-contract/testing'
import { describe, expect, it } from 'vitest'
import { action, ref } from './support.ts'
import {
  acquired,
  alice,
  aliceAway,
  away,
  bob,
  home,
  mallory,
  notAcquired,
  world,
  type Principal,
  type World,
} from './world.ts'

async function listing(w: World, asker: Access<Principal>): Promise<ToolSourceListing> {
  const answer = await w.source.list(asker)
  if ('failure' in answer) throw new Error(`list: ${JSON.stringify(answer.failure)}`)
  return answer.ok
}

const names = (listed: ToolSourceListing) => listed.entries.map(entry => entry.definition.name)

function commandNamed(w: World, asker: Access<Principal>, tool: string, command: string) {
  const definition = w.source.select(asker, tool)?.definition
  const found =
    definition?.kind === 'commands'
      ? definition.commands.find(candidate => candidate.name === command)
      : undefined
  if (found === undefined) throw new Error(`${tool} ${command} is not selected`)
  return found
}

function callOf(
  asker: Access<Principal>,
  tool: string,
  declared: ToolCommandDeclaration,
  args: JsonValue = jsonOf({ query: 'x' }),
): ToolSourceCall<Principal> {
  return {
    ...asker,
    name: tool,
    command: declared.name,
    declared,
    arguments: args,
    invocation: 'call-1',
    signal: new AbortController().signal,
  }
}

const done: InvokeResult = {
  kind: 'sent',
  outcome: {
    kind: 'complete',
    content: toContentBlocks([jsonOf({ type: 'text', text: 'forty-two' })]),
    output: { kind: 'no-schema' },
  },
}

describe('what the source gives, for each state of an endpoint', () => {
  it('adoption cannot be read: the whole source answers that its basis is unavailable', async () => {
    const w = world()
    w.adoptRefs(home, 'unknown')
    expect(await w.source.list(alice)).toEqual({
      failure: { kind: 'unavailable', dependency: 'mcpAdoption', diagnostic: expect.any(String) },
    })
  })

  it('nothing adopted: nothing', async () => {
    expect(await listing(world(), alice)).toEqual({ entries: [], withheld: [] })
  })

  it('adopted, the asker is not eligible: nothing, the same as not adopted', async () => {
    const w = world()
    w.adopt(home, 'docs')
    w.reads('docs', fail({ kind: 'not-available-to-you' }))
    expect(await listing(w, alice)).toEqual({ entries: [], withheld: [] })
  })

  it('adopted, eligibility cannot be read: this endpoint is withheld, the others stand', async () => {
    const w = world()
    w.adopt(home, 'docs', 'wiki')
    w.reads('docs', fail({ kind: 'unknown' }))
    w.offers('wiki', [action('read')])
    const listed = await listing(w, alice)
    expect(names(listed)).toEqual(['mcp__wiki'])
    expect(listed.withheld).toEqual([
      { name: 'mcp__docs', reason: 'whether the endpoint may be used could not be read' },
    ])
  })

  it('adopted and disabled: withheld, with the reason', async () => {
    const w = world()
    w.adopt(home, 'docs')
    w.reads('docs', fail({ kind: 'blocked', reason: 'disabled' }))
    expect((await listing(w, alice)).withheld).toEqual([
      { name: 'mcp__docs', reason: 'the endpoint is disabled' },
    ])
  })

  it('the actions were never acquired: one refresh, and what it acquired is listed', async () => {
    const w = world()
    w.adopt(home, 'docs')
    w.reads('docs', succeed(notAcquired))
    w.refreshes('docs', () => {
      w.offers('docs', [action('search')])
      return succeed({ kind: 'published', revision: revisionOf(1) })
    })
    expect(names(await listing(w, alice))).toEqual(['mcp__docs'])
    expect(w.refreshed).toEqual(['docs'])
  })

  it('the actions were never acquired and the refresh fails: withheld, with the reason', async () => {
    const w = world()
    w.adopt(home, 'docs')
    w.reads('docs', succeed(notAcquired))
    w.refreshes('docs', () => fail({ kind: 'config-missing', item: 'target' }))
    expect((await listing(w, alice)).withheld).toEqual([
      { name: 'mcp__docs', reason: 'the address of the endpoint is not set' },
    ])
  })

  it('a refresh that keeps what there was leaves the endpoint withheld', async () => {
    const w = world()
    w.adopt(home, 'docs')
    w.reads('docs', succeed(notAcquired))
    w.refreshes('docs', () => succeed({ kind: 'kept', reason: { kind: 'cancelled' } }))
    expect((await listing(w, alice)).withheld).toEqual([
      { name: 'mcp__docs', reason: 'the actions of the endpoint have not been acquired' },
    ])
  })

  it('a first acquisition slower than the wait is withheld now and listed once it lands', async () => {
    const w = world(5)
    w.adopt(home, 'docs')
    w.reads('docs', succeed(notAcquired))
    let land: () => void = () => undefined
    w.refreshes(
      'docs',
      () =>
        new Promise(resolve => {
          land = () => {
            w.offers('docs', [action('search')])
            resolve(succeed({ kind: 'published', revision: revisionOf(1) }))
          }
        }),
    )
    expect((await listing(w, alice)).withheld).toEqual([
      { name: 'mcp__docs', reason: 'the actions of the endpoint are still being acquired' },
    ])
    expect((await listing(w, alice)).withheld).toHaveLength(1)
    expect(w.refreshed).toEqual(['docs'])
    land()
    await Promise.resolve()
    expect(names(await listing(w, alice))).toEqual(['mcp__docs'])
  })

  it('acquired once and unreachable now: known to be unavailable, with its last lawful definition', async () => {
    const w = world()
    w.adopt(home, 'docs')
    w.offers('docs', [action('search', { unavailable: 'connection-unavailable' })])
    const [entry] = (await listing(w, alice)).entries
    expect(entry?.availability).toEqual({
      kind: 'known-unavailable',
      reason: 'the endpoint could not be reached',
    })
    expect(entry?.definition.kind === 'commands' && entry.definition.commands).toHaveLength(1)
  })

  it('acquired and usable: one available entry, of the capability of the endpoint', async () => {
    const w = world()
    w.adopt(home, 'docs')
    w.offers('docs', [action('search'), action('fetch')])
    const [entry] = (await listing(w, alice)).entries
    expect(entry?.availability).toEqual({ kind: 'available' })
    expect(entry?.capability).toEqual({ category: 'mcp', name: 'docs' })
    expect(entry?.definition.name).toBe('mcp__docs')
  })

  it('an endpoint whose actions make no tool is withheld', async () => {
    const w = world()
    w.adopt(home, 'docs')
    w.offers('docs', [])
    expect((await listing(w, alice)).withheld).toEqual([
      { name: 'mcp__docs', reason: 'the endpoint offers no action that can be called here' },
    ])
  })

  it('two holdings of one name give one row, the usable one', async () => {
    const w = world()
    w.adoptRefs(home, [ref('docs', 'org/docs'), ref('docs', 'tenant/docs')])
    w.reads('docs', fail({ kind: 'blocked', reason: 'disabled' }))
    expect((await listing(w, alice)).withheld).toHaveLength(1)
    w.offers('docs', [action('search')])
    const listed = await listing(w, alice)
    expect(names(listed)).toEqual(['mcp__docs'])
    expect(listed.withheld).toEqual([])
  })

  it('what one asker listed is not selected by another asker or another tenant', async () => {
    const w = world()
    w.adopt(home, 'docs')
    w.offers('docs', [action('search')])
    await listing(w, alice)
    expect(w.source.select(alice, 'mcp__docs')?.definition.name).toBe('mcp__docs')
    expect(w.source.select(bob, 'mcp__docs')).toBeUndefined()
    expect(w.source.select(mallory, 'mcp__docs')).toBeUndefined()
    expect(w.source.select(aliceAway, 'mcp__docs')).toBeUndefined()
    expect(await listing(w, aliceAway)).toEqual({ entries: [], withheld: [] })
    expect(w.source.select(alice, 'mcp__docs')?.definition.name).toBe('mcp__docs')
  })

  it('one endpoint read by two tenants is converted for each, not shared', async () => {
    const w = world()
    w.adopt(home, 'docs')
    w.adopt(away, 'docs')
    w.reads('docs', asker =>
      succeed(acquired([action(asker.tenant === home ? 'search' : 'fetch')])),
    )
    const [mine] = (await listing(w, alice)).entries
    const [theirs] = (await listing(w, aliceAway)).entries
    expect(mine?.definition.kind === 'commands' && mine.definition.commands[0]?.name).toBe('search')
    expect(theirs?.definition.kind === 'commands' && theirs.definition.commands[0]?.name).toBe(
      'fetch',
    )
  })

  it('the same actions read again are not converted again', async () => {
    const w = world()
    w.adopt(home, 'docs')
    w.reads('docs', () => succeed(acquired([action('search')])))
    const [first] = (await listing(w, alice)).entries
    const [second] = (await listing(w, bob)).entries
    expect(second?.definition).toBe(first?.definition)
    w.reads('docs', () => succeed(acquired([action('search', { revision: '2' })])))
    const [third] = (await listing(w, alice)).entries
    expect(third?.definition).not.toBe(first?.definition)
  })
})

describe('the source stands as a Tool entry source', () => {
  for (const conformance of toolEntrySourceConformance<Principal, never>()) {
    it(`${conformance.clause}: ${conformance.name}`, async () => {
      const w = world()
      w.adopt(home, 'docs', 'wiki', 'down')
      w.offers('docs', [action('search'), action('fetch')])
      w.offers('wiki', [action('read', { unavailable: 'connection-unavailable' })])
      w.reads('down', fail({ kind: 'unknown' }))
      const verdict = await runConformanceCase(conformance, {
        source: w.source as never,
        owner: alice,
        stranger: mallory,
      })
      expect(verdict).toEqual({ kind: 'passed' })
    })
  }
})

describe('a call of a command', () => {
  async function ready(...offered: Parameters<typeof action>[]) {
    const w = world()
    w.adopt(home, 'docs')
    w.offers(
      'docs',
      offered.map(args => action(...args)),
    )
    await listing(w, alice)
    return w
  }

  it('goes to the endpoint once, as the call it was accepted as', async () => {
    const w = await ready(['search'], ['fetch'])
    w.answers(() => done)
    const declared = commandNamed(w, alice, 'mcp__docs', 'search')
    const args = jsonOf({ query: 'answer' })
    const result = await w.source.execute(callOf(alice, 'mcp__docs', declared, args))
    expect(w.invoked).toHaveLength(1)
    expect(w.invoked[0]?.asker).toEqual(alice)
    expect(w.invoked[0]?.request).toMatchObject({
      ref: { name: 'docs' },
      action: 'search',
      args,
      expectedDefinition: 'sha256:search:1',
      correlationKey: 'call-1',
    })
    expect(result.content).toHaveLength(1)
    expect(result.content[0]).toMatchObject({ kind: 'text' })
    expect((result.content[0] as { text: string }).text).toContain('forty-two')
  })

  it('does not start when the called action changed after the call was accepted', async () => {
    const w = await ready(['search'], ['fetch'])
    const declared = commandNamed(w, alice, 'mcp__docs', 'search')
    w.offers('docs', [action('search', { description: 'Now it deletes.' }), action('fetch')], 2)
    await expect(w.source.execute(callOf(alice, 'mcp__docs', declared))).rejects.toThrow(
      /did not start: the definition of the action changed.*Nothing was sent/u,
    )
    expect(w.invoked).toEqual([])
  })

  it('is sent as usual when only another action changed', async () => {
    const w = await ready(['search'], ['fetch'])
    w.answers(() => done)
    const declared = commandNamed(w, alice, 'mcp__docs', 'search')
    w.offers('docs', [action('search'), action('fetch', { description: 'Changed.' })], 2)
    await w.source.execute(callOf(alice, 'mcp__docs', declared))
    expect(w.invoked).toHaveLength(1)
  })

  it('does not start when the endpoint no longer offers the action', async () => {
    const w = await ready(['search'], ['fetch'])
    const declared = commandNamed(w, alice, 'mcp__docs', 'search')
    w.offers('docs', [action('fetch')], 2)
    await expect(w.source.execute(callOf(alice, 'mcp__docs', declared))).rejects.toThrow(
      /did not start: the endpoint does not offer this action now/u,
    )
    expect(w.invoked).toEqual([])
  })

  it('does not start when the endpoint cannot be read at the call', async () => {
    const w = await ready(['search'])
    const declared = commandNamed(w, alice, 'mcp__docs', 'search')
    w.reads('docs', fail({ kind: 'blocked', reason: 'disabled' }))
    await expect(w.source.execute(callOf(alice, 'mcp__docs', declared))).rejects.toThrow(
      /did not start: the endpoint is disabled/u,
    )
    expect(w.invoked).toEqual([])
  })

  it('does not start for an asker who did not list the endpoint', async () => {
    const w = await ready(['search'])
    const declared = commandNamed(w, alice, 'mcp__docs', 'search')
    await expect(w.source.execute(callOf(mallory, 'mcp__docs', declared))).rejects.toThrow(
      /did not start: the endpoint is not available to this caller/u,
    )
    expect(w.invoked).toEqual([])
  })

  it('that the endpoint turned into a task is cancelled there and answered as not known', async () => {
    const w = await ready(['search'])
    w.answers(() => ({
      kind: 'sent',
      outcome: { kind: 'task', taskId: taskIdOf('task-9'), issuedAt: generationOf(3) },
    }))
    const declared = commandNamed(w, alice, 'mcp__docs', 'search')
    await expect(w.source.execute(callOf(alice, 'mcp__docs', declared))).rejects.toThrow(
      /was sent.*long-running task.*not known/u,
    )
    expect(w.cancelledTasks).toEqual([
      { ref: expect.objectContaining({ name: 'docs' }), taskId: 'task-9', issuedAt: 3 },
    ])
    expect(w.invoked).toHaveLength(1)
  })
})
