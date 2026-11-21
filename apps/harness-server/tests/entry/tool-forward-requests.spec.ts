import { describe, expect, it } from 'vitest'
import { commandArguments } from '@omne-harness/tool-contract/provider'
import {
  createForwardTargetRequests,
  isReleaseToolsRequest,
  resolveForwardTarget,
  type ForwardRequestPorts,
} from '../../src/entry/tool-forward-requests.ts'
import { tree } from '../rows/tool-host/support.ts'
import { forwardWorld } from './tool-forward-support.ts'

describe('trusted forwarding target preparation', () => {
  it('uses the target encoding and settings, preserving every parent ceiling', async () => {
    const world = await forwardWorld()
    try {
      const prepare = createForwardTargetRequests({
        release: () => world.release,
        catalog: () => world.catalog,
        view: () => world.view,
      })
      const result = await prepare(world.parent, {
        name: 'ToyEcho',
        command: 'info',
        arguments: tree({}),
      })
      if ('failure' in result) throw new Error(JSON.stringify(result))
      const target = result.ok
      expect(target.command).toBe('info')
      const echo = world.request('ToyEcho').availability.definition
      expect(target.availability).toMatchObject({ definition: echo.adoption, name: echo.name })
      expect(commandArguments(echo, target.command, target.arguments)).toMatchObject({
        ok: { effective: '{}' },
      })
      for (const key of [
        'context',
        'workspace',
        'resources',
        'scope',
        'requesterScope',
        'limits',
        'mode',
      ] as const)
        expect(target[key]).toEqual(world.parent.request[key])
      expect(target.settings).toEqual(world.request('ToyEcho').settings)
      expect(target).not.toHaveProperty('environment')
      expect(target.batchDecision).toBeNull()
      expect(target).not.toHaveProperty('invocation')
      // A parent pinned to no directory gives its target none: the member is absent.
      expect(target).not.toHaveProperty('directory')
      const directory = { path: '/srv/blog', workspace: null }
      const pinned = { ...world.parent, request: { ...world.parent.request, directory } }
      const inherited = await prepare(pinned, {
        name: 'ToyEcho',
        command: 'info',
        arguments: tree({}),
      })
      if ('failure' in inherited) throw new Error(JSON.stringify(inherited))
      expect(inherited.ok.directory).toEqual(directory)
    } finally {
      await world.close()
    }
  })
  it('refuses every resident target, including a target admitted after the first preparation', async () => {
    const world = await forwardWorld()
    try {
      const prepare = createForwardTargetRequests({
        release: () => world.release,
        catalog: () => world.catalog,
        view: () => world.view,
      })
      for (const name of ['Files', 'Shell'])
        expect(
          await prepare(world.parent, { name, command: 'help', arguments: tree({}) }),
        ).toMatchObject({
          failure: { kind: 'denied', action: 'resident-tools-require-direct-call' },
        })
      expect(
        await prepare(world.parent, { name: 'ToyEcho', command: 'info', arguments: tree({}) }),
      ).toHaveProperty('ok')
      world.setToyResident(true)
      expect(
        await prepare(world.parent, { name: 'ToyEcho', command: 'info', arguments: tree({}) }),
      ).toMatchObject({ failure: { kind: 'denied' } })
    } finally {
      await world.close()
    }
  })
  it('refuses name-only parent impersonation, recursive forwarding and missing catalog', async () => {
    const world = await forwardWorld()
    try {
      const original = world.parent.request
      expect(isReleaseToolsRequest(world.release, original)).toBe(true)
      expect(
        isReleaseToolsRequest(world.release, {
          ...original,
          availability: {
            ...original.availability,
            definition: {
              ...original.availability.definition,
              adoption: { ...original.availability.definition.adoption, digest: 'forged' },
            },
          },
        }),
      ).toBe(false)
      const prepare = createForwardTargetRequests({
        release: () => world.release,
        catalog: () => world.catalog,
        view: () => world.view,
      })
      expect(
        await prepare(world.parent, { name: 'Tools', command: 'help', arguments: tree({}) }),
      ).toMatchObject({ failure: { kind: 'invalid' } })
      expect(
        await prepare(world.parent, { name: 'ToyEcho', command: null, arguments: tree({}) }),
      ).toMatchObject({ failure: { kind: 'invalid' } })
      expect(
        await createForwardTargetRequests({
          release: () => world.release,
          catalog: () => undefined,
          view: () => world.view,
        })(world.parent, { name: 'ToyEcho', command: 'info', arguments: tree({}) }),
      ).toMatchObject({ failure: { kind: 'unavailable' } })
    } finally {
      await world.close()
    }
  })
})

