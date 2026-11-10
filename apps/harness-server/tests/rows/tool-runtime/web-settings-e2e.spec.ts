// @module-tag slow
// 慢：本进程装发行树（真实 SQLite），每条命令起一个 `omne` 子进程，模型走本进程的本地网关，Exa 走本地替身，页面来自本地 HTTP 夹具。
// 先构建 `apps/cli`。Web 的 search 凭据端到端（web-meta-tool 切片 04，spec C2、C4、C5、C6）：`omne setting` 写入、查看、列表、清除
// Web 的 `exa.apiKey`；配了 key 的 coding 会话里 `Web().search` 把这把 key 发给 Exa 替身，结果回到历史；替身的 0 条、401、402、429、500
// 各得到可分辨的结果；两个租户各用自己的 key；Model 的凭据与 Web 的 key 互相取不到；哨兵 key 不出现在数据库、会话日志、服务端诊断、
// CLI 输出与工具结果里，只在保管文件里。哨兵 key 每次运行随机生成，不写死真实 key。不访问外网。
import { randomBytes } from 'node:crypto'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { setTimeout as sleep } from 'node:timers/promises'
import { tenantCodec } from '@omne-harness/legal-identity'
import { MODEL_SEND } from '@omne-harness/model-contract/provider'
import { modelCredentialBindingKey } from '@omne-harness/model-host-local'
import type { SecretText, SettingsHolding } from '@omne-harness/settings'
import type { ToolDefinition } from '@omne-harness/tool-contract'
import { openSecretVault, type SecretVault } from '@omne-harness/settings-local/secrets'
import { deriveDefinition, judgeToolDefinition } from '@omne-harness/tool-contract/provider'
import { describe, expect, it } from 'vitest'
import * as cordis from '../../../src/cordis.ts'
import { loadProductionRelease } from '../../../src/entry/tool-release.ts'
import { governanceOf } from '../../../src/entry/tool-release-manifest.ts'
import { tenantCredentialId } from '../../../src/model/tenant-credential.ts'
import { holdingKey, officialHolding, toolAsset } from '../../../src/assets/official-holdings.ts'
import { EXA_KEY_ITEM } from '../../../src/rows/tool-bindings/web.ts'
import { runServe, type S0Record } from '../../../src/run.ts'
import {
  exaResult,
  exaResults,
  startExaStub,
  type ExaAnswer,
  type ExaStub,
} from '../../fixtures/exa-stub.ts'
import { startModelGateway, type GatewayScript } from '../../fixtures/model-gateway.ts'
import { PAGE_BODY_MARKER, startWebPages, type WebPages } from '../../fixtures/web-pages.ts'
import { SESSION_PATH } from '../../r9/flow.ts'
import {
  bodyOf,
  freePort,
  leaked,
  newScratch,
  operatorLayer,
  runOmne,
  savedLoginProof,
  savedTenant,
  type CliRun,
} from '../../r9/support.ts'
import { TEST_CONSTRUCTION, tree } from '../tool-host/support.ts'
import { connectable, until } from '../server-entry/support.ts'

/** The Settings holding of a release tool definition, or `null` when it declares no settings. */
function toolHolding(definition: ToolDefinition): SettingsHolding | null {
  const held = officialHolding(toolAsset(definition))
  return held.kind === 'declared' ? held.ref.holding : null
}

const release: unknown = JSON.parse(
  readFileSync(new URL('../../../config/serve.distribution.json', import.meta.url), 'utf8'),
)

const FINAL = 'MARKER-web-settings-final'
const VAULT_FILE = 'model-vault.json'
const WEB_ASSET = 'Web'
const RESULT_URL = 'https://results.example.test/MARKER-exa-hit'

/** A sentinel key that no real provider knows: random per run, so a leak cannot be a stale fixture. */
const sentinel = (label: string): string => `exa-${label}-${randomBytes(12).toString('hex')}`

const sse = (events: readonly unknown[]): string =>
  `${events.map(event => `data: ${JSON.stringify(event)}\n\n`).join('')}data: [DONE]\n\n`

const serving = (body: string) => ({
  model: (JSON.parse(body) as { model?: string }).model ?? 'unknown',
  provider: 'OpenAI',
})

