// covers: PF-006 S24, PF-006 S69
// Public demo assembly. Controlled HTTPS and real OpenRouter are separate tests.
// Build first: pnpm --filter @omne-harness-lite/model-invocation-minimal-demo... run build
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { createServer } from 'node:https'
import { join, resolve } from 'node:path'
import { parseEnv } from 'node:util'
import { DatabaseSync } from 'node:sqlite'
import { test } from 'vitest'
import { checkLogPayload, type LogEntry } from '@omne-harness-lite/session-log'
import {
  readModelLogEnvelope,
  inspectModelLogEntry,
} from '@omne-harness-lite/model-request-runtime'
import { inspectToolJournalEntry } from '@omne-harness-lite/tool-execution-runtime'
import {
  MODEL,
  openDemo,
  inspectDriverEntry,
  type DemoConversation,
} from '../../../../examples/model-invocation-minimal-demo/dist/index.js'

const limitMs = 120_000
const prompt =
  'Call demo__nonce exactly once with {} to obtain a fresh nonce. After the tool returns, ' +
  'reply with its complete 32-character hexadecimal result, and nothing else. ' +
  'Do not invent a nonce and do not call another tool.'

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}
function object(value: unknown): Record<string, unknown> {
  assert.ok(isObject(value))
  return value
}
function array(value: unknown): unknown[] {
  assert.ok(Array.isArray(value))
  return value
}
function string(value: unknown): string {
  assert.equal(typeof value, 'string')
  assert.ok(typeof value === 'string')
  return value
}
function one<T>(values: readonly T[], criterion: string): T {
  assert.equal(values.length, 1, criterion)
  const value = values[0]
  assert.ok(value !== undefined, criterion)
  return value
}
function value(entry: LogEntry) {
  const scope = { tenant: entry.tenant, session: entry.session }
  const execution = inspectToolJournalEntry(scope, entry)
  if ('value' in execution) return object(execution.value)
  assert.ok('unrelated' in execution, 'claimed tool execution fact must decode')
  const driver = inspectDriverEntry(scope, entry)
  if ('value' in driver) return object(driver.value)
  assert.ok('unrelated' in driver, 'claimed driver fact must decode')
  const payload = checkLogPayload(entry.payload)
  assert.ok('kind' in payload, 'claimed log payload must decode')
  if (payload.kind === 'message') return object(payload.payload.value)
  const model = readModelLogEnvelope(entry.payload)
  if ('kind' in model && model.kind === 'model') {
    const inspected = inspectModelLogEntry({
      ...scope,
      entry,
      purpose: { kind: model.envelope.category },
      messagePrefix: null,
    })
    assert.ok('ok' in inspected, 'claimed model fact must validate format, body, shell and keys')
    return object(inspected.ok.captured.value)
  }
  assert.ok('kind' in model, 'claimed model fact must decode')
  assert.ok(payload.kind === 'fact', 'remaining entry is an owned fact')
  return object(payload.payload.value)
}
async function bounded<T>(operation: Promise<T>, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      operation,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${label}: ${limitMs}ms deadline`)), limitMs)
      }),
    ])
  } finally {
    clearTimeout(timer)
  }
}
async function save(directory: string, name: string, supplied: unknown) {
  await writeFile(join(directory, `${name}.json`), JSON.stringify(supplied, null, 2) + '\n', {
    mode: 0o600,
  })
}

/** Preserve only this Session's exact SQL journal bytes, without identity or credential tables. */
async function preserveSqlJournal(directory: string, data: string, session: string) {
  const db = new DatabaseSync(join(data, 'db.sqlite'), { readOnly: true })
  try {
    await save(directory, 'actual-session-log-sql', {
      journal: db.prepare('select * from sl_journal where session = ?').all(session),
      entries: db
        .prepare('select * from sl_entry where session = ? order by position_length, position')
        .all(session),
    })
  } finally {
    db.close()
  }
}

/** Only the external model endpoint is controlled. No runtime/executor boundary is replaced. */
async function controlledEndpoint(directory: string) {
  const cert = join(directory, 'peer-cert.pem')
  const key = join(directory, 'peer-key.pem')
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
  const ca = await readFile(cert)
  const requests: unknown[] = []
  const failures: string[] = []
  const pending = new Set<Promise<void>>()
  const server = createServer({ key: await readFile(key), cert: ca }, (req, res) => {
    const work = (async () => {
      assert.equal(req.method, 'POST')
      assert.equal(req.url, '/api/v1/chat/completions')
      const chunks: Buffer[] = []
      for await (const chunk of req) {
        assert.ok(Buffer.isBuffer(chunk))
        chunks.push(chunk)
      }
      // Capture body only. Authorization and other request headers never enter evidence.
      const body: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8'))
      requests.push(body)
      assert.ok(requests.length <= 2, 'one nonce turn requires two model requests')
      const first = requests.length === 1
      let delta: unknown
      if (first) {
        assert.ok(JSON.stringify(body).includes('demo__nonce'))
        delta = {
          tool_calls: [
            {
              index: 0,
              id: 'external-nonce-call',
              function: { name: 'demo__nonce', arguments: '{}' },
            },
          ],
        }
      } else {
        const tool = one(
          array(object(body).messages)
            .map(object)
            .filter(m => m.role === 'tool'),
          'the second request carries one actual tool message',
        )
        const match = string(tool.content).match(/\b[a-f0-9]{32}\b/u)
        assert.ok(match, 'model peer receives the unpredictable tool result')
        delta = { role: 'assistant', content: match[0] }
      }
      const frames = [
        {
          id: `pf006-peer-${requests.length}`,
          model: MODEL,
          provider: 'DeepInfra',
          choices: [{ delta, finish_reason: null }],
        },
        {
          choices: [{ delta: {}, finish_reason: first ? 'tool_calls' : 'stop' }],
          usage: {
            prompt_tokens: 9,
            completion_tokens: 3,
            total_tokens: 12,
            prompt_tokens_details: { cached_tokens: 4, cache_write_tokens: 0 },
            cost: 0.0000117,
          },
        },
      ]
      res.writeHead(200, { 'content-type': 'text/event-stream' })
      res.end(
        frames.map(frame => `data: ${JSON.stringify(frame)}\n\n`).join('') + 'data: [DONE]\n\n',
      )
    })()
    pending.add(work)
    work.then(
      () => pending.delete(work),
      error => {
        failures.push(error instanceof Error ? error.message : 'peer failure')
        pending.delete(work)
        res.destroy()
      },
    )
  })
  await new Promise<void>((accept, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', accept)
  })
  const address = server.address()
  assert.ok(address !== null && typeof address !== 'string')
  return {
    requests,
    failures,
    transport: { baseUrl: `https://127.0.0.1:${address.port}/api/v1/`, tls: { ca } },
    async close() {
      server.closeAllConnections()
      await Promise.allSettled([...pending])
      await new Promise<void>((accept, reject) =>
        server.close(error => (error ? reject(error) : accept())),
      )
    },
  }
}

