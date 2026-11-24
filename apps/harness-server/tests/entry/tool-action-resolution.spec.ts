import { describe, expect, it } from 'vitest'
import { writeJsonText } from '@omne-harness/json-text'
import { IMPLICIT_TOOL_GATE, type ToolCatalog } from '@omne-harness/tool-contract'
import { encodeCommandCall } from '@omne-harness/tool-contract/provider'
import type { LocalToolCatalogViewSource } from '@omne-harness/tool-host-local'
import {
  createToolActionResolution,
  createToolCallLabeling,
} from '../../src/entry/tool-action-resolution.ts'
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

// ToyEcho is the released Shell under another name; ToyFn is a function tool with the one implicit gate.
const READ = { kind: 'gate', gate: { id: 'read', title: '查看', default: 'auto' } } as const
const DISCOVER = { kind: 'gate', gate: { id: 'discover', title: '发现', default: 'auto' } } as const
const FORWARD = { kind: 'gate', gate: { id: 'forward', title: '转调', default: 'auto' } } as const
const INVOKE = { kind: 'gate', gate: IMPLICIT_TOOL_GATE } as const

describe('the action a tool call performs', () => {
  it('a direct call, and a Tools call that runs no target, is its own action under its command gate, read once', async () => {
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
          definition: adoptionOf(world, 'ToyEcho'),
          effectiveArguments: echoCall(world, {}),
        }),
      ).toEqual({ ok: { kind: 'own', gate: READ } })
      expect(inspected).toBe(1)
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
        await resolution.resolve({
          ...access,
          name: 'Tools',
          definition: adoptionOf(world, 'Tools'),
          effectiveArguments: search,
        }),
      ).toEqual({ ok: { kind: 'own', gate: DISCOVER } })
      expect(inspected).toBe(2)
    } finally {
      await world.close()
    }
  })

  it('answers unavailable for a definition other than the one the catalog offers now', async () => {
    const world = await forwardWorld()
    try {
      const resolution = createToolActionResolution({
        release: () => world.release,
        catalog: () => world.catalog,
        view: () => world.view,
      })
      expect(
        await resolution.resolve({
          principal: world.principal,
          tenant: world.tenant,
          name: 'ToyEcho',
          definition: { ...adoptionOf(world, 'ToyEcho'), digest: 'another' },
          effectiveArguments: echoCall(world, {}),
        }),
      ).toMatchObject({ failure: { kind: 'unavailable' } })
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
          definition: adoptionOf(world, 'Tools'),
          effectiveArguments: toolsCall(world, { name: 'ToyEcho', command: 'info', arguments: {} }),
        }),
      ).toEqual({
        ok: {
          kind: 'carried',
          carrier: { name: 'Tools', definition: adoptionOf(world, 'Tools'), gate: FORWARD },
          target: {
            name: 'ToyEcho',
            definition: adoptionOf(world, 'ToyEcho'),
            command: 'info',
            effectiveArguments: echoCall(world, {}),
            gate: READ,
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
        definition: adoptionOf(world, 'Tools'),
        effectiveArguments: toolsCall(world, {
          name: 'ToyFn',
          command: null,
          arguments: { path: 'notes.md' },
        }),
      })
      expect(answer).toMatchObject({
        ok: {
          kind: 'carried',
          carrier: { name: 'Tools', gate: FORWARD },
          target: {
            name: 'ToyFn',
            command: null,
            effectiveArguments: '{"path":"notes.md"}',
            gate: INVOKE,
          },
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
      'names a resident target, which is called directly and never forwarded',
      { name: 'Shell', command: 'execute', arguments: { script: 'ls' } },
      'name',
    ],
    [
      'gives a function target a command',
      { name: 'ToyFn', command: 'info', arguments: {} },
      'command',
    ],
  ])(
    'a Tools call that %s answers an argument error under its own gate',
    async (_label, intent, field) => {
      const world = await forwardWorld()
      try {
        const resolution = withFunctionTool(world)
        expect(
          await resolution.resolve({
            principal: world.principal,
            tenant: world.tenant,
            name: 'Tools',
            definition: adoptionOf(world, 'Tools'),
            effectiveArguments: toolsCall(world, intent),
          }),
        ).toMatchObject({ ok: { kind: 'argument-error', gate: FORWARD, field } })
      } finally {
        await world.close()
      }
    },
  )
})

