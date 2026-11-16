import { Context } from '@deepseek-ai/cordis'
import type { AccessContribution } from '@omne-harness/access-cordis-contract'
import { AccessRegistryService } from '@omne-harness/access-cordis-contract/cordis'
import { createSessionDiagnosticsAccessPlugin } from '@omne-harness/session-diagnostics-access/cordis'
import {
  sessionDiagnosticsProtocol,
  type SessionDiagnosticsProtocol,
} from '@omne-harness/session-diagnostics-protocol'
import { expect, it } from 'vitest'
import { createWorld, fixtureLogin, loginIdentity, runEntries } from './fixtures/world.ts'

class RecordingRegistry extends AccessRegistryService {
  readonly mounted: AccessContribution<SessionDiagnosticsProtocol>[] = []
  readonly unmounted: AccessContribution<SessionDiagnosticsProtocol>[] = []
  protected attach(contribution: never) {
    this.mounted.push(contribution)
    return async () => {
      this.unmounted.push(contribution)
    }
  }
}

const ALICE = fixtureLogin('a')
const SESSION = 'a'.repeat(64)
const signal = new AbortController().signal

const body = (pageBytes: string) => ({
  tenant: ALICE.tenant,
  session: SESSION,
  cursor: null,
  run: null,
  pageBytes,
})

async function assemble(settings: Record<string, unknown>) {
  const world = createWorld()
  world.addSession(ALICE, SESSION)
  world.entries.push(...runEntries('r1', 1))
  const root = new Context()
  await root.plugin(RecordingRegistry)
  const plugin = await root.plugin(
    createSessionDiagnosticsAccessPlugin({
      principals: () => world.principals,
      faces: () => world.currentFaces(),
    }),
    settings,
  )
  const registry = root.get('accessRegistry') as unknown as RecordingRegistry
  const contribution = registry.mounted[0]
  if (contribution === undefined) throw new Error('nothing was mounted')
  const read = (pageBytes: string) =>
    contribution.operations['read-session-diagnostics'](
      { principal: loginIdentity(ALICE), messageId: 'm-1', signal },
      body(pageBytes) as never,
    )
  return { world, root, plugin, registry, contribution, read }
}

const complete = {
  maxPageBytes: 2048,
  diagnosticsKinds: ['run.started', 'run.terminal'],
  maxRuns: 1,
  maxCallsPerRun: 2,
}

it('the cordis entry gives the plugin factory and nothing else at run time', async () => {
  const cordis = (await import('@omne-harness/session-diagnostics-access/cordis')) as Record<
    string,
    unknown
  >
  expect(Object.keys(cordis)).toEqual(['createSessionDiagnosticsAccessPlugin'])
})

it('mounts session-diagnostics/v1 with its one operation and no observation', async () => {
  const { registry, contribution } = await assemble(complete)
  expect(registry.mounted).toHaveLength(1)
  expect(contribution.protocol).toBe(sessionDiagnosticsProtocol)
  expect(Object.keys(contribution.operations)).toEqual(['read-session-diagnostics'])
  expect(Object.keys(contribution.observations)).toEqual([])
})

it('hands the plugin settings to the handler: the page bound and the three projection fields', async () => {
  const { read, world } = await assemble(complete)
  expect(await read('2049')).toEqual({ outcome: 'invalid', body: {} })
  expect((await read('2048')).outcome).toBe('succeeded')
  expect(world.begins[0]).toMatchObject({ kinds: ['run.started', 'run.terminal'] })
})

it('answers basis-unavailable when the settings give the projection only in part', async () => {
  const { read, world } = await assemble({ maxPageBytes: 2048, maxRuns: 1 })
  expect(await read('10')).toEqual({ outcome: 'basis-unavailable' })
  expect(world.calls).toEqual([])
})

it('answers basis-unavailable while Session is off, and the protocol stays mounted', async () => {
  const { read, world, registry } = await assemble(complete)
  world.removeFaces()
  expect(await read('10')).toEqual({ outcome: 'basis-unavailable' })
  expect(registry.mounted).toHaveLength(1)
  expect(registry.unmounted).toHaveLength(0)
})

it('takes the contribution down with the plugin', async () => {
  const { plugin, registry, contribution } = await assemble(complete)
  await plugin.dispose()
  expect(registry.unmounted).toEqual([contribution])
})