async function liveCredential() {
  const location = process.env.PF006_ENV_FILE ?? resolve(import.meta.dirname, '../../../../.env')
  const bytes = await readFile(location).catch(() => {
    throw new Error('Unable to verify: authorized PF006_ENV_FILE/.env is unavailable')
  })
  try {
    const parsed = parseEnv(bytes.toString('utf8'))
    const supplied = parsed.OPENROUTER_API_KEY
    delete parsed.OPENROUTER_API_KEY
    assert.ok(
      typeof supplied === 'string' && supplied.trim(),
      'Unable to verify: OPENROUTER_API_KEY is unavailable',
    )
    return Buffer.from(supplied.trim())
  } finally {
    bytes.fill(0)
  }
}

async function verifyTurn(mode: 'controlled-https' | 'real-openrouter') {
  const runId = `${mode}-${randomUUID()}`
  const directory = join(
    process.env.PF006_EVIDENCE_ROOT ?? resolve(import.meta.dirname, '../../../../tmp/qa/pf006'),
    runId,
  )
  await mkdir(directory, { recursive: true, mode: 0o700 })
  const data = join(directory, 'runtime')
  const startedMonotonicNs = process.hrtime.bigint()
  let demo: DemoConversation | undefined
  let peer: Awaited<ReturnType<typeof controlledEndpoint>> | undefined
  let credential: Buffer | undefined
  let status = 'FAIL'
  let summary: unknown
  try {
    if (mode === 'controlled-https') peer = await controlledEndpoint(directory)
    credential = peer
      ? Buffer.from('pf006-controlled-artificial-credential')
      : await liveCredential()
    demo = await bounded(
      openDemo(
        data,
        { multiplier: 1.1, reserveTokens: 256 },
        {
          waitMilliseconds: 5000,
          force: false,
          schedule(milliseconds, callback) {
            const timer = setTimeout(callback, milliseconds)
            return () => clearTimeout(timer)
          },
        },
        16384,
        credential,
        peer ? { developmentTransport: peer.transport } : undefined,
        undefined,
        undefined,
        true,
      ),
      'openDemo',
    )
    credential.fill(0)
    const delivered: string[] = []
    const sent = await bounded(
      demo.send(prompt, async serialized => {
        delivered.push(serialized)
      }),
      'actual model/tool continuation',
    )
    await save(directory, 'send-result', sent)
    await save(directory, 'observer-deliveries', delivered)
    assert.equal(sent.kind, 'saved', 'the real assembly saves the final model response')
    assert.equal(sent.released, true)
    const read = await demo.application.readSessionLog(demo.actor, demo.session)
    await save(directory, 'public-session-read', read)
    assert.ok('entries' in read, 'public session log is readable')
    const entries = read.entries
    const execution = one(
      entries.filter(entry => value(entry).kind === 'execution_ended'),
      'one actual execution terminal',
    )
    const terminal = object(value(execution).terminal)
    assert.equal(terminal.outcome, 'completed', 'S69: actual execution succeeds')
    const returned = string(terminal.result)
    assert.match(returned, /^[a-f0-9]{32}$/u, 'actual ordinary nonce function result')
    assert.ok(!prompt.includes(returned), 'result is not preloaded in the model prompt')
    const toolEntry = one(
      entries.filter(entry => value(entry).type === 'tool'),
      'one actual persisted ToolMessage',
    )
    const message = value(toolEntry)
    const resultBlock = object(one(array(message.blocks), 'one result block'))
    assert.equal(resultBlock.kind, 'tool_result')
    assert.equal(resultBlock.outcome, 'completed')
    assert.equal(message.callId, object(value(execution).ref).callId)
    assert.equal(resultBlock.callId, message.callId)
    const text = object(one(array(resultBlock.blocks), 'one complete ordinary return block'))
    assert.equal(text.kind, 'text')
    assert.equal(text.text, returned, 'S24: the whole ordinary return is the message string')
    assert.equal(object(text.visibility).toModel, true)
    assert.deepEqual(object(value(execution).delivery).result, resultBlock)
    const results: unknown[] = []
    for (const file of await readdir(join(data, 'tool-results'))) {
      if (file.endsWith('.json'))
        results.push(JSON.parse(await readFile(join(data, 'tool-results', file), 'utf8')))
    }
    await save(directory, 'actual-result-resources', results)
    const resource = object(
      one(
        results.map(object).filter(item => item.kind === 'result'),
        'one real durable result resource',
      ),
    )
    assert.equal(object(object(resource.value).ref).callId, message.callId)
    assert.deepEqual(
      object(object(resource.value).result).content,
      resultBlock.blocks,
      'S69: real result resource and persisted message agree',
    )
    const firstAssistant = one(
      entries.filter(
        entry =>
          value(entry).type === 'assistant' &&
          array(value(entry).blocks).some(block => object(block).kind === 'tool_call'),
      ),
      'actual model tool call',
    )
    const call = object(
      one(
        array(value(firstAssistant).blocks).filter(block => object(block).kind === 'tool_call'),
        'one model nonce call',
      ),
    )
    assert.equal(call.tool, 'demo__nonce')
    assert.equal(call.callId, message.callId)
    const finalAssistant = one(
      entries.filter(
        entry =>
          entries.indexOf(entry) > entries.indexOf(toolEntry) &&
          value(entry).type === 'assistant' &&
          array(value(entry).blocks).some(block => object(block).kind === 'text'),
      ),
      'actual model continuation answer',
    )
    const answer = array(value(finalAssistant).blocks)
      .map(object)
      .filter(block => block.kind === 'text')
      .map(block => string(block.text))
      .join('')
      .trim()
    assert.equal(answer, returned, 'the actual model continuation consumes the whole tool result')
    const calls = entries.filter(entry => value(entry).kind === 'model_call_created')
    assert.equal(calls.length, 2, 'tool result causes a second actual model request')
    assert.equal(toolEntry.run, execution.run)
    assert.equal(finalAssistant.run, execution.run)
    for (const created of calls) assert.equal(created.run, execution.run, 'same Run continues')
    assert.ok(entries.indexOf(firstAssistant) < entries.indexOf(execution))
    assert.ok(entries.indexOf(execution) < entries.indexOf(toolEntry))
    const continued = calls[1]
    assert.ok(continued)
    assert.ok(entries.indexOf(toolEntry) < entries.indexOf(continued))
    assert.ok(entries.indexOf(continued) < entries.indexOf(finalAssistant))
    const ended = one(
      entries.filter(entry => value(entry).kind === 'run_ended'),
      'one Run ending',
    )
    assert.equal(value(ended).reason, 'completed')
    assert.equal(value(ended).run, execution.run)
    if (peer) {
      assert.equal(peer.requests.length, 2)
      assert.ok(
        !JSON.stringify(peer.requests[0]).includes(returned),
        'external model did not know result before execution',
      )
      const remoteTool = one(
        array(object(peer.requests[1]).messages)
          .map(object)
          .filter(m => m.role === 'tool'),
        'the model receives the actual tool message',
      )
      assert.ok(string(remoteTool.content).includes(returned))
      assert.equal(peer.failures.length, 0)
    }
    await preserveSqlJournal(directory, data, demo.session)
    const closed = await bounded(demo.close(), 'close')
    await save(directory, 'close-result', closed)
    assert.equal(closed.complete, true, 'actual owners release')
    summary = {
      run: execution.run,
      session: demo.session,
      callId: message.callId,
      returned,
      answer,
      executionIndex: entries.indexOf(execution),
      toolMessageIndex: entries.indexOf(toolEntry),
      continuationIndex: entries.indexOf(continued),
      finalAnswerIndex: entries.indexOf(finalAssistant),
      modelRequests: calls.length,
      closeComplete: closed.complete,
    }
    status = 'PASS'
  } catch (error) {
    await save(directory, 'failure', {
      message: error instanceof Error ? error.message : 'unknown failure',
    })
    throw error
  } finally {
    credential?.fill(0)
    if (demo) {
      // Preserve original application bytes on failure as well as success.
      await preserveSqlJournal(directory, data, demo.session).catch(async error => {
        await save(directory, 'physical-log-capture-failure', {
          message: error instanceof Error ? error.message : 'unknown capture failure',
        })
      })
      demo.stopActive()
      await bounded(demo.close(), 'cleanup close')
    }
    if (peer) {
      await save(directory, 'external-request-bodies', peer.requests)
      await save(directory, 'external-peer-failures', peer.failures)
      await peer.close()
    }
    // Keep only this scenario's safe log/result evidence, never credential replicas or private keys.
    await rm(data, { recursive: true, force: true })
    await rm(join(directory, 'peer-key.pem'), { force: true })
    await save(directory, 'result', {
      commit: process.env.PF006_CANDIDATE_COMMIT ?? 'local-unrecorded',
      run_id: runId,
      verifier: 'qa',
      exit_code: status === 'PASS' ? 0 : 1,
      status,
      mode,
      criteria: ['PF-006 S24', 'PF-006 S69'],
      startedMonotonicNs: startedMonotonicNs.toString(),
      finishedMonotonicNs: process.hrtime.bigint().toString(),
      limitMs,
      details: summary,
    })
    console.log(`${status} PF-006 S24/S69 ${mode} ${runId}`)
  }
}

test('PF-006 S24/S69 controlled HTTPS: ordinary return reaches model continuation', async () => {
  await verifyTurn('controlled-https')
})

test('PF-006 S24/S69 real OpenRouter: ordinary return reaches model continuation', async () => {
  await verifyTurn('real-openrouter')
})
