import { FIBER_STATE } from '@omne-harness-lite/kernel-basis'
import { describe, expect, it, vi } from 'vitest'
import { createServer, type ServerOptions } from 'node:https'
import { execFileSync } from 'node:child_process'
import { readFile, mkdir, open, type FileHandle } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import {
  inspectModelLogEntry,
  decodeModelLogKey,
} from '@omne-harness-lite/model-request-runtime/log-codec/v2'
import { createAcceptanceApplication, type TextCallRequest } from '../src/index.ts'
import { durationMilliseconds } from '../src/model-request-text.ts'
import { actor, ref, latch } from './support.ts'
import { callDeployment, publication, ROOT } from './model-request-support.ts'

const AT = '2026-09-28T00:00:00Z'
const MODEL = 'deepseek/deepseek-v4-pro-0813'
const BODY = 'explicit-local-synthetic-credential'
function request(id: string): TextCallRequest {
  return {
    parameters: { reasoningEffort: 'low', maxOutputTokens: 1024 },
    noRun: true,
    tools: [],
    callId: `call-${id}`,
    responseId: `response-${id}`,
    replyId: `reply-${id}`,
    user: {
      id: `user-${id}`,
      type: 'user',
      createdAt: AT,
      blocks: [
        {
          id: `text-${id}`,
          kind: 'text',
          text: 'hello',
          visibility: { toHuman: true, toModel: true },
        },
      ],
    },
  }
}
async function localTls(dir: string, mode: 'complete' | 'hold' = 'complete') {
  await mkdir(dir, { recursive: true })
  const key = join(dir, 'key.pem'),
    cert = join(dir, 'cert.pem')
  execFileSync(
    'openssl',
    [
      'req',
      '-x509',
      '-newkey',
      'rsa:2048',
      '-nodes',
      '-keyout',
      key,
      '-out',
      cert,
      '-days',
      '1',
      '-subj',
      '/CN=127.0.0.1',
      '-addext',
      'subjectAltName=IP:127.0.0.1,DNS:localhost',
    ],
    { stdio: 'ignore' },
  )
  const tls: ServerOptions = { key: await readFile(key), cert: await readFile(cert) }
  const requests: { body: string; authorization: string | undefined }[] = []
  const received = latch(),
    sentContent = latch()
  let socketsClosed = 0
  const server = createServer(tls, (req, res) => {
    const work = async () => {
      const chunks: Buffer[] = []
      for await (const chunk of req) {
        if (!Buffer.isBuffer(chunk)) throw new Error('body')
        chunks.push(chunk)
      }
      requests.push({
        body: Buffer.concat(chunks).toString(),
        authorization: req.headers.authorization,
      })
      received.resolve()
      res.writeHead(200, { 'content-type': 'text/event-stream', 'x-request-id': 'controlled-id' })
      res.write(
        `data: ${JSON.stringify({ id: 'controlled-upstream', model: MODEL, provider: 'DeepInfra', choices: [{ delta: { role: 'assistant', content: 'real reply' }, finish_reason: null }] })}\n\n`,
      )
      sentContent.resolve()
      if (mode === 'complete') {
        res.end(
          `data: ${JSON.stringify({ choices: [{ delta: {}, finish_reason: 'stop' }], usage: { prompt_tokens: 5, completion_tokens: 2, total_tokens: 7, cost: 0.00001 } })}\n\ndata: [DONE]\n\n`,
        )
      }
    }
    work().catch(() => res.destroy())
  })
  server.on('secureConnection', socket =>
    socket.once('close', () => {
      socketsClosed++
    }),
  )
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('address')
  return {
    requests,
    received,
    sentContent,
    socketsClosed: () => socketsClosed,
    developmentTransport: {
      baseUrl: `https://127.0.0.1:${address.port}/api/v1/`,
      tls: { ca: tls.cert },
    },
    async close() {
      server.closeAllConnections()
      await new Promise<void>((resolve, reject) =>
        server.close(error => (error ? reject(error) : resolve())),
      )
    },
  }
}

