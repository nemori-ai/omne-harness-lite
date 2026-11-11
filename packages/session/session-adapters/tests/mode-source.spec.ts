import { afterEach, expect, it } from 'vitest'
import { fail, succeed } from '@omne-harness/operation-result'
import { adoption, evidence } from '@omne-harness/session-contract/testing'
import {
  createSessionModesSource,
  type SessionModesSourcePorts,
} from '../src/cordis/mode-source.ts'
import { sqlScene, type SqlScene } from './fixtures/sql-scene.ts'

const scenes: SqlScene[] = []
afterEach(async () => {
  for (const scene of scenes.splice(0)) await scene.close()
})

async function fixture() {
  const scene = await sqlScene('mode-source')
  scenes.push(scene)
  const calls: string[] = []
  const ports: SessionModesSourcePorts<string> = {
    readWork: access => {
      calls.push('work')
      return scene.port.readWork(access)
    },
    storage: {
      read: (...args) => {
        calls.push('mode')
        return scene.storage.read(...args)
      },
    },
    domains: { lookup: async () => ({ kind: 'ready', domain: scene.domain }) },
    defaultModes: async input => {
      calls.push('defaults')
      expect(input.source).toEqual(adoption('tenant-defaults'))
      return succeed({
        modes: {
          permission: 'auto_permission',
          environment: adoption('environment'),
          collaboration: 'co-work',
        },
        basis: evidence('original-default'),
      })
    },
  }
  return { scene, calls, ports }
}

it('reads the authorized Session and original mode owner before resolving its adopted defaults', async () => {
  const { scene, calls, ports } = await fixture()
  const result = await createSessionModesSource(ports).read(scene.sessionAccess)
  expect(result).toMatchObject({
    kind: 'ready',
    value: {
      modes: { permission: 'auto_permission' },
      inquiry: { source: evidence('original-default') },
      basis: { session: scene.sessionAccess.session },
    },
  })
  expect(calls).toEqual(['work', 'mode', 'defaults'])
})

it('does not read trusted SQL mode material after Session access is denied', async () => {
  const { scene, calls, ports } = await fixture()
  const source = createSessionModesSource({
    ...ports,
    readWork: async () => fail({ kind: 'denied', action: 'readWork' }),
  })
  expect(await source.read(scene.sessionAccess)).toEqual({ kind: 'refused' })
  expect(calls).toEqual([])
})

it('does not invent mode state when the owner projection is not ready', async () => {
  const { scene, ports } = await fixture()
  const source = createSessionModesSource({
    ...ports,
    storage: {
      read: async input => ({
        kind: 'read',
        requestKey: input.requestKey,
        output: { kind: 'not-ready' },
      }),
    },
  })
  expect(await source.read(scene.sessionAccess)).toEqual({ kind: 'unavailable' })
})

it('keeps a failed default source unavailable', async () => {
  const { scene, ports } = await fixture()
  const source = createSessionModesSource({
    ...ports,
    defaultModes: async () =>
      fail({ kind: 'unavailable', diagnostic: 'original definition absent' }),
  })
  expect(await source.read(scene.sessionAccess)).toEqual({ kind: 'unavailable' })
})
