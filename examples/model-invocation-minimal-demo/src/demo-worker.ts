import { randomUUID } from 'node:crypto'
import { DemoStartupFailure, readPrivateFile, openDemo, type DemoConversation } from './demo.ts'
import { decodeBody, encodeBody, packet, record, type DemoPacket } from './demo-ipc.ts'
import { readTokenMargin } from './token-margin.ts'

function positiveBound(value: string | undefined): number {
  if (value === undefined || !/^[1-9][0-9]*$/u.test(value)) throw new Error('invalid IPC bound')
  const parsed = Number(value)
  if (!Number.isSafeInteger(parsed)) throw new Error('invalid IPC bound')
  return parsed
}

const maximumPacketBytes = positiveBound(process.env.OMNE_DEMO_IPC_MAX_PACKET_BYTES)
const maximumPendingRequests = positiveBound(process.env.OMNE_DEMO_IPC_MAX_PENDING_REQUESTS)
type Pending = { readonly resolve: (value: unknown) => void }
const pending = new Map<string, Pending>()
let generation: string | undefined
let conversation: DemoConversation | undefined
let activeCommand: Promise<void> | undefined
let closing = false

function send(kind: DemoPacket['kind'], id: string, body: unknown): boolean {
  if (generation === undefined || !process.send || !process.connected) return false
  let encoded: string
  try {
    encoded = encodeBody(body)
  } catch {
    return false
  }
  const outgoing = { generation, id, kind, body: encoded }
  if (Buffer.byteLength(JSON.stringify(outgoing), 'utf8') > maximumPacketBytes) return false
  process.send(outgoing)
  return true
}

function finishPending(id: string, value: unknown): void {
  const wait = pending.get(id)
  if (wait === undefined) return
  pending.delete(id)
  wait.resolve(value)
}

async function request(kind: DemoPacket['kind'], body: unknown): Promise<unknown> {
  if (pending.size >= maximumPendingRequests) return undefined
  const id = randomUUID()
  const result = new Promise<unknown>(resolve => pending.set(id, { resolve }))
  if (!send(kind, id, body)) finishPending(id, undefined)
  return await result
}

function positiveInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0
}

async function start(message: DemoPacket, body: Readonly<Record<string, unknown>>): Promise<void> {
  if (generation !== undefined || conversation !== undefined) return
  if (
    typeof body.dataDirectory !== 'string' ||
    !body.dataDirectory.startsWith('/') ||
    typeof body.identity !== 'string' ||
    body.identity.length < 16 ||
    typeof body.multiplier !== 'string' ||
    typeof body.reserveTokens !== 'string' ||
    (body.tools !== undefined && typeof body.tools !== 'boolean') ||
    !positiveInteger(body.maxOutputTokens) ||
    !positiveInteger(body.retirementWaitMilliseconds) ||
    typeof body.covered !== 'boolean' ||
    (body.keyFile !== undefined && typeof body.keyFile !== 'string') ||
    (body.developmentTransport !== undefined &&
      (!record(body.developmentTransport) ||
        typeof body.developmentTransport.baseUrl !== 'string' ||
        typeof body.developmentTransport.ca !== 'string'))
  ) {
    generation = message.generation
    send('failure', message.id, { reason: 'invalidInput' })
    return
  }
  const margin = readTokenMargin(body.multiplier, body.reserveTokens)
  if (margin === undefined) {
    generation = message.generation
    send('failure', message.id, { reason: 'invalidInput' })
    return
  }
  generation = message.generation
  try {
    if (body.keyFile !== undefined && process.env.OPENROUTER_API_KEY)
      throw new Error('two credential sources')
    const identity = body.identity
    const retirementWaitMilliseconds = body.retirementWaitMilliseconds
    const controlled = body.developmentTransport
    conversation = await openDemo(
      body.dataDirectory,
      margin,
      {
        waitMilliseconds: retirementWaitMilliseconds,
        force: false,
        schedule(milliseconds, callback) {
          const timer = setTimeout(callback, milliseconds)
          return () => clearTimeout(timer)
        },
      },
      body.maxOutputTokens,
      undefined,
      record(controlled) &&
        typeof controlled.baseUrl === 'string' &&
        typeof controlled.ca === 'string'
        ? {
            developmentTransport: {
              baseUrl: controlled.baseUrl,
              tls: { ca: Buffer.from(controlled.ca, 'base64') },
            },
          }
        : undefined,
      undefined,
      {
        covered: body.covered,
        async readCredential() {
          if (typeof body.keyFile === 'string') {
            let loaded = await readPrivateFile(body.keyFile)
            if (loaded.at(-1) === 10) {
              const original = loaded
              loaded = Buffer.from(
                original.subarray(0, original.length - (original.at(-2) === 13 ? 2 : 1)),
              )
              original.fill(0)
            }
            return loaded
          }
          return process.env.OPENROUTER_API_KEY
            ? Buffer.from(process.env.OPENROUTER_API_KEY)
            : undefined
        },
        processOwnership: {
          current: identity,
          async observeExit(owner) {
            if (owner === identity) return 'alive'
            const fact = await request('observeExit', { owner })
            return fact === 'exited' || fact === 'alive' ? fact : 'unknown'
          },
        },
      },
      body.tools === true,
    )
    const started = send('started', message.id, {
      session: conversation.session,
      identity: conversation.identity,
    })
    if (!started) {
      send('failure', message.id, { reason: 'packetLimit' })
      try {
        const stopped = await conversation.close()
        if (stopped.complete) {
          conversation = undefined
          process.disconnect?.()
        }
      } catch {
        // Keep the live worker and its resource ownership until an explicit operator action.
      }
    }
  } catch (error) {
    send('failure', message.id, { reason: 'unavailable' })
    if (!(error instanceof DemoStartupFailure && !error.cleanupComplete)) process.disconnect?.()
  }
}

