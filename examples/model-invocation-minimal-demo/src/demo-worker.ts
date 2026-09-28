import { randomUUID } from 'node:crypto'
import { DemoStartupFailure, readPrivateFile, openDemo, type DemoConversation } from './demo.ts'
import { decodeBody, encodeBody, packet, record, type DemoPacket } from './demo-ipc.ts'
import { readTokenMargin } from './token-margin.ts'

const maximumPacketBytes = 1_048_576
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
  if (Buffer.byteLength(encoded, 'utf8') > maximumPacketBytes) return false
  process.send({ generation, id, kind, body: encoded })
  return true
}

function finishPending(id: string, value: unknown): void {
  const wait = pending.get(id)
  if (wait === undefined) return
  pending.delete(id)
  wait.resolve(value)
}

async function request(kind: DemoPacket['kind'], body: unknown): Promise<unknown> {
  if (pending.size >= 2) return undefined
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
  let credential: Buffer | undefined
  try {
    if (body.keyFile !== undefined && process.env.OPENROUTER_API_KEY)
      throw new Error('two credential sources')
    if (typeof body.keyFile === 'string') {
      credential = await readPrivateFile(body.keyFile)
      if (credential.at(-1) === 10) {
        const original = credential
        credential = Buffer.from(
          original.subarray(0, original.length - (original.at(-2) === 13 ? 2 : 1)),
        )
        original.fill(0)
      }
    } else if (process.env.OPENROUTER_API_KEY)
      credential = Buffer.from(process.env.OPENROUTER_API_KEY)
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
      credential,
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
        processOwnership: {
          current: identity,
          async observeExit(owner) {
            if (owner === identity) return 'alive'
            const fact = await request('observeExit', { owner })
            return fact === 'exited' || fact === 'alive' ? fact : 'unknown'
          },
        },
      },
    )
    send('started', message.id, {
      session: conversation.session,
      identity: conversation.identity,
    })
  } catch (error) {
    send('failure', message.id, { reason: 'unavailable' })
    if (!(error instanceof DemoStartupFailure && !error.cleanupComplete)) process.disconnect?.()
  } finally {
    credential?.fill(0)
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
