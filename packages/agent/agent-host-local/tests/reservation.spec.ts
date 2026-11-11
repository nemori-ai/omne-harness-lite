import { agentEvaluator } from '@omne-harness/agent'
import {
  decodeAgentExecutionId,
  decodeAgentOperationId,
  decodeInputId,
  type AcceptedInput,
} from '@omne-harness/agent-contract'
import { judgeMessage, parseMessageId } from '@omne-harness/message'
import { fail } from '@omne-harness/operation-result'
import { afterEach, expect, it } from 'vitest'
import {
  IDLE_MS,
  caller,
  definitions,
  ok,
  openWorld,
  scope,
  slotOf,
  turns,
  type World,
} from './host-support.ts'

const opened: World[] = []
afterEach(async () => {
  for (const host of opened.splice(0)) await host.dispose()
})

function initial(): AcceptedInput {
  const id = parseMessageId(`msg_${'a'.repeat(24)}`)
  if (!id.ok) throw new Error('invalid fixture message id')
  const judged = judgeMessage({
    role: 'user',
    id: id.value,
    blocks: [
      { kind: 'text', id: 'blk_1', visibility: { toHuman: true, toModel: true }, text: 'hello' },
    ],
  })
  if (!('ok' in judged)) throw new Error('fixture message refused')
  return {
    id: ok(decodeInputId('reserved-input')),
    content: judged.ok,
    source: null,
    priority: 'ordinary',
  }
}

it('the real runtime keeps an opening slot out of idle reclamation, then releases a refused slot', async () => {
  const opening = Promise.withResolvers<void>()
  const entered = Promise.withResolvers<void>()
  const host = await openWorld({
    journal: port => ({
      ...port,
      async open() {
        entered.resolve()
        await opening.promise
        return fail({ kind: 'unavailable', owner: 'test-journal', diagnostic: 'open refused' })
      },
    }),
  })
  opened.push(host)
  host.controls.adoptions.define(definitions.first, {
    definition: { category: 'AgentDefinition', name: 'test', references: [], attributes: [] },
    evaluator: agentEvaluator,
    extensions: [],
  })
  const { instance } = ok(await host.provision.acquire(slotOf('a')))
  const runtime = ok(await host.directory.resolve({ ...caller('a'), instance }))
  const pending = runtime.invoke({
    ...caller('a'),
    execution: ok(decodeAgentExecutionId('reserved-execution')),
    operation: ok(decodeAgentOperationId('reserved-invoke')),
    initial: initial(),
    grant: null,
  })
  try {
    await entered.promise
    host.advance(IDLE_MS + 1)
    await turns()
    expect(host.controls.access.check.calls.filter(call => call.operation === 'quiesce')).toEqual(
      [],
    )
    expect(host.retired).toEqual([])
    ok(await host.directory.resolve({ ...caller('a'), instance }))
  } finally {
    opening.resolve()
  }
  expect(await pending).toMatchObject({ failure: { kind: 'unavailable' } })
  host.advance(IDLE_MS + 1)
  await turns()
  expect(host.retired).toMatchObject([{ instance, reason: 'withdrawn' }])
})

it('an invoke awaiting access cannot admit after idle reclamation starts', async () => {
  let opens = 0
  const host = await openWorld({
    journal: port => ({
      ...port,
      async open() {
        opens += 1
        return fail({ kind: 'invalid', field: 'value', reason: 'late admission' })
      },
    }),
  })
  opened.push(host)
  host.controls.adoptions.define(definitions.first, {
    definition: { category: 'AgentDefinition', name: 'test', references: [], attributes: [] },
    evaluator: agentEvaluator,
    extensions: [],
  })
  const { instance } = ok(await host.provision.acquire(slotOf('a')))
  const runtime = ok(await host.directory.resolve({ ...caller('a'), instance }))
  const access = Promise.withResolvers<void>()
  const entered = Promise.withResolvers<void>()
  host.controls.access.check.once(async () => {
    entered.resolve()
    await access.promise
    return { kind: 'allowed', evidence: scope }
  })
  const pending = runtime.invoke({
    ...caller('a'),
    execution: ok(decodeAgentExecutionId('late-execution')),
    operation: ok(decodeAgentOperationId('late-invoke')),
    initial: initial(),
    grant: null,
  })
  try {
    await entered.promise
    host.advance(IDLE_MS + 1)
    await turns()
    expect(host.retired).toMatchObject([{ instance, reason: 'withdrawn' }])
  } finally {
    access.resolve()
  }
  expect(await pending).toMatchObject({ failure: { kind: 'unavailable' } })
  expect(opens).toBe(0)
})
