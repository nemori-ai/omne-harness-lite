// @module-tag slow
// The ordered stop of the `agent-host` row (agent-host-local SPEC "有序停止"): three rows loaded
// together (the stand-ins of `doubles.ts`, `agent-host` and the real `agent-instances`), then the
// ordered shutdown or the row's own handle. The handle calls the member's `quiesceAll` and maps its
// answer as it is: `settled` only when every instance drained, `incomplete` with the member's detail
// otherwise.
//
// `agentHostRow` runs the Agent factory of this release, whose quiesce answers `unavailable` (#502
// stage 5): with no instance the stop is settled, with a live instance it is incomplete. The cases
// that drain use `createAgentHostRowOver` with the member's testing plugin and a factory wrapper that
// stands in for the runtime's quiesce; they prove the row and the host side only, not the runtime.
import type { Plugin } from '@deepseek-ai/cordis'
import { afterEach, describe, expect, it } from 'vitest'
import { createAgentRuntime } from '@omne-harness/agent'
import {
  decodeAgentExecutionId,
  decodeExecutionAttachmentId,
  type AgentInstanceId,
  type AgentRegistrationHandle,
} from '@omne-harness/agent-contract'
import {
  agentInstanceProvisionKey,
  agentInstancesKey,
  type AgentInstanceProvisionService,
  type AgentInstancesService,
} from '@omne-harness/agent-cordis-contract/cordis'
import {
  createAgentHostPluginOver,
  type AgentHostRuntimeFactory,
} from '@omne-harness/agent-host-local/testing'
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import { rowDeclarationOf } from '../../../src/row.ts'
import { agentHostRow, createAgentHostRowOver } from '../../../src/rows/agent-host/index.ts'
import { agentInstancesRow } from '../../../src/rows/agent-instances/index.ts'
import { monotonicClock } from '../../../src/shutdown.ts'
import type { StopResult } from '../../../src/types.ts'
import { declared, loadTree, makeBase, type LoadedTree } from '../session-fixtures/tree.ts'
import {
  caller,
  definition,
  hostConfig,
  hostDoubles,
  principalObject,
  scope,
} from './doubles.ts'

const release: Array<() => Promise<void> | void> = []
afterEach(async () => {
  for (const close of release.splice(0).reverse()) await close()
})

function ok<T>(outcome: Outcome<T, unknown>): T {
  if ('failure' in outcome) throw new Error(`expected success, got ${JSON.stringify(outcome)}`)
  return outcome.ok
}

type Script = 'drained' | 'unresolved' | 'hang'

/** The runtime's quiesce, stood in for: each quiesce takes the next script, `drained` when none. */
type Duties = Readonly<{
  scripts: Script[]
  handles: Map<AgentInstanceId, AgentRegistrationHandle<unknown>>
  quiesced: AgentInstanceId[]
}>

function dutiesFactory(duties: Duties): AgentHostRuntimeFactory {
  return async (dependencies, options) => {
    const made = await createAgentRuntime(dependencies, options)
    const handle = dependencies.registration
    if ('failure' in made || handle === null) return made
    const { instance } = options.binding
    duties.handles.set(instance, handle)
    return succeed({
      ...made.ok,
      control: {
        async quiesce(input) {
          duties.quiesced.push(instance)
          const script = duties.scripts.shift() ?? 'drained'
          if (script === 'hang') return new Promise(() => {})
          if (script === 'unresolved')
            return succeed({ kind: 'unresolved', remaining: [], evidence: input.reason })
          const withdrawn = await handle.withdraw(input)
          if ('failure' in withdrawn)
            return fail({ kind: 'unavailable', owner: 'test-duties', diagnostic: 'withdraw' })
          return succeed({ kind: 'drained', remaining: [], evidence: input.reason })
        },
      },
    })
  }
}

function newDuties(): Duties {
  return { scripts: [], handles: new Map(), quiesced: [] }
}

type Started = Readonly<{
  tree: LoadedTree
  provision: AgentInstanceProvisionService<string>
  directory: AgentInstancesService<string>
}>

/** The three rows together: the stand-ins of the injects, `agent-host` and `agent-instances`. */
async function start(row: Plugin): Promise<Started> {
  const base = makeBase()
  release.push(() => base.release())
  const doubles = hostDoubles(null)
  const tree = await loadTree({
    base,
    rows: [doubles.spec, declared(row, hostConfig), declared(agentInstancesRow)],
    entryObjects: [principalObject()],
  })
  release.push(() => tree.dispose())
  expect(tree.allActive).toBe(true)
  return {
    tree,
    provision: tree.service<AgentInstanceProvisionService<string>>(agentInstanceProvisionKey)!,
    directory: tree.service<AgentInstancesService<string>>(agentInstancesKey)!,
  }
}

