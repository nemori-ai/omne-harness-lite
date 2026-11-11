// 用当前公开命令建立一份含多种等待状态的库。关系守护、池过滤和查询成本测试在它上面运行。
// 每个场景是一个独立等待：只准备、已登记、部分答复、全部答复未消费、部分消费、
// 全部消费未确认、终局、换代。场景按顺序执行，请求序号和收件箱序号因此与提交顺序一致。
import { randomUUID } from 'node:crypto'
import {
  OperationRefSchema,
  RegisterRequestSchema,
  type ConsumerReceipt,
  type DecisionRef,
  type OperationRef,
  type RequestRef,
  type WaitRef,
} from '@omne-harness/human-intervention'
import {
  IndependentCommandSchema,
  RequestRecordSchema,
  SqlCommandSchema,
  independentControlCommands,
  independentRequestCommands,
  type RequestRecord,
} from '@omne-harness/human-intervention-local'
import type { FactCommandV2 } from '@omne-harness/sql-contract'
import { json, operationKey } from '../src/encoding.ts'
import { RecoveryResultSchemas, StoredOperationSchema } from '../src/operation-schema.ts'
import { SqlCommandResultSchema } from '../src/request-schema.ts'
import { openWorld } from './world.ts'

type World = Awaited<ReturnType<typeof openWorld>>
type Scenario = Readonly<{
  name: string
  answers: number
  bind: boolean
  consumes: number
  terminal?: boolean
  rebind?: boolean
}>

export const scenarios: readonly Scenario[] = [
  { name: 'prepared', answers: 0, bind: false, consumes: 0 },
  { name: 'active', answers: 0, bind: false, consumes: 0 },
  { name: 'partial-answer', answers: 1, bind: false, consumes: 0 },
  { name: 'unconsumed', answers: 2, bind: false, consumes: 0 },
  { name: 'partial-consume', answers: 2, bind: true, consumes: 1 },
  { name: 'unacked', answers: 2, bind: true, consumes: 2 },
  { name: 'terminal', answers: 1, bind: false, consumes: 0, terminal: true },
  { name: 'generation', answers: 2, bind: true, consumes: 2, rebind: true },
]

function operation(operationId: string): OperationRef {
  return OperationRefSchema.parse({ tenantRef: 'tenant-a', actorRef: 'owner', operationId })
}
function commit(world: World, operationRef: OperationRef, commands: readonly FactCommandV2[]) {
  return world.storage.commit({
    identity: {
      ...world.combination,
      operation: 'hitl.command',
      protocolVersion: '2',
      operationKey: operationKey(operationRef),
    },
    combinationVersion: world.combination.combinationVersion,
    manifestDigest: world.combination.manifestDigest,
    commands,
  })
}
async function command(world: World, input: unknown, waitRef: WaitRef) {
  const parsed = SqlCommandSchema.parse(input)
  const result = await commit(
    world,
    parsed.command.operation,
    independentRequestCommands(parsed, waitRef),
  )
  if (result.kind !== 'committed') throw new Error(JSON.stringify(result))
  const envelope = result.responses.find(item => item.participant === 'hitl.requests')?.reply
    .response
  if (
    !envelope ||
    typeof envelope !== 'object' ||
    Array.isArray(envelope) ||
    !('result' in envelope)
  )
    throw new Error('Expected durable result envelope')
  return SqlCommandResultSchema.parse(envelope.result)
}
async function control(world: World, input: unknown) {
  const parsed = IndependentCommandSchema.parse(input)
  if (parsed.kind === 'request') throw new Error('Expected control input')
  const ref = parsed.kind === 'prepare' ? parsed.operation : parsed.command.operation
  const result = await commit(world, ref, independentControlCommands(parsed))
  if (result.kind !== 'committed') throw new Error(JSON.stringify(result))
  if (parsed.kind === 'prepare') return undefined
  return StoredOperationSchema.parse(
    result.responses.find(item => item.participant === 'hitl.independent-state')?.reply.response,
  ).result
}
async function readRequest(world: World, ref: RequestRef) {
  const read = await world.storage.read({
    domain: world.combination,
    handler: 'hitl.request-read',
    protocol: 'hitl-sql/2',
    requestKey: randomUUID(),
    input: json({ kind: 'request', ref, actorRef: 'owner' }),
  })
  if (read.kind !== 'read') throw new Error(JSON.stringify(read))
  return RequestRecordSchema.parse(read.output)
}

