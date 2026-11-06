import { createServer } from 'node:http'
import { randomBytes } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { z } from 'zod'
import {
  RegisterRequestSchema,
  SubmitReplySchema,
  InvalidateWaitSchema,
  BindReceiverSchema,
  ConsumeDecisionSchema,
  AcknowledgeDeliverySchema,
  ListPoolSchema,
  GetWaitSchema,
  ReadInboxSchema,
  GetOperationSchema,
  WaitRefSchema,
} from '@omne-harness/human-intervention'
import {
  createIndependentHitlApplication,
  IndependentCommandSchema,
  independentControlCommands,
  hitlCommandBinding,
} from '@omne-harness/human-intervention-local'
import { openIdentityWorld } from '../../tests/identity-world.ts'
import { operationKey } from '../../src/encoding.ts'

const world = await openIdentityWorld()
const cursorKey = randomBytes(32)
const controlToken = randomBytes(32).toString('hex')
const options = {
  ...world.terminalOptions,
  destination: world.destination,
  required: [],
  locationRef: 'workbench',
  cursorKey,
  identity: {
    verifier: world.authority.verifier,
    standing: world.identity.standing,
    reservations: world.identity.reservations,
  },
}
let application = createIndependentHitlApplication(options)
let revision = 1
let remounting
async function remount() {
  if (!remounting) {
    const previous = application
    remounting = previous
      .close()
      .then(() => {
        application = createIndependentHitlApplication(options)
        return { kind: 'remounted', revision: ++revision }
      })
      .finally(() => {
        remounting = undefined
      })
  }
  return remounting
}
const operation = id => world.operation(`workbench-${id}`)
const actionSchema = z.strictObject({
  id: z.string().uuid(),
  action: z.enum(['create', 'reply', 'cancel', 'receive', 'remount']),
  input: z.json(),
})
async function prepare(id, input) {
  const form = z
    .strictObject({
      title: z.string(),
      description: z.string(),
      count: z.union([z.literal(1), z.literal(2)]),
    })
    .parse(input)
  const command = RegisterRequestSchema.parse({
    ...world.request,
    operation: operation(id),
    preparationRef: `form-${id}`,
    origin: {
      ...world.request.origin,
      originRef: id,
      wait: { ...world.request.origin.wait, waitId: id },
      positionRef: 'form',
      adoptionRef: 'v1',
    },
    questions: Array.from({ length: form.count }, (_, index) => ({
      kind: 'question',
      cardId: `question-${index}`,
      title: index ? `${form.title} · 第二项` : form.title,
      description: form.description,
      options: [
        { id: 'a', label: '方案 A', description: '记录选择 A' },
        { id: 'b', label: '方案 B', description: '记录选择 B' },
      ],
    })),
    displayContext: '临时独立工作，无 Session 或 Agent 父对象',
  })
  const qualified = await world.backend.qualify(world.principal)
  if (qualified.kind !== 'qualified') return { kind: 'refused', result: qualified }
  const preparation = IndependentCommandSchema.parse({
    kind: 'prepare',
    operation: operation(`${id}-prepare`),
    preparation: {
      registration: command,
      readers: [command.operation.actorRef],
      responders: [command.operation.actorRef],
      compatibleImplementations: ['v1'],
    },
  })
  const stored = await world.world.storage.commit({
    identity: {
      ...world.world.combination,
      operation: 'hitl.command',
      protocolVersion: '2',
      operationKey: operationKey(preparation.operation),
    },
    combinationVersion: world.world.combination.combinationVersion,
    manifestDigest: world.world.combination.manifestDigest,
    commands: independentControlCommands(preparation),
  })
  if (stored.kind !== 'committed')
    return { kind: 'refused', result: { kind: 'unavailable', reason: 'preparation' } }
  return { kind: 'prepared', command }
}
async function receive(app, id, input) {
  const value = z.strictObject({ wait: WaitRefSchema, expectedGeneration: z.string() }).parse(input)
  const bound = await app.bindReceiver(
    world.principal,
    BindReceiverSchema.parse({
      protocol: 'hitl/1',
      operation: operation(`${id}-bind`),
      waitRef: value.wait,
      expectedGeneration: value.expectedGeneration,
      instanceId: `receiver-${id}`,
      implementationRef: 'v1',
    }),
  )
  if (bound.kind !== 'bound') return bound
  const inbox = await app.readInbox(
    world.principal,
    ReadInboxSchema.parse({
      protocol: 'hitl/1',
      waitRef: value.wait,
      receiverGeneration: bound.receiverGeneration,
      limit: 100,
    }),
  )
  if (inbox.kind !== 'page') return inbox
  const receipts = []
  for (const [index, entry] of inbox.decisions.entries()) {
    const consumeId = `${id}-consume-${index}`
    const consumed = await app.consumeDecision(
      world.principal,
      ConsumeDecisionSchema.parse({
        protocol: 'hitl/1',
        operation: operation(consumeId),
        consumeOperationId: operation(consumeId).operationId,
        waitRef: value.wait,
        receiverGeneration: bound.receiverGeneration,
        decisionRef: entry.decision.ref,
      }),
    )
    if (consumed.kind !== 'accepted' && consumed.kind !== 'superseded') return consumed
    const acknowledged = await app.acknowledgeDelivery(
      world.principal,
      AcknowledgeDeliverySchema.parse({
        protocol: 'hitl/1',
        operation: operation(`${id}-ack-${index}`),
        consumerReceipt: consumed.receipt,
      }),
    )
    if (acknowledged.kind !== 'acknowledged') return acknowledged
    receipts.push(consumed.receipt)
  }
  return {
    kind: 'received',
    receipts,
    wait: await app.getWait(
      world.principal,
      GetWaitSchema.parse({ protocol: 'hitl/1', waitRef: value.wait }),
    ),
  }
}
async function action(envelope) {
  const { id, action: kind, input } = actionSchema.parse(envelope)
  const app = application
  if (kind === 'remount') {
    z.strictObject({}).parse(input)
    return { result: await remount() }
  }
  if (kind === 'receive') return { result: await receive(app, id, input) }
  let method, command
  if (kind === 'create') {
    const prepared = await prepare(id, input)
    if (prepared.kind !== 'prepared') return { result: prepared.result }
    method = 'registerRequest'
    command = prepared.command
  } else if (kind === 'reply') {
    method = 'submitReply'
    command = SubmitReplySchema.parse({
      ...SubmitReplySchema.unwrap().omit({ protocol: true, operation: true }).parse(input),
      protocol: 'hitl/1',
      operation: operation(id),
    })
  } else {
    const value = z.strictObject({ wait: WaitRefSchema }).parse(input)
    method = 'invalidateWait'
    command = InvalidateWaitSchema.parse({
      protocol: 'hitl/1',
      operation: operation(id),
      waitRef: value.wait,
      terminalEvidenceRef: `operator-cancel-${id}`,
      reason: 'cancelled',
    })
  }
  const result = await app[method](world.principal, command)
  return { result, operation: { protocol: 'hitl/1', ...hitlCommandBinding(method, command) } }
}
const readSchema = z.discriminatedUnion('query', [
  z.strictObject({ query: z.literal('pool'), cursor: z.string().optional() }),
  z.strictObject({ query: z.literal('wait'), wait: WaitRefSchema }),
  z.strictObject({ query: z.literal('operation'), operation: GetOperationSchema }),
])
async function query(input) {
  const value = readSchema.parse(input)
  switch (value.query) {
    case 'pool':
      return {
        revision,
        result: await application.listPool(
          world.principal,
          ListPoolSchema.parse({
            protocol: 'hitl/1',
            tenantRef: world.request.operation.tenantRef,
            locationRef: 'workbench',
            filter: { states: ['pending', 'decided', 'invalidated'] },
            limit: 50,
            ...(value.cursor ? { cursor: value.cursor } : {}),
          }),
        ),
      }
    case 'wait':
      return {
        result: await application.getWait(
          world.principal,
          GetWaitSchema.parse({ protocol: 'hitl/1', waitRef: value.wait }),
        ),
      }
    case 'operation':
      return { result: await application.getOperation(world.principal, value.operation) }
  }
}
async function body(request) {
  const chunks = []
  let size = 0
  let exceeded = false
  for await (const chunk of request) {
    size += chunk.length
    if (size > 300000) {
      exceeded = true
      chunks.length = 0
    }
    if (!exceeded) chunks.push(chunk)
  }
  if (exceeded) throw new RangeError('request-bytes')
  return JSON.parse(Buffer.concat(chunks).toString('utf8'))
}
let origin
const files = new Map([
  ['/', ['index.html', 'text/html; charset=utf-8']],
  ['/client.js', ['client.js', 'text/javascript; charset=utf-8']],
  ['/style.css', ['style.css', 'text/css; charset=utf-8']],
])
function respond(response, status, data) {
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  })
  response.end(JSON.stringify(data))
}
const server = createServer(async (request, response) => {
  try {
    if (request.headers.host !== new URL(origin).host)
      return respond(response, 403, { error: 'host' })
    const file = files.get(request.url)
    if (request.method === 'GET' && file) {
      let content = await readFile(new URL(file[0], import.meta.url), 'utf8')
      if (file[0] === 'index.html') content = content.replace('CONTROL_TOKEN', controlToken)
      response.writeHead(200, {
        'Content-Type': file[1],
        'Cache-Control': 'no-store',
        'Content-Security-Policy':
          "default-src 'self'; frame-ancestors 'none'; object-src 'none'; base-uri 'none'",
        'X-Content-Type-Options': 'nosniff',
      })
      return response.end(content)
    }
    if (request.method !== 'POST' || !['/api/action', '/api/query'].includes(request.url))
      return respond(response, 404, { error: 'not-found' })
    if (request.headers.origin !== origin || request.headers['x-workbench-token'] !== controlToken)
      return respond(response, 403, { error: 'workbench-access' })
    const value = await body(request)
    respond(response, 200, request.url === '/api/action' ? await action(value) : await query(value))
  } catch (error) {
    const invalid = error instanceof z.ZodError || error instanceof SyntaxError
    respond(response, error instanceof RangeError ? 413 : invalid ? 422 : 503, {
      error: invalid
        ? 'invalid-input'
        : error instanceof RangeError
          ? 'request-bytes'
          : 'unavailable',
    })
  }
})
server.listen(0, '127.0.0.1', () => {
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('Missing HTTP address')
  origin = `http://127.0.0.1:${address.port}`
  process.stdout.write(
    JSON.stringify({ ready: true, url: origin, database: world.world.root, pid: process.pid }) +
      '\n',
  )
})
let closing
async function close() {
  return (closing ??= (async () => {
    await new Promise(resolve => server.close(resolve))
    await application.close()
    await world.close()
  })())
}
process.once('SIGTERM', () => {
  void close()
})
process.once('SIGINT', () => {
  void close()
})