const acquire = async (started: Started) =>
  ok(await started.provision.acquire({ ...caller, scope, definition })).instance

async function shutdownOutcome(tree: LoadedTree): Promise<StopResult> {
  const report = await tree.shutdown()
  const outcome = report.outcomes.find(entry => entry.row === 'agent-host')
  expect(outcome?.phase).toBe('business')
  return outcome?.result as StopResult
}

function occupy(duties: Duties, instance: AgentInstanceId): void {
  duties.handles.get(instance)?.report({
    state: {
      kind: 'occupied',
      instance,
      execution: ok(decodeAgentExecutionId('row-stop-execution')),
      executionAttachment: ok(decodeExecutionAttachmentId('row-stop-attachment')),
    },
  })
}

describe('the agent-host row: ordered stop with the Agent factory of this release', () => {
  it('answers settled when no instance was built', { timeout: 60_000 }, async () => {
    const { tree } = await start(agentHostRow)
    expect(await shutdownOutcome(tree)).toEqual({ kind: 'settled' })
  })

  it(
    'answers incomplete and names a live instance, whose quiesce is unavailable',
    { timeout: 60_000 },
    async () => {
      const started = await start(agentHostRow)
      const instance = await acquire(started)
      const result = await shutdownOutcome(started.tree)
      expect(result).toEqual({
        kind: 'incomplete',
        detail: expect.stringContaining(`${instance}: quiesce failed with unavailable`),
      })
    },
  )
})

describe('the agent-host row: ordered stop over a runtime that drains', () => {
  it('is the same row as `agentHostRow`', () => {
    const row = createAgentHostRowOver(() => createAgentHostPluginOver(dutiesFactory(newDuties())))
    expect(rowDeclarationOf(row)).toEqual(rowDeclarationOf(agentHostRow))
  })

  it(
    'answers settled when an idle and an occupied instance both drain, and refuses acquire after',
    { timeout: 60_000 },
    async () => {
      const duties = newDuties()
      const started = await start(
        createAgentHostRowOver(() => createAgentHostPluginOver(dutiesFactory(duties))),
      )
      const idle = await acquire(started)
      const busy = ok(
        await started.provision.acquire({
          ...caller,
          scope: { ...scope, record: 'slot-other' },
          definition,
        }),
      ).instance
      occupy(duties, busy)
      const frozen = started.tree.registry.freeze()
      const handle = frozen.live.get('agent-host' as never)?.handle
      expect(handle).toBeDefined()
      expect(await handle!.stop(monotonicClock.now() + 5_000)).toEqual({ kind: 'settled' })
      expect([...duties.quiesced].sort()).toEqual([idle, busy].sort())
      for (const instance of [idle, busy])
        expect(await started.directory.resolve({ ...caller, instance })).toHaveProperty('failure')
      expect(await started.provision.acquire({ ...caller, scope, definition })).toMatchObject({
        failure: { kind: 'unavailable', owner: 'agent-host' },
      })
    },
  )

  it(
    'answers incomplete and names the instance whose quiesce is unresolved',
    { timeout: 60_000 },
    async () => {
      const duties = newDuties()
      const started = await start(
        createAgentHostRowOver(() => createAgentHostPluginOver(dutiesFactory(duties))),
      )
      const instance = await acquire(started)
      duties.scripts.push('unresolved')
      const result = await shutdownOutcome(started.tree)
      expect(result).toEqual({
        kind: 'incomplete',
        detail: expect.stringContaining(`${instance}: quiesce left 0 execution(s) unresolved`),
      })
    },
  )

  it(
    'answers incomplete at its deadline when a quiesce gives no answer',
    { timeout: 60_000 },
    async () => {
      const duties = newDuties()
      const started = await start(
        createAgentHostRowOver(() => createAgentHostPluginOver(dutiesFactory(duties))),
      )
      const instance = await acquire(started)
      duties.scripts.push('hang')
      const handle = started.tree.registry.freeze().live.get('agent-host' as never)?.handle
      // The handle's own answer, not the coordinator's timer: the row turns its deadline into the
      // member's signal.
      const result = await handle!.stop(monotonicClock.now() + 200)
      expect(result).toEqual({
        kind: 'incomplete',
        detail: expect.stringContaining(`${instance}: quiesce gave no answer before the deadline`),
      })
    },
  )
})
