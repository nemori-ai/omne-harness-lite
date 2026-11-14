// @module-tag slow
import { randomBytes } from 'node:crypto'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { setTimeout as sleep } from 'node:timers/promises'
import { tenantCodec } from '@omne-harness/legal-identity'
import type { SecretText, SettingsHolding } from '@omne-harness/settings'
import type { ToolDefinition } from '@omne-harness/tool-contract'
import { openSecretVault, type SecretVault } from '@omne-harness/settings-local/secrets'
import { deriveDefinition, judgeToolDefinition } from '@omne-harness/tool-contract/provider'
import { describe, expect, it } from 'vitest'
import * as cordis from '../../../src/cordis.ts'
import { loadProductionRelease } from '../../../src/entry/tool-release.ts'
import { governanceOf } from '../../../src/entry/tool-release-manifest.ts'
import { providerCredentialKey, releaseProvider } from '../../../src/assets/model-providers.ts'
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
  testVaultPath,
  TEST_DEPLOYMENT_KEY,
  type CliRun,
} from '../../r9/support.ts'
import { TEST_CONSTRUCTION, tree } from '../tool-host/support.ts'
import { connectable, until } from '../server-entry/support.ts'

function toolHolding(definition: ToolDefinition): SettingsHolding | null {
  const held = officialHolding(toolAsset(definition))
  return held.kind === 'declared' ? held.ref.holding : null
}

const release: unknown = JSON.parse(
  readFileSync(new URL('../../../config/serve.distribution.json', import.meta.url), 'utf8'),
)

const FINAL = 'MARKER-web-settings-final'
const WEB_ASSET = 'Web'
const RESULT_URL = 'https://results.example.test/MARKER-exa-hit'

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
const resultText = (entry: Entry | undefined): string =>
  blocksOf(entry)
    .slice(1)
    .map(block => String(block['text'] ?? ''))
    .join('')

type Who = 'alice' | 'bob'

type Turn = Readonly<{
  entries: readonly Entry[]
  results: readonly string[]
}>

type Tools = Readonly<{
  cli(who: Who, args: readonly string[], secret?: string): Promise<CliRun>
  login(who: Who): Promise<void>
  session(who: Who): Promise<string>
  turn(who: Who, session: string, calls: readonly Call[]): Promise<Turn>
  exa: ExaStub
  pages: WebPages
  outputs(): string
  vault(): SecretVault
  vaultPath: string
  base: string
  tenant(who: Who): string
  modelAuthorizations(): readonly (string | null)[]
}>