describe('the reasons a target of a Tools execute call is refused', () => {
  const echo = (command: string | null, args: unknown = {}) => ({
    name: 'ToyEcho',
    command,
    arguments: tree(args),
  })
  const waiting = (diagnostic: string) => ({
    failure: { kind: 'unavailable', dependency: 'tools-target', diagnostic },
  })
  const refused = (field: string, reason: string) => ({
    failure: { kind: 'invalid', field, reason },
  })

  it('names the dependency that is missing, and the field and reason of an intent it cannot carry', async () => {
    const world = await forwardWorld()
    try {
      const ports: ForwardRequestPorts = {
        release: () => world.release,
        catalog: () => world.catalog,
        view: () => world.view,
      }
      const access = { principal: world.principal, tenant: world.tenant }
      const resolve = (given: typeof ports, intent: ReturnType<typeof echo>) =>
        resolveForwardTarget(given, access, intent)
      expect(
        await resolve(
          { ...ports, release: () => ({ kind: 'unavailable', diagnostic: 'x' }) },
          echo('info'),
        ),
      ).toEqual(waiting('The release snapshot is unavailable.'))
      expect(await resolve(ports, { ...echo('help'), name: 'Tools' })).toEqual(
        refused('name', 'recursive-tools-execute'),
      )
      expect(await resolve(ports, { ...echo('info'), name: 'Nope' })).toEqual(
        refused('name', 'unknown-target'),
      )
      expect(await resolve({ ...ports, catalog: () => undefined }, echo('info'))).toEqual(
        waiting('The target catalog is unavailable.'),
      )
      expect(await resolve(ports, echo(null))).toEqual(refused('command', 'unknown-target-command'))
      expect(await resolve(ports, echo('nope'))).toEqual(
        refused('command', 'unknown-target-command'),
      )
      expect(
        await resolve(ports, { ...echo('info'), arguments: { kind: 'string', value: 'x' } }),
      ).toEqual(refused('arguments', 'command-parameters-must-be-object'))
      const found = await resolve(ports, echo('info'))
      if ('failure' in found) throw new Error(JSON.stringify(found.failure))
      expect(found.ok.entry.asset.name).toBe('ToyEcho')
      expect(found.ok.availability.definition.name).toBe('ToyEcho')
      expect(JSON.parse(found.ok.effective)).toMatchObject({ command: 'info' })
    } finally {
      await world.close()
    }
  })

  it('passes a failure of the catalog on as it came, and refuses a target that is not the released one', async () => {
    const world = await forwardWorld()
    try {
      const ports: ForwardRequestPorts = {
        release: () => world.release,
        catalog: () => world.catalog,
        view: () => world.view,
      }
      const access = { principal: world.principal, tenant: world.tenant }
      const failing = { kind: 'denied', action: 'inspect' } as const
      expect(
        await resolveForwardTarget(
          {
            ...ports,
            catalog: () => ({ ...world.catalog, inspect: async () => ({ failure: failing }) }),
          },
          access,
          echo('info'),
        ),
      ).toEqual({ failure: failing })
      const available = world.request('ToyEcho').availability
      if (available.kind !== 'available') throw new Error('fixture ToyEcho unavailable')
      const other = {
        ...available,
        definition: {
          ...available.definition,
          adoption: { ...available.definition.adoption, digest: 'other' },
        },
      }
      for (const inspected of [
        other,
        { ...available, layer: { kind: 'workspace' } },
        { ...available, executor: { ...available.executor, digest: 'other' } },
        { kind: 'unavailable' },
      ])
        expect(
          await resolveForwardTarget(
            {
              ...ports,
              catalog: () =>
                ({ ...world.catalog, inspect: async () => ({ ok: inspected }) }) as never,
            },
            access,
            echo('info'),
          ),
        ).toEqual(waiting('The exact target release adoption is unavailable.'))
    } finally {
      await world.close()
    }
  })

  it('refuses a target when the current view of the catalog is not there or does not include it', async () => {
    const world = await forwardWorld()
    try {
      const access = { principal: world.principal, tenant: world.tenant }
      const ports = { release: () => world.release, catalog: () => world.catalog }
      expect(
        await resolveForwardTarget({ ...ports, view: () => undefined }, access, echo('info')),
      ).toEqual({
        failure: {
          kind: 'unavailable',
          dependency: 'toolCatalogView',
          diagnostic: 'The current target view is absent.',
        },
      })
      const empty = { read: async () => ({ ok: { entries: [] } }) } as never
      expect(
        await resolveForwardTarget({ ...ports, view: () => empty }, access, echo('info')),
      ).toEqual({
        failure: { kind: 'denied', action: 'target-not-included' },
      })
    } finally {
      await world.close()
    }
  })
})
