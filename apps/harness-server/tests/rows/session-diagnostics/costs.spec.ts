// @module-tag slow
import { readdirSync } from 'node:fs'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { unpackText } from '@omne-harness/sql-contract/worker'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  freePort,
  newScratch,
  operatorLayer,
  runOmne,
  startServer,
  writeOperator,
  type Scratch,
  type ServerHandle,
} from '../../r9/support.ts'
import {
  answer504,
  createSession,
  registerAndLogin,
  sendInput,
  startScenarioGateway,
  untilRunEnded,
  type Cli,
  type ScenarioAnswer,
  type ScenarioGateway,
} from './support.ts'

// The cost of a dispatch on the release tree, as the command line shows it (C13, C16): a cost the
// stream carried; a cost looked up after the stream was cut, marked late; and a cost the upstream
// cannot tell, which stays unknown and never reads as zero.

const CREDENTIAL = 'dana-pw-COSTS-7e2a'
const RUN_END_TIMEOUT_MS = 90_000
const LATE_ID = 'gen-COSTS-LATE-0001'
const MISS_ID = 'gen-COSTS-MISS-0002'

const sse = (events: readonly unknown[]): string =>
  `${events.map(event => `data: ${JSON.stringify(event)}\n\n`).join('')}data: [DONE]\n\n`
const modelOf = (body: string) => (JSON.parse(body) as { model?: string }).model ?? 'unknown'
const firstFrame = (body: string, text: string) =>
  `data: ${JSON.stringify({ model: modelOf(body), provider: 'OpenAI', choices: [{ delta: { content: text } }] })}\n\n`

const retried = new Set<string>()

/** Every dispatch fact the release stored, grouped by call, in dispatch order. */
function dispatchFacts(
  storageRoot: string,
): ReadonlyMap<string, readonly Record<string, unknown>[]> {
  const files: string[] = []
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name)
      if (entry.isDirectory()) walk(path)
      else if (entry.name.endsWith('.sqlite')) files.push(path)
    }
  }
  walk(storageRoot)
  const facts = new Map<string, Record<string, unknown>[]>()
  for (const file of files) {
    const db = new DatabaseSync(file, { readOnly: true })
    try {
      const table =
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'md_dispatch_fact'"
      if (db.prepare(table).get() === undefined) continue
      for (const row of db
        .prepare('SELECT call, fact FROM md_dispatch_fact ORDER BY call, seq')
        .all()) {
        const raw = row['fact']
        const text = raw instanceof Uint8Array ? unpackText(raw) : String(raw)
        const call = String(row['call'])
        facts.set(call, [...(facts.get(call) ?? []), JSON.parse(text) as Record<string, unknown>])
      }
    } finally {
      db.close()
    }
  }
  return facts
}

function answerOf(
  request: Readonly<{ body: string; method: string; path: string }>,
): ScenarioAnswer {
  if (request.method === 'GET') {
    const asked = new URL(request.path, 'https://127.0.0.1').searchParams.get('id')
    if (asked === LATE_ID)
      return {
        kind: 'answer',
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { total_cost: 9.16e-5, provider_name: 'OpenAI' } }),
      }
    return {
      kind: 'answer',
      status: 404,
      contentType: 'application/json',
      body: '{"error":{"message":"Generation not found","code":404}}',
    }
  }
  if (request.body.includes('COSTS-RETRY') && !retried.has(request.body)) {
    retried.add(request.body)
    return answer504
  }
  if (request.body.includes('COSTS-LATE'))
    return {
      kind: 'break',
      headers: { 'x-generation-id': LATE_ID },
      body: firstFrame(request.body, 'half'),
    }
  if (request.body.includes('COSTS-MISS'))
    return {
      kind: 'break',
      headers: { 'x-generation-id': MISS_ID },
      body: firstFrame(request.body, 'half'),
    }
  return {
    kind: 'answer',
    status: 200,
    contentType: 'text/event-stream',
    body: sse([
      {
        model: modelOf(request.body),
        provider: 'OpenAI',
        choices: [{ delta: { content: 'done' } }],
      },
      {
        choices: [{ delta: {}, finish_reason: 'stop' }],
        usage: { prompt_tokens: 12, completion_tokens: 1, total_tokens: 13, cost: 0.000123 },
      },
    ]),
  }
}

