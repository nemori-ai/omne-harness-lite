import { describe, expect, it } from 'vitest'
import { commandArguments } from '@omne-harness/tool-contract/provider'
import {
  createForwardTargetRequests,
  isReleaseToolsRequest,
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
      expect(
        commandArguments(target.availability.definition, target.command, target.arguments),
      ).toMatchObject({ ok: { effective: '{}' } })
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
      expect(target.environment).toEqual(world.request('ToyEcho').environment)
      expect(target.batchDecision).toBeNull()
      expect(target).not.toHaveProperty('invocation')
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