function fileMethods(value: unknown): value is Pick<FileHandle, 'datasync' | 'truncate'> {
  return (
    typeof value === 'object' &&
    value !== null &&
    'datasync' in value &&
    typeof value.datasync === 'function' &&
    'truncate' in value &&
    typeof value.truncate === 'function'
  )
}
describe('A2b actual first-model consumer', () => {
  it('dispatches actual DeepSeek wire after explicit selection, persists full M/R once, clears borrowed bytes and reopens without resend', async () => {
    const config = await callDeployment('actual-first-model'),
      tls = await localTls(join(dirname(config.databaseFile), 'tls'))
    const events: unknown[] = [],
      app = createAcceptanceApplication(config, {
        stage: 'modelRequest',
        developmentTransport: tls.developmentTransport,
        diagnostics: { record: e => events.push(e) },
      })
    let zeroes = 0
    const originalFill = Uint8Array.prototype.fill
    const fill = vi.spyOn(Uint8Array.prototype, 'fill').mockImplementation(function (
      this: Uint8Array,
      value: number,
      start?: number,
      end?: number,
    ) {
      if (Buffer.from(this).toString() === BODY && value === 0) zeroes++
      return originalFill.call(this, value, start, end)
    })
    try {
      await app.ready
      const who = await actor(app)
      await app.prepareSession(who, 's1')
      expect(await app.prepareModelInputs(who, 's1')).toEqual({ prepared: true })
      expect(await app.startTextCall(who, 's1', request('unselected'))).toEqual({
        unavailable: true,
      })
      expect(tls.requests).toHaveLength(0)
      expect(await app.legalTargets(who, 's1')).toEqual({ ok: [MODEL] })
      expect(await app.selectModel(who, 's1', MODEL)).toEqual({ selected: MODEL })
      const selected = await app.effectiveModel(who, 's1')
      if (!('ok' in selected)) throw new Error('basis')
      expect(selected.ok.selectedBy).toBe('session')
      await app.publishCredential(who, async actual => ({
        account: actual.account,
        tenant: actual.tenant,
        sourceRef: ref('actual-source'),
        body: Buffer.from(BODY),
      }))
      zeroes = 0
      const visible: string[] = [],
        mutableParameters = { reasoningEffort: 'low' as const, maxOutputTokens: 1024 },
        mutableUser = {
          ...(request('one').user as { id: string; type: 'user'; createdAt: string }),
          blocks: [
            {
              id: 'text-one',
              kind: 'text',
              text: 'hello',
              visibility: { toHuman: true, toModel: true },
            },
          ],
        },
        mutableRequest = {
          ...request('one'),
          parameters: mutableParameters,
          user: mutableUser,
          onAccepted: (event: { t: string }) => visible.push(event.t),
        },
        starting = app.startTextCall(who, 's1', mutableRequest)
      // sessionAccess starts with an awaited actual identity read. Caller mutations happen before it returns.
      mutableParameters.maxOutputTokens = 1
      mutableUser.blocks[0]!.text = 'changed after admission'
      mutableRequest.callId = 'changed-call'
      mutableRequest.responseId = 'changed-response'
      mutableRequest.replyId = 'changed-reply'
      mutableRequest.onAccepted = () => {
        throw new Error('changed observer must not run')
      }
      const started = await starting
      if (!('call' in started)) throw new Error(`start ${JSON.stringify(started)}`)
      const result = await started.call.outcome
      if (!('replyPending' in result)) throw new Error(`outcome ${JSON.stringify(result)}`)
      expect(result.replyPending.reply.blocks).toEqual(
        expect.arrayContaining([expect.objectContaining({ kind: 'text', text: 'real reply' })]),
      )
      const settled = await started.call.settleReply('persisted')
      if ('unavailable' in settled) throw new Error(`settlement ${settled.reason}`)
      expect(settled).toHaveProperty('settled')
      expect(await started.call.close()).toEqual({ released: true })
      expect(tls.requests).toHaveLength(1)
      expect(tls.requests[0]?.authorization).toBe(`Bearer ${BODY}`)
      const wire = JSON.parse(tls.requests[0]?.body ?? '{}')
      expect(wire.model).toBe(MODEL)
      expect(wire.max_tokens).toBe(1024)
      expect(wire.provider).toEqual(
        expect.objectContaining({ order: ['deepinfra/fp8'], allow_fallbacks: false }),
      )
      expect(wire.messages).toEqual([{ role: 'user', content: [{ type: 'text', text: 'hello' }] }])
      expect(visible).toContain('fill')
      const read = await app.readSessionLog(who, 's1')
      if (!('entries' in read)) throw new Error('log')
      expect(read.entries).toHaveLength(6)
      const responseEntry = read.entries.find(entry =>
        entry.readKeys.some(key => {
          const decoded = decodeModelLogKey(key)
          return 'ok' in decoded && decoded.ok.kind === 'response'
        }),
      )
      if (responseEntry === undefined) throw new Error('response entry')
      const response = inspectModelLogEntry({
        session: 's1',
        tenant: who.tenant,
        entry: responseEntry,
        purpose: { kind: 'response' },
        messagePrefix: null,
      })
      if ('invalidValue' in response) throw new Error('response value')
      expect(response.ok.captured.response?.route).toEqual(
        expect.objectContaining({ selectedBy: 'session', provider: 'deepinfra/fp8' }),
      )
      expect(response.ok.captured.response?.id).toBe('response-one')
      expect(response.ok.captured.response?.call.callId).toBe('call-one')
      expect(result.replyPending.reply.id).toBe('reply-one')
      expect(response.ok.captured.response?.timing).toEqual(
        expect.objectContaining({ firstTokenAt: AT }),
      )
      expect(zeroes).toBe(1)
      expect(JSON.stringify(events)).not.toContain(BODY)
      expect(await app.close()).toMatchObject({ complete: true })
      const reopen = createAcceptanceApplication(config, {
        stage: 'modelRequest',
        developmentTransport: tls.developmentTransport,
        diagnostics: { record() {} },
      })
      try {
        await reopen.ready
        expect(await reopen.readSessionLog(who, 's1')).toEqual(read)
        expect(await reopen.legalTargets(who, 's1')).toEqual({ ok: [MODEL] })
        expect((await reopen.close()).complete).toBe(true)
      } finally {
        await reopen.close()
      }
      expect(tls.requests).toHaveLength(1)
    } finally {
      fill.mockRestore()
      await app.close()
      await tls.close()
    }
  })
  it('stops an actual content-bearing socket during app close and settles system-stop R without a reply', async () => {
    const config = await callDeployment('actual-stop'),
      tls = await localTls(join(dirname(config.databaseFile), 'tls'), 'hold')
    const accepted = latch(),
      app = createAcceptanceApplication(config, {
        stage: 'modelRequest',
        developmentTransport: tls.developmentTransport,
        diagnostics: { record() {} },
      })
    try {
      await app.ready
      const who = await actor(app)
      await app.prepareSession(who, 's1')
      await app.prepareModelInputs(who, 's1')
      await app.selectModel(who, 's1', MODEL)
      await app.publishCredential(who, async actual => ({
        account: actual.account,
        tenant: actual.tenant,
        sourceRef: ref('stop-source'),
        body: Buffer.from(BODY),
      }))
      const started = await app.startTextCall(who, 's1', {
        ...request('stop'),
        onAccepted: event => {
          if (event.t === 'fill') accepted.resolve()
        },
      })
      if (!('call' in started)) throw new Error(`start ${JSON.stringify(started)}`)
      await accepted.promise
      expect(await app.close()).toMatchObject({ complete: true })
      expect(await started.call.close()).toEqual({ released: true })
      expect(tls.requests).toHaveLength(1)
      const next = createAcceptanceApplication(config, {
        stage: 'modelRequest',
        developmentTransport: tls.developmentTransport,
        diagnostics: { record() {} },
      })
      try {
        await next.ready
        const read = await next.readSessionLog(who, 's1')
        if (!('entries' in read)) throw new Error('log')
        expect(read.entries).toHaveLength(5)
        expect(JSON.stringify(read.entries)).toContain('run_cancelled')
        expect(JSON.stringify(read.entries)).not.toContain('"type":"assistant"')
        expect((await next.close()).complete).toBe(true)
      } finally {
        await next.close()
      }
    } finally {
      await app.close()
      await tls.close()
    }
  })
  it('fails closed for missing and non-ASCII credentials and for invalid or cross-tenant input with zero HTTP', async () => {
    const config = await callDeployment('actual-zero-send'),
      tls = await localTls(join(dirname(config.databaseFile), 'tls'))
    const app = createAcceptanceApplication(config, {
      stage: 'modelRequest',
      developmentTransport: tls.developmentTransport,
      diagnostics: { record() {} },
    })
    try {
      await app.ready
      const who = await actor(app),
        other = await actor(app, 'other')
      await app.prepareSession(who, 's1')
      await app.prepareModelInputs(who, 's1')
      await app.selectModel(who, 's1', MODEL)
      expect(await app.startTextCall(other, 's1', request('cross'))).toEqual({
        failure: 'identityMismatch',
      })
      expect(await app.startTextCall(who, 's1', { ...request('invalid'), user: {} })).toEqual({
        rejected: 'invalidInput',
      })
      const missing = await app.startTextCall(who, 's1', request('missing'))
      expect(missing).toEqual({ step: 'lookup', result: { failure: 'credentialUnavailable' } })
      await app.publishCredential(who, async actual => ({
        account: actual.account,
        tenant: actual.tenant,
        sourceRef: ref('non-ascii-source'),
        body: new Uint8Array([0x41, 0x80]),
      }))
      expect(await app.startTextCall(who, 's1', request('nonascii'))).toEqual({
        rejected: 'invalidInput',
      })
      expect(tls.requests).toHaveLength(0)
      expect(await app.close()).toMatchObject({ complete: true })
    } finally {
      await app.close()
      await tls.close()
    }
  })
  it('retains an actual unknown response append and blocks every later physical send and byte release', async () => {
    const config = await callDeployment('actual-write-unknown'),
      tls = await localTls(join(dirname(config.databaseFile), 'tls'))
    const probe = await open(join(dirname(config.databaseFile), 'probe'), 'w')
    const prototype: unknown = Object.getPrototypeOf(probe)
    if (!fileMethods(prototype)) throw new Error('actual file methods')
    const sync = prototype.datasync,
      truncate = prototype.truncate
    let fail = false,
      zeroes = 0
    const syncSpy = vi.spyOn(prototype, 'datasync').mockImplementation(async function (
      this: Pick<FileHandle, 'datasync' | 'truncate'>,
    ) {
      if (fail) throw Object.assign(new Error('controlled actual fs fault'), { code: 'EIO' })
      await sync.call(this)
    })
    const truncateSpy = vi.spyOn(prototype, 'truncate').mockImplementation(async function (
      this: Pick<FileHandle, 'datasync' | 'truncate'>,
      size,
    ) {
      if (fail) throw Object.assign(new Error('controlled actual fs fault'), { code: 'EIO' })
      await truncate.call(this, size)
    })
    const originalFill = Uint8Array.prototype.fill
    const fill = vi.spyOn(Uint8Array.prototype, 'fill').mockImplementation(function (
      this: Uint8Array,
      value: number,
      start?: number,
      end?: number,
    ) {
      if (Buffer.from(this).toString() === BODY && value === 0) zeroes++
      return originalFill.call(this, value, start, end)
    })
    const app = createAcceptanceApplication(config, {
      stage: 'modelRequest',
      developmentTransport: tls.developmentTransport,
      diagnostics: { record() {} },
    })
    try {
      await app.ready
      const who = await actor(app)
      await app.prepareSession(who, 's1')
      await app.prepareModelInputs(who, 's1')
      await app.selectModel(who, 's1', MODEL)
      await app.publishCredential(who, async actual => ({
        account: actual.account,
        tenant: actual.tenant,
        sourceRef: ref('unknown-source'),
        body: Buffer.from(BODY),
      }))
      zeroes = 0
      const started = await app.startTextCall(who, 's1', request('unknown'))
      if (!('call' in started)) throw new Error('start')
      const result = await started.call.outcome
      if (!('replyPending' in result)) throw new Error('reply')
      fail = true
      expect(await started.call.settleReply('persisted')).toMatchObject({ unavailable: true })
      expect(await started.call.close()).toEqual({ unavailable: true })
      expect(await app.startTextCall(who, 's1', request('after-unknown'))).toEqual({
        unavailable: true,
      })
      const closed = await app.close()
      expect(closed.complete).toBe(false)
      expect(closed.unfinished).toContain('modelRequestConsumers')
      expect(tls.requests).toHaveLength(1)
      expect(zeroes).toBe(0)
      expect(app.status().fibers.evaluationInputs).toBe(FIBER_STATE.ACTIVE)
    } finally {
      fail = false
      syncSpy.mockRestore()
      truncateSpy.mockRestore()
      fill.mockRestore()
      await probe.close()
      await tls.close()
    }
  })
  it('confirms the actual opened JSONL write before delivering the first visible content', async () => {
    const config = await callDeployment('actual-opened-gate'),
      tls = await localTls(join(dirname(config.databaseFile), 'tls'))
    const probe = await open(join(dirname(config.databaseFile), 'probe'), 'w'),
      prototype: unknown = Object.getPrototypeOf(probe)
    if (!fileMethods(prototype)) throw new Error('actual file methods')
    const sync = prototype.datasync,
      entered = latch(),
      gate = latch()
    let armed = false,
      writes = 0,
      visible = 0
    const spy = vi.spyOn(prototype, 'datasync').mockImplementation(async function (
      this: Pick<FileHandle, 'datasync' | 'truncate'>,
    ) {
      if (armed && ++writes === 3) {
        entered.resolve()
        await gate.promise
      }
      await sync.call(this)
    })
    const app = createAcceptanceApplication(config, {
      stage: 'modelRequest',
      developmentTransport: tls.developmentTransport,
      diagnostics: { record() {} },
    })
    try {
      await app.ready
      const who = await actor(app)
      await app.prepareSession(who, 's1')
      await app.prepareModelInputs(who, 's1')
      await app.selectModel(who, 's1', MODEL)
      await app.publishCredential(who, async actual => ({
        account: actual.account,
        tenant: actual.tenant,
        sourceRef: ref('gate-source'),
        body: Buffer.from(BODY),
      }))
      armed = true
      const started = await app.startTextCall(who, 's1', {
        ...request('gate'),
        onAccepted: event => {
          if (event.t === 'fill') visible++
        },
      })
      if (!('call' in started)) throw new Error('start')
      await entered.promise
      expect(tls.requests).toHaveLength(1)
      expect(visible).toBe(0)
      gate.resolve()
      const result = await started.call.outcome
      expect('replyPending' in result).toBe(true)
      expect(await started.call.settleReply('persisted')).toHaveProperty('settled')
      expect(visible).toBeGreaterThan(0)
      expect(await started.call.close()).toEqual({ released: true })
      expect((await app.close()).complete).toBe(true)
    } finally {
      gate.resolve()
      spy.mockRestore()
      await app.close()
      await probe.close()
      await tls.close()
    }
  })
  it('uses actual same-name organization lock and later source publication without rewriting the opened binding', async () => {
    const base = await callDeployment('actual-locked-source'),
      tls = await localTls(join(dirname(base.databaseFile), 'tls'))
    let changed = false
    const config = {
      ...base,
      modelRequest: {
        ...base.modelRequest,
        evaluationInputs: {
          ...base.modelRequest.evaluationInputs,
          async prepare(who: Parameters<typeof publication>[0]) {
            const source = publication(who, changed ? '1' : null)
            return {
              publication: {
                ...source,
                scopes: source.scopes.map(scope =>
                  scope.holder.layer === 'organization'
                    ? {
                        ...scope,
                        holdings: source.scopes.flatMap(factory =>
                          factory.holder.layer === 'factory'
                            ? factory.holdings.map(holding => ({
                                ...holding,
                                holder: {
                                  layer: 'organization' as const,
                                  organization: who.tenant.organization,
                                },
                                assignments: [
                                  { item: 'model', value: MODEL, immutable: !changed, since: AT },
                                ],
                              }))
                            : [],
                        ),
                      }
                    : scope,
                ),
              },
              recipe: { rootDefinition: ROOT },
            }
          },
        },
      },
    }
    const app = createAcceptanceApplication(config, {
      stage: 'modelRequest',
      developmentTransport: tls.developmentTransport,
      diagnostics: { record() {} },
    })
    try {
      await app.ready
      const who = await actor(app)
      await app.prepareSession(who, 's1')
      expect(await app.prepareModelInputs(who, 's1')).toEqual({ prepared: true })
      await app.selectModel(who, 's1', MODEL)
      const locked = await app.effectiveModel(who, 's1')
      if (!('ok' in locked)) throw new Error('basis')
      expect(locked.ok.selectedBy).toBe('layer_lock')
      await app.publishCredential(who, async actual => ({
        account: actual.account,
        tenant: actual.tenant,
        sourceRef: ref('locked-source'),
        body: Buffer.from(BODY),
      }))
      const start = await app.startTextCall(who, 's1', request('locked'))
      if (!('call' in start)) throw new Error('start')
      await tls.received.promise
      changed = true
      expect(await app.prepareModelInputs(who, 's1')).toEqual({ prepared: true })
      const outcome = await start.call.outcome
      if (!('replyPending' in outcome)) throw new Error('reply')
      const original = outcome.replyPending.responseFor('persisted')
      if (!('response' in original)) throw new Error('response')
      expect(original.response.route.selectedBy).toBe('layer_lock')
      expect(await start.call.settleReply('persisted')).toHaveProperty('settled')
      expect(await start.call.close()).toEqual({ released: true })
      const current = await app.effectiveModel(who, 's1')
      if (!('ok' in current)) throw new Error('current')
      expect(current.ok.selectedBy).toBe('session')
      expect(tls.requests).toHaveLength(1)
      expect((await app.close()).complete).toBe(true)
    } finally {
      await app.close()
      await tls.close()
    }
  })
  it('clears a fresh borrow exactly once when the genuine invocation constructor throws before handing over a handle', async () => {
    const base = await callDeployment('actual-ctor-throw'),
      tls = await localTls(join(dirname(base.databaseFile), 'tls'))
    const config = {
      ...base,
      modelRequest: {
        ...base.modelRequest,
        settlement: {
          ...base.modelRequest.settlement,
          contention: { ...base.modelRequest.settlement.contention, name: '' },
        },
      },
    }
    const app = createAcceptanceApplication(config, {
      stage: 'modelRequest',
      developmentTransport: tls.developmentTransport,
      diagnostics: { record() {} },
    })
    let zeroes = 0
    const originalFill = Uint8Array.prototype.fill,
      spy = vi.spyOn(Uint8Array.prototype, 'fill').mockImplementation(function (
        this: Uint8Array,
        value: number,
        start?: number,
        end?: number,
      ) {
        if (Buffer.from(this).toString() === BODY && value === 0) zeroes++
        return originalFill.call(this, value, start, end)
      })
    try {
      await app.ready
      const who = await actor(app)
      await app.prepareSession(who, 's1')
      await app.prepareModelInputs(who, 's1')
      await app.selectModel(who, 's1', MODEL)
      await app.publishCredential(who, async actual => ({
        account: actual.account,
        tenant: actual.tenant,
        sourceRef: ref('constructor-source'),
        body: Buffer.from(BODY),
      }))
      zeroes = 0
      await expect(app.startTextCall(who, 's1', request('throw'))).rejects.toMatchObject({
        name: 'AcceptanceOperationDefect',
      })
      expect(zeroes).toBe(1)
      expect(tls.requests).toHaveLength(0)
      expect((await app.close()).complete).toBe(true)
    } finally {
      spy.mockRestore()
      await app.close()
      await tls.close()
    }
  })
  it('uses exact positive milliseconds only and leaves unrepresentable AD durations unavailable', () => {
    expect(durationMilliseconds('PT15S')).toBe(15000)
    expect(durationMilliseconds('PT2M')).toBe(120000)
    expect(durationMilliseconds('PT0.001S')).toBe(1)
    expect(durationMilliseconds('PT01.000S')).toBe(1000)
    expect(durationMilliseconds('PT0.00000000000000000001S')).toBeNull()
    expect(durationMilliseconds('PT9007199254740993S')).toBeNull()
    expect(durationMilliseconds('PT0S')).toBeNull()
  })
})