describe('the cost of a dispatch on the release tree, read on the command line', () => {
  let scratch: Scratch
  let gateway: ScenarioGateway
  let server: ServerHandle
  let dana: Cli
  const lookups: string[] = []

  beforeAll(async () => {
    scratch = newScratch('diagnostics-costs-')
    const port = await freePort()
    gateway = await startScenarioGateway(request => {
      if (request.method === 'GET') lookups.push(request.path)
      return answerOf(request)
    })
    const operatorPath = join(scratch.base, 'operator.json')
    writeOperator(
      operatorPath,
      operatorLayer({ storageRoot: scratch.storageRoot, port, modelRoute: gateway.url }),
    )
    server = await startServer({
      stateRoot: scratch.stateRoot,
      operatorPath,
      port,
      extraCaPath: gateway.certPath,
    })
    const home = join(scratch.base, 'home-dana')
    dana = (args, credential) =>
      runOmne({
        args: [...args],
        home,
        server: `http://127.0.0.1:${String(port)}`,
        cwd: scratch.base,
        ...(credential === undefined ? {} : { credential }),
      })
    await registerAndLogin(dana, 'dana', CREDENTIAL)
  }, 120_000)

  afterAll(async () => {
    await server?.kill()
    await gateway?.close()
    scratch?.remove()
  })

  async function diagnosticsUntil(session: string, done: (text: string) => boolean) {
    const deadline = Date.now() + 60_000
    for (;;) {
      const read = await dana(['read-session-diagnostics', '--session', session])
      expect(read.status, read.stderr).toBe(0)
      if (done(read.stdout) || Date.now() > deadline) return read.stdout
      await new Promise(resolve => setTimeout(resolve, 500))
    }
  }

  it(
    'C16: shows the cost the stream carried, as known and received',
    { timeout: 180_000 },
    async () => {
      const session = await createSession(dana)
      await sendInput(dana, session, 'COSTS-KNOWN answer briefly')
      await untilRunEnded(dana, session, RUN_END_TIMEOUT_MS)
      const text = await diagnosticsUntil(session, out => out.includes('0.000123'))
      expect(text).toContain('billable 0.000123 openrouter-credit known')
      expect(text).toContain('receipt received')
    },
  )

  it(
    'C13, C16: looks up the cost of a cut stream by its request id and shows it known and late',
    { timeout: 180_000 },
    async () => {
      const session = await createSession(dana)
      await sendInput(dana, session, 'COSTS-LATE answer briefly')
      await untilRunEnded(dana, session, RUN_END_TIMEOUT_MS)
      const text = await diagnosticsUntil(session, out => out.includes('0.0000916'))
      expect(text).toContain('billable 0.0000916 openrouter-credit known')
      expect(text).toContain('receipt late')
      expect(lookups.some(path => path.includes(LATE_ID))).toBe(true)
    },
  )

  it(
    'C15: keeps two dispatch facts for a call that was retried once',
    { timeout: 180_000 },
    async () => {
      const session = await createSession(dana)
      await sendInput(dana, session, 'COSTS-RETRY answer briefly')
      await untilRunEnded(dana, session, RUN_END_TIMEOUT_MS)
      const twice = [...dispatchFacts(scratch.storageRoot).values()].filter(
        facts => facts.length === 2,
      )
      expect(
        twice.some(
          ([first, second]) =>
            JSON.stringify(first?.['outcome']).includes('504') &&
            JSON.stringify(second?.['outcome']).includes('completed'),
        ),
        JSON.stringify(twice),
      ).toBe(true)
    },
  )

  it(
    'C16: shows the cost of a cut stream the upstream cannot tell as unknown, never zero',
    { timeout: 180_000 },
    async () => {
      const session = await createSession(dana)
      await sendInput(dana, session, 'COSTS-MISS answer briefly')
      await untilRunEnded(dana, session, RUN_END_TIMEOUT_MS)
      const deadline = Date.now() + 30_000
      while (!lookups.some(path => path.includes(MISS_ID)) && Date.now() < deadline)
        await new Promise(resolve => setTimeout(resolve, 200))
      expect(lookups.some(path => path.includes(MISS_ID))).toBe(true)
      const read = await dana(['read-session-diagnostics', '--session', session])
      expect(read.stdout).toContain('account: unknown (not-recorded)')
      expect(read.stdout).not.toMatch(/billable 0(\.0+)? openrouter-credit/)
    },
  )
})
