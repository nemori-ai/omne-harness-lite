import { test } from 'node:test'
import assert from 'node:assert/strict'
import { fork, spawnSync } from 'node:child_process'
import { createServer } from 'node:http'
import { once } from 'node:events'
import { mkdtemp, readFile, rm, stat, writeFile, chmod } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { openLedger } from '../src/budget.mjs'
import {
  openProductionLedger,
  privateOutputDirectory,
  writePrivateEvidence,
  paidInvocation,
} from '../src/production-gate.mjs'
const budget = { limitUsd: '100', researchLimitUsd: '50' }
async function existing(path) {
  const ledger = await openLedger(path, budget)
  const id = await ledger.reserve({
    model: 'fixture',
    provider: 'fixture',
    stage: 'research',
    estimateUsd: '0',
  })
  await ledger.settle(id, '0')
  await ledger.close()
}
async function directory() {
  return mkdtemp(join(tmpdir(), 'omne-production-gate-'))
}
function worker(path) {
  return fork(new URL('./budget-worker.mjs', import.meta.url), [path], {
    stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
  })
}

test('production refuses a second, missing or public ledger before the effect', async () => {
  const root = await directory()
  const primary = join(root, 'ledger.json'),
    other = join(root, 'other.json')
  let effects = 0
  try {
    await existing(primary)
    await existing(other)
    await assert.rejects(openProductionLedger(other, primary, budget), /differs/)
    await assert.rejects(openProductionLedger(join(root, 'missing.json'), primary, budget), {
      code: 'ENOENT',
    })
    await chmod(primary, 0o644)
    await assert.rejects(openProductionLedger(primary, primary, budget), /owner-only/)
    assert.equal(effects, 0)
    assert.equal(JSON.parse(await readFile(other, 'utf8')).entries.length, 1)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
test('a durable reservation is visible before the sole effect and duplicate receipts fail', async () => {
  const root = await directory()
  const path = join(root, 'ledger.json')
  let sends = 0
  try {
    await existing(path)
    const ledger = await openProductionLedger(path, path, budget)
    const result = await paidInvocation(
      ledger,
      { model: 'm', provider: 'p', stage: 'acceptance', estimateUsd: '0.1' },
      async id => {
        const state = JSON.parse(await readFile(path, 'utf8'))
        assert.equal(state.entries.find(entry => entry.id === id).state, 'reserved')
        sends++
        return { actualUsd: '0.01234567890123456789' }
      },
    )
    assert.equal(sends, 1)
    await assert.rejects(ledger.settle(result.id, '0.01'), /Invalid settlement/)
    await ledger.close()
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
for (const actualUsd of [undefined, '-1', 'NaN', 'garbage'])
  test(`missing/invalid cost ${actualUsd} blocks further effects after reopen`, async () => {
    const root = await directory()
    const path = join(root, 'ledger.json')
    let sends = 0
    try {
      await existing(path)
      let ledger = await openProductionLedger(path, path, budget)
      await assert.rejects(
        paidInvocation(
          ledger,
          { model: 'm', provider: 'p', stage: 'acceptance', estimateUsd: '1' },
          async () => {
            sends++
            return { actualUsd }
          },
        ),
      )
      await assert.rejects(
        paidInvocation(
          ledger,
          { model: 'm', provider: 'p', stage: 'acceptance', estimateUsd: '1' },
          async () => {
            sends++
            return { actualUsd: '0' }
          },
        ),
        /Unsettled/,
      )
      await ledger.close()
      await assert.rejects(openProductionLedger(path, path, budget), /Unsettled/)
      assert.equal(sends, 1)
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })
test('failed generation lookup and cancellation do not refund or retry', async () => {
  const root = await directory()
  const path = join(root, 'ledger.json')
  let sends = 0
  try {
    await existing(path)
    const ledger = await openProductionLedger(path, path, budget)
    await assert.rejects(
      paidInvocation(
        ledger,
        { model: 'm', provider: 'p', stage: 'acceptance', estimateUsd: '1' },
        async () => {
          sends++
          throw new Error('generation temporarily unreadable')
        },
      ),
      /unknown/,
    )
    assert.equal(ledger.snapshot().entries.at(-1).state, 'unknown')
    assert.equal(sends, 1)
    await ledger.close()
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
test('two OS processes share the same exclusive ledger lock', async () => {
  const root = await directory()
  const path = join(root, 'ledger.json')
  let child
  try {
    await existing(path)
    child = worker(path)
    await once(child, 'message')
    await assert.rejects(openProductionLedger(path, path, budget), { code: 'EEXIST' })
    const state = JSON.parse(await readFile(path, 'utf8'))
    assert.equal(state.entries.filter(entry => entry.state === 'reserved').length, 1)
  } finally {
    if (child) {
      child.kill('SIGKILL')
      await once(child, 'exit')
    }
    await rm(root, { recursive: true, force: true })
  }
})
for (const afterEffect of [false, true])
  test(`SIGKILL ${afterEffect ? 'after controlled effect' : 'before effect'} preserves unresolved reservation and blocks restart`, async () => {
    const root = await directory()
    const path = join(root, 'ledger.json')
    let child
    let effects = 0
    const server = createServer((_req, res) => {
      effects++
      res.end('received')
    })
    server.listen(0, '127.0.0.1')
    await once(server, 'listening')
    try {
      await existing(path)
      child = worker(path)
      await once(child, 'message')
      if (afterEffect) {
        const message = once(child, 'message')
        child.send({ phase: 'effect', url: `http://127.0.0.1:${server.address().port}/` })
        await message
      }
      child.kill('SIGKILL')
      await once(child, 'exit')
      child = undefined
      await assert.rejects(openProductionLedger(path, path, budget), { code: 'EEXIST' })
      assert.equal(effects, afterEffect ? 1 : 0)
      assert.equal(JSON.parse(await readFile(path, 'utf8')).entries.at(-1).state, 'reserved')
      // Synthetic fixture only: even a manual lock deletion cannot clear the durable reservation.
      await rm(`${path}.lock`)
      await assert.rejects(openProductionLedger(path, path, budget), /Unsettled/)
    } finally {
      if (child) {
        child.kill('SIGKILL')
        await once(child, 'exit')
      }
      await new Promise(resolve => server.close(resolve))
      await rm(root, { recursive: true, force: true })
    }
  })
test('budget rejection prevents the effect; omitting a reservation is caught by the receipt oracle', async () => {
  const root = await directory()
  const path = join(root, 'ledger.json')
  let sends = 0
  try {
    await existing(path)
    const ledger = await openProductionLedger(path, path, budget)
    await assert.rejects(
      paidInvocation(
        ledger,
        { model: 'm', provider: 'p', stage: 'acceptance', estimateUsd: '100.0001' },
        async () => {
          sends++
          return { actualUsd: '0' }
        },
      ),
      /refused/,
    )
    assert.equal(sends, 0)
    assert.equal(ledger.snapshot().entries.filter(entry => entry.state === 'reserved').length, 0)
    await assert.rejects(ledger.settle('effect-without-reservation', '0'), /Invalid settlement/)
    await ledger.close()
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
test('another real OS user cannot read owner-only output, while a public negative control is readable', async () => {
  const root = await directory()
  const output = join(root, 'private')
  const publicFile = join(root, 'public.json')
  try {
    await chmod(root, 0o755)
    await privateOutputDirectory(output)
    await writePrivateEvidence(join(output, 'result.json'), 'synthetic-fixture')
    await writeFile(publicFile, 'public-fixture', { mode: 0o644 })
    assert.equal((await stat(output)).mode & 0o777, 0o700)
    assert.equal((await stat(join(output, 'result.json'))).mode & 0o777, 0o600)
    const denied = spawnSync('sudo', ['-n', '-u', 'nobody', 'cat', join(output, 'result.json')], {
        encoding: 'utf8',
      }),
      allowed = spawnSync('sudo', ['-n', '-u', 'nobody', 'cat', publicFile], { encoding: 'utf8' })
    assert.notEqual(denied.status, 0)
    assert.equal(allowed.status, 0)
    assert.equal(allowed.stdout, 'public-fixture')
    assert.equal(denied.stdout, '')
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('actual receipts and budget comparisons retain precision beyond eighteen decimal places', async () => {
  const root = await directory()
  const path = join(root, 'ledger.json')
  try {
    await existing(path)
    const ledger = await openProductionLedger(path, path, budget)
    const id = await ledger.reserve({
      model: 'm',
      provider: 'p',
      stage: 'acceptance',
      estimateUsd: '100',
    })
    await ledger.settle(id, '99.99999999999999999999')
    assert.equal(ledger.snapshot().entries.at(-1).actualUsd, '99.99999999999999999999')
    const tiny = await ledger.reserve({
      model: 'm',
      provider: 'p',
      stage: 'acceptance',
      estimateUsd: '0.00000000000000000001',
    })
    await ledger.settle(tiny, '0.00000000000000000001')
    await assert.rejects(
      ledger.reserve({
        model: 'm',
        provider: 'p',
        stage: 'acceptance',
        estimateUsd: '0.00000000000000000001',
      }),
      /refused/,
    )
    await ledger.close()
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
