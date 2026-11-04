// A run that stops on a node failure, in the `agent-host` plugin on real Cordis 4.0.4 with the
// production factory `createAgentRuntime` (SPEC「运行失败」, R2-D282). The Journal double refuses
// every commit of the I0 node with `unavailable`, as the session log Journal does when the storage
// refuses a command over its size limit. Checked: the host writes exactly one warn record that names
// tenant, instance, execution, node, failure kind and diagnostic. The ordered stop answers
// `incomplete` for that instance (R2-D285): nothing handed the failed execution over, and its reason
// names the execution, node and failure kind. The execution is not ended: ending the Run as
// failed and releasing its attachment when a node fails is not implemented yet, planned for wave 3
// (R2-D285). Nothing here proves the session log Journal, a real Model or another process.
import { agentEvaluator } from '@omne-harness/agent'
import { testAdoption } from '@omne-harness/agent/testing'
import {
  decodeAgentExecutionId,
  decodeAgentOperationId,
  decodeInputId,
  type AcceptedInput,
  type AgentExecutionId,
  type Failure,
  type RuntimeConditions,
  type SelectedModel,
} from '@omne-harness/agent-contract'
import { tenantCodec } from '@omne-harness/legal-identity'
import { judgeMessage } from '@omne-harness/message'
import { fail } from '@omne-harness/operation-result'
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
const EXECUTION: AgentExecutionId = ok(decodeAgentExecutionId('failing-execution'))

const JOURNAL_DOWN: Failure = {
  kind: 'unavailable',
  owner: 'agentJournal',
  diagnostic: 'storage rejected the commit: command_limit',
}

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
    id: `msg_${'f'.repeat(24)}`,
    role: 'user',
    blocks: [
      { kind: 'text', id: 'blk_1', visibility: { toHuman: true, toModel: true }, text: 'go' },
    ],
  })
  if (!('ok' in judged)) throw new Error('fixture message refused')
  return {
    id: ok(decodeInputId('failing-input')),
    content: judged.ok,
    source: null,
    priority: 'ordinary',
  }
}

/** Waits for `probe` on later turns, at most `ms` milliseconds. */
async function until(probe: () => boolean, ms = 10_000): Promise<void> {
  const end = Date.now() + ms
  while (!probe()) {
    if (Date.now() > end) throw new Error('the condition never held')
    await new Promise(resolve => setTimeout(resolve, 5))
  }
}

const runFailed = (host: World) =>
  host.warnings.filter(text => text.startsWith('agent run stopped on a failure'))

/** A host whose Journal refuses every I0 commit, with one invoked execution. */
async function failing() {
  const host = await openWorld({
    stages: true,
    dependencies: { receivingPrincipal: caller('a').principal },
    journal: port => ({
      ...port,
      commit: request =>
        request.operation.startsWith('I0/')
          ? Promise.resolve(fail(JOURNAL_DOWN))
          : port.commit(request),
    }),
  })
  opened.push(host)
  host.controls.adoptions.define(definitions.first, {
    definition: { category: 'AgentDefinition', name: 'failing', references: [], attributes: [] },
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
      operation: ok(decodeAgentOperationId('failing-invoke')),
      initial: input(),
      grant: null,
    }),
  )
  return { host, instance }
}

describe('a run that stops on a node failure', () => {
  it('writes one named warn record through the host log', async () => {
    const { host, instance } = await failing()
    await until(() => runFailed(host).length > 0)
    await turns(20)
    const [record, ...more] = runFailed(host)
    expect(more).toEqual([])
    const tenant = tenantCodec.encode(caller('a').tenant)
    if (!tenant.ok) throw new Error('fixture tenant does not encode')
    expect(record).toContain(`tenant=${tenant.value} `)
    expect(record).toContain(`instance=${instance}`)
    expect(record).toContain(`execution=${EXECUTION}`)
    expect(record).toContain('node=I0')
    expect(record).toContain('failure=unavailable')
    expect(record).toContain('diagnostic=agentJournal: storage rejected the commit: command_limit')
    // The execution is not ended: no terminal state in the Journal. Ending the Run as failed when a
    // node fails is not implemented yet, planned for wave 3 (R2-D285).
    const loaded = ok(
      await host.controls.journal.port.load({ ...caller('a'), execution: EXECUTION }),
    )
    expect(loaded.state.kind).not.toBe('ended')
  })

  it('answers the ordered stop incomplete and names the failed execution, node and failure', async () => {
    const { host, instance } = await failing()
    await until(() => runFailed(host).length > 0)
    const answer = await host.plugin.quiesceAll({ signal: new AbortController().signal })
    const reason =
      `quiesce left 1 execution(s) unresolved: ${EXECUTION} ` +
      '(run stopped: node=I0 failure=unavailable)'
    expect(answer).toEqual({
      kind: 'incomplete',
      detail: `${instance}: ${reason}`,
      instances: [{ instance, reason }],
    })
    expect(host.errors).toContain(`ordered stop left 1 unsettled: ${instance}: ${reason}`)
    // The stop does not report the run a second time.
    expect(runFailed(host)).toHaveLength(1)
  })
})
