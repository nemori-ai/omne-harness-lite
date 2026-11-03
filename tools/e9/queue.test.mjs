import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import test from 'node:test'
import { launchProcess, runProcess } from './driver.mjs'
import { readArchive } from './archive.mjs'

const base = resolve('tmp/line-m2-toolchain/w2/e9-hardening')
mkdirSync(base, { recursive: true })

async function queuedRun(waitMs, maxWait, check, cancel = false) {
  const directory = mkdtempSync(join(base, 'queue-test-'))
  const env = {
    OMNE_TEST_SLOT_HELD: '',
    OMNE_TEST_SLOT_DIR: join(directory, 'slots'),
    OMNE_TEST_SLOT_LEDGER: join(directory, 'ledger.jsonl'),
    OMNE_TEST_SLOTS: '1',
    OMNE_TEST_SLOT_POLL_SECONDS: '1',
    OMNE_TEST_SLOT_MAX_WAIT_SECONDS: String(maxWait),
  }
  let holder
  try {
    let ready
    const acquired = new Promise(resolve => {
      ready = resolve
    })
    holder = launchProcess(
      process.execPath,
      [
        resolve('scripts/with-test-slot.mjs'),
        process.execPath,
        '-e',
        'process.stdout.write("ready");process.stdin.resume();process.stdin.on("end",()=>process.exit(0))',
      ],
      {
        env,
        timeoutMs: 60000,
        closeStdin: false,
        onOutput: text => {
          if (text.includes('ready')) ready()
        },
      },
    )
    await Promise.race([
      acquired,
      holder.done.then(result => {
        throw new Error(`holder exited: ${result.stderr}`)
      }),
    ])
    const adapter = join(directory, 'adapter.mjs')
    writeFileSync(
      adapter,
      `import { syntheticEvents, workload } from ${JSON.stringify(pathToFileURL(resolve('tools/e9/synthetic.mjs')).href)}; export {workload}; export async function open(){return {nextRound:async n=>syntheticEvents(n),close:async()=>{}}}`,
    )
    const out = join(directory, 'output')
    const release = setTimeout(() => holder.child.stdin.end(), waitMs)
    let result
    try {
      const entry = resolve('tools/e9/cli.mjs')
      const args = [
        entry,
        'run',
        '--root',
        resolve('.'),
        '--out',
        out,
        '--adapter',
        adapter,
        '--timeout-ms',
        '1000',
      ]
      const launcher = cancel
        ? [
            '--input-type=module',
            '-e',
            `process.argv=[process.execPath,...process.argv.slice(1)];setTimeout(()=>process.emit('SIGTERM'),1000);await import(${JSON.stringify(pathToFileURL(entry).href)})`,
            ...args,
          ]
        : args
      result = await runProcess(process.execPath, launcher, { env, timeoutMs: 55000 })
    } finally {
      clearTimeout(release)
    }
    await check(result, out)
  } finally {
    holder?.child.stdin.end()
    await holder?.done
    rmSync(directory, { recursive: true, force: true })
  }
}

test('queue wait does not consume the adapter execution deadline', async () => {
  await queuedRun(32000, 40, (result, out) => {
    assert.equal(result.exitCode, 0, result.stderr)
    assert.equal(readArchive(out).summary.state, 'pass')
    assert.equal(readArchive(out).rounds.length, 200)
  })
})

test('queue cancellation preserves an archive and the cancellation fact', async () => {
  await queuedRun(
    10000,
    40,
    (result, out) => {
      assert.equal(result.exitCode, 3, result.stderr)
      assert.equal(readArchive(out).summary.state, 'blocked')
      const processes = JSON.parse(readFileSync(join(out, 'processes.json'), 'utf8'))
      assert.equal(processes[0].cancelled, true)
    },
    true,
  )
})

test('queue exhaustion is archived as blocked and never leaks exit 75', async () => {
  await queuedRun(10000, 1, (result, out) => {
    assert.equal(result.exitCode, 3, result.stderr)
    assert.equal(readArchive(out).summary.state, 'blocked')
    const processes = JSON.parse(readFileSync(join(out, 'processes.json'), 'utf8'))
    assert.equal(processes[0].exitCode, 75)
  })
})
