// The two RD-COORD doubles answer only from their scripts, answer `unavailable` without one, take
// the caller's access and keep every call readable.
import { describe, expect, it } from 'vitest'
import type { ContentBlock } from '@omne-harness/content-block'
import { fail, succeed } from '@omne-harness/operation-result'
import { residentToolFacts, type DurableEvidence } from '@omne-harness/tool-contract'
import type { ToolAuthority, ToolBindingKey } from '@omne-harness/tool-contract/provider'
import {
  createScriptedAdoptionPoint,
  createScriptedToolGenerations,
  isNotApplicable,
  memoryToolBindingRegistryFixture,
  type AdoptionPointRecorded,
} from '@omne-harness/tool-cordis-contract/testing'

const keyOf = (authority: ToolAuthority): ToolBindingKey => ({
  layer: authority.layer,
  asset: authority.asset,
})
const evidence = (record: string): DurableEvidence => ({
  owner: 'adoption-scripts',
  record,
  revision: '1',
  digest: `sha256:${record}`,
})

function generationsOverRegistry() {
  const fixture = memoryToolBindingRegistryFixture()
  const scripted = createScriptedToolGenerations<string, unknown, ContentBlock>({
    registry: fixture.registry,
  })
  return { fixture, scripted }
}

const liveKeys = (fixture: ReturnType<typeof memoryToolBindingRegistryFixture>) => {
  const snapshot = fixture.registry.snapshot(fixture.access)
  if ('failure' in snapshot) throw new Error('snapshot failed')
  return snapshot.ok.map(entry => entry.key)
}

describe('createScriptedToolGenerations', () => {
  it('declares no durability', () => {
    expect(createScriptedToolGenerations().durability).toBe('none')
  })

  it('answers the script of the key and writes a scripted load into the registry', async () => {
    const { fixture, scripted } = generationsOverRegistry()
    const key = keyOf(fixture.authority)
    scripted.answer(
      key,
      succeed({ key, state: 'loaded' }),
      fixture.loaded(fixture.authority, 'sha256:first'),
    )
    expect(liveKeys(fixture)).toEqual([])
    const answer = await scripted.generations.ensureLoaded({
      authority: fixture.authority,
      access: fixture.access,
    })
    expect(answer).toEqual(succeed({ key, state: 'loaded' }))
    expect(liveKeys(fixture)).toEqual([key])
  })

  it('answers a scripted failure as it is and writes nothing', async () => {
    const { fixture, scripted } = generationsOverRegistry()
    const key = keyOf(fixture.authority)
    const missing = fail({ kind: 'missing' as const, evidence: evidence('gone') })
    scripted.answer(key, missing, fixture.loaded(fixture.authority, 'sha256:first'))
    const answer = await scripted.generations.ensureLoaded({
      authority: fixture.authority,
      access: fixture.access,
    })
    expect(answer).toEqual(missing)
    expect(liveKeys(fixture)).toEqual([])
  })

  it('answers unavailable for a key without a script, another revision of the asset too', async () => {
    const { fixture, scripted } = generationsOverRegistry()
    const key = keyOf(fixture.authority)
    scripted.answer(key, succeed({ key, state: 'recognized' }))
    const other = fixture.otherAuthority
    if (other === undefined) throw new Error('the fixture names another authority')
    const answer = await scripted.generations.ensureLoaded({
      authority: other,
      access: fixture.access,
    })
    expect(answer).toMatchObject({ failure: { kind: 'unavailable' } })
    expect(liveKeys(fixture)).toEqual([])
  })

  it('records the access and authority of each call, and the system scope of unload and sweep', async () => {
    const { fixture, scripted } = generationsOverRegistry()
    const key = keyOf(fixture.authority)
    await scripted.generations.ensureLoaded({
      authority: fixture.authority,
      access: fixture.access,
    })
    await scripted.generations.ensureLoaded({
      authority: fixture.authority,
      access: { scope: 'system' },
    })
    expect(await scripted.generations.unload({ key })).toEqual(succeed({ state: 'retained' }))
    expect(await scripted.generations.sweep()).toEqual(succeed({ reloaded: [], unloaded: [] }))
    const calls = scripted.calls
    expect(calls.map(call => call.verb)).toEqual([
      'ensureLoaded',
      'ensureLoaded',
      'unload',
      'sweep',
    ])
    expect(calls[0]?.access).toBe(fixture.access)
    expect(calls[0]?.authority).toBe(fixture.authority)
    expect(calls[0]?.key).toEqual(key)
    expect(calls[1]?.access).toEqual({ scope: 'system' })
    expect(calls[2]).toEqual({ verb: 'unload', key, authority: null, access: { scope: 'system' } })
    expect(calls[3]).toEqual({
      verb: 'sweep',
      key: null,
      authority: null,
      access: { scope: 'system' },
    })
  })

  it('gives a copy of the calls that later calls do not change', async () => {
    const { scripted } = generationsOverRegistry()
    const before = scripted.calls
    await scripted.generations.sweep()
    expect(before).toEqual([])
    expect(Object.isFrozen(scripted.calls)).toBe(true)
    expect(scripted.calls).toHaveLength(1)
  })

  it('throws on a scripted write it cannot make instead of answering loaded', async () => {
    const { fixture, scripted } = generationsOverRegistry()
    const key = keyOf(fixture.authority)
    scripted.answer(
      key,
      succeed({ key, state: 'loaded' }),
      fixture.loaded(fixture.authority, 'sha256:first'),
    )
    await expect(
      scripted.generations.ensureLoaded({
        authority: fixture.authority,
        access: { scope: 'system' },
      }),
    ).rejects.toThrow(/access of a tenant/u)

    const foreign = fixture.foreignAuthority
    if (foreign === undefined) throw new Error('the fixture names a foreign authority')
    const foreignKey = keyOf(foreign)
    scripted.answer(
      foreignKey,
      succeed({ key: foreignKey, state: 'loaded' }),
      fixture.loaded(foreign, 'sha256:foreign'),
    )
    await expect(
      scripted.generations.ensureLoaded({ authority: foreign, access: fixture.access }),
    ).rejects.toThrow(/refused/u)
    expect(liveKeys(fixture)).toEqual([])

    const bare = createScriptedToolGenerations<string, unknown, ContentBlock>()
    expect(() =>
      bare.answer(key, succeed({ key, state: 'loaded' }), fixture.loaded(fixture.authority, 'x')),
    ).toThrow(TypeError)
  })

  it('has no loader', () => {
    const { fixture, scripted } = generationsOverRegistry()
    let thrown: unknown
    try {
      scripted.generations.loaderFor(fixture.authority)
    } catch (error) {
      thrown = error
    }
    expect(isNotApplicable(thrown)).toBe(true)
  })
})