type Run = Readonly<{
  exitCode: number
  records: readonly S0Record[]
  stderr: readonly string[]
}>

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
  const vaultPath = testVaultPath(dir.storageRoot)
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
      modelAuthorizations: () => gateway.authorizations(),
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
        const shown0 = await tools.cli('alice', [
          'setting',
          'show',
          WEB_ASSET,
          EXA_KEY_ITEM,
          '--json',
        ])
        expect(shown0.status, shown0.stderr).toBe(0)
        expect(bodyOf(shown0)).toEqual({
          own: { state: 'unbound' },
          official: { state: 'unbound' },
        })
        const listed0 = await tools.cli('alice', ['setting', 'list', WEB_ASSET])
        expect(listed0.status, listed0.stderr).toBe(0)
        expect(bodyOf(listed0)).toEqual({
          items: [
            {
              asset: { category: 'tool', name: WEB_ASSET },
              item: EXA_KEY_ITEM,
              title: 'Exa API key',
              sensitivity: 'secret',
              state: { state: 'unbound' },
              official: { state: 'unbound' },
            },
          ],
          completeness: 'complete',
        })

        const session = await tools.session('alice')
        const first = await tools.turn('alice', session, [
          searchCall('call_search_0', 'omne harness'),
          fetchCall('call_fetch_0', tools.pages.pageUrl),
        ])
        expect(first.results[0]?.startsWith(unconfiguredLine)).toBe(true)
        expect(first.results[1]).toContain(PAGE_BODY_MARKER)
        expect(tools.exa.requests()).toEqual([])

        const set = await tools.cli('alice', ['setting', 'set', WEB_ASSET, EXA_KEY_ITEM], key)
        expect(set.status, set.stderr).toBe(0)
        const configuredAt = bodyOf(set)['configuredAt']
        expect(typeof configuredAt).toBe('string')
        expect(Object.keys(bodyOf(set))).toEqual(['configuredAt'])
        const shown1 = await tools.cli('alice', [
          'setting',
          'show',
          WEB_ASSET,
          EXA_KEY_ITEM,
          '--json',
        ])
        expect(bodyOf(shown1)).toEqual({
          own: { state: 'usable', tenantId: tenant, configuredAt },
          official: { state: 'unbound' },
        })
        const listed1 = await tools.cli('alice', ['setting', 'list', WEB_ASSET])
        expect(bodyOf(listed1)).toMatchObject({
          items: [
            { item: EXA_KEY_ITEM, state: { state: 'usable', tenantId: tenant, configuredAt } },
          ],
        })

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

        const parsed = tenantCodec.parse(tenant)
        if (!parsed.ok) throw new Error('tenant text')
        const tenantKey = holdingKey(
          { layer: 'tenant', tenant: parsed.value },
          holding,
          EXA_KEY_ITEM,
        )
        expect(tools.vault().unbind(tenantKey)).toBe('removed')
        expect(
          bodyOf(await tools.cli('alice', ['setting', 'show', WEB_ASSET, EXA_KEY_ITEM, '--json'])),
        ).toMatchObject({ own: { state: 'unbound' } })
        expect(bodyOf(await tools.cli('alice', ['setting', 'list', WEB_ASSET]))).toMatchObject({
          items: [{ item: EXA_KEY_ITEM, state: { state: 'unbound' } }],
        })

        expect(
          (await tools.cli('alice', ['setting', 'set', WEB_ASSET, EXA_KEY_ITEM], key)).status,
        ).toBe(0)
        expect(tools.vault().describe(tenantKey)).toMatchObject({ kind: 'bound', life: 'active' })
        const vaultText = readFileSync(tools.vaultPath, 'utf8')
        const unset = await tools.cli('alice', ['setting', 'unset', WEB_ASSET, EXA_KEY_ITEM])
        expect(unset.status, unset.stderr).toBe(0)
        expect(unset.result?.['outcome']).toBe('succeeded')
        expect(
          bodyOf(await tools.cli('alice', ['setting', 'show', WEB_ASSET, EXA_KEY_ITEM, '--json'])),
        ).toMatchObject({ own: { state: 'unbound' } })
        const again = await tools.cli('alice', ['setting', 'unset', WEB_ASSET, EXA_KEY_ITEM])
        expect(again.result?.['outcome']).toBe('no-change')

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
      expect(value.files).toBeGreaterThan(0)
      expect(leaked(value.fileTexts, secrets)).toEqual([])
      expect(leaked(JSON.stringify({ records: run.records, stderr: run.stderr }), secrets)).toEqual(
        [],
      )
      expect(leaked(value.outputs, secrets)).toEqual([])
      expect(leaked(value.history, secrets)).toEqual([])
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
        expect(
          (await tools.cli('alice', ['setting', 'set', 'openrouter', 'apiKey'], modelSecret))
            .status,
        ).toBe(0)
        expect(
          bodyOf(await tools.cli('bob', ['setting', 'show', WEB_ASSET, EXA_KEY_ITEM, '--json'])),
        ).toMatchObject({ own: { state: 'usable', tenantId: tools.tenant('bob') } })
        tools.exa.answer(() => exaResults([exaResult('T', RESULT_URL, 'E')]))
        const alice = await tools.session('alice')
        const bob = await tools.session('bob')
        const aliceFirst = await tools.turn('alice', alice, [searchCall('call_a1', 'alice query')])
        const bobFirst = await tools.turn('bob', bob, [searchCall('call_b1', 'bob query')])
        expect(aliceFirst.results[0]).toContain('results=1')
        expect(bobFirst.results[0]).toContain('results=1')

        const aliceTenant = tenantCodec.parse(tools.tenant('alice'))
        if (!aliceTenant.ok) throw new Error('tenant text')
        const webKey = holdingKey(
          { layer: 'tenant', tenant: aliceTenant.value },
          holding,
          EXA_KEY_ITEM,
        )
        const openrouter = releaseProvider('openrouter')
        if (openrouter === undefined) throw new Error('the release holds no openrouter provider')
        const modelKey = providerCredentialKey(
          openrouter,
          { layer: 'tenant', tenant: aliceTenant.value },
          'apiKey',
        )
        const vault = tools.vault()
        expect(vault.use(webKey)).toEqual({ kind: 'secret', value: keys.alice })
        expect(vault.use(modelKey)).toEqual({ kind: 'secret', value: modelSecret })
        expect(modelKey).toEqual({ ...webKey, target: modelKey.target })
        expect(webKey.target).not.toEqual(modelKey.target)

        expect(
          (await tools.cli('alice', ['setting', 'unset', WEB_ASSET, EXA_KEY_ITEM])).status,
        ).toBe(0)
        const aliceSecond = await tools.turn('alice', alice, [searchCall('call_a2', 'alice again')])
        expect(aliceSecond.results[0]?.startsWith(unconfiguredLine)).toBe(true)
        const bobSecond = await tools.turn('bob', bob, [searchCall('call_b2', 'bob again')])
        expect(bobSecond.results[0]).toContain('results=1')

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
      expect(value.requests).not.toContain(modelSecret)
    },
  )

  it(
    'C1: the Model sends with the official OpenRouter key, with the tenant key once it is set, and with the official key again once it is cleared',
    { timeout: 300_000 },
    async () => {
      const own = `sk-or-v1-${randomBytes(12).toString('hex')}`
      const { value, run } = await withTree(async tools => {
        await tools.login('alice')
        const session = await tools.session('alice')
        const sent = () => tools.modelAuthorizations().length
        await tools.turn('alice', session, [])
        const official = tools.modelAuthorizations().slice(0)
        expect(
          (await tools.cli('alice', ['setting', 'set', 'openrouter', 'apiKey'], own)).status,
        ).toBe(0)
        const shown = bodyOf(
          await tools.cli('alice', ['setting', 'show', 'openrouter', 'apiKey', '--json']),
        )
        const before = sent()
        await tools.turn('alice', session, [])
        const withOwn = tools.modelAuthorizations().slice(before)
        expect(
          (await tools.cli('alice', ['setting', 'unset', 'openrouter', 'apiKey'])).status,
        ).toBe(0)
        const cleared = sent()
        await tools.turn('alice', session, [])
        const afterClear = tools.modelAuthorizations().slice(cleared)
        return { official, shown, withOwn, afterClear, outputs: tools.outputs() }
      })
      expect(run.exitCode).toBe(0)
      const deployment = `Bearer ${TEST_DEPLOYMENT_KEY}`
      expect(value.official.length).toBeGreaterThan(0)
      expect(new Set(value.official)).toEqual(new Set([deployment]))
      expect(value.shown).toMatchObject({ own: { state: 'usable' } })
      expect(value.withOwn.length).toBeGreaterThan(0)
      expect(new Set(value.withOwn)).toEqual(new Set([`Bearer ${own}`]))
      expect(value.afterClear.length).toBeGreaterThan(0)
      expect(new Set(value.afterClear)).toEqual(new Set([deployment]))
      expect(value.outputs).not.toContain(own)
      expect(JSON.stringify(run.records)).not.toContain(own)
    },
  )
})
