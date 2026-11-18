import { describe, expect, it } from 'vitest'
import { writeJsonText } from '@omne-harness/json-text'
import type { ToolCatalog } from '@omne-harness/tool-contract'
import { encodeCommandCall } from '@omne-harness/tool-contract/provider'
import type { LocalToolCatalogViewSource } from '@omne-harness/tool-host-local'
import { createToolActionResolution } from '../../src/entry/tool-action-resolution.ts'
import { forwardWorld } from './tool-forward-support.ts'
import { echoCall, objectTree, toolsCall } from './tool-call-support.ts'

type World = Awaited<ReturnType<typeof forwardWorld>>

// The fixture release has command tools only; a function tool `ToyFn` is added, not resident.
function withFunctionTool(world: World) {
  const echo = world.release.manifest.entries.find(entry => entry.asset.name === 'ToyEcho')
  if (echo === undefined) throw new Error('fixture ToyEcho missing')
  const adoption = { ...echo.asset.adoption, name: 'ToyFn' }
  const release = {
    ...world.release,
    manifest: {
      ...world.release.manifest,
      entries: [...world.release.manifest.entries, { ...echo, asset: { name: 'ToyFn', adoption } }],
    },
  }
  const echoAvailability = world.request('ToyEcho').availability
  if (echoAvailability.kind !== 'available') throw new Error('fixture ToyEcho unavailable')
  if (echoAvailability.definition.kind !== 'commands')
    throw new Error('fixture ToyEcho is not commands')
  const info = echoAvailability.definition.commands[0]
  if (info === undefined || info.parameters.kind !== 'declared') throw new Error('fixture command')
  const {
    commands: _commands,
    encoding: _encoding,
    ...common
  } = echoAvailability.definition as {
    commands: unknown
    encoding: unknown
  } & typeof echoAvailability.definition
  const fn = {
    ...echoAvailability,
    definition: {
      ...common,
      adoption,
      name: 'ToyFn',
      kind: 'function',
      parameters: info.parameters.value,
      returns: info.returns,
    },
  } as unknown as typeof echoAvailability
  const catalog: ToolCatalog<unknown> = {
    ...world.catalog,
    inspect: async input => (input.name === 'ToyFn' ? { ok: fn } : world.catalog.inspect(input)),
  }
  const view: LocalToolCatalogViewSource<unknown> = {
    read: async input => {
      const read = await world.view.read(input)
      if ('failure' in read) return read
      return {
        ok: {
          ...read.ok,
          entries: [
            ...read.ok.entries,
            {
              key: { layer: { kind: 'official' }, asset: { name: 'ToyFn', adoption } },
              resident: false,
            },
          ],
        },
      }
    },
  } as LocalToolCatalogViewSource<unknown>
  return createToolActionResolution({
    release: () => release,
    catalog: () => catalog,
    view: () => view,
  })
}

const adoptionOf = (world: World, name: 'Tools' | 'ToyEcho') => {
  const availability = world.request(name).availability
  if (availability.kind !== 'available') throw new Error(`${name} unavailable`)
  return availability.definition.adoption
}

describe('the action a tool call performs', () => {
  it('a direct call, and a Tools call that runs no target, is its own action and reads nothing', async () => {
    const world = await forwardWorld()
    try {
      let inspected = 0
      const resolution = createToolActionResolution({
        release: () => world.release,
        catalog: () => ({
          ...world.catalog,
          inspect: async input => {
            inspected += 1
            return world.catalog.inspect(input)
          },
        }),
        view: () => world.view,
      })
      const access = { principal: world.principal, tenant: world.tenant }
      expect(
        await resolution.resolve({
          ...access,
          name: 'ToyEcho',
          effectiveArguments: echoCall(world, {}),
        }),
      ).toEqual({ ok: { kind: 'own' } })
      expect(inspected).toBe(0)
      const tools = world.request('Tools').availability
      if (tools.kind !== 'available' || tools.definition.kind !== 'commands')
        throw new Error('fixture Tools is not a command tool')
      const search = writeJsonText(
        encodeCommandCall(tools.definition.encoding, {
          command: 'search',
          intent: null,
          params: objectTree({ query: 'echo' }),
        }),
      )
      expect(
        await resolution.resolve({ ...access, name: 'Tools', effectiveArguments: search }),
      ).toEqual({ ok: { kind: 'own' } })
    } finally {
      await world.close()
    }
  })

  it('a Tools call naming a command target carries that target, encoded as a direct call would be', async () => {
    const world = await forwardWorld()
    try {
      const resolution = withFunctionTool(world)
      expect(
        await resolution.resolve({
          principal: world.principal,
          tenant: world.tenant,
          name: 'Tools',
          effectiveArguments: toolsCall(world, { name: 'ToyEcho', command: 'info', arguments: {} }),
        }),
      ).toEqual({
        ok: {
          kind: 'carried',
          carrier: { name: 'Tools', definition: adoptionOf(world, 'Tools') },
          target: {
            name: 'ToyEcho',
            definition: adoptionOf(world, 'ToyEcho'),
            command: 'info',
            effectiveArguments: echoCall(world, {}),
          },
        },
      })
    } finally {
      await world.close()
    }
  })

  it('a Tools call naming a function target carries it with no command and its arguments as given', async () => {
    const world = await forwardWorld()
    try {
      const resolution = withFunctionTool(world)
      const answer = await resolution.resolve({
        principal: world.principal,
        tenant: world.tenant,
        name: 'Tools',
        effectiveArguments: toolsCall(world, {
          name: 'ToyFn',
          command: null,
          arguments: { path: 'notes.md' },
        }),
      })
      expect(answer).toMatchObject({
        ok: {
          kind: 'carried',
          carrier: { name: 'Tools' },
          target: { name: 'ToyFn', command: null, effectiveArguments: '{"path":"notes.md"}' },
        },
      })
    } finally {
      await world.close()
    }
  })

  it.each([
    ['names Tools itself', { name: 'Tools', command: 'search', arguments: {} }, 'name'],
    ['names a target that is not there', { name: 'Nope', command: 'info', arguments: {} }, 'name'],
    [
      'names a command the target lacks',
      { name: 'ToyEcho', command: 'nope', arguments: {} },
      'command',
    ],
    [
      'gives a command target arguments that are not an object',
      { name: 'ToyEcho', command: 'info', arguments: [1] },
      'arguments',
    ],
    [
      'gives a function target a command',
      { name: 'ToyFn', command: 'info', arguments: {} },
      'command',
    ],
  ])('a Tools call that %s answers invalid', async (_label, intent, field) => {
    const world = await forwardWorld()
    try {
      const resolution = withFunctionTool(world)
      expect(
        await resolution.resolve({
          principal: world.principal,
          tenant: world.tenant,
          name: 'Tools',
          effectiveArguments: toolsCall(world, intent),
        }),
      ).toMatchObject({ failure: { kind: 'invalid', field } })
    } finally {
      await world.close()
    }
  })
})
