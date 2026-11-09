import { largeBodyRelease, adoptLargeBody } from './large-body-release.ts'
import { largeBodyModel } from './large-body-model.ts'
import { LARGE_TOOL } from './large-body-author.ts'
import { writerBodyAuthor, WRITER_BODY, WRITER_SUMMARY } from './writer-body-author.ts'
import { structuredBodyAuthor } from './structured-body-author.ts'
import { observeToolResults, resultsReleased } from './release-material-observation.ts'
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
  toolRowsOperatorConfig,
} from '../../r9/support.ts'
import { connectable, until } from '../server-entry/support.ts'
import { bodyReadingModel } from './body-reading-model.ts'
import { toolRuntimeConfigSchema } from '../../../src/rows/tool-runtime/config.ts'

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

type Call = Readonly<{ id: string; arguments: string; name?: string }>

/**
 * First request: the given calls of the release Shell. Every later request: the final text. The
 * request bodies are kept in `seen`, so a test reads what the model was sent.
 */
const toolsThenText =
  (calls: readonly Call[], seen: string[] = []): GatewayScript =>
  ({ index, body }) => {
    seen.push(body)
    return {
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
                      tool_calls: calls.map((call, position) => ({
                        index: position,
                        id: call.id,
                        type: 'function',
                        function: { name: call.name ?? 'Shell', arguments: call.arguments },
                      })),
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

/** The operator layer with `read-history` listing the tool result and the Run boundaries too. */
function withHistoryKinds(
  layer: unknown,
  construction?: ReturnType<typeof toolRowsOperatorConfig>['construction'],
  maxInlineUtf8Bytes?: number,
): unknown {
  const { ops } = layer as { ops: Readonly<{ kind: string; id: string; config?: object }>[] }
  return {
    ops: ops.map(op =>
      op.id === 'tool-records' && maxInlineUtf8Bytes !== undefined
        ? (() => {
            const config = toolRuntimeConfigSchema.parse(op.config)
            return {
              ...op,
              config: {
                ...config,
                configuration: {
                  ...config.configuration,
                  offloading: { ...config.configuration.offloading, maxInlineUtf8Bytes },
                },
              },
            }
          })()
        : op.id === 'tool-host' && construction !== undefined
          ? { ...op, config: { construction } }
          : op.id === 'server-entry'
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

async function allHistory(port: number, request: ReturnType<typeof readHistory>) {
  let page = await post(port, request)
  const entries: Entry[] = []
  const cursors = new Set<string>()
  for (;;) {
    if (page.status === 503) return page
    expect(page.status, page.body).toBe(200)
    const value = JSON.parse(page.body) as { body: { entries: Entry[]; next: string | null } }
    entries.push(...value.body.entries)
    const cursor = value.body.next
    if (cursor === null) return { status: page.status, body: JSON.stringify({ body: { entries } }) }
    expect(cursors.has(cursor), 'history cursor must advance').toBe(false)
    cursors.add(cursor)
    expect(cursors.size).toBeLessThan(128)
    page = await post(port, {
      ...request,
      body: { tenant: request.body.tenant, session: request.body.session, cursor },
    })
  }
}

/** The blocks of a message entry. */
const blocksOf = (entry: Entry | undefined): readonly Record<string, unknown>[] =>
  ((entry?.payload['message'] as { blocks?: Record<string, unknown>[] } | undefined)?.blocks ??
    []) as readonly Record<string, unknown>[]

/**
 * Runs one turn on the release tree with the gateway `script`: register, log in, create a coding
 * session, send one input and read the history until the Run ends, then stop the server.
 */
async function turnOnRelease(
  script: GatewayScript,
  shellResultMaxBytes?: number,
  extension?: ReturnType<typeof largeBodyRelease>,
  checkRelease: 'inline' | 'offloaded' | null = null,
  reopenLimit?: number,
) {
  const dir = newScratch('tool-delivery-')
  const port = await freePort()
  const home = join(dir.base, 'home')
  let controller = new AbortController()
  const records: S0Record[] = []
  const stderr: string[] = []
  const gateway = await startModelGateway(script)
  gateway.trustInProcess()
  const { construction } = toolRowsOperatorConfig({ storageRoot: dir.storageRoot })
  const start = (maxInlineUtf8Bytes?: number) =>
    runServe({
      distribution: extension === undefined ? release : adoptLargeBody(release),
      operator: withHistoryKinds(
        operatorLayer({ storageRoot: dir.storageRoot, port, modelRoute: gateway.url }),
        shellResultMaxBytes === undefined
          ? undefined
          : {
              ...construction,
              Shell: { ...construction.Shell, resultMaxBytes: shellResultMaxBytes },
            },
        maxInlineUtf8Bytes,
      ),
      plugins: {
        ...cordis,
        ...(extension === undefined ? {} : { toolHostRow: extension.toolHostRow }),
      },
      ...(extension === undefined ? {} : { entryObjects: extension.entryObjects }),
      stateRoot: dir.stateRoot,
      stop: controller.signal,
      readinessTimeoutMs: 15_000,
      shutdownDeadlineMs: 5000,
      write: record => records.push(record),
      stderr: line => stderr.push(line),
    })
  let finished = start()
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
    let history = await allHistory(port, request)
    for (
      const end = Date.now() + 120_000;
      Date.now() < end &&
      !(history.status === 200 && entriesOf(history.body).some(e => e.kind === 'run.terminal'));
      await sleep(500)
    )
      history = await allHistory(port, request)
    expect(history.status, history.body).toBe(200)
    if (!entriesOf(history.body).some(entry => entry.kind === 'run.terminal')) {
      const diagnostics = await cli(['read-session-diagnostics', '--session', session])
      throw new Error(
        `the Run must reach a terminal before shutdown; model requests=${gateway.requests()}; diagnostics=${JSON.stringify(diagnostics)}`,
      )
    }
    const modelRequests = gateway.requests()
    if (checkRelease !== null) {
      // C6: once the Agent durably took the result, the record keeps the summary, not the values.
      const offloaded = checkRelease === 'offloaded' ? 1 : 0
      let physical = observeToolResults(dir.storageRoot)
      for (
        const end = Date.now() + 15_000;
        !resultsReleased(physical, offloaded) && Date.now() < end;
        await sleep(100)
      )
        physical = observeToolResults(dir.storageRoot)
      expect(resultsReleased(physical, offloaded), JSON.stringify(physical)).toBe(true)
      console.info('W3-RELEASE', JSON.stringify(physical))
      const reread = await allHistory(port, request)
      expect(reread.status).toBe(200)
      expect(entriesOf(reread.body)).toEqual(entriesOf(history.body))
      // One history entry per released result: the Agent keeps its copy, the Tool keeps the summary.
      expect(entriesOf(reread.body).filter(entry => entry.kind === 'message.tool')).toHaveLength(
        physical.length,
      )
    }
    controller.abort('test: stop')
    stopped = true
    const result = await finished
    const unsettled = records.filter(record => record.kind === 'shutdown-result')
    expect(result.exitCode, JSON.stringify(unsettled)).toBe(0)
    let reopenedEntries: Entry[] | null = null
    if (reopenLimit !== undefined) {
      controller = new AbortController()
      stopped = false
      finished = start(reopenLimit)
      await until(() => connectable('127.0.0.1', port), 'the reopened server to listen', 20_000)
      const next = await cli([
        'send-input',
        '--session',
        session,
        '--text',
        'continue from the saved result',
      ])
      expect(next.status, next.stderr).toBe(0)
      let reread = await allHistory(port, request)
      for (
        const end = Date.now() + 120_000;
        Date.now() < end &&
        entriesOf(reread.body).filter(entry => entry.kind === 'run.terminal').length < 2;
        await sleep(500)
      )
        reread = await allHistory(port, request)
      expect(reread.status, reread.body).toBe(200)
      reopenedEntries = [...entriesOf(reread.body)]
      expect(reopenedEntries.filter(entry => entry.kind === 'run.terminal')).toHaveLength(2)
      expect(reopenedEntries.slice(0, entriesOf(history.body).length)).toEqual(
        entriesOf(history.body),
      )
      expect(gateway.requests()).toBe(modelRequests)
      controller.abort('test: stop reopened server')
      stopped = true
      expect((await finished).exitCode).toBe(0)
    }
    return {
      entries: entriesOf(history.body),
      reopenedEntries,
      modelRequests,
      logs: records.filter(
        record => record.kind === 'telemetry' && 'level' in record && record.level === 'warn',
      ),
    }
  } catch (cause) {
    const logs = records.filter(
      record => record.kind === 'telemetry' && 'signal' in record && record.signal === 'log',
    )
    const lifecycle = records.filter(record => record.kind !== 'telemetry')
    throw new Error(
      `release turn failed: ${JSON.stringify({ logs: logs.slice(0, 20), lifecycle: lifecycle.slice(-10), stderr: stderr.slice(-10) })}`,
      { cause },
    )
  } finally {
    if (!stopped) controller.abort('test: stop')
    await finished.catch(() => undefined)
    await gateway.close()
    dir.remove()
  }
}

/** The text blocks of a tool message entry after its result marker, joined. */
const resultText = (entry: Entry | undefined): string =>
  blocksOf(entry)
    .slice(1)
    .map(block => String(block['text'] ?? ''))
    .join('')

describe('a Tool result on the release tree reaches the Agent (R2-D272)', () => {
  it.each(
    (['json-document', 'json-lines'] as const).flatMap(format =>
      (['direct-small', 'direct-large'] as const).map(delivery => ({ format, delivery })),
    ),
  )(
    'W3-B direct $delivery $format reaches the production Agent',
    { timeout: 240_000 },
    async ({ format, delivery }) => {
      const author = structuredBodyAuthor(format, true, delivery)
      const large = delivery === 'direct-large'
      if (large) expect(Buffer.byteLength(author.original)).toBeGreaterThan(2048)
      const model = largeBodyModel(FINAL, large, 'completed', large ? undefined : author.original)
      const { entries } = await turnOnRelease(
        model.script,
        undefined,
        largeBodyRelease(author.module),
      )
      expect(model.errors, JSON.stringify(model.replies)).toEqual([])
      expect(model.completed()).toBe(true)
      expect(author.executions()).toBe(1)
      const pages = entries
        .filter(entry => entry.kind === 'message.tool')
        .flatMap(blocksOf)
        .filter(block => block['id'] === 'Tools.body')
      if (large) {
        expect(pages.length).toBeGreaterThan(1)
        expect(pages.map(page => String(page['text'])).join('')).toBe(author.original)
      } else {
        expect(pages).toHaveLength(0)
        expect(model.replies.some(reply => reply.includes(author.original))).toBe(true)
      }
      expect(entries.at(-1)?.payload['terminal']).toMatchObject({ outcome: 'completed' })
    },
  )

  it.each(['json-document', 'json-lines'] as const)(
    'W3-B direct small invalid %s becomes a failed Tool result',
    { timeout: 240_000 },
    async format => {
      const author = structuredBodyAuthor(format, false, 'direct-small')
      const model = largeBodyModel(FINAL, false, 'failed')
      const { entries } = await turnOnRelease(
        model.script,
        undefined,
        largeBodyRelease(author.module),
      )
      expect(model.errors, JSON.stringify(model.replies)).toEqual([])
      expect(model.completed()).toBe(true)
      expect(author.executions()).toBe(1)
      expect(model.replies.some(reply => /sourceTerminal\s*:\s*failed/.test(reply))).toBe(true)
      expect(entries.at(-1)?.payload['terminal']).toMatchObject({ outcome: 'completed' })
    },
  )

  it.each(['json-document', 'json-lines'] as const)(
    'W3-B rejects a schema-invalid %s body and finishes the production Agent run',
    { timeout: 240_000 },
    async format => {
      const author = structuredBodyAuthor(format, false)
      const model = largeBodyModel(FINAL, false, 'failed')
      const { entries } = await turnOnRelease(
        model.script,
        undefined,
        largeBodyRelease(author.module),
      )
      expect(model.errors, JSON.stringify(model.replies)).toEqual([])
      expect(model.completed()).toBe(true)
      expect(author.executions()).toBe(1)
      expect(model.replies.some(reply => /sourceTerminal\s*:\s*failed/.test(reply))).toBe(true)
      expect(
        entries
          .filter(entry => entry.kind === 'message.tool')
          .flatMap(blocksOf)
          .some(block => block['id'] === 'Tools.body'),
      ).toBe(false)
      expect(entries.at(-1)?.payload['terminal']).toMatchObject({ outcome: 'completed' })
    },
  )

  it.each(['json-document', 'json-lines'] as const)(
    'W3-B reads a schema-validated %s author body through the production Agent',
    { timeout: 240_000 },
    async format => {
      const author = structuredBodyAuthor(format)
      const model = largeBodyModel(FINAL, true)
      const { entries } = await turnOnRelease(
        model.script,
        undefined,
        largeBodyRelease(author.module),
      )
      expect(model.errors, JSON.stringify(model.replies)).toEqual([])
      expect(model.completed()).toBe(true)
      expect(author.executions()).toBe(1)
      const pages = entries
        .filter(entry => entry.kind === 'message.tool')
        .flatMap(entry => blocksOf(entry).filter(block => block['id'] === 'Tools.body'))
      expect(pages.length).toBeGreaterThan(1)
      expect(pages.map(page => String(page['text'])).join('')).toBe(author.original)
      expect(model.replies.some(reply => reply.includes(format))).toBe(true)
      expect(entries.at(-1)?.payload['terminal']).toMatchObject({ outcome: 'completed' })
    },
  )

  it(
    'W3-B writes an author body, drains unawaited writes and reads every page through the release Agent',
    { timeout: 240_000 },
    async () => {
      const author = writerBodyAuthor()
      const model = largeBodyModel(FINAL, true)
      const { entries } = await turnOnRelease(
        model.script,
        undefined,
        largeBodyRelease(author.module),
      )
      expect(model.errors, JSON.stringify(model.replies)).toEqual([])
      expect(model.completed()).toBe(true)
      expect(author.executions()).toBe(1)
      expect(author.pending).toHaveLength(2)
      for (const pending of author.pending) expect(await pending).toHaveProperty('ok')
      expect(model.replies.some(reply => reply.includes(WRITER_SUMMARY))).toBe(true)
      const pages = entries
        .filter(entry => entry.kind === 'message.tool')
        .flatMap(entry => blocksOf(entry).filter(block => block['id'] === 'Tools.body'))
      expect(pages.length).toBeGreaterThan(1)
      expect(pages.map(page => String(page['text'])).join('')).toBe(WRITER_BODY)
      for (const body of model.requests) {
        const request = JSON.parse(body) as { tools: { function: { name: string } }[] }
        expect(request.tools.map(tool => tool.function.name)).not.toContain(LARGE_TOOL)
      }
      expect(entries.at(-1)?.payload['terminal']).toMatchObject({ outcome: 'completed' })
    },
  )

  it(
    'W3-A carries return schemas through native declarations, Tools.inspect and command help into model requests',
    { timeout: 240_000 },
    async () => {
      const seen: string[] = []
      const { entries } = await turnOnRelease(
        toolsThenText(
          [
            {
              id: 'inspect-todo-return',
              name: 'Tools',
              arguments: JSON.stringify({
                command: 'inspect',
                params: { name: 'TodoItems', command: 'add' },
              }),
            },
            {
              id: 'help-todo-return',
              name: 'TodoItems',
              arguments: JSON.stringify({ command: 'help', params: { command: 'add' } }),
            },
          ],
          seen,
        ),
      )
      const first = JSON.parse(seen[0] ?? '') as {
        tools: { function: { name: string; description: string } }[]
      }
      const definition = first.tools.find(tool => tool.function.name === 'TodoItems')
      expect(definition?.function.description).toContain(
        'Returns string (string-output@1). Model body: text. Program data: none.',
      )
      expect(definition?.function.description).not.toContain('Return value schema')
      const second = JSON.parse(seen[1] ?? '') as { messages: { role: string; content: string }[] }
      const replies = second.messages.filter(message => message.role === 'tool')
      expect(replies).toHaveLength(2)
      for (const reply of replies) {
        expect(reply.content).toContain('Return value schema string-output@1')
        expect(reply.content).toContain('{"type":"string"}')
      }
      expect(entries.at(-1)?.payload['terminal']).toMatchObject({ outcome: 'completed' })
    },
  )

  it.skipIf(process.platform !== 'linux')(
    'W3-A refuses old tool history at the current limit after a real release restart',
    { timeout: 300_000 },
    async () => {
      const result = await turnOnRelease(
        toolsThenText([
          {
            id: 'call_old_inline',
            arguments: JSON.stringify({
              command: 'execute',
              params: { script: 'awk \'BEGIN { for(i=0;i<1536;i++) printf "x" }\'' },
            }),
          },
        ]),
        undefined,
        undefined,
        'inline',
        512,
      )
      expect(resultText(result.entries.find(entry => entry.kind === 'message.tool'))).toContain(
        'x'.repeat(1536),
      )
      expect(result.entries.at(-1)?.payload['terminal']).toMatchObject({ outcome: 'completed' })
      expect(result.reopenedEntries?.at(-1)?.payload['terminal']).toMatchObject({
        outcome: 'failed',
      })
      expect(result.reopenedEntries?.filter(entry => entry.kind === 'message.tool')).toHaveLength(1)
    },
  )

  it(
    'W3-A reads the complete offloaded UTF-8 body through callable Tools pages',
    { timeout: 240_000 },
    async () => {
      const payload = `W3-BODY-BEGIN\n${'中🙂'.repeat(10_240)}\nW3-BODY-END\n`
      const shell =
        'awk \'BEGIN { printf "W3-BODY-BEGIN\\n"; for(i=0;i<10240;i++) printf "中🙂"; printf "\\nW3-BODY-END\\n" }\''
      const model = bodyReadingModel(shell, FINAL)
      const { entries, modelRequests } = await turnOnRelease(
        model.script,
        131_072,
        undefined,
        'offloaded',
      )
      expect(model.errors).toEqual([])
      expect(model.ended()).toBe(true)
      expect(modelRequests).toBe(model.requests.length)
      expect(modelRequests).toBeLessThanOrEqual(40)
      expect(model.tools[0]).toContain('read_result')
      expect(model.tools[0]).toContain('"reference":"tb1.')
      expect(model.reads.length).toBeGreaterThanOrEqual(2)
      expect(new Set(model.reads.map(read => JSON.stringify(read))).size).toBe(model.reads.length)
      expect(new Set(model.reads.map(read => read.reference)).size).toBe(1)
      const pages = entries
        .filter(entry => entry.kind === 'message.tool')
        .flatMap(entry => blocksOf(entry).filter(block => block['id'] === 'Tools.body'))
      expect(pages.length).toBe(model.reads.length)
      expect(pages.length).toBeGreaterThanOrEqual(2)
      const texts = pages.map(block => {
        expect(block['kind']).toBe('text')
        expect(typeof block['text']).toBe('string')
        const text = String(block['text'])
        expect(text).not.toContain('\uFFFD')
        expect(text.isWellFormed()).toBe(true)
        expect(Buffer.byteLength(text, 'utf8')).toBeLessThanOrEqual(4096)
        return text
      })
      expect(texts.join('')).toContain(payload)
      expect(texts[0]).toContain('W3-BODY-BEGIN')
      expect(texts.at(-1)).toContain('W3-BODY-END')
      expect(model.tools.at(-1)).toContain('Body traversal ended.')
      expect(entries.at(-1)?.payload['terminal']).toMatchObject({ outcome: 'completed' })
      expect(
        entries
          .filter(entry => entry.kind === 'message.assistant')
          .some(entry => blocksOf(entry).some(block => block['text'] === FINAL)),
      ).toBe(true)
    },
  )

  it(
    'W3-A Linux control executes a small Shell command through the same release assembly',
    { timeout: 240_000 },
    async () => {
      const { entries } = await turnOnRelease(
        toolsThenText([
          {
            id: 'call_small_result',
            arguments: JSON.stringify({
              command: 'execute',
              params: { script: "printf 'W3-SMALL-OK\\n'" },
            }),
          },
        ]),
        8 * 1024 * 1024,
        undefined,
        'inline',
      )
      expect(resultText(entries.find(entry => entry.kind === 'message.tool'))).toContain(
        'W3-SMALL-OK',
      )
      expect(entries.at(-1)?.payload['terminal']).toMatchObject({ outcome: 'completed' })
    },
  )

  it(
    'W3-A offloads a five MiB nonresident test author through the real release runtime',
    { timeout: 240_000 },
    async () => {
      const model = largeBodyModel(FINAL)
      const { entries, logs } = await turnOnRelease(model.script, undefined, largeBodyRelease())
      expect(
        model.errors,
        JSON.stringify({ replies: model.replies.map(reply => reply.slice(0, 2000)), logs }),
      ).toEqual([])
      expect(model.completed()).toBe(true)
      const preview = model.replies.at(-1) ?? ''
      expect(preview).toContain('W3-BEGIN')
      expect(preview).toContain('W3-END')
      expect(preview).toContain('"reference":"tb1.')
      expect(Buffer.byteLength(preview)).toBeLessThanOrEqual(65_536)
      for (const request of model.requests) {
        const value = JSON.parse(request) as { tools: { function: { name: string } }[] }
        expect(value.tools.map(tool => tool.function.name)).not.toContain(LARGE_TOOL)
        expect(request).not.toContain('x'.repeat(65_537))
      }
      expect(entries.at(-1)?.payload['terminal']).toMatchObject({ outcome: 'completed' })
    },
  )

  it(
    'W3-A presents a bounded preview for a five MiB Shell result on the release tree',
    { timeout: 240_000 },
    async () => {
      const seen: string[] = []
      const script =
        "printf 'W3-BEGIN\\n'; head -c 5242880 /dev/zero | tr '\\000' 'x'; printf '\\nW3-END\\n'"
      const { entries, modelRequests } = await turnOnRelease(
        toolsThenText(
          [
            {
              id: 'call_large_result',
              arguments: JSON.stringify({ command: 'execute', params: { script } }),
            },
          ],
          seen,
        ),
        8 * 1024 * 1024,
      )
      expect(blocksOf(entries[2])).toMatchObject([
        { kind: 'tool_call', name: 'Shell', callId: 'call_large_result' },
      ])
      const result = entries.find(entry => entry.kind === 'message.tool')
      expect(result, JSON.stringify(entries.map(entry => entry.kind))).toBeDefined()
      const preview = resultText(result)
      expect(preview).toContain('W3-BEGIN')
      expect(preview).toContain('W3-END')
      expect(preview).toContain('read_result')
      expect(Buffer.byteLength(preview, 'utf8')).toBeLessThanOrEqual(65_536)
      expect(seen[1]).not.toContain('x'.repeat(65_537))
      expect(modelRequests).toBe(2)
      expect(entries.at(-1)?.payload['terminal']).toMatchObject({ outcome: 'completed' })
    },
  )

  it(
    'Shell info runs, its result and the final reply enter the history, the Run completes and the stop settles',
    { timeout: 240_000 },
    async () => {
      const { entries, modelRequests } = await turnOnRelease(
        toolsThenText([{ id: 'call_deliver', arguments: '{"command":"info","params":{}}' }]),
      )
      // The tool call, its result, the final reply after it, then the end of the Run.
      expect(entries.map(entry => entry.kind)).toEqual([
        'message.user',
        'run.started',
        'message.assistant',
        'message.tool',
        'message.assistant',
        'run.terminal',
      ])
      expect(modelRequests).toBe(2)
      expect(blocksOf(entries[2])).toMatchObject([{ kind: 'tool_call', name: 'Shell' }])
      expect(blocksOf(entries[3])[0]).toMatchObject({
        kind: 'tool_result',
        callId: 'call_deliver',
      })
      expect(blocksOf(entries[4])).toMatchObject([{ kind: 'text', text: FINAL }])
      expect(entries[5]?.payload['terminal']).toMatchObject({ outcome: 'completed' })
    },
  )

  it(
    'a call that names no command reads the tool guide, a wrong parameter reads the command guide, and the other call runs (D-104)',
    { timeout: 240_000 },
    async () => {
      const seen: string[] = []
      const { entries } = await turnOnRelease(
        toolsThenText(
          [
            { id: 'call_unknown', arguments: '{"command":"nope"}' },
            { id: 'call_missing', arguments: '{"command":"execute","params":{}}' },
            { id: 'call_info', arguments: '{"command":"info","params":{}}' },
          ],
          seen,
        ),
      )
      expect(entries.map(entry => entry.kind)).toEqual([
        'message.user',
        'run.started',
        'message.assistant',
        'message.tool',
        'message.tool',
        'message.tool',
        'message.assistant',
        'run.terminal',
      ])
      // Not run, answered with the reason and the guide of the tool; the batch is not denied.
      const unknown = resultText(entries[3])
      expect(unknown.startsWith('Shell: there is no command "nope".')).toBe(true)
      expect(unknown).toContain('info {} - ')
      // Run, failed with the reason and the guide of the command.
      const missing = resultText(entries[4])
      expect(missing).toContain('Shell execute: ')
      expect(missing).toContain('Usage: Shell {"command": "execute", "params": {script')
      expect(resultText(entries[5])).toContain('shell=')
      expect(entries[7]?.payload['terminal']).toMatchObject({ outcome: 'completed' })
      // The model reads both guides in its next request.
      expect(seen[1]).toContain('there is no command \\"nope\\"')
      expect(seen[1]).toContain('Usage: Shell {\\"command\\": \\"execute\\"')
    },
  )
})