type Call = Readonly<{ id: string; arguments: string }>
const searchCall = (id: string, query: string): Call => ({
  id,
  arguments: JSON.stringify({ command: 'search', params: { query } }),
})
const fetchCall = (id: string, url: string): Call => ({
  id,
  arguments: JSON.stringify({ command: 'fetch', params: { url } }),
})

/**
 * The gateway script of every turn: while scripted calls are queued, each request answers the
 * next one as a Web tool call; with the queue empty, the final text. Turns run one at a time.
 */
function queuedCalls(queue: Call[], seen: string[]): GatewayScript {
  return ({ body }) => {
    seen.push(body)
    const call = queue.shift()
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
  messageId: 'web-settings-read-history',
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

type Who = 'alice' | 'bob'

type Turn = Readonly<{
  /** The entries this turn appended to the history. */
  entries: readonly Entry[]
  /** The result texts of the tool messages of this turn, in call order. */
  results: readonly string[]
}>

type Tools = Readonly<{
  cli(who: Who, args: readonly string[], secret?: string): Promise<CliRun>
  /** Registers and logs in `who`; the outputs join the scanned text. */
  login(who: Who): Promise<void>
  session(who: Who): Promise<string>
  /** One turn of a session: the scripted Web calls, then the final text; returns what came back. */
  turn(who: Who, session: string, calls: readonly Call[]): Promise<Turn>
  exa: ExaStub
  pages: WebPages
  /** Every CLI stdout and stderr so far. */
  outputs(): string
  /** The in-process vault of the tree, opened again by the test (no cache on either side). */
  vault(): SecretVault
  vaultPath: string
  base: string
  tenant(who: Who): string
}>

type Run = Readonly<{
  exitCode: number
  records: readonly S0Record[]
  stderr: readonly string[]
}>

/** The Web definition of the release, for the holding the secret keys are derived from. */
async function webHolding() {
  const snapshot = await loadProductionRelease()
  if (snapshot.kind !== 'trusted') throw new Error(`release ${snapshot.diagnostic}`)
  const entry = snapshot.manifest.entries.find(candidate => candidate.asset.name === WEB_ASSET)
  if (entry === undefined) throw new Error('the release has no Web entry')
  const author = snapshot.modules.webToolModule.createAuthor(tree(TEST_CONSTRUCTION.Web))
  if ('failure' in author) throw new Error('fixture: Web author')
  const definition = judgeToolDefinition(deriveDefinition(governanceOf(entry), author.ok.facts))
  if ('failure' in definition) throw new Error('fixture: Web definition')
  const holding = toolHolding(definition.ok)
  if (holding === null) throw new Error('fixture: Web declares no settings')
  return holding
}

/**
 * Runs the release tree in this process with the local gateway, the Exa stand-in and the page
 * fixture, gives `scenario` the tools, then stops the tree in order and returns the run.
 */
async function withTree<T>(
  scenario: (tools: Tools) => Promise<T>,
): Promise<{ value: T; run: Run }> {
  const dir = newScratch('web-settings-')
  const port = await freePort()
  const homes: Record<Who, string> = {
    alice: join(dir.base, 'home-alice'),
    bob: join(dir.base, 'home-bob'),
  }
  const controller = new AbortController()
  const records: S0Record[] = []
  const stderr: string[] = []
  const seen: string[] = []
  const queue: Call[] = []
  const outputs: string[] = []
  const gateway = await startModelGateway(queuedCalls(queue, seen))
  gateway.trustInProcess()
  const exa = await startExaStub()
  const pages = await startWebPages()
  const vaultPath = join(dir.storageRoot, VAULT_FILE)
  const finished = runServe({
    distribution: release,
    operator: withHistoryKinds(
      operatorLayer({
        storageRoot: dir.storageRoot,
        port,
        modelRoute: gateway.url,
        exaEndpoint: exa.url,
      }),
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
    const cli: Tools['cli'] = async (who, args, secret) => {
      const run = await runOmne({
        args: [...args],
        home: homes[who],
        server: `http://127.0.0.1:${String(port)}`,
        cwd: dir.base,
        ...(secret === undefined ? {} : { credential: secret }),
      })
      outputs.push(run.stdout, run.stderr)
      return run
    }
    const credentialOf = (who: Who) => `${who}-pw-web04-${randomBytes(4).toString('hex')}`
    const login: Tools['login'] = async who => {
      const credential = credentialOf(who)
      const registered = await cli(who, ['register', '--login-identifier', who], credential)
      expect(registered.status, registered.stderr).toBe(0)
      const loggedIn = await cli(who, ['login', '--login-identifier', who], credential)
      expect(loggedIn.status, loggedIn.stderr).toBe(0)
    }
    const session: Tools['session'] = async who => {
      const created = await cli(who, ['create-session', '--definition', 'coding'])
      expect(created.status, created.stderr).toBe(0)
      return String(bodyOf(created)['session'])
    }
    const history = async (who: Who, id: string) => {
      const answer = await post(
        port,
        readHistory(savedTenant(homes[who]), id, savedLoginProof(homes[who])),
      )
      expect(answer.status, answer.body).toBe(200)
      return entriesOf(answer.body)
    }
    const turn: Tools['turn'] = async (who, id, calls) => {
      const before = (await history(who, id)).length
      queue.splice(0, queue.length, ...calls)
      const sent = await cli(who, [
        'send-input',
        '--session',
        id,
        '--text',
        `turn ${String(before)}`,
      ])
      expect(sent.status, sent.stderr).toBe(0)
      let entries = await history(who, id)
      for (
        const end = Date.now() + 120_000;
        Date.now() < end && !entries.slice(before).some(e => e.kind === 'run.terminal');
        await sleep(500)
      )
        entries = await history(who, id)
      const appended = entries.slice(before)
      expect(appended.at(-1)?.payload['terminal'], JSON.stringify(appended)).toMatchObject({
        outcome: 'completed',
      })
      const results = appended
        .filter(entry => entry.kind === 'message.tool')
        .map(entry => resultText(entry))
      expect(queue, 'every scripted call was answered').toEqual([])
      return { entries: appended, results }
    }
    const vault = (): SecretVault => {
      const opened = openSecretVault({ path: vaultPath, lockWaitMs: 2000 })
      if (opened.kind !== 'open') throw new Error(`vault ${opened.cause}`)
      return opened.vault
    }
    const value = await scenario({
      cli,
      login,
      session,
      turn,
      exa,
      pages,
      outputs: () => outputs.join('\n'),
      vault,
      vaultPath,
      base: dir.base,
      tenant: who => savedTenant(homes[who]),
    })
    controller.abort('test: stop')
    stopped = true
    const result = await finished
    return { value, run: { exitCode: result.exitCode, records, stderr } }
  } finally {
    if (!stopped) controller.abort('test: stop')
    await finished.catch(() => undefined)
    await pages.close()
    await exa.close()
    await gateway.close()
    dir.remove()
  }
}

/** Every regular file below `root`, except those whose path `skip` accepts. */
function filesBelow(root: string, skip: (path: string) => boolean): string[] {
  const found: string[] = []
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name)
      if (entry.isDirectory()) walk(path)
      else if (entry.isFile() && !skip(path)) found.push(path)
    }
  }
  walk(root)
  return found
}

const text = (value: string) => value as SecretText
const unconfiguredLine =
  'unconfigured reason=no search key is configured; set the Web setting exa.apiKey'

describe('the Web search key through `omne setting` on the release tree (web-meta-tool slice 04)', () => {
  it(
    'C2 and C6: set, show, list and unset the key; search uses it; the custody is the one fact; no sentinel leaves the vault',
    { timeout: 300_000 },
    async () => {
      const holding = await webHolding()
      const key = sentinel('alice')
      const { value, run } = await withTree(async tools => {
        await tools.login('alice')
        const tenant = tools.tenant('alice')
        const shown0 = await tools.cli('alice', ['setting', 'show', WEB_ASSET, EXA_KEY_ITEM])
        expect(shown0.status, shown0.stderr).toBe(0)
        expect(bodyOf(shown0)).toEqual({ state: 'unbound' })
        const listed0 = await tools.cli('alice', ['setting', 'list'])
        expect(listed0.status, listed0.stderr).toBe(0)
        expect(bodyOf(listed0)).toEqual({
          items: [
            {
              asset: { category: 'tool', name: WEB_ASSET },
              item: EXA_KEY_ITEM,
              title: 'Exa API key',
              sensitivity: 'secret',
              state: { state: 'unbound' },
            },
          ],
          completeness: 'complete',
        })

        // Without a key: search is unconfigured and sends nothing; fetch works.
        const session = await tools.session('alice')
        const first = await tools.turn('alice', session, [
          searchCall('call_search_0', 'omne harness'),
          fetchCall('call_fetch_0', tools.pages.pageUrl),
        ])
        expect(first.results[0]?.startsWith(unconfiguredLine)).toBe(true)
        expect(first.results[1]).toContain(PAGE_BODY_MARKER)
        expect(tools.exa.requests()).toEqual([])

        // The secret goes in through the pipe; the answer carries the time only.
        const set = await tools.cli('alice', ['setting', 'set', WEB_ASSET, EXA_KEY_ITEM], key)
        expect(set.status, set.stderr).toBe(0)
        const configuredAt = bodyOf(set)['configuredAt']
        expect(typeof configuredAt).toBe('string')
        expect(Object.keys(bodyOf(set))).toEqual(['configuredAt'])
        const shown1 = await tools.cli('alice', ['setting', 'show', WEB_ASSET, EXA_KEY_ITEM])
        expect(bodyOf(shown1)).toEqual({ state: 'usable', tenantId: tenant, configuredAt })
        const listed1 = await tools.cli('alice', ['setting', 'list', WEB_ASSET])
        expect(bodyOf(listed1)).toMatchObject({
          items: [
            { item: EXA_KEY_ITEM, state: { state: 'usable', tenantId: tenant, configuredAt } },
          ],
        })

        // With the key: search sends it to Exa and the hits come back; fetch is unchanged.
        tools.exa.answer(() => exaResults([exaResult('Hit title', RESULT_URL, 'Hit excerpt')]))
        const second = await tools.turn('alice', session, [
          searchCall('call_search_1', 'omne harness'),
          fetchCall('call_fetch_1', tools.pages.pageUrl),
        ])
        expect(tools.exa.requests().map(request => request.apiKey)).toEqual([key])
        expect(tools.exa.requests()[0]?.body).toMatchObject({ query: 'omne harness', type: 'lite' })
        expect(
          second.results[0]?.startsWith('done Web search query="omne harness" results=1\n'),
        ).toBe(true)
        expect(second.results[0]).toContain(`url=${RESULT_URL}`)
        expect(second.results[0]).toContain('Hit excerpt')
        expect(second.results[1]).toContain(PAGE_BODY_MARKER)
        expect(blocksOf(second.entries.find(e => e.kind === 'message.tool'))[0]).toMatchObject({
          kind: 'tool_result',
          callId: 'call_search_1',
        })

        // One fact: a binding removed straight from the vault file is gone for show and list at once.
        const parsed = tenantCodec.parse(tenant)
        if (!parsed.ok) throw new Error('tenant text')
        const tenantKey = holdingKey(
          { layer: 'tenant', tenant: parsed.value },
          holding,
          EXA_KEY_ITEM,
        )
        expect(tools.vault().unbind(tenantKey)).toBe('removed')
        expect(
          bodyOf(await tools.cli('alice', ['setting', 'show', WEB_ASSET, EXA_KEY_ITEM])),
        ).toEqual({
          state: 'unbound',
        })
        expect(bodyOf(await tools.cli('alice', ['setting', 'list']))).toMatchObject({
          items: [{ item: EXA_KEY_ITEM, state: { state: 'unbound' } }],
        })

        // Set again, then unset through the public operation.
        expect(
          (await tools.cli('alice', ['setting', 'set', WEB_ASSET, EXA_KEY_ITEM], key)).status,
        ).toBe(0)
        expect(tools.vault().describe(tenantKey)).toMatchObject({ kind: 'bound', life: 'active' })
        const vaultText = readFileSync(tools.vaultPath, 'utf8')
        const unset = await tools.cli('alice', ['setting', 'unset', WEB_ASSET, EXA_KEY_ITEM])
        expect(unset.status, unset.stderr).toBe(0)
        expect(unset.result?.['outcome']).toBe('succeeded')
        expect(
          bodyOf(await tools.cli('alice', ['setting', 'show', WEB_ASSET, EXA_KEY_ITEM])),
        ).toEqual({
          state: 'unbound',
        })
        const again = await tools.cli('alice', ['setting', 'unset', WEB_ASSET, EXA_KEY_ITEM])
        expect(again.result?.['outcome']).toBe('no-change')

        // Everything the scan reads, gathered while the tree runs.
        const files = filesBelow(tools.base, path => path === tools.vaultPath)
        const fileTexts = files.map(path => readFileSync(path, 'latin1')).join('\n')
        return {
          outputs: tools.outputs(),
          history: JSON.stringify([...first.entries, ...second.entries]),
          files: files.length,
          fileTexts,
          vaultText,
        }
      })
      expect(run.exitCode).toBe(0)
      const secrets = { key: [key] }
      // The sentinel is in none of the places a reader could see: files (SQLite, logs, state), the
      // server records and stderr, the CLI outputs, the history with the tool results.
      expect(value.files).toBeGreaterThan(0)
      expect(leaked(value.fileTexts, secrets)).toEqual([])
      expect(leaked(JSON.stringify({ records: run.records, stderr: run.stderr }), secrets)).toEqual(
        [],
      )
      expect(leaked(value.outputs, secrets)).toEqual([])
      expect(leaked(value.history, secrets)).toEqual([])
      // Positive control: the same search finds the key where it is, the vault file while it was bound.
      expect(leaked(value.vaultText, secrets)).toEqual(['key'])
    },
  )

  it(
    'C4: zero results, 401, 402, 429 and 500 of the search provider each give their own result',
    { timeout: 300_000 },
    async () => {
      const key = sentinel('alice')
      const answers: ExaAnswer[] = [
        exaResults([]),
        { status: 401, body: { error: 'bad key' } },
        { status: 402, body: { error: 'no credits' } },
        { status: 429, body: { error: 'slow down' } },
        { status: 500, body: { error: 'boom' } },
      ]
      const { value, run } = await withTree(async tools => {
        await tools.login('alice')
        expect(
          (await tools.cli('alice', ['setting', 'set', WEB_ASSET, EXA_KEY_ITEM], key)).status,
        ).toBe(0)
        tools.exa.answer(({ index }) => answers[index] ?? { status: 500, body: {} })
        const session = await tools.session('alice')
        const results: string[] = []
        for (const [index] of answers.entries()) {
          const turn = await tools.turn('alice', session, [
            searchCall(`call_c4_${String(index)}`, `q${String(index)}`),
          ])
          results.push(...turn.results)
        }
        return { results, requests: tools.exa.requests() }
      })
      expect(run.exitCode).toBe(0)
      expect(value.requests.map(request => request.apiKey)).toEqual(answers.map(() => key))
      expect(value.results[0]).toBe('done Web search query="q0" results=0\nno results')
      expect(value.results[1]).toBe(
        'denied reason=the configured search key was refused by the search provider',
      )
      expect(value.results[2]).toBe(
        'quota-exhausted reason=the search provider has no credits left for this key',
      )
      expect(value.results[3]).toBe(
        'rate-limited reason=the search provider limited the request rate; retry later',
      )
      expect(value.results[4]).toBe(
        'upstream reason=the remote server answered HTTP 500 status=500',
      )
      // The limit the author asked for stays within the operator bound (maxSearchResults 10).
      for (const request of value.requests)
        expect((request.body as { numResults: number }).numResults).toBeLessThanOrEqual(10)
    },
  )

  it(
    "C5: two tenants send only their own key; a cleared key is not replaced by another tenant's or a cached one; Model and Web keys do not see each other",
    { timeout: 300_000 },
    async () => {
      const holding = await webHolding()
      const keys = {
        alice: sentinel('alice'),
        bob: sentinel('bob'),
        official: sentinel('official'),
      }
      const modelSecret = `sk-or-v1-${randomBytes(12).toString('hex')}`
      const { value, run } = await withTree(async tools => {
        await tools.login('alice')
        await tools.login('bob')
        expect(
          (await tools.cli('alice', ['setting', 'set', WEB_ASSET, EXA_KEY_ITEM], keys.alice))
            .status,
        ).toBe(0)
        expect(
          (await tools.cli('bob', ['setting', 'set', WEB_ASSET, EXA_KEY_ITEM], keys.bob)).status,
        ).toBe(0)
        expect((await tools.cli('alice', ['credential', 'set'], modelSecret)).status).toBe(0)
        // Each tenant sees only its own item state.
        expect(
          bodyOf(await tools.cli('bob', ['setting', 'show', WEB_ASSET, EXA_KEY_ITEM])),
        ).toMatchObject({
          state: 'usable',
          tenantId: tools.tenant('bob'),
        })
        tools.exa.answer(() => exaResults([exaResult('T', RESULT_URL, 'E')]))
        const alice = await tools.session('alice')
        const bob = await tools.session('bob')
        const aliceFirst = await tools.turn('alice', alice, [searchCall('call_a1', 'alice query')])
        const bobFirst = await tools.turn('bob', bob, [searchCall('call_b1', 'bob query')])
        expect(aliceFirst.results[0]).toContain('results=1')
        expect(bobFirst.results[0]).toContain('results=1')

        // The custody keys apart: Model's binding and Web's binding of one tenant never answer for each other.
        const aliceTenant = tenantCodec.parse(tools.tenant('alice'))
        if (!aliceTenant.ok) throw new Error('tenant text')
        const webKey = holdingKey(
          { layer: 'tenant', tenant: aliceTenant.value },
          holding,
          EXA_KEY_ITEM,
        )
        const modelId = tenantCredentialId(aliceTenant.value)
        if (modelId === undefined) throw new Error('model credential id')
        const modelKey = modelCredentialBindingKey({
          id: modelId,
          tenant: aliceTenant.value,
          purpose: MODEL_SEND,
        })
        const vault = tools.vault()
        expect(vault.use(webKey)).toEqual({ kind: 'secret', value: keys.alice })
        expect(vault.use(modelKey)).toEqual({ kind: 'secret', value: modelSecret })
        expect(vault.use({ ...webKey, purpose: MODEL_SEND })).toBe('missing')
        expect(vault.use({ ...modelKey, purpose: webKey.purpose })).toBe('missing')
        expect(vault.use({ ...webKey, target: modelKey.target })).toBe('missing')

        // Alice clears her key: her next search is unconfigured; Bob's key is not hers and nothing is cached.
        expect(
          (await tools.cli('alice', ['setting', 'unset', WEB_ASSET, EXA_KEY_ITEM])).status,
        ).toBe(0)
        const aliceSecond = await tools.turn('alice', alice, [searchCall('call_a2', 'alice again')])
        expect(aliceSecond.results[0]?.startsWith(unconfiguredLine)).toBe(true)
        const bobSecond = await tools.turn('bob', bob, [searchCall('call_b2', 'bob again')])
        expect(bobSecond.results[0]).toContain('results=1')

        // An official key, written by the operator's stand-in: held by every legal tenant (F7), so
        // Alice without her own key searches with it, and Bob still with his own.
        expect(
          vault.bind(
            holdingKey({ layer: 'official' }, holding, EXA_KEY_ITEM),
            text(keys.official),
            null,
          ),
        ).toBe('written')
        const aliceThird = await tools.turn('alice', alice, [
          searchCall('call_a3', 'alice official'),
        ])
        expect(aliceThird.results[0]).toContain('results=1')
        const bobThird = await tools.turn('bob', bob, [searchCall('call_b3', 'bob own')])
        expect(bobThird.results[0]).toContain('results=1')
        return { requests: tools.exa.requests().map(request => request.apiKey) }
      })
      expect(run.exitCode).toBe(0)
      expect(value.requests).toEqual([keys.alice, keys.bob, keys.bob, keys.official, keys.bob])
      // The Model secret never reached the search provider.
      expect(value.requests).not.toContain(modelSecret)
    },
  )
})
