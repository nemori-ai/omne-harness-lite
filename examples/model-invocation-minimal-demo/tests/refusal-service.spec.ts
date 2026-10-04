import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createServer } from 'node:https'
import { dirname, join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { ExactDecimal } from '@omne-harness-lite/call-accounts'
import { toOpaqueJson } from '@omne-harness-lite/content-blocks'
import { judgeMessage } from '@omne-harness-lite/messages'
import { parseOpaqueIdentifier, unwrap } from '@omne-harness-lite/identity-values'
import { decodeModelLogKey, invokeModel } from '@omne-harness-lite/model-request-runtime-local'
import {
  createPiAiTransport,
  deepseekV4Pro0813Configuration,
  deepseekV4Pro0813Definition,
} from '@omne-harness-lite/pi-ai-transport'
import { createAcceptanceApplication } from '../src/index.ts'
import { createDemoCallHost } from '../src/model-call-host.ts'
import { createLocalTls, deferred } from './local-tls.ts'
import { callDeployment, publication, rootBody, ROOT } from './model-request-support.ts'
import { activateModelFixture, actor, PASSWORD, ref } from './support.ts'

// D-108 / transport v14 rev2 RF-V3/V5/V7/V9. Only the upstream HTTPS boundary
// is controlled; model invocation, Cordis service and SQLite/JSONL remain real.
const MODEL = deepseekV4Pro0813Definition.modelId
const REFUSAL = '  I cannot provide that answer.\n保留完整文字。 '
const AT = '2026-09-28T00:00:00Z'
const USAGE = {
  prompt_tokens: 9,
  completion_tokens: 3,
  total_tokens: 12,
  prompt_tokens_details: { cached_tokens: 4, cache_write_tokens: 0 },
  cost: 0.0000117,
}
type Mode = 'complete' | 'error' | 'eof' | 'hold'

function sse(value: unknown) {
  return `data: ${JSON.stringify(value)}\n\n`
}
function user(id: string) {
  const judged = judgeMessage({
    type: 'user',
    id,
    createdAt: AT,
    blocks: [
      {
        id: `${id}-text`,
        kind: 'text',
        text: `Request ${id}`,
        visibility: { toHuman: true, toModel: true },
      },
    ],
  })
  if (!('ok' in judged) || judged.ok.type !== 'user') throw new Error('invalid user fixture')
  return judged.ok
}

async function refusalTls(directory: string) {
  // Reuse the existing controlled TLS fixture's certificate provisioning.
  const provisioned = await createLocalTls(directory)
  await provisioned.close()
  const cert = await readFile(join(directory, 'local-cert.pem'))
  const requests: unknown[] = []
  const failures: unknown[] = []
  const pending = new Set<Promise<void>>()
  const bodyClosed = deferred()
  const socketClosed = deferred()
  const contentSent = deferred()
  let mode: Mode = 'complete'
  let activeResponses = 0
  const server = createServer(
    { key: await readFile(join(directory, 'local-key.pem')), cert },
    (req, res) => {
      activeResponses++
      res.once('close', () => {
        activeResponses--
        bodyClosed.resolve()
      })
      const work = (async () => {
        const chunks: Buffer[] = []
        for await (const chunk of req) {
          assert.ok(Buffer.isBuffer(chunk))
          chunks.push(chunk)
        }
        requests.push(JSON.parse(Buffer.concat(chunks).toString('utf8')))
        res.writeHead(200, { 'content-type': 'text/event-stream' })
        res.write(
          sse({
            id: 'refusal-generation',
            model: MODEL,
            provider: 'DeepInfra',
            choices: [{ delta: { refusal: REFUSAL }, finish_reason: null }],
          }),
        )
        contentSent.resolve()
        if (mode === 'hold') return
        if (mode === 'eof') {
          res.end()
          return
        }
        if (mode === 'error') {
          // The unread future usage must not be turned into known accounting.
          // Top-level error also wins over same-frame content/refusal.
          res.end(
            sse({
              error: { code: 503, message: 'controlled upstream failure' },
              choices: [
                { delta: { refusal: 'MUST NOT BE DELIVERED', content: 'MUST NOT BE DELIVERED' } },
              ],
            }) +
              sse({ choices: [], usage: USAGE }) +
              'data: [DONE]\n\n',
          )
          return
        }
        res.end(
          sse({ choices: [{ delta: { content: ' End.' }, finish_reason: null }] }) +
            sse({ choices: [{ delta: {}, finish_reason: 'stop' }] }) +
            sse({ choices: [{ delta: {}, finish_reason: 'stop' }], usage: USAGE }) +
            'data: [DONE]\n\n',
        )
      })()
      pending.add(work)
      work.then(
        () => pending.delete(work),
        error => {
          failures.push(error)
          pending.delete(work)
          res.destroy()
        },
      )
    },
  )
  server.on('secureConnection', socket => socket.once('close', () => socketClosed.resolve()))
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  if (address === null || typeof address === 'string') throw new Error('TLS address missing')
  return {
    requests,
    failures,
    contentSent,
    bodyClosed,
    socketClosed,
    activeResponses: () => activeResponses,
    developmentTransport: {
      baseUrl: `https://127.0.0.1:${address.port}/api/v1/`,
      tls: { ca: cert },
    },
    setMode(value: Mode) {
      mode = value
    },
    async close() {
      server.closeAllConnections()
      await Promise.allSettled([...pending])
      await new Promise<void>((resolve, reject) =>
        server.close(error => (error ? reject(error) : resolve())),
      )
      expect(failures).toEqual([])
    },
  }
}

async function ready(label: string, mode: Mode = 'complete', idleDuration = 'PT120S') {
  const base = await callDeployment(label)
  const config = {
    ...base,
    modelRequest: {
      ...base.modelRequest,
      evaluationInputs: {
        ...base.modelRequest.evaluationInputs,
        async prepare(who: Parameters<typeof publication>[0]) {
          const source = publication(who)
          const root = source.definitions[0]
          const version = root?.versions[0]
          if (root === undefined || version === undefined) throw new Error('root fixture absent')
          const body = rootBody()
          if (!Array.isArray(body.attributes)) throw new Error('root attributes absent')
          return {
            publication: {
              ...source,
              definitions: [
                {
                  ...root,
                  versions: [
                    {
                      ...version,
                      content: {
                        category: 'agent_definition' as const,
                        body: toOpaqueJson({
                          ...body,
                          attributes: body.attributes.map(attribute => {
                            if (
                              attribute === null ||
                              typeof attribute !== 'object' ||
                              Array.isArray(attribute)
                            )
                              throw new Error('root attribute malformed')
                            return attribute.item === 'post_first_token_stall_limit'
                              ? { ...attribute, default: idleDuration }
                              : attribute
                          }),
                        }),
                      },
                    },
                  ],
                },
              ],
            },
            recipe: { rootDefinition: ROOT },
          }
        },
      },
    },
  }
  const tls = await refusalTls(join(dirname(config.databaseFile), 'tls'))
  tls.setMode(mode)
  const app = createAcceptanceApplication(config, {
    stage: 'modelRequest',
    developmentTransport: tls.developmentTransport,
    diagnostics: { record() {} },
  })
  const host = createDemoCallHost()
  let diagnostics: Awaited<ReturnType<typeof activateModelFixture>> | undefined
  try {
    await app.ready
    const who = await actor(app)
    diagnostics = await activateModelFixture(app, who, config)
    const prepared = await app.prepareSession(who, `${label}-session`)
    if (!('session' in prepared)) throw new Error('session unavailable')
    const session = prepared.session
    expect(await app.prepareModelInputs(who, session)).toEqual({ prepared: true })
    expect(await app.selectModel(who, session, MODEL)).toEqual({ selected: MODEL })
    expect(await app.attachModelCallHost(who, session, host)).toEqual({ attached: true })
    expect(
      await app.publishCredential(who, async checked => ({
        account: checked.account,
        tenant: checked.tenant,
        sourceRef: ref(`${label}-key`),
        body: Buffer.from('controlled-refusal-key'),
      })),
    ).toEqual({ stored: true })
    const bound = await app.bindModelRuntime(who, session)
    if (!('service' in bound)) throw new Error('model service unavailable')
    const openedDiagnostics = diagnostics
    return {
      app,
      who,
      session,
      host,
      tls,
      config,
      service: bound.service,
      async closeBusiness() {
        expect(await host.stop()).toEqual({ released: true })
        expect(host.released?.()).toBe(true)
        const closed = await openedDiagnostics.closeAfterBusiness(() => app.close())
        expect(closed.complete).toBe(true)
      },
      async close() {
        await host.stop()
        await openedDiagnostics.closeAfterBusiness(() => app.close())
        await tls.close()
      },
    }
  } catch (error) {
    await host.stop()
    if (diagnostics) await diagnostics.closeAfterBusiness(() => app.close())
    else await app.close()
    await tls.close()
    throw error
  }
}

function send(f: Awaited<ReturnType<typeof ready>>, id: string) {
  return f.app.startServiceCall(f.who, f.session, {
    user: user(id),
    parameters: { reasoningEffort: 'low', maxOutputTokens: 1024 },
    host: f.host.host,
  })
}

describe('D108 refusal real service persistence and stopping', () => {
  it('RF-V3/V9 commits opened before visibility and replays exact persisted refusal after close/reopen', async () => {
    const f = await ready('refusal-reopen')
    let observer: Awaited<ReturnType<typeof f.app.openModelObserver>> | undefined
    try {
      const gateChecks: boolean[] = []
      observer = await f.app.openModelObserver(f.who, f.session, undefined, async serialized => {
        if (!serialized.includes('"t":"fill"')) return
        const log = await f.app.readSessionLog(f.who, f.session)
        gateChecks.push(
          'entries' in log &&
            log.entries.some(entry =>
              entry.readKeys.some(key => {
                const decoded = decodeModelLogKey(key)
                return 'ok' in decoded && decoded.ok.kind === 'opened'
              }),
            ),
        )
      })
      if (!('endpoint' in observer)) throw new Error('real observer unavailable')
      const first = await f.app.startServiceCall(f.who, f.session, {
        user: user('refusal-first'),
        parameters: { reasoningEffort: 'low', maxOutputTokens: 1024 },
        host: f.host.host,
        observer: {
          session: f.session,
          endpoint: observer.endpoint,
          observer_max_buffered_events: 64,
          observer_max_buffered_bytes: 65536,
        },
      })
      if (!('result' in first) || !('replyPending' in first.result))
        throw new Error(`refusal did not hand off: ${JSON.stringify(first)}`)
      const response = first.result.replyPending
      expect(response.outcome).toBe('complete')
      expect(response.reply.ending).toBe('complete')
      expect(response.reply.blocks).toHaveLength(1)
      expect(response.reply.blocks[0]).toMatchObject({
        kind: 'text',
        text: REFUSAL + ' End.',
        visibility: { toHuman: true, toModel: true },
      })
      expect(response.reply.blocks[0]).not.toHaveProperty('origin')
      expect(response.timing.firstTokenAt).toBeDefined()
      expect(response.usage).toMatchObject({
        output_tokens: 3,
        cache_read_tokens: 4,
        cache_write_tokens: 0,
        source: 'upstream',
      })
      if (response.usage.input_tokens === 'unknown') throw new Error('actual input usage missing')
      expect(ExactDecimal.from(response.usage.input_tokens).compare(ExactDecimal.from(5))).toBe(0)
      await expect.poll(() => gateChecks.length).toBeGreaterThan(0)
      expect(gateChecks.every(Boolean)).toBe(true)
      const persisted = await f.app.persistModelReply(f.who, f.session, response)
      if (!('settled' in persisted) || persisted.settled.response.response === undefined)
        throw new Error('persisted response unavailable')
      expect(persisted.settled.response.response).not.toHaveProperty('raw.body')
      const durable = await f.app.readSessionLog(f.who, f.session)
      if (!('entries' in durable)) throw new Error('durable log unavailable')
      expect(JSON.stringify(durable.entries)).toContain(REFUSAL.replaceAll('\n', '\\n'))
      expect(await f.host.stop()).toEqual({ released: true })
      const grant = observer
      // Revocation is a stop request; actual receiver removal follows stopped.
      await expect.poll(() => grant.revoke()).toEqual({ released: true })
      observer = undefined
      await f.closeBusiness()
      const reopened = createAcceptanceApplication(f.config, {
        stage: 'modelRequest',
        developmentTransport: f.tls.developmentTransport,
        diagnostics: { record() {} },
      })
      const nextHost = createDemoCallHost()
      let nextDiagnostics: Awaited<ReturnType<typeof activateModelFixture>> | undefined
      try {
        await reopened.ready
        const who = await reopened.authenticate('alice', PASSWORD)
        if (!('account' in who)) throw new Error('reopen authentication failed')
        nextDiagnostics = await activateModelFixture(reopened, who, f.config)
        expect(await reopened.readSessionLog(who, f.session)).toEqual(durable)
        expect(await reopened.attachModelCallHost(who, f.session, nextHost)).toEqual({
          attached: true,
        })
        const next = await reopened.startServiceCall(who, f.session, {
          user: user('refusal-next'),
          parameters: { reasoningEffort: 'low', maxOutputTokens: 1024 },
          host: nextHost.host,
        })
        if (!('result' in next) || !('replyPending' in next.result))
          throw new Error(`next round refused: ${JSON.stringify(next)}`)
        expect(f.tls.requests).toHaveLength(2)
        expect(f.tls.requests[1]).toMatchObject({
          messages: [
            { role: 'user' },
            { role: 'assistant', content: REFUSAL + ' End.' },
            { role: 'user' },
          ],
        })
        expect(
          await reopened.persistModelReply(who, f.session, next.result.replyPending),
        ).toHaveProperty('settled')
      } finally {
        expect(await nextHost.stop()).toEqual({ released: true })
        const closed = nextDiagnostics
          ? await nextDiagnostics.closeAfterBusiness(() => reopened.close())
          : await reopened.close()
        expect(closed.complete).toBe(true)
      }
    } finally {
      if (observer && 'revoke' in observer) await observer.revoke()
      await f.close()
    }
  })

  it.each(['error', 'eof'] as const)(
    'RF-V3/V5 %s retains delivered refusal, forbids same-call retry and excludes it from next history',
    async mode => {
      const f = await ready(`refusal-${mode}`, mode)
      try {
        const sent = await send(f, 'failed-refusal')
        if (!('callId' in sent) || !('result' in sent) || !('settled' in sent.result))
          throw new Error(`failure did not settle: ${JSON.stringify(sent)}`)
        expect(sent.result.settled).toMatchObject({
          outcome: 'failed',
          failure: { cause: 'interrupted_mid_reply' },
          delivered: [{ kind: 'text', text: REFUSAL }],
        })
        expect(sent.result.settled).not.toHaveProperty('reply')
        expect(sent.result.settled.timing.firstTokenAt).toBeDefined()
        expect(sent.result.settled.usage).toMatchObject({
          input_tokens: 'unknown',
          output_tokens: 'unknown',
          source: 'none',
        })
        expect(sent.result.settled.cost).toEqual({ cost_usd: 'unknown', source: 'none' })
        if (mode === 'error')
          expect(sent.result.settled.failure).toMatchObject({ statusCode: 503, inBand: true })
        expect(JSON.stringify(sent.result.settled)).not.toContain('MUST NOT BE DELIVERED')
        expect(
          await f.service.dispatchAgain({
            session: f.session,
            callId: sent.callId,
            plan: { provider: 'deepinfra/fp8' },
          }),
        ).toEqual({ retryRefused: { why: 'already_spoke' } })
        expect(f.tls.requests).toHaveLength(1)
        const log = await f.app.readSessionLog(f.who, f.session)
        if (!('entries' in log)) throw new Error('durable failure unavailable')
        const responses = log.entries.filter(entry =>
          entry.readKeys.some(key => {
            const decoded = decodeModelLogKey(key)
            return 'ok' in decoded && decoded.ok.kind === 'response'
          }),
        )
        expect(responses).toHaveLength(1)
        expect(JSON.stringify(responses)).toContain(REFUSAL.replaceAll('\n', '\\n'))
        f.tls.setMode('complete')
        const next = await send(f, 'after-failure')
        if (!('result' in next) || !('replyPending' in next.result))
          throw new Error(`next round refused: ${JSON.stringify(next)}`)
        expect(f.tls.requests).toHaveLength(2)
        expect(JSON.stringify(f.tls.requests[1])).not.toContain(REFUSAL.replaceAll('\n', '\\n'))
        expect(
          await f.app.persistModelReply(f.who, f.session, next.result.replyPending),
        ).toHaveProperty('settled')
      } finally {
        await f.close()
      }
    },
  )

  it('RF-V7 host cancellation stops a never-ending TLS body and durably preserves delivered refusal without reply', async () => {
    const f = await ready('refusal-host-stop', 'hold')
    try {
      const started = send(f, 'held-refusal')
      await f.tls.contentSent.promise
      await expect
        .poll(async () => {
          const log = await f.app.readSessionLog(f.who, f.session)
          return (
            'entries' in log &&
            log.entries.some(entry =>
              entry.readKeys.some(key => {
                const decoded = decodeModelLogKey(key)
                return 'ok' in decoded && decoded.ok.kind === 'opened'
              }),
            )
          )
        })
        .toBe(true)
      expect(await f.host.stop()).toEqual({ released: true })
      await f.tls.bodyClosed.promise
      await f.tls.socketClosed.promise
      expect(f.tls.activeResponses()).toBe(0)
      expect(f.host.released?.()).toBe(true)
      const sent = await started
      if (!('result' in sent) || !('settled' in sent.result))
        throw new Error(`cancel did not settle: ${JSON.stringify(sent)}`)
      expect(sent.result.settled).toMatchObject({
        outcome: 'interrupted',
        initiator: 'run_cancelled',
        delivered: [{ kind: 'text', text: REFUSAL }],
      })
      expect(sent.result.settled).not.toHaveProperty('reply')
      expect(sent.result.settled).not.toHaveProperty('failure')
      expect(f.tls.requests).toHaveLength(1)
    } finally {
      await f.close()
    }
  })

  it('RF-V7 current configured stall deadline stops a never-ending refusal stream without draining or retry', async () => {
    const f = await ready('refusal-stall', 'hold', 'PT0.1S')
    try {
      const sent = await send(f, 'stalled-refusal')
      await f.tls.bodyClosed.promise
      await f.tls.socketClosed.promise
      expect(f.tls.activeResponses()).toBe(0)
      if (!('result' in sent) || !('settled' in sent.result))
        throw new Error(`timeout did not settle: ${JSON.stringify(sent)}`)
      expect(sent.result.settled).toMatchObject({
        outcome: 'failed',
        failure: { cause: 'interrupted_mid_reply' },
        delivered: [{ kind: 'text', text: REFUSAL }],
      })
      expect(sent.result.settled).not.toHaveProperty('reply')
      expect(sent.result.settled.cost).toEqual({ cost_usd: 'unknown', source: 'none' })
      expect(f.tls.requests).toHaveLength(1)
      expect(await f.host.stop()).toEqual({ released: true })
      expect(f.host.released?.()).toBe(true)
    } finally {
      await f.close()
    }
  })

  it('RF-V3 public invoke rejects a refusal first-content gate without publishing a fill or first token', async () => {
    const config = await callDeployment('refusal-public-gate')
    const tls = await refusalTls(join(dirname(config.databaseFile), 'tls'))
    tls.setMode('hold')
    const transport = createPiAiTransport({
      ...tls.developmentTransport,
      policy: config.modelRequest.transport.policy,
      definitions: config.modelRequest.transport.definitions,
      inputMeters: config.modelRequest.transport.inputMeters,
    })
    let gates = 0
    const fills: unknown[] = []
    try {
      const definition = deepseekV4Pro0813Definition
      const handle = invokeModel({
        calibration: { kind: 'none', reason: 'no_observation' },
        outputHistory: [],
        tokenMargin: { multiplier: 1.1, reserveTokens: 256 },
        target: {
          kind: 'model_call',
          callId: unwrap(parseOpaqueIdentifier('refusal-public-call', 'ModelCallId')),
          dispatch: 1,
        },
        messages: [user('refusal-gate')],
        tools: [],
        routeName: MODEL,
        provider: 'deepinfra/fp8',
        parameters: { reasoningEffort: 'low', maxOutputTokens: 1024 },
        snapshot: {
          ...definition.capabilities,
          providers: ['deepinfra/fp8'],
          allowFallback: false,
          updatedAt: AT,
          adaptation: {
            implementation: definition.implementation,
            definition: { modelId: definition.modelId, revision: definition.revision },
            configuration: deepseekV4Pro0813Configuration,
          },
        },
        transport,
        credential: 'controlled-refusal-key',
        signal: new AbortController().signal,
        policy: { ...config.modelRequest.invocation, diagnostic() {} },
        async beforeFirstContent() {
          gates++
          throw new Error('controlled gate rejection')
        },
        onAccepted(event) {
          if (event.t === 'fill') fills.push(event)
        },
      })
      const result = await handle.outcome
      if (!('outcome' in result))
        throw new Error(`public invoke refused before send: ${JSON.stringify(result)}`)
      expect(result).toMatchObject({
        outcome: 'failed',
        failure: { cause: 'unrecognized', localError: 'before_first_content' },
        blocks: [],
      })
      expect(gates).toBe(1)
      expect(fills).toEqual([])
      expect(result.timing.firstTokenAt).toBeUndefined()
      expect(handle.snapshot().firstContentAt).toBeUndefined()
      expect(
        handle.snapshot().blocks.every(block => !block.closed && block.content === undefined),
      ).toBe(true)
      await tls.bodyClosed.promise
      await tls.socketClosed.promise
      expect(tls.activeResponses()).toBe(0)
      expect(tls.requests).toHaveLength(1)
    } finally {
      await transport.close()
      await tls.close()
    }
  })
})
