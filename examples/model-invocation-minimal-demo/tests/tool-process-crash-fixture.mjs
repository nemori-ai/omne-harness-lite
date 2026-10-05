// Demo-owned subprocess regression. The only private import is this member's nonce
// contribution, instrumented before registration; the real pure function still runs.
import { appendFileSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { openDemo } from '@omne-harness-lite/model-invocation-minimal-demo'
import { projectToolJournal } from '@omne-harness-lite/tool-execution-runtime'
import { DEMO_TOOL_IMPLEMENTATIONS } from '../dist/demo-tools.js'
import { prepareSecondSession } from './tool-process-two-sessions.ts'

const input = JSON.parse(await readFile(process.argv[2], 'utf8'))
let demo
let storage, context
const sessions = [],
  observations = []
let recoveryGateOpen = false
const digest = value => createHash('sha256').update(value).digest('hex')
function send(value) {
  return new Promise((resolve, reject) => {
    if (!process.send) return reject(new Error('IPC owner absent'))
    process.send(value, error => (error ? reject(error) : resolve()))
  })
}
async function cut(point) {
  if (!['crash', 'two-crash'].includes(input.mode) || input.cut !== point) return
  await send({
    kind: 'cut',
    point,
    session: demo?.session,
    sessions,
    owner: input.owner,
    pid: process.pid,
  })
  await new Promise(() => {})
}
const nonce = DEMO_TOOL_IMPLEMENTATIONS.find(item => item.definition.name === 'demo:nonce')
if (!nonce) throw new Error('real nonce contribution absent')
const execute = nonce.executor
nonce.executor = async (...args) => {
  appendFileSync(
    input.authorEntries,
    JSON.stringify({ owner: input.owner, phase: 'entered' }) + '\n',
    { mode: 0o600 },
  )
  const result = await execute(...args)
  if (typeof result !== 'string') throw new Error('real nonce did not return its ordinary string')
  appendFileSync(
    input.authorEntries,
    JSON.stringify({ owner: input.owner, phase: 'returned', digest: digest(result) }) + '\n',
    { mode: 0o600 },
  )
  await cut('author_returned_before_A')
  return result
}
try {
  demo = await openDemo(
    input.data,
    { multiplier: 1.1, reserveTokens: 256 },
    {
      diagnostics: {
        record(event) {
          if (event.event === 'gate' && event.phase === 'scenario' && event.outcome === 'open')
            recoveryGateOpen = true
        },
      },
      waitMilliseconds: 30,
      force: false,
      schedule(milliseconds, callback) {
        const timer = setTimeout(callback, milliseconds)
        return () => clearTimeout(timer)
      },
    },
    16384,
    Buffer.from('controlled-crash-credential'),
    {
      developmentTransport: {
        baseUrl: input.transport.baseUrl,
        tls: { ca: Buffer.from(input.transport.ca, 'base64') },
      },
      hooks: {
        storageOpened(value) {
          storage = value
        },
        async fiberCreated(name, fiber) {
          if (name === 'evaluationInputs') {
            await fiber
            context = fiber.ctx
          }
        },
        sessionLogOpened(log) {
          return {
            ...log,
            async append(...args) {
              const kinds = args[1].map(entry => entry.payload?.value?.kind)
              // Leave the first session's real A durable and B unresolved, without closing.
              if (
                input.mode === 'two-crash' &&
                args[0] === demo?.session &&
                kinds.includes('delivery_ready')
              )
                return { failure: 'unavailable' }
              if (
                input.mode === 'recover' &&
                input.holdSession === args[0] &&
                kinds.includes('delivery_confirmed')
              ) {
                await send({
                  kind: 'recovery_blocked',
                  session: args[0],
                  gateOpen: recoveryGateOpen,
                })
                await new Promise(resolve =>
                  process.once('message', message => {
                    if (message?.releaseRecovery !== true)
                      throw new Error('recovery release control missing')
                    resolve()
                  }),
                )
              }
              if (kinds.includes('execution_intended')) await cut('before_intent')
              if (kinds.includes('delivery_confirmed')) await cut('before_C')
              const result = await log.append(...args)
              if (!('failure' in result)) {
                if (kinds.includes('execution_intended')) await cut('after_intent')
                if (kinds.includes('execution_started')) await cut('after_started')
                if (kinds.includes('execution_ended')) await cut('after_A')
                if (kinds.includes('delivery_ready')) await cut('after_B')
                if (kinds.includes('delivery_confirmed')) await cut('after_C')
              }
              return result
            },
          }
        },
      },
    },
    undefined,
    {
      covered: true,
      processOwnership: {
        current: input.owner,
        async observeExit(owner) {
          if (owner === input.owner) return 'alive'
          const observed = input.confirmedExited.includes(owner)
            ? 'exited'
            : input.observedAlive?.includes(owner)
              ? 'alive'
              : 'unknown'
          observations.push({ owner, observed })
          return observed
        },
      },
    },
    true,
  )
  sessions.push(demo.session)
  if (input.mode === 'crash') {
    const result = await demo.send('Generate one nonce.', async () => {})
    throw new Error('turn completed without reaching the declared cut: ' + result.kind)
  }
  if (input.mode === 'two-crash') {
    const first = await demo.send('Generate one nonce.', async () => {})
    if (first.kind !== 'refused') throw new Error('first session did not retain its B obligation')
    await send({ kind: 'first_pending' })
    await new Promise(resolve =>
      process.once('message', message => {
        if (message?.continueSecond !== true) throw new Error('second-session control missing')
        resolve()
      }),
    )
    if (!storage || !context) throw new Error('actual evaluation input owners absent')
    const second = await prepareSecondSession(demo, storage, context, input)
    sessions.push(second.session)
    const result = await second.send()
    throw new Error('second turn ended without reaching its cut: ' + result.kind)
  }
  const read = await demo.application.readSessionLog(demo.actor, demo.session)
  if (!('entries' in read)) throw new Error('recovered public history unavailable')
  const projected = projectToolJournal(
    { tenant: demo.actor.tenant, session: demo.session },
    read.entries,
  )
  if ('invalid' in projected) throw new Error('recovered tool history violates the public codec')
  const owned = []
  for (const session of input.sessions ?? [demo.session]) {
    const history = await demo.application.readSessionLog(demo.actor, session)
    if (!('entries' in history)) throw new Error('owned recovered session unavailable')
    const view = projectToolJournal({ tenant: demo.actor.tenant, session }, history.entries)
    if ('invalid' in view || [...view.executions.values()].some(execution => !execution.confirmed))
      throw new Error('owned session still has an unfinished tool obligation at ready')
    owned.push({ session, executions: view.executions.size })
  }
  await send({
    kind: 'ready',
    session: demo.session,
    owner: input.owner,
    executions: projected.executions.size,
    owned,
  })
  const closed = await demo.close()
  if (!closed.complete) throw new Error('recovered owner did not close completely')
  await send({ kind: 'closed', owner: input.owner })
  process.disconnect()
} catch (error) {
  await send({
    kind: 'failure',
    reason: error instanceof Error ? error.message : 'child failure',
    observations,
  })
  process.exitCode = 1
  process.disconnect?.()
}