async function play(world: World, scenario: Scenario) {
  const name = scenario.name
  const waitRef = { owner: 'independent', waitId: name, incarnation: 'one', destination: 'inbox' }
  const registration = RegisterRequestSchema.parse({
    protocol: 'hitl/1',
    operation: operation(`${name}-register`),
    preparationRef: `preparation-${name}`,
    displayContext: `Original ${name}`,
    origin: {
      kind: 'independent',
      originRef: `origin-${name}`,
      wait: waitRef,
      positionRef: `position-${name}`,
      adoptionRef: 'v1',
    },
    questions: ['first', 'second'].map(cardId => ({
      kind: 'question',
      cardId,
      title: cardId,
      description: 'Original question',
      declineConsequence: 'Skip this question',
      options: [{ id: 'yes', label: 'Yes', description: 'Continue' }],
    })),
  })
  await control(world, {
    kind: 'prepare',
    operation: operation(`${name}-prepare`),
    preparation: {
      registration,
      readers: ['owner', 'reader'],
      responders: ['owner'],
      compatibleImplementations: ['v1'],
    },
  })
  if (name === 'prepared') return undefined
  const registered = await command(
    world,
    { method: 'registerRequest', command: registration },
    waitRef,
  )
  if (registered.kind !== 'registered') throw new Error(JSON.stringify(registered))
  const requestRef = registered.requestRef
  if (scenario.bind)
    await control(world, {
      kind: 'bind',
      command: {
        protocol: 'hitl/1',
        operation: operation(`${name}-bind-first`),
        waitRef,
        expectedGeneration: '0',
        instanceId: 'first',
        implementationRef: 'v1',
      },
    })
  const decisions: DecisionRef[] = []
  for (const [index, cardId] of ['first', 'second'].slice(0, scenario.answers).entries()) {
    const decided = await command(
      world,
      {
        method: 'submitReply',
        command: {
          protocol: 'hitl/1',
          operation: operation(`${name}-reply-${index}`),
          cardRef: { request: requestRef, cardId },
          expectedRevision: '0',
          reply: { kind: 'text', text: ` preserved ${name} ${index} 😀 ` },
        },
      },
      waitRef,
    )
    if (decided.kind !== 'decided') throw new Error(JSON.stringify(decided))
    decisions.push(decided.decisionRef)
  }
  const receipts: ConsumerReceipt[] = []
  for (const [index, decisionRef] of decisions.slice(0, scenario.consumes).entries()) {
    const consumeOperationId = `${name}-consume-${index}`
    const consumed = await control(world, {
      kind: 'consume',
      command: {
        protocol: 'hitl/1',
        operation: operation(consumeOperationId),
        waitRef,
        receiverGeneration: '1',
        decisionRef,
        consumeOperationId,
      },
    })
    const accepted = RecoveryResultSchemas.consumeDecision.parse(consumed)
    if (accepted.kind !== 'accepted') throw new Error(JSON.stringify(accepted))
    receipts.push(accepted.receipt)
  }
  if (scenario.rebind)
    await control(world, {
      kind: 'bind',
      command: {
        protocol: 'hitl/1',
        operation: operation(`${name}-bind-second`),
        waitRef,
        expectedGeneration: '1',
        instanceId: 'second',
        implementationRef: 'v1',
      },
    })
  if (scenario.terminal) {
    const invalidated = await command(
      world,
      {
        method: 'invalidateWait',
        command: {
          protocol: 'hitl/1',
          operation: operation(`${name}-invalidate`),
          waitRef,
          terminalEvidenceRef: 'terminal-original',
          reason: 'cancelled',
        },
      },
      waitRef,
    )
    if (invalidated.kind !== 'invalidated') throw new Error(JSON.stringify(invalidated))
  }
  return { requestRef, decisions, receipts }
}

/**
 * 在新库上执行全部场景后关闭存储。返回库目录、按登记顺序读回的请求、按提交顺序的决定和消费回执。
 */
export async function seed() {
  const world = await openWorld()
  try {
    const requests: RequestRecord[] = [],
      decisions: DecisionRef[] = [],
      receipts: ConsumerReceipt[] = []
    for (const scenario of scenarios) {
      const played = await play(world, scenario)
      if (!played) continue
      requests.push(await readRequest(world, played.requestRef))
      decisions.push(...played.decisions)
      receipts.push(...played.receipts)
    }
    return { root: world.root, requests, decisions, receipts }
  } finally {
    await world.close()
  }
}
