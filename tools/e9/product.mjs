import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { createServer } from 'node:net'
import { launchProcess, runProcess } from './driver.mjs'

export function cliObservation(operation, result) {
  let response
  try {
    response = JSON.parse(result.stdout)
  } catch {
    // A missing or malformed reply cannot establish an unavailable basis.
  }
  if (
    result.exitCode === 4 &&
    response?.result === 'response' &&
    response.outcome === 'basis-unavailable'
  )
    return {
      state: 'blocked',
      operation,
      exitCode: result.exitCode,
      outcome: response.outcome,
      reason: 'adopted basis is unavailable; dependent product measurement remains pending',
    }
  return { state: result.exitCode === 0 ? 'pass' : 'fail', operation, exitCode: result.exitCode }
}

function freePort() {
  return new Promise((resolve, reject) => {
    const server = createServer()
    server.on('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port
      server.close(() => resolve(port))
    })
  })
}

export async function probeProduct(root, output) {
  const observations = []
  const raw = []
  const serverBin = join(root, 'apps/harness-server/dist/bin.js')
  const cliBin = join(root, 'apps/cli/dist/bin.js')
  const missing = [serverBin, cliBin].filter(path => !existsSync(path))
  if (missing.length)
    return {
      observations: [{ state: 'blocked', reason: 'missing product build artifacts', missing }],
      raw,
      rounds: [],
    }
  const { operatorLayer } = await import(
    pathToFileURL(join(root, 'tools/joint-a/support.mjs')).href
  )
  const stateRoot = join(output, 'product-state')
  mkdirSync(stateRoot)
  const port = await freePort()
  const operator = join(output, 'operator.json')
  writeFileSync(
    operator,
    JSON.stringify(operatorLayer({ storageRoot: join(stateRoot, 'storage'), port }), null, 2),
  )
  let ready
  const startup = new Promise(resolve => {
    ready = resolve
  })
  const server = launchProcess(
    process.execPath,
    [
      serverBin,
      'serve',
      '--distribution',
      join(root, 'apps/harness-server/config/serve.distribution.json'),
      '--operator',
      operator,
      '--readiness-timeout-ms',
      '15000',
      '--shutdown-deadline-ms',
      '5000',
      '--state-root',
      stateRoot,
      '--stop-on-stdin-close',
    ],
    {
      cwd: root,
      closeStdin: false,
      timeoutMs: 60000,
      onOutput: text => {
        for (const line of text.split('\n')) {
          try {
            const record = JSON.parse(line)
            if (record.kind === 'startup-result') ready(record)
          } catch {
            /* incomplete JSON line */
          }
        }
      },
    },
  )
  try {
    const started = await Promise.race([startup, server.done.then(() => undefined)])
    if (started?.accepting !== true) {
      observations.push({
        state: 'fail',
        reason: 'serve did not reach accepting startup',
        ...(started ? { startup: started } : {}),
      })
      return { observations, raw, rounds: [] }
    }
    observations.push({
      state: 'pass',
      reason: 'real serve reached accepting startup',
      startup: started,
    })
    const home = join(output, 'cli-home')
    const cli = async (args, input) => {
      const result = await runProcess(
        process.execPath,
        [
          cliBin,
          ...args,
          '--server',
          `http://127.0.0.1:${port}`,
          ...(args[0] === 'register' ? [] : ['--home', home]),
        ],
        { cwd: root, input },
      )
      raw.push(result)
      observations.push(cliObservation(args[0], result))
      return result
    }
    const account = `e9-${process.pid}`
    const credential = 'e9-local-probe-credential\n'
    if ((await cli(['register', '--login-identifier', account], credential)).exitCode !== 0)
      return { observations, raw, rounds: [] }
    if ((await cli(['login', '--login-identifier', account], credential)).exitCode !== 0)
      return { observations, raw, rounds: [] }
    await cli(['create-session', '--definition', 'assistant'])
    const release = JSON.parse(
      readFileSync(join(root, 'apps/harness-server/config/serve.distribution.json'), 'utf8'),
    )
    observations.push({
      state: 'blocked',
      reason:
        'fixed-delay model/tool installation and completed-round observation are not available in the adopted F public command contract; no input dispatched and no completed round claimed',
      stubRows: release.rows.filter(row => row.plugin === 'stubPlugin').map(row => row.id),
    })
    return { observations, raw, rounds: [] }
  } finally {
    server.child.stdin.end()
    const stopped = await server.done
    raw.push(stopped)
    observations.push({
      state: stopped.exitCode === 0 ? 'pass' : 'fail',
      operation: 'serve shutdown',
      exitCode: stopped.exitCode,
      timedOut: stopped.timedOut,
      ...(stopped.cleanup ? { cleanup: stopped.cleanup } : {}),
    })
    writeFileSync(join(output, 'processes.json'), JSON.stringify(raw, null, 2) + '\n')
  }
}
