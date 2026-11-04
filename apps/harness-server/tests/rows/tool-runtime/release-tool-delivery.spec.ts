// @module-tag slow
// 慢：本进程装发行树（真实 SQLite），每条命令起一个 `omne` 子进程，模型走本进程的本地网关。先构建 `apps/cli`。
// 发行树上一次工具调用的结果交回 Agent（R2-D272 第二十层）：模型先答一个调用 Shell 的 info 命令，再答文字。工具执行完，
// Tool 宿主按受理时冻结的 consumer owner（`@omne-harness/agent`）找结果接收方推送，接收方把结果写进会话日志，Agent
// 从 T0 醒来，结果进历史，模型给出最终回复，Run 以 completed 结束，停服退出码 0。
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { setTimeout as sleep } from 'node:timers/promises'
import { describe, expect, it } from 'vitest'
import * as cordis from '../../../src/cordis.ts'
import { runServe, type S0Record } from '../../../src/run.ts'
import { startModelGateway, type GatewayScript } from '../../fixtures/model-gateway.ts'
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

const FINAL = 'MARKER-tool-delivery-final'

const sse = (events: readonly unknown[]): string =>
  `${events.map(event => `data: ${JSON.stringify(event)}\n\n`).join('')}data: [DONE]\n\n`

const serving = (body: string) => ({
  model: (JSON.parse(body) as { model?: string }).model ?? 'unknown',
  provider: 'OpenAI',
})

/** First request: one call of the release Shell, naming its `info` command. Every later request: the final text. */
const toolThenText: GatewayScript = ({ index, body }) => ({
  status: 200,
  contentType: 'text/event-stream',
  body: sse(
    index === 0
      ? [
          {
            ...serving(body),
            choices: [
              {
                delta: {
                  tool_calls: [
                    {
                      index: 0,
                      id: 'call_deliver',
                      type: 'function',
                      function: { name: 'Shell', arguments: '{"command":"info","params":{}}' },
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
})

/** The operator layer with `read-history` listing the tool result and the Run boundaries too. */
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
  messageId: 'tool-delivery-read-history',
  operation: 'read-history',
  body: { tenant, session, cursor: null, direction: 'forward', pageBytes: '262144' },
  loginProof,
})

type Entry = Readonly<{ kind: string; payload: Record<string, unknown> }>

/** The history entries in order. */
const entriesOf = (body: string): readonly Entry[] =>
  (JSON.parse(body) as { body: { entries: Entry[] } }).body.entries

/** The blocks of a message entry. */
const blocksOf = (entry: Entry | undefined): readonly Record<string, unknown>[] =>
  ((entry?.payload['message'] as { blocks?: Record<string, unknown>[] } | undefined)?.blocks ??
    []) as readonly Record<string, unknown>[]

describe('a Tool result on the release tree reaches the Agent (R2-D272)', () => {
  it(
    'Shell info runs, its result and the final reply enter the history, the Run completes and the stop settles',
    { timeout: 240_000 },
    async () => {
      const dir = newScratch('tool-delivery-')
      const port = await freePort()
      const home = join(dir.base, 'home')
      const controller = new AbortController()
      const records: S0Record[] = []
      const stderr: string[] = []
      const gateway = await startModelGateway(toolThenText)
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
        const credential = 'erin-pw-R2D272-5d1a'
        expect((await cli(['register', '--login-identifier', 'erin'], credential)).status).toBe(0)
        expect((await cli(['login', '--login-identifier', 'erin'], credential)).status).toBe(0)
        const created = await cli(['create-session', '--definition', 'coding'])
        expect(created.status, created.stderr).toBe(0)
        const session = String(bodyOf(created)['session'])
        const sent = await cli(['send-input', '--session', session, '--text', 'list your files'])
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
        const entries = entriesOf(history.body)
        const kinds = entries.map(entry => entry.kind)
        // The tool call, its result, the final reply after it, then the end of the Run.
        expect(kinds).toEqual([
          'message.user',
          'run.started',
          'message.assistant',
          'message.tool',
          'message.assistant',
          'run.terminal',
        ])
        expect(gateway.requests()).toBe(2)
        expect(blocksOf(entries[2])).toMatchObject([{ kind: 'tool_call', name: 'Shell' }])
        expect(blocksOf(entries[3])[0]).toMatchObject({
          kind: 'tool_result',
          callId: 'call_deliver',
        })
        expect(blocksOf(entries[4])).toMatchObject([{ kind: 'text', text: FINAL }])
        expect(entries[5]?.payload['terminal']).toMatchObject({ outcome: 'completed' })
        controller.abort('test: stop')
        stopped = true
        const result = await finished
        const unsettled = records.filter(record => record.kind === 'shutdown-result')
        expect(result.exitCode, JSON.stringify(unsettled)).toBe(0)
      } finally {
        if (!stopped) controller.abort('test: stop')
        await finished.catch(() => undefined)
        await gateway.close()
        dir.remove()
      }
    },
  )
})