async function command(
  message: DemoPacket,
  body: Readonly<Record<string, unknown>>,
): Promise<void> {
  const current = conversation
  if (current === undefined || closing || activeCommand !== undefined) {
    send('failure', message.id, { reason: 'unavailable' })
    return
  }
  const name = body.name
  if (
    name !== 'models' &&
    name !== 'currentModel' &&
    name !== 'selectModel' &&
    name !== 'history' &&
    name !== 'totals' &&
    name !== 'send'
  ) {
    send('failure', message.id, { reason: 'invalidInput' })
    return
  }
  activeCommand = (async () => {
    try {
      let result: unknown
      switch (name) {
        case 'models':
          result = await current.models()
          break
        case 'currentModel':
          result = await current.currentModel()
          break
        case 'selectModel':
          if (typeof body.routeName !== 'string') throw new Error('invalid route')
          result = await current.selectModel(body.routeName)
          break
        case 'history':
          result = await current.history()
          break
        case 'totals': {
          const totals = await current.totals()
          result = {
            responses: totals.responses,
            usage: Object.fromEntries(
              Object.entries(totals.usage).map(([key, value]) => [
                key,
                { knownSum: value.knownSum.toString(), unknownCount: value.unknownCount },
              ]),
            ),
            cost: {
              knownSum: totals.cost.knownSum.toString(),
              unknownCount: totals.cost.unknownCount,
            },
          }
          break
        }
        case 'send':
          if (typeof body.text !== 'string') throw new Error('invalid text')
          result = await current.send(body.text, async serialized => {
            const answer = await request('observer', { commandId: message.id, serialized })
            if (answer !== 'delivered') throw new Error('observer unavailable')
          })
          break
      }
      if (!send('result', message.id, result))
        send('failure', message.id, { reason: 'unavailable' })
    } catch {
      send('failure', message.id, { reason: 'unavailable' })
    }
  })()
  try {
    await activeCommand
  } finally {
    activeCommand = undefined
  }
}

async function close(message: DemoPacket): Promise<void> {
  if (conversation === undefined || closing) {
    send('failure', message.id, { reason: 'unavailable' })
    return
  }
  closing = true
  conversation.stopActive()
  const result = await conversation.close()
  send('closed', message.id, result)
  if (result.complete) {
    conversation = undefined
    process.disconnect?.()
  } else closing = false
}

process.on('message', value => {
  const message = packet(value, maximumPacketBytes)
  if (message === undefined || (generation !== undefined && message.generation !== generation))
    return
  const body = decodeBody(message.body)
  if (message.kind === 'exitFact' || message.kind === 'observerAck') {
    finishPending(message.id, body)
    return
  }
  if (message.kind === 'start' && record(body)) {
    void start(message, body)
    return
  }
  if (message.kind === 'stop') {
    conversation?.stopActive()
    return
  }
  if (message.kind === 'command' && record(body)) {
    void command(message, body)
    return
  }
  if (message.kind === 'close') void close(message)
})

process.on('disconnect', () => {
  for (const [id] of pending) finishPending(id, undefined)
  conversation?.stopActive()
  if (conversation !== undefined)
    void conversation.close().then(
      result => {
        if (result.complete) process.exit(0)
      },
      () => undefined,
    )
})
