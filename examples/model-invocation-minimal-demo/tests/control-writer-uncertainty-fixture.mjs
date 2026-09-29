import { open } from 'node:fs/promises'
import { join } from 'node:path'
import { judgeMessage } from '@omne-harness-lite/messages'
import { openDemo } from '../dist/demo.js'
import { createDemoCallHost } from '../dist/model-call-host.js'

const retirement = {
  waitMilliseconds: 30,
  force: false,
  schedule(milliseconds, callback) {
    const timer = setTimeout(callback, milliseconds)
    return () => clearTimeout(timer)
  },
}

function send(value) {
  process.send?.(value)
}

async function openConversation(input) {
  const identity = input.identity
  return await openDemo(
    input.dataDirectory,
    { multiplier: 1.1, reserveTokens: 256 },
    retirement,
    128,
    Buffer.from('controlled-local-key'),
    {
      developmentTransport: {
        baseUrl: input.baseUrl,
        tls: { ca: Buffer.from(input.ca, 'base64') },
      },
    },
    undefined,
    {
      covered: true,
      processOwnership: {
        current: identity,
        async observeExit(owner) {
          return input.previousOwner === owner && input.previousExitObserved === true
            ? 'exited'
            : 'unknown'
        },
      },
    },
  )
}

async function installEndedFault(dataDirectory) {
  const probe = await open(join(dataDirectory, 'control-fault-probe'), 'w')
  const methods = Object.getPrototypeOf(probe)
  await probe.close()
  const originalWrite = methods.write
  const originalDatasync = methods.datasync
  const originalTruncate = methods.truncate
  const targets = new WeakSet()
  let writes = 0
  let syncFailures = 0
  let truncateFailures = 0
  const fault = () => Object.assign(new Error('controlled control writer EIO'), { code: 'EIO' })
  methods.write = async function (...args) {
    const bytes = args[0]
    if (
      ArrayBuffer.isView(bytes) &&
      Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength).includes(
        Buffer.from('"kind":"model_call_ended"'),
      )
    ) {
      writes++
      targets.add(this)
    }
    return originalWrite.apply(this, args)
  }
  methods.datasync = async function (...args) {
    if (targets.has(this)) {
      syncFailures++
      throw fault()
    }
    return originalDatasync.apply(this, args)
  }
  methods.truncate = async function (...args) {
    if (targets.has(this)) {
      truncateFailures++
      throw fault()
    }
    return originalTruncate.apply(this, args)
  }
  return () => ({ writes, syncFailures, truncateFailures })
}

async function original(input) {
  const conversation = await openConversation(input)
  const { application: app, actor, session } = conversation
  const bound = await app.bindModelRuntime(actor, session)
  if (!('service' in bound)) throw new Error('service binding unavailable')
  const effective = await bound.service.effectiveModel({ session })
  if (!('effectiveModel' in effective)) throw new Error('effective model unavailable')
  const host = createDemoCallHost()
  if (!('attached' in (await app.attachModelCallHost(actor, session, host))))
    throw new Error('call host unavailable')
  const user = judgeMessage({
    type: 'user',
    id: 'control-cold-user',
    createdAt: '2026-09-28T00:00:00Z',
    blocks: [
      {
        id: 'control-cold-text',
        kind: 'text',
        text: 'controlled release',
        visibility: { toHuman: true, toModel: true },
      },
    ],
  })
  if (!('ok' in user) || user.ok.type !== 'user') throw new Error('user fixture invalid')
  const opened = await bound.service.openCall({
    session,
    target: effective.effectiveModel.routeName,
    basis: effective.effectiveModel,
    messages: [user.ok],
    tools: [],
    parameters: { reasoningEffort: 'low', maxOutputTokens: 128 },
    host: host.host,
  })
  if (!('callId' in opened)) throw new Error('call open unavailable')
  const callId = opened.callId
  const dispatched = await bound.service.dispatch({ session, callId })
  if (!('settled' in dispatched) || dispatched.settled.outcome !== 'failed')
    throw new Error('controlled HTTP 503 did not settle failed')
  const counts = await installEndedFault(input.dataDirectory)
  const release = await bound.service.releaseCall({ session, callId })
  if (!('unavailable' in release))
    throw new Error('unknown control receipt did not return unavailable')
  const physical = counts()
  if (physical.writes !== 1 || physical.syncFailures < 1 || physical.truncateFailures < 1)
    throw new Error('controlled control writer fault missed actual JSONL')
  send({ kind: 'unknown', callId, ...physical, pid: process.pid })
  // The original owner is deliberately still alive until the parent sends SIGKILL.
}

async function successor(input) {
  const conversation = await openConversation(input)
  const { application: app, actor, session } = conversation
  const read = await app.readSessionLog(actor, session)
  if (!('entries' in read)) throw new Error('successor authoritative log unavailable')
  const ended = read.entries.filter(entry => {
    const value = entry.payload?.value
    return value?.kind === 'model_call_ended' && value.call === input.callId
  })
  const bound = await app.bindModelRuntime(actor, session)
  if (!('service' in bound)) throw new Error('successor service binding unavailable')
  const history = await bound.service.readAttempts({ session, callId: input.callId })
  const closed = await conversation.close()
  send({
    kind: 'recovered',
    pid: process.pid,
    endedCount: ended.length,
    ending: ended[0]?.payload?.value?.ending,
    historyState: history.state,
    closeComplete: closed.complete,
  })
  process.disconnect?.()
}

process.once('message', value => {
  void (value.phase === 'original' ? original(value) : successor(value)).catch(error => {
    send({ kind: 'failure', message: error instanceof Error ? error.message : 'unknown' })
    process.disconnect?.()
  })
})
