// `createAgentHostLocalPlugin` on real Cordis 4.0.4 (Agent SPEC「测量事件」, agent-host-local SPEC
// 「测量事件的插件入口」): the observer given to the plugin factory reaches `createAgentRuntime` of
// every instance the host builds, so an invoke through the real host emits the Agent segments. The
// services behind the host are the non-durable doubles of `@omne-harness/agent/testing`.
import { agentEvaluator, type AgentMeasureEvent } from '@omne-harness/agent'
import {
  decodeAgentExecutionId,
  decodeAgentOperationId,
  decodeInputId,
  type AcceptedInput,
  type RuntimeConditions,
} from '@omne-harness/agent-contract'
import { judgeMessage, parseMessageId } from '@omne-harness/message'
import { afterEach, describe, expect, it } from 'vitest'
import { agentHostPlugin, createAgentHostLocalPlugin } from '../src/cordis.ts'
import { caller, definitions, ok, openWorld, slotOf, turns, type World } from './host-support.ts'

const opened: World[] = []
afterEach(async () => {
  for (const world of opened.splice(0)) await world.dispose()
})

const adoption = (name: string) => ({
  owner: 'host-test',
  name,
  revision: '1',
  digest: `test:${name}`,
})
const evidence = (record: string) => ({
  owner: 'host-test',
  record,
  revision: '1',
  digest: `test:${record}`,
})

function acceptedInput(): AcceptedInput {
  const id = parseMessageId(`msg_${'a'.repeat(24)}`)
  if (!id.ok) throw new Error('fixture message id')
  const judged = judgeMessage({
    role: 'user',
    id: id.value,
    blocks: [
      { kind: 'text', id: 'blk_1', visibility: { toHuman: true, toModel: true }, text: 'hello' },
    ],
  })
  if (!('ok' in judged)) throw new Error('fixture message refused')
  return {
    id: ok(decodeInputId('input-1')),
    content: judged.ok,
    source: null,
    priority: 'ordinary',
  }
}

const conditions: RuntimeConditions = {
  source: evidence('conditions'),
  configuration: adoption('configuration'),
  progression: { kind: 'evaluate-completion', basis: evidence('progression') },
  model: adoption('model'),
  context: evidence('context'),
  bindings: [],
}

/** Loads the plugin, makes one instance for tenant a and invokes one execution on it. */
async function invokeThrough(plugin: ReturnType<typeof createAgentHostLocalPlugin>) {
  const made = await openWorld({ plugin })
  opened.push(made)
  const execution = ok(decodeAgentExecutionId('measured-execution'))
  made.controls.adoptions.define(definitions.first, {
    definition: { category: 'AgentDefinition', name: 'test' } as never,
    evaluator: agentEvaluator,
    extensions: [],
  })
  made.controls.conditions.define(execution, conditions)
  const { instance } = ok(await made.provision.acquire(slotOf('a')))
  const runtime = ok(await made.directory.resolve({ ...caller('a'), instance }))
  const answer = await runtime.invoke({
    ...caller('a'),
    execution,
    operation: ok(decodeAgentOperationId('measured-invoke')),
    initial: acceptedInput(),
    grant: null,
  })
  await turns()
  return { made, answer, execution }
}

describe('createAgentHostLocalPlugin', () => {
  it('hands the observer to the runtime of each instance, so an invoke emits the acceptance segment', async () => {
    const events: AgentMeasureEvent[] = []
    const { answer, execution } = await invokeThrough(
      createAgentHostLocalPlugin({ measure: event => events.push(event) }),
    )
    expect('ok' in answer).toBe(true)
    const accept = events.filter(event => event.pass === 'accept')
    expect(accept.map(event => event.phase)).toEqual(['start', 'end'])
    expect(accept.every(event => event.execution === execution)).toBe(true)
    expect(accept[0]?.span).toBe(accept[1]?.span)
  })

  it('has the name, inject and configuration of agentHostPlugin, and serves without an observer', async () => {
    const plugin = createAgentHostLocalPlugin()
    expect(plugin).not.toBe(agentHostPlugin)
    expect(plugin.name).toBe(agentHostPlugin.name)
    expect(plugin.inject).toEqual(agentHostPlugin.inject)
    expect(plugin.Config).toBe(agentHostPlugin.Config)
    const { answer } = await invokeThrough(plugin)
    expect('ok' in answer).toBe(true)
  })
})