describe('createScriptedAdoptionPoint', () => {
  const fixture = memoryToolBindingRegistryFixture()
  const access = fixture.access
  const filesKey = keyOf(fixture.authority)
  const facts = residentToolFacts(filesKey, fixture.loaded(fixture.authority, 'sha256:a').shape)
  if ('failure' in facts) throw new Error('the fixture shape is storable')
  const recorded: AdoptionPointRecorded = facts.ok
  const recordedCapability = recorded.capability
  type Key = Readonly<{ capability: string; key: string }>
  type Resident = Readonly<{ capability: string; version: string }>

  it('declares no durability', () => {
    expect(createScriptedAdoptionPoint().durability).toBe('none')
  })

  it('joins the scripted parts of the recorded and wanted capabilities, recorded first', async () => {
    const point = createScriptedAdoptionPoint<string, Resident, Key>()
    point.script('Shell', {
      plan: { kind: 'advance', key: filesKey },
      key: { capability: 'Shell', key: 'shell-key' },
      residents: [{ capability: 'Shell', version: '2' }],
    })
    point.script(recordedCapability, {
      plan: { kind: 'keep', key: filesKey },
      key: { capability: recordedCapability, key: recorded.key },
    })
    const answer = await point.plan(access, {
      recorded: [recorded],
      capabilities: ['Shell', recordedCapability],
    })
    expect(answer).toEqual(
      succeed({
        material: {
          residents: [{ capability: 'Shell', version: '2' }],
          keys: [
            { capability: recordedCapability, key: recorded.key },
            { capability: 'Shell', key: 'shell-key' },
          ],
        },
        verdict: null,
      }),
    )
  })

  it('answers the verdict of the first capability scripted to freeze', async () => {
    const point = createScriptedAdoptionPoint<string, Resident, Key>()
    const verdict = { cause: 'tool-shape-lost' as const, evidence: evidence('lost') }
    point.script(recordedCapability, { plan: { kind: 'freeze', verdict } })
    point.script('Shell', { plan: { kind: 'replacement' } })
    const answer = await point.plan(access, { recorded: [recorded], capabilities: ['Shell'] })
    expect(answer).toMatchObject({ ok: { verdict } })
  })

  it('answers unavailable when a capability has no script or is scripted unavailable', async () => {
    const point = createScriptedAdoptionPoint<string, Resident, Key>()
    point.script(recordedCapability, { plan: { kind: 'keep', key: filesKey } })
    expect(await point.plan(access, { recorded: [recorded], capabilities: ['Shell'] })).toEqual(
      fail({ kind: 'unavailable' }),
    )
    point.script('Shell', 'unavailable')
    expect(await point.plan(access, { recorded: [recorded], capabilities: ['Shell'] })).toEqual(
      fail({ kind: 'unavailable' }),
    )
    point.script('Shell', { plan: { kind: 'replacement' } })
    expect(
      await point.plan(access, { recorded: [recorded], capabilities: ['Shell'] }),
    ).toMatchObject({ ok: { verdict: null } })
  })

  it('records the access and input of each call, unscripted ones too', async () => {
    const point = createScriptedAdoptionPoint<string, Resident, Key>()
    const input = { recorded: [recorded], capabilities: ['Shell'] }
    await point.plan(access, input)
    const before = point.calls
    await point.plan(access, { recorded: [], capabilities: [] })
    expect(before).toHaveLength(1)
    expect(point.calls).toHaveLength(2)
    expect(point.calls[0]?.access).toBe(access)
    expect(point.calls[0]?.access.tenant).toBe(access.tenant)
    expect(point.calls[0]?.input).toBe(input)
    expect(Object.keys(point.calls[0]?.input ?? {}).sort()).toEqual(['capabilities', 'recorded'])
  })
})
