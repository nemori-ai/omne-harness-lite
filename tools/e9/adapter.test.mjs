import assert from 'node:assert/strict'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import test from 'node:test'
import { runProcess } from './driver.mjs'
import { readArchive } from './archive.mjs'

const base = resolve('tmp/line-m2-toolchain/w2/e9-hardening')
mkdirSync(base, { recursive: true })
const cli = resolve('tools/e9/cli.mjs')
const synthetic = pathToFileURL(resolve('tools/e9/synthetic.mjs')).href

async function withAdapter(body, check, timeout = '5000') {
  const directory = mkdtempSync(join(base, 'adapter-test-'))
  try {
    const adapter = join(directory, 'adapter.mjs')
    writeFileSync(
      adapter,
      `import { syntheticEvents, workload } from ${JSON.stringify(synthetic)}; export { workload }; ${body}`,
    )
    const out = join(directory, 'output')
    const result = await runProcess(
      process.execPath,
      [
        cli,
        'run',
        '--root',
        resolve('.'),
        '--out',
        out,
        '--adapter',
        adapter,
        '--timeout-ms',
        timeout,
      ],
      {
        timeoutMs: 15000,
        env: {
          OMNE_TEST_SLOT_HELD: '',
          OMNE_TEST_SLOT_DIR: join(directory, 'slots'),
          OMNE_TEST_SLOT_LEDGER: join(directory, 'ledger.jsonl'),
        },
      },
    )
    await check(result, out, directory)
  } finally {
    rmSync(directory, { recursive: true })
  }
}

test('actual CLI adapter archives 200 completed rounds and all raw events', async () => {
  await withAdapter(
    'export async function open() { return {nextRound: async n => syntheticEvents(n), close: async () => {}} }',
    (result, out) => {
      assert.equal(result.exitCode, 0, result.stderr)
      const archive = readArchive(out)
      assert.equal(archive.summary.state, 'pass')
      assert.equal(archive.summary.metadata.workload.kind, 'synthetic')
      assert.equal(archive.rounds.length, 200)
      assert.equal(readFileSync(join(out, 'events.jsonl'), 'utf8').trim().split('\n').length, 1400)
    },
  )
})

test('adapter stops before requesting another round at 10000 log entries', async () => {
  await withAdapter(
    'export async function open() { return {nextRound: async n => { if(n>5) throw Error("ran past stop"); const events=syntheticEvents(n); if(n===5) events[0].logCount=10000; return events }, close: async () => {}} }',
    (result, out) => {
      assert.equal(result.exitCode, 3, result.stderr)
      assert.equal(readArchive(out).rounds.length, 5)
    },
  )
})

test('adapter timeout archives partial facts and signals abort before close', async () => {
  await withAdapter(
    'export async function open({out,abortSignal}) { const {writeFileSync}=await import("node:fs"); return {nextRound: async n => n===1 ? syntheticEvents(n) : new Promise(()=>{}), close: async () => writeFileSync(out+"/closed",String(abortSignal.aborted))} }',
    (result, out) => {
      assert.equal(result.exitCode, 1, result.stderr)
      assert.equal(readArchive(out).rounds.length, 1)
      assert.equal(readFileSync(join(out, 'closed'), 'utf8'), 'true')
      assert.match(readFileSync(join(out, 'adapter-result.json'), 'utf8'), /timeout/)
    },
    '400',
  )
})

test('invalid raw events and close error retain the first error and both diagnostics', async () => {
  await withAdapter(
    'export async function open() { return {nextRound: async n => [...syntheticEvents(n),syntheticEvents(n)[0]], close: async () => {throw Error("close-broke")} } }',
    (result, out) => {
      assert.equal(result.exitCode, 1)
      const record = JSON.parse(readFileSync(join(out, 'adapter-result.json'), 'utf8'))
      assert.match(record.firstError, /completion/)
      assert.equal(record.observations.length, 2)
      assert.equal(readArchive(out).summary.state, 'fail')
      assert.equal(existsSync(join(out, 'events.jsonl')), true)
    },
  )
})
