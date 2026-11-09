// @module-tag slow
// 慢：本进程装发行树（真实 SQLite），每条命令起一个 `omne` 子进程，模型走本进程的本地网关，页面来自本地 HTTP 夹具。
// 先构建 `apps/cli`。Web 元工具在发行树上端到端（web-meta-tool 切片 02）：coding 会话发给模型的工具声明含 Web；脚本化模型
// 先调 `Web().fetch` 取本地夹具页，Markdown 正文回到会话历史；再调 `Web().search`，本切片没有凭据保管，结果是
// `unconfigured` 失败；模型给出最终回复，Run 以 completed 结束，停服退出码 0。不访问外网。
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { setTimeout as sleep } from 'node:timers/promises'
import { describe, expect, it } from 'vitest'
import * as cordis from '../../../src/cordis.ts'
import { runServe, type S0Record } from '../../../src/run.ts'
import { startModelGateway, type GatewayScript } from '../../fixtures/model-gateway.ts'
import { PAGE_BODY_MARKER, PAGE_TITLE_MARKER, startWebPages } from '../../fixtures/web-pages.ts'
import { SESSION_PATH } from '../../r9/flow.ts'
import {
  bodyOf,
  freePort,
  newScratch,
  operatorLayer,
  runOmne,
  savedLoginProof,
  savedTenant,
} from '../../r9/support.ts'
import { connectable, until } from '../server-entry/support.ts'

const release: unknown = JSON.parse(
  readFileSync(new URL('../../../config/serve.distribution.json', import.meta.url), 'utf8'),
)

const FINAL = 'MARKER-web-delivery-final'

const sse = (events: readonly unknown[]): string =>
  `${events.map(event => `data: ${JSON.stringify(event)}\n\n`).join('')}data: [DONE]\n\n`

const serving = (body: string) => ({
  model: (JSON.parse(body) as { model?: string }).model ?? 'unknown',
  provider: 'OpenAI',
})

type Call = Readonly<{ id: string; arguments: string }>

/** Request n answers the n-th scripted Web call; after the last call, the final text. */
const webCallsThenText =
  (calls: readonly Call[], seen: string[]): GatewayScript =>
  ({ index, body }) => {
    seen.push(body)
    const call = calls[index]
    return {
      status: 200,
      contentType: 'text/event-stream',
      body: sse(
        call !== undefined
          ? [
              {
                ...serving(body),
                choices: [
                  {
                    delta: {
                      tool_calls: [
                        {
                          index: 0,
                          id: call.id,
                          type: 'function',
                          function: { name: 'Web', arguments: call.arguments },
                        },
                      ],
                    },
                  },
                ],
              },
              { choices: [{ delta: {}, finish_reason: 'tool_calls' }] },
            ]
          : [
              { ...serving(body), choices: [{ delta: { content: FINAL } }] },
              { choices: [{ delta: {}, finish_reason: 'stop' }] },
            ],
      ),
    }
  }

/** The operator layer with `read-history` listing the tool results and the Run boundaries too. */
function withHistoryKinds(layer: unknown): unknown {
  const { ops } = layer as { ops: Readonly<{ kind: string; id: string; config?: object }>[] }
  return {
    ops: ops.map(op =>
      op.id === 'server-entry'
        ? {
            ...op,
            config: {
              ...op.config,
              historyKinds: [
                'message.user',
                'message.assistant',
                'message.tool',
                'run.started',
                'run.terminal',
              ],
            },
          }
        : op,
    ),
  }
}

