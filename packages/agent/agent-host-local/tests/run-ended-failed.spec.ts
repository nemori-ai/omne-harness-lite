// A run that ends with a `fail` conclusion because its Model call failed, in the `agent-host` plugin
// on real Cordis 4.0.4 with the production factory `createAgentRuntime` (SPEC「以失败终结」). Checked:
// the host writes exactly one warn record that names the execution, the step and the cause, and the
// cause keeps the fault of the Model call rather than only `no-reply`. Nothing here proves the
// session log Journal, a real Model or another process.
import { agentEvaluator } from '@omne-harness/agent'
import { testAdoption } from '@omne-harness/agent/testing'
import {
  decodeAgentExecutionId,
  decodeAgentOperationId,
  decodeInputId,
  type AcceptedInput,
  type AgentExecutionId,
  type ExecutionSnapshot,
  type RuntimeConditions,
  type SelectedModel,
} from '@omne-harness/agent-contract'
import {
  createTestCancellationPolicy,
  testCancellationPolicyInstallation,
} from '@omne-harness/agent-contract/testing'
import { judgeMessage } from '@omne-harness/message'
import {
  decodeResultVersion,
  resolveModelInvocationRef,
  type Termination,
} from '@omne-harness/model-contract'
import { afterEach, describe, expect, it } from 'vitest'
import { caller, definitions, ok, openWorld, slotOf, turns, type World } from './host-support.ts'

const opened: World[] = []
afterEach(async () => {
  for (const world of opened.splice(0)) await world.dispose()
})

const evidence = (record: string) => ({
  owner: 'host-test',
  record,
  revision: '1',
  digest: `test:${record}`,
})
const adoption = (name: string) => ({
  owner: 'host-test',
  name,
  revision: '1',
  digest: `test:${name}`,
})
const EXECUTION: AgentExecutionId = ok(decodeAgentExecutionId('ending-execution'))

const conditions: RuntimeConditions = {
  source: evidence('conditions'),
  configuration: adoption('configuration'),
  progression: { kind: 'continue', basis: evidence('progression') },
  model: adoption('model'),
  context: evidence('context'),
  bindings: [],
}

const selected = {
  recipient: { route: 'route-1', profile: testAdoption('profile') },
  resolution: { kind: 'resolved', selectable: true },
  parameters: [],
  tools: evidence('tools'),
  evidence: evidence('selected'),
} as unknown as SelectedModel

function input(): AcceptedInput {
  const judged = judgeMessage({
    id: `msg_${'e'.repeat(24)}`,
    role: 'user',
    blocks: [
      { kind: 'text', id: 'blk_1', visibility: { toHuman: true, toModel: true }, text: 'go' },
    ],
  })
  if (!('ok' in judged)) throw new Error('fixture message refused')
  return {
    id: ok(decodeInputId('ending-input')),
    content: judged.ok,
    source: null,
    priority: 'ordinary',
  }
}

async function until(probe: () => boolean | Promise<boolean>, ms = 10_000): Promise<void> {
  const end = Date.now() + ms
  while (!(await probe())) {
    if (Date.now() > end) throw new Error('the condition never held')
    await new Promise(resolve => setTimeout(resolve, 5))
  }
}

const endedFailed = (host: World) =>
  host.warnings.filter(text => text.startsWith('agent run ended with a failure'))

/** A host whose main Model call settles with `termination` and no content. */
async function ending(termination: Termination) {
  const host = await openWorld({
    stages: true,
    dependencies: {
      journal: {
        cancellation: {
          installation: testCancellationPolicyInstallation,
          policy: createTestCancellationPolicy(),
        },
      },
      receivingPrincipal: caller('a').principal,
    },
  })
  opened.push(host)
  host.controls.adoptions.define(definitions.first, {
    definition: { category: 'AgentDefinition', name: 'ending', references: [], attributes: [] },
    evaluator: agentEvaluator,
    extensions: [],
  })
  host.controls.conditions.define(EXECUTION, conditions)
  host.controls.selection.select.always(() => ({ ok: selected }))
  const { instance } = ok(await host.provision.acquire(slotOf('a')))
  const runtime = ok(await host.directory.resolve({ ...caller('a'), instance }))
  ok(
    await runtime.invoke({
      ...caller('a'),
      execution: EXECUTION,
      operation: ok(decodeAgentOperationId('ending-invoke')),
      initial: input(),
      grant: null,
    }),
  )
  const load = async (): Promise<ExecutionSnapshot> =>
    ok(await host.controls.journal.port.load({ ...caller('a'), execution: EXECUTION }))
  let pending: ExecutionSnapshot['checkpoint']['calls'][number] | undefined
  await until(async () => {
    pending = (await load()).checkpoint.calls.find(call => call.kind === 'model')
    return pending !== undefined
  })
  if (pending?.kind !== 'model') throw new Error('no Model call is open')
  const { call } = ok(resolveModelInvocationRef(pending.reference, caller('a').tenant))
  host.controls.models.settle({
    ...caller('a'),
    call,
    version: ok(decodeResultVersion('mrver_ending')),
    termination,
    parts: [],
    source: evidence('model-ending'),
    pageSize: 10,
    pageTargetBytes: 65536,
  })
  if (host.controls.pusher === null) throw new Error('the Model pusher is missing')
  await host.controls.pusher.settled({ ...caller('a'), call })
  await until(async () => (await load()).state.kind === 'ended')
  await turns(20)
  return { host, instance }
}

describe('a run that ends with a failure', () => {
  it('a Model call failed on connect-timeout: one warn names the execution, step and cause', async () => {
    const { host, instance } = await ending({
      kind: 'failed',
      fault: { cause: 'upstream-unavailable', diagnostic: 'connect-timeout', upstreamStatus: null },
    })
    const [record, ...more] = endedFailed(host)
    expect(more).toEqual([])
    expect(record).toContain(`instance=${instance}`)
    expect(record).toContain(`execution=${EXECUTION}`)
    expect(record).toContain('step=step-1')
    expect(record).toContain('failure=no-reply')
    expect(record).toContain('fault=upstream-unavailable diagnostic=connect-timeout ')
    expect(record).toContain(
      `cause=${EXECUTION}/step-1/model-failed/upstream-unavailable/connect-timeout`,
    )
    // A run that ended is not a run that stopped on a node failure.
    expect(host.warnings.filter(text => text.startsWith('agent run stopped'))).toEqual([])
  })

  it('negative control: a call that completed without content warns with no-reply', async () => {
    const { host } = await ending({ kind: 'completed', reason: 'stop' })
    const [record, ...more] = endedFailed(host)
    expect(more).toEqual([])
    expect(record).toContain('fault=none diagnostic=none ')
    expect(record).toContain(`cause=${EXECUTION}/step-1/no-reply`)
  })
})