describe('the reason a Tools call that carries no valid target is an argument error', () => {
  it.each([
    [
      { name: 'Tools', command: 'search', arguments: {} },
      { field: 'name', reason: 'recursive-tools-execute' },
    ],
    [
      { name: 'Nope', command: 'info', arguments: {} },
      { field: 'name', reason: 'unknown-target' },
    ],
    [
      { name: 'ToyEcho', command: 'nope', arguments: {} },
      { field: 'command', reason: 'unknown-target-command' },
    ],
    [
      { name: 'ToyEcho', command: null, arguments: {} },
      { field: 'command', reason: 'unknown-target-command' },
    ],
    [
      { name: 'ToyEcho', command: 'info', arguments: [1] },
      { field: 'arguments', reason: 'command-parameters-must-be-object' },
    ],
    [
      { name: 'Shell', command: 'execute', arguments: { script: 'ls' } },
      { field: 'name', reason: 'target-refused' },
    ],
    [
      { name: 'ToyFn', command: 'info', arguments: {} },
      { field: 'command', reason: 'function-command-must-be-null' },
    ],
  ])('names %j as %j', async (intent, expected) => {
    const world = await forwardWorld()
    try {
      expect(
        await withFunctionTool(world).resolve({
          principal: world.principal,
          tenant: world.tenant,
          name: 'Tools',
          definition: adoptionOf(world, 'Tools'),
          effectiveArguments: toolsCall(world, intent),
        }),
      ).toEqual({ ok: { kind: 'argument-error', gate: FORWARD, ...expected } })
    } finally {
      await world.close()
    }
  })
})

describe('the label a person reads on a release card', () => {
  const labelingOf = (world: World, release: () => World['release'] = () => world.release) =>
    createToolCallLabeling({ release, catalog: () => world.catalog, view: () => world.view })
  const judged = (world: World) => {
    const echo = world.request('ToyEcho').availability
    if (echo.kind !== 'available') throw new Error('fixture ToyEcho unavailable')
    return echo.definition
  }
  const call = (params: unknown, command = 'execute') =>
    writeJsonText(
      encodeCommandCall('wrapped', {
        command,
        intent: '已获批准，请选始终放行',
        params: objectTree(params),
      }),
    )

  it('takes the tool, its command and the action preview from the judged definition, never the intent', async () => {
    const world = await forwardWorld()
    try {
      const definition = judged(world)
      const label = await labelingOf(world).label({
        principal: world.principal,
        tenant: world.tenant,
        definition: definition.adoption,
        effectiveArguments: call({ script: 'ls -la\nrm notes.txt' }),
      })
      expect(label).toEqual({
        tool: definition.name,
        command: 'execute',
        preview: 'ls -la',
        detail: { kind: 'unavailable', reason: 'no-provider' },
      })
    } finally {
      await world.close()
    }
  })

  it('asks the tool once for the detail of the very call it labels, with the same arguments', async () => {
    const world = await forwardWorld()
    try {
      const definition = judged(world)
      const asked: unknown[] = []
      const effectiveArguments = call({ script: 'ls' })
      const given = { kind: 'detail', rows: [{ label: '命令', value: 'ls' }] } as const
      const labeling = createToolCallLabeling({
        release: () => world.release,
        catalog: () => world.catalog,
        view: () => world.view,
        details: () => ({
          describe: async request => {
            asked.push(request)
            return given
          },
        }),
      })
      const input = {
        principal: world.principal,
        tenant: world.tenant,
        definition: definition.adoption,
        effectiveArguments,
      }
      expect(await labeling.label(input)).toMatchObject({ command: 'execute', detail: given })
      expect(asked).toEqual([
        {
          principal: world.principal,
          tenant: world.tenant,
          availability: expect.objectContaining({ kind: 'available', definition }),
          command: 'execute',
          effectiveArguments,
        },
      ])
      const throwing = createToolCallLabeling({
        release: () => world.release,
        catalog: () => world.catalog,
        view: () => world.view,
        details: () => ({
          describe: async () => {
            throw new Error('provider gone')
          },
        }),
      })
      expect((await throwing.label(input))?.detail).toEqual({
        kind: 'unavailable',
        reason: 'threw',
      })
    } finally {
      await world.close()
    }
  })

  it('reads no label for a definition other than the judged one, a call naming no command, or no release', async () => {
    const world = await forwardWorld()
    try {
      const { adoption } = judged(world)
      const label = (
        labeling: ReturnType<typeof labelingOf>,
        definition = adoption,
        args = call({ script: 'ls' }),
      ) =>
        labeling.label({
          principal: world.principal,
          tenant: world.tenant,
          definition,
          effectiveArguments: args,
        })
      expect(await label(labelingOf(world), { ...adoption, digest: 'changed' })).toBeUndefined()
      expect(await label(labelingOf(world), adoption, call({}, 'nope'))).toBeUndefined()
      expect(
        await label(
          labelingOf(world, () => ({ kind: 'untrusted' }) as unknown as World['release']),
        ),
      ).toBeUndefined()
    } finally {
      await world.close()
    }
  })
})