async function post(port: number, body: unknown): Promise<{ status: number; body: string }> {
  const response = await fetch(`http://127.0.0.1:${String(port)}${SESSION_PATH}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  return { status: response.status, body: await response.text() }
}

const readHistory = (tenant: string, session: string, loginProof: string) => ({
  protocolVersion: 'session-public/1',
  messageId: 'web-delivery-read-history',
  operation: 'read-history',
  body: { tenant, session, cursor: null, direction: 'forward', pageBytes: '262144' },
  loginProof,
})

type Entry = Readonly<{ kind: string; payload: Record<string, unknown> }>
const entriesOf = (body: string): readonly Entry[] =>
  (JSON.parse(body) as { body: { entries: Entry[] } }).body.entries
const blocksOf = (entry: Entry | undefined): readonly Record<string, unknown>[] =>
  ((entry?.payload['message'] as { blocks?: Record<string, unknown>[] } | undefined)?.blocks ??
    []) as readonly Record<string, unknown>[]
/** The text blocks of a tool message entry after its result marker, joined. */
const resultText = (entry: Entry | undefined): string =>
  blocksOf(entry)
    .slice(1)
    .map(block => String(block['text'] ?? ''))
    .join('')

/** One turn on the release tree with the scripted Web calls; returns the history and the model requests. */
async function turnOnRelease(calls: readonly Call[]) {
  const seen: string[] = []
  const dir = newScratch('web-delivery-')
  const port = await freePort()
  const home = join(dir.base, 'home')
  const controller = new AbortController()
  const records: S0Record[] = []
  const stderr: string[] = []
  const gateway = await startModelGateway(webCallsThenText(calls, seen))
  gateway.trustInProcess()
  const finished = runServe({
    distribution: release,
    operator: withHistoryKinds(
      operatorLayer({ storageRoot: dir.storageRoot, port, modelRoute: gateway.url }),
    ),
    plugins: { ...cordis },
    stateRoot: dir.stateRoot,
    stop: controller.signal,
    readinessTimeoutMs: 15_000,
    shutdownDeadlineMs: 5000,
    write: record => records.push(record),
    stderr: line => stderr.push(line),
  })
  let stopped = false
  try {
    await until(() => connectable('127.0.0.1', port), 'the server to listen', 20_000)
    const cli = (args: readonly string[], credential?: string) =>
      runOmne({
        args: [...args],
        home,
        server: `http://127.0.0.1:${String(port)}`,
        cwd: dir.base,
        ...(credential === undefined ? {} : { credential }),
      })
    const credential = 'erin-pw-web02-7c3e'
    expect((await cli(['register', '--login-identifier', 'erin'], credential)).status).toBe(0)
    expect((await cli(['login', '--login-identifier', 'erin'], credential)).status).toBe(0)
    const created = await cli(['create-session', '--definition', 'coding'])
    expect(created.status, created.stderr).toBe(0)
    const session = String(bodyOf(created)['session'])
    const sent = await cli(['send-input', '--session', session, '--text', 'read the fixture page'])
    expect(sent.status, sent.stderr).toBe(0)
    const request = readHistory(savedTenant(home), session, savedLoginProof(home))
    let history = await post(port, request)
    for (
      const end = Date.now() + 120_000;
      Date.now() < end &&
      !(history.status === 200 && entriesOf(history.body).some(e => e.kind === 'run.terminal'));
      await sleep(500)
    )
      history = await post(port, request)
    expect(history.status, history.body).toBe(200)
    controller.abort('test: stop')
    stopped = true
    const result = await finished
    const unsettled = records.filter(record => record.kind === 'shutdown-result')
    expect(result.exitCode, JSON.stringify(unsettled)).toBe(0)
    return { entries: entriesOf(history.body), seen }
  } finally {
    if (!stopped) controller.abort('test: stop')
    await finished.catch(() => undefined)
    await gateway.close()
    dir.remove()
  }
}

describe('the Web meta tool on the release tree (web-meta-tool slice 02)', () => {
  it(
    'the model sees Web, fetch returns the local page as Markdown, search is unconfigured, and the Run completes',
    { timeout: 240_000 },
    async () => {
      const pages = await startWebPages()
      try {
        const { entries, seen } = await turnOnRelease([
          {
            id: 'call_web_fetch',
            arguments: JSON.stringify({ command: 'fetch', params: { url: pages.pageUrl } }),
          },
          {
            id: 'call_web_search',
            arguments: JSON.stringify({ command: 'search', params: { query: 'omne harness' } }),
          },
        ])
        // The declaration the model reads names Web among the tools of the coding session.
        expect(seen.length).toBe(3)
        expect(seen[0]).toContain('"name":"Web"')
        expect(entries.map(entry => entry.kind)).toEqual([
          'message.user',
          'run.started',
          'message.assistant',
          'message.tool',
          'message.assistant',
          'message.tool',
          'message.assistant',
          'run.terminal',
        ])
        expect(blocksOf(entries[2])).toMatchObject([{ kind: 'tool_call', name: 'Web' }])
        expect(blocksOf(entries[3])[0]).toMatchObject({
          kind: 'tool_result',
          callId: 'call_web_fetch',
        })
        const fetched = resultText(entries[3])
        expect(
          fetched.startsWith(
            `done Web fetch url=${pages.pageUrl} media_type=text/html truncated=false\n`,
          ),
        ).toBe(true)
        expect(fetched).toContain(`# ${PAGE_TITLE_MARKER}`)
        expect(fetched).toContain(PAGE_BODY_MARKER)
        expect(fetched).toContain('[external data begins')
        expect(fetched).not.toContain('alert(')
        // The page server saw one GET for the one fetch.
        expect(pages.requests()).toEqual(['GET'])
        // The second model request carries the fetched Markdown back to the model.
        expect(seen[1]).toContain(PAGE_BODY_MARKER)
        expect(blocksOf(entries[5])[0]).toMatchObject({
          kind: 'tool_result',
          callId: 'call_web_search',
        })
        const searched = resultText(entries[5])
        expect(searched.startsWith('unconfigured reason=')).toBe(true)
        expect(searched).toContain('exa.apiKey')
        expect(blocksOf(entries[6])).toMatchObject([{ kind: 'text', text: FINAL }])
        expect(entries[7]?.payload['terminal']).toMatchObject({ outcome: 'completed' })
      } finally {
        await pages.close()
      }
    },
  )
})
