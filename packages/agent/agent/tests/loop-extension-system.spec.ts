import { describe, expect, it } from 'vitest'
import type { AgentDependencies } from '@omne-harness/agent'
import type { EnabledExtension, ExecutionSnapshot } from '@omne-harness/agent-contract'
import type { ContentBlock } from '@omne-harness/content-block'
import { fail, succeed } from '@omne-harness/operation-result'
import { adoption, execution, ok, type Principal } from './journal-support.ts'
import { alice, eventsOf, eventually, invoke, loopAssembly } from './loop-support.ts'
import {
  declare,
  implementations,
  observed,
  recordingPasses,
  tenantView,
} from './extension-support.ts'

const INTERVAL_MS = 1000
type SystemPort = NonNullable<AgentDependencies<Principal, ContentBlock>['systemExtensions']>

/** The system source of an assembly, held in memory: its members, and the calls it resolved itself. */
function systemSource(members: readonly EnabledExtension[]) {
  const state = { readable: true, positions: [] as string[], invoked: [] as string[] }
  const port: SystemPort = {
    async read(input) {
      state.positions.push(input.position)
      if (!state.readable)
        return fail({
          kind: 'unavailable' as const,
          owner: 'systemExtensions',
          diagnostic: 'the system extensions are not readable',
        })
      return succeed(members.filter(member => member.declaration.position === input.position))
    },
    async resolve({ passage }) {
      const { declaration, implementation } = passage
      return succeed({
        implementation,
        async invoke() {
          state.invoked.push(declaration.name)
          return observed
        },
      })
    },
  }
  return { state, port }
}

async function scene(system: ReturnType<typeof systemSource>) {
  const view = tenantView()
  view.enable(declare('probe', 'execution_started'))
  const extensions = implementations()
  extensions.define('probe', () => observed)
  let recorded: ReturnType<typeof recordingPasses> | null = null
  const assembly = await loopAssembly(
    [execution()],
    dependencies => {
      recorded = recordingPasses({
        ...dependencies,
        extensions: extensions.port,
        enabledExtensions: view.port,
        systemExtensions: system.port,
      })
      return recorded.dependencies
    },
    undefined,
    { reconciliationDelaysMs: [INTERVAL_MS] },
  )
  assembly.release.open()
  if (recorded === null) throw new Error('the assembly did not wrap its dependencies')
  const saved: ReturnType<typeof recordingPasses> = recorded
  const load = async (): Promise<ExecutionSnapshot> =>
    ok(await assembly.controls.journal.port.load({ ...alice, execution: execution() }))
  return { assembly, extensions, saved, load }
}

const guard: EnabledExtension = {
  declaration: declare('guard', 'execution_started'),
  implementation: adoption('guard@1'),
}

describe('the trusted system extensions of an assembly', () => {
  it('join the chain after the members the tenant enabled, and are resolved by the system source alone', async () => {
    const system = systemSource([guard])
    const s = await scene(system)
    const events = await eventsOf(ok(await invoke(s.assembly)))
    expect(events.at(-1)?.body.kind).toBe('ended')
    const chain = s.saved.commits[0]?.chain
    expect(chain?.members.map(member => [member.source, member.declaration.name])).toEqual([
      ['tenant', 'probe'],
      ['system', 'guard'],
    ])
    expect(s.extensions.invocations.map(item => item.extension)).toEqual(['probe'])
    expect(system.state.invoked).toEqual(['guard'])
    expect(system.state.positions.filter(at => at === 'execution_started')).toHaveLength(1)
  })

  it('unreadable, are waited on at the position and never read as no member', async () => {
    const system = systemSource([guard])
    system.state.readable = false
    const s = await scene(system)
    const handle = ok(await invoke(s.assembly))
    await eventually(async () => (await s.load()).state.kind === 'waiting')
    const waiting = await s.load()
    expect(waiting.state).toEqual({
      kind: 'waiting',
      waits: [{ kind: 'dependency', owner: 'systemExtensions', position: 'E3' }],
    })
    expect(waiting.checkpoint.chain).toBeNull()
    expect(s.extensions.invocations).toEqual([])

    system.state.readable = true
    ok(s.assembly.controls.clock.advanceTo(new Date(INTERVAL_MS).toISOString()))
    const events = await eventsOf(handle)
    expect(events.at(-1)?.body.kind).toBe('ended')
    expect(system.state.invoked).toEqual(['guard'])
  })
})
