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

const JOURNAL_REFUSED: Failure = { kind: 'invalid', field: 'storage', reason: 'command_limit' }

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

async function until(probe: () => boolean, ms = 10_000): Promise<void> {
  const end = Date.now() + ms
  while (!probe()) {
    if (Date.now() > end) throw new Error('the condition never held')
    await new Promise(resolve => setTimeout(resolve, 5))
  }
}

const runFailed = (host: World) =>
  host.warnings.filter(text => text.startsWith('agent run stopped on a failure'))

async function failing() {
  const host = await openWorld({
    stages: true,
    dependencies: { receivingPrincipal: caller('a').principal },
    journal: port => ({
      ...port,
      commit: request =>
        request.operation.startsWith('I0/')
          ? Promise.resolve(fail(JOURNAL_REFUSED))
          : port.commit(request),
      tryFinish: () => Promise.resolve(fail(JOURNAL_REFUSED)),
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
    expect(record).toContain('node=F3')
    expect(record).toContain('failure=invalid')
    expect(record).toContain('diagnostic=field storage: command_limit')
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
      '(run stopped: node=F3 failure=invalid)'
    expect(answer).toEqual({
      kind: 'incomplete',
      detail: `${instance}: ${reason}`,
      instances: [{ instance, reason }],
    })
    expect(host.errors).toContain(`ordered stop left 1 unsettled: ${instance}: ${reason}`)
    expect(runFailed(host)).toHaveLength(1)
  })
})
