// Node/filesystem feasibility observation, not an OMNE runtime or product test.
import { fork } from 'node:child_process'
import { once } from 'node:events'
import { open, mkdir, readFile, stat } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import { fileURLToPath } from 'node:url'

async function syncFile(path, data) {
  const file = await open(path, 'wx', 0o600)
  try { await file.writeFile(data); await file.sync() } finally { await file.close() }
}
async function syncDirectory(path) {
  const dir = await open(path, 'r')
  try { await dir.sync() } finally { await dir.close() }
}

if (process.argv[2] === 'child') {
  const path = process.argv[3]
  process.on('message', async message => {
    if (message !== 'perform-file-effect') return
    try {
      await syncFile(join(path, 'target.txt'), 'observed-file-effect\n')
      await syncDirectory(path)
      process.send({ kind: 'file-synced' })
    } catch (error) {
      process.send({ kind: 'failure', code: error.code ?? error.name })
    }
  })
  process.send({ kind: 'ready' })
} else {
  const root = resolve(process.argv[2])
  await mkdir(root, { recursive: false, mode: 0o700 })
  const observations = []
  for (const window of ['before-file-effect', 'after-file-sync-before-result']) {
    const dir = join(root, window)
    await mkdir(dir, { mode: 0o700 })
    // Deliberately separate files; this marker is not core-journal/1.
    await syncFile(join(dir, 'business-marker.txt'), 'dispatch-intent\n')
    await syncDirectory(dir)
    const child = fork(fileURLToPath(import.meta.url), ['child', dir], {
      env: {}, execArgv: [], stdio: ['ignore', 'ignore', 'pipe', 'ipc'],
    })
    const closed = once(child, 'close')
    const timeout = setTimeout(() => child.kill('SIGKILL'), 5000)
    let stderr = ''
    child.stderr.on('data', chunk => { stderr += chunk.toString() })
    try {
      const [ready] = await once(child, 'message')
      if (ready.kind !== 'ready') throw new Error('worker did not become ready')
      if (window === 'after-file-sync-before-result') {
        const synced = once(child, 'message')
        child.send('perform-file-effect')
        const [fact] = await synced
        if (fact.kind !== 'file-synced') throw new Error(`worker failure: ${fact.code}`)
      }
      child.kill('SIGKILL')
      const [exitCode, signal] = await closed
      let file = { exists: false }
      try {
        const info = await stat(join(dir, 'target.txt'))
        file = { exists: true, bytes: info.size, content: await readFile(join(dir, 'target.txt'), 'utf8') }
      } catch (error) { if (error.code !== 'ENOENT') throw error }
      observations.push({ window, exitCode, signal, file,
        businessMarker: await readFile(join(dir, 'business-marker.txt'), 'utf8'), stderr })
    } finally {
      clearTimeout(timeout)
      if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL')
      await closed
    }
  }
  process.stdout.write(`${JSON.stringify({ node: process.version, platform: process.platform,
    arch: process.arch, observations, limitation: 'No OMNE owners, admission, tombstone, restart protocol, or exactly-once proof.' }, null, 2)}\n`)
}
