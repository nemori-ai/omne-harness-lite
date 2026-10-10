import assert from 'node:assert/strict'
import { spawn, type ChildProcess } from 'node:child_process'
import { once } from 'node:events'
import { existsSync } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { fileURLToPath } from 'node:url'
import { DatabaseSync } from 'node:sqlite'
import { openCliCatalog } from '../dist/catalog-open.js'
import { tenantPaths } from '../dist/state-layout.js'
import { sessionHostAddress } from '../dist/session-host-io.js'
import { parseSessionHostStartup } from '../dist/session-host-startup.js'
import { array, json, object, string } from './pf006-values.ts'

const hostEntry = fileURLToPath(new URL('../dist/session-host-main.js', import.meta.url))
const entry = fileURLToPath(new URL('../dist/main.js', import.meta.url))
export async function openScenario(token: string, prompt: string) {
  const home = process.env.PF006_HOME
  const routeName = process.env.PF006_MODEL
  assert.ok(
    home && routeName,
    'Unable to verify: PF006_HOME and PF006_MODEL must name a configured dedicated tenant and registered model',
  )
  const catalog = await openCliCatalog(home, {
    maxCenters: 256,
    maxCreations: 100_000,
    maxRecordBytes: 1_048_576,
  })
  let selected
  try {
    selected = (await catalog.catalog.readSelection()).selected
  } finally {
    await catalog.close()
  }
  assert.ok(selected, 'Unable to verify: the dedicated tenant is not selected')
  const startup = parseSessionHostStartup(
    JSON.stringify({ format: 'omne-session-host-startup/1', home, binding: selected, routeName }),
  )
  const socket = sessionHostAddress(home, selected).socketPath
  assert.equal(existsSync(socket), false, 'refuse to replace an existing Session host')
  const directory = resolve(process.env.PF006_EVIDENCE_ROOT ?? 'tmp/qa/pf006', token)
  await mkdir(directory, { recursive: true, mode: 0o700 })
  const host = launch(hostEntry, [JSON.stringify(startup)])
  try {
    await waitForSocket(host.child, socket)
    const file = join(directory, 'input.json')
    await writeFile(
      file,
      JSON.stringify({
        id: token,
        type: 'user',
        createdAt: '2026-10-10T00:00:00.000Z',
        blocks: [
          {
            id: token + '-text',
            kind: 'text',
            text: prompt,
            visibility: { toHuman: true, toModel: true },
          },
        ],
      }),
      { flag: 'wx', mode: 0o600 },
    )
    return {
      directory,
      runtimeFile: tenantPaths(home, selected).runtime,
      results: join(tenantPaths(home, selected).data, 'tool-results'),
      execute: () => launch(entry, ['--home', home, '--message-file', file, '--json']),
      async close() {
        host.child.kill('SIGTERM')
        const result = await host.finished
        await writeFile(join(directory, 'host-result.json'), JSON.stringify(result), {
          mode: 0o600,
        })
        assert.equal(result.code, 0, 'formal host closes through its real owners')
        assert.equal(existsSync(socket), false, 'formal host removes its own socket')
      },
    }
  } catch (error) {
    host.child.kill('SIGTERM')
    await host.finished
    throw error
  }
}
function launch(program: string, args: string[]) {
  const child = spawn(process.execPath, [program, ...args], { stdio: ['ignore', 'pipe', 'pipe'] })
  const timer = setTimeout(() => child.kill('SIGTERM'), 150_000)
  timer.unref()
  let stdout = '',
    stderr = ''
  child.stdout.setEncoding('utf8').on('data', chunk => {
    stdout += chunk
  })
  child.stderr.setEncoding('utf8').on('data', chunk => {
    stderr += chunk
  })
  const finished = once(child, 'close')
    .then(([code, signal]) => ({ code, signal, stdout, stderr }))
    .finally(() => clearTimeout(timer))
  return { child, finished }
}
async function waitForSocket(child: ChildProcess, socket: string) {
  const end = process.hrtime.bigint() + 30_000_000_000n
  while (!existsSync(socket)) {
    assert.ok(
      child.exitCode === null && child.signalCode === null,
      'formal Session host exited before readiness',
    )
    assert.ok(process.hrtime.bigint() < end, 'formal Session host readiness deadline')
    await delay(25)
  }
}

/** Capture request messages before the real ACK releases temporary model content. */
export async function observeRequests(file: string, token: string, running: Promise<unknown>) {
  const captured = new Map<string, unknown[]>()
  let ended = false
  const watched = running.finally(() => {
    ended = true
  })
  const db = new DatabaseSync(file, { readOnly: true })
  try {
    while (!ended) {
      for (const row of db
        .prepare("select call, bytes from model_call_content where kind = 'created'")
        .all()) {
        assert.ok(row.bytes instanceof Uint8Array)
        const content = object(json(Buffer.from(row.bytes).toString('utf8')))
        const input = object(content.input)
        if (!JSON.stringify(input.messages).includes(token)) continue
        assert.equal(content.status, 'accepted')
        captured.set(string(row.call), array(object(content.adopted).messages))
      }
      await delay(20)
    }
    await watched
    return captured
  } finally {
    db.close()
  }
}