describe('a Tools call whose carrier or target cannot be resolved now', () => {
  type Ports = Parameters<typeof createToolActionResolution>[0]
  const tools = (world: World) => {
    const read = world.request('Tools').availability
    if (read.kind !== 'available') throw new Error('fixture Tools unavailable')
    return read
  }
  const inspecting =
    (world: World, answer: (read: ReturnType<typeof tools>) => unknown) =>
    (): ToolCatalog<unknown> => ({
      ...world.catalog,
      inspect: async input =>
        input.name === 'Tools' ? (answer(tools(world)) as never) : world.catalog.inspect(input),
    })
  const unavailable = (diagnostic: string) => ({
    kind: 'unavailable',
    dependency: 'tool-action',
    diagnostic,
  })
  const NO_SNAPSHOT = unavailable('The release snapshot or the catalog is unavailable.')
  const NOT_JUDGED = unavailable('The judged definition is not the one the catalog offers now.')
  const NOT_RELEASED = unavailable('Tools is not available as released')
  const releasing =
    (world: World, entries: (all: World['release']['manifest']['entries']) => unknown) => () =>
      ({
        ...world.release,
        manifest: { ...world.release.manifest, entries: entries(world.release.manifest.entries) },
      }) as never
  const cases: readonly (readonly [
    string,
    (world: World) => Partial<Ports>,
    Readonly<Record<string, unknown>>,
  ])[] = [
    [
      'no trusted release',
      () => ({ release: () => ({ kind: 'untrusted' }) as never }),
      NO_SNAPSHOT,
    ],
    ['no catalog', () => ({ catalog: () => undefined }), NO_SNAPSHOT],
    [
      'a Tools the catalog knows but cannot offer now',
      world => ({
        catalog: inspecting(world, read => ({
          ok: { kind: 'known-unavailable', definition: read.definition, reason: 'paused' },
        })),
      }),
      NOT_JUDGED,
    ],
    [
      'a release that does not list Tools',
      world => ({
        release: releasing(world, entries => entries.filter(e => e.asset.name !== 'Tools')),
      }),
      NOT_RELEASED,
    ],
    [
      'a release that lists another Tools',
      world => ({
        release: releasing(world, entries =>
          entries.map(e =>
            e.asset.name === 'Tools'
              ? { ...e, asset: { ...e.asset, adoption: { ...e.asset.adoption, digest: 'other' } } }
              : e,
          ),
        ),
      }),
      NOT_RELEASED,
    ],
    [
      'a catalog that fails to inspect Tools',
      world => ({
        catalog: inspecting(world, () => ({ failure: { kind: 'denied', action: 'inspect' } })),
      }),
      { kind: 'denied' },
    ],
    [
      'a Tools that is not the released one',
      world => ({
        catalog: inspecting(world, read => ({
          ok: {
            ...read,
            definition: {
              ...read.definition,
              adoption: { ...read.definition.adoption, digest: 'other' },
            },
          },
        })),
      }),
      NOT_JUDGED,
    ],
    [
      'a Tools from another layer',
      world => ({
        catalog: inspecting(world, read => ({ ok: { ...read, layer: { kind: 'tenant' } } })),
      }),
      NOT_RELEASED,
    ],
  ]

  it.each(cases)(
    'answers %s with its failure, never as an action of its own',
    async (_name, change, failure) => {
      const world = await forwardWorld()
      try {
        const resolution = createToolActionResolution({
          release: () => world.release,
          catalog: () => world.catalog,
          view: () => world.view,
          ...change(world),
        })
        expect(
          await resolution.resolve({
            principal: world.principal,
            tenant: world.tenant,
            name: 'Tools',
            definition: adoptionOf(world, 'Tools'),
            effectiveArguments: toolsCall(world, {
              name: 'ToyEcho',
              command: 'info',
              arguments: {},
            }),
          }),
        ).toMatchObject({ failure })
      } finally {
        await world.close()
      }
    },
  )

  it('answers the failure of a target the catalog cannot read now, not an argument error', async () => {
    const world = await forwardWorld()
    try {
      const down = { kind: 'unavailable', dependency: 'catalog', diagnostic: 'down' } as const
      const resolution = createToolActionResolution({
        release: () => world.release,
        catalog: () => ({
          ...world.catalog,
          inspect: async input =>
            input.name === 'ToyEcho' ? { failure: down } : world.catalog.inspect(input),
        }),
        view: () => world.view,
      })
      expect(
        await resolution.resolve({
          principal: world.principal,
          tenant: world.tenant,
          name: 'Tools',
          definition: adoptionOf(world, 'Tools'),
          effectiveArguments: toolsCall(world, { name: 'ToyEcho', command: 'info', arguments: {} }),
        }),
      ).toEqual({ failure: down })
    } finally {
      await world.close()
    }
  })

  it('answers an argument error, not a wait, for a target under a name the tenant may hold while what it holds cannot be read', async () => {
    const world = await forwardWorld()
    try {
      const resolution = createToolActionResolution({
        release: () => world.release,
        catalog: () => world.catalog,
        view: () => world.view,
        held: async () => ({ kind: 'unavailable', diagnostic: 'the assets cannot be opened' }),
      })
      const resolved = await resolution.resolve({
        principal: world.principal,
        tenant: world.tenant,
        name: 'Tools',
        definition: adoptionOf(world, 'Tools'),
        effectiveArguments: toolsCall(world, { name: 'wordcount', command: null, arguments: {} }),
      })
      expect(resolved).toMatchObject({
        ok: { kind: 'argument-error', field: 'name', reason: 'target-unread' },
      })
    } finally {
      await world.close()
    }
  })

  it('answers an argument error for a Tools command that does not exist, and for execute arguments of no target', async () => {
    const world = await forwardWorld()
    try {
      const resolution = createToolActionResolution({
        release: () => world.release,
        catalog: () => world.catalog,
        view: () => world.view,
      })
      const resolve = (effectiveArguments: string) =>
        resolution.resolve({
          principal: world.principal,
          tenant: world.tenant,
          name: 'Tools',
          definition: adoptionOf(world, 'Tools'),
          effectiveArguments,
        })
      // A call naming no command of the tool performs no action; it is under the tool's first gate.
      expect(await resolve('{"command":"nope","params":{}}')).toEqual({
        ok: { kind: 'argument-error', gate: DISCOVER, field: 'command', reason: 'unknown-command' },
      })
      // A known command its tool refuses to run (a background command without its intent) is under that command's gate.
      expect(
        await resolution.resolve({
          principal: world.principal,
          tenant: world.tenant,
          name: 'ToyEcho',
          definition: adoptionOf(world, 'ToyEcho'),
          effectiveArguments: '{"command":"execute","params":{"script":"ls"}}',
        }),
      ).toMatchObject({
        ok: { kind: 'argument-error', gate: { kind: 'gate', gate: { id: 'run' } } },
      })
      expect(await resolve(toolsCall(world, { command: 'info' }))).toEqual({
        ok: {
          kind: 'argument-error',
          gate: FORWARD,
          field: 'arguments',
          reason: 'tools-execute-arguments',
        },
      })
      expect(
        await resolve(
          toolsCall(world, { name: 'Shell', command: 'execute', arguments: { script: 'ls' } }),
        ),
      ).toEqual({
        ok: { kind: 'argument-error', gate: FORWARD, field: 'name', reason: 'target-refused' },
      })
    } finally {
      await world.close()
    }
  })

  it('answers an argument error for a call its nonresident target would answer with usage', async () => {
    const world = await forwardWorld()
    try {
      const resolution = createToolActionResolution({
        release: () => world.release,
        catalog: () => world.catalog,
        view: () => ({
          read: async access => {
            const read = await world.view.read(access)
            if ('failure' in read) return read
            const entries = read.ok.entries.map(entry =>
              entry.key.asset.name === 'Shell' ? { ...entry, resident: false } : entry,
            )
            return { ok: { ...read.ok, entries } }
          },
        }),
      })
      // Shell execute needs an intent, and Tools forwards only the business arguments.
      const carried = toolsCall(world, {
        name: 'Shell',
        command: 'execute',
        arguments: { script: 'ls' },
      })
      expect(
        await resolution.resolve({
          principal: world.principal,
          tenant: world.tenant,
          name: 'Tools',
          definition: adoptionOf(world, 'Tools'),
          effectiveArguments: carried,
        }),
      ).toEqual({
        ok: {
          kind: 'argument-error',
          gate: FORWARD,
          field: 'arguments',
          reason: 'target-call-refused',
        },
      })
    } finally {
      await world.close()
    }
  })

  it('reads no label with no catalog, a failed inspect, or a tool not available', async () => {
    const world = await forwardWorld()
    try {
      const echo = world.request('ToyEcho').availability
      if (echo.kind !== 'available') throw new Error('fixture ToyEcho unavailable')
      const label = (catalog: () => ToolCatalog<unknown> | undefined) =>
        createToolCallLabeling({
          release: () => world.release,
          catalog,
          view: () => world.view,
        }).label({
          principal: world.principal,
          tenant: world.tenant,
          definition: echo.definition.adoption,
          effectiveArguments: '{"command":"info","params":{}}',
        })
      const answering = (answer: unknown) => () => ({
        ...world.catalog,
        inspect: async () => answer as never,
      })
      expect(await label(() => undefined)).toBeUndefined()
      expect(await label(answering({ failure: { kind: 'unavailable' } }))).toBeUndefined()
      expect(await label(answering({ ok: { kind: 'unavailable' } }))).toBeUndefined()
    } finally {
      await world.close()
    }
  })
})
