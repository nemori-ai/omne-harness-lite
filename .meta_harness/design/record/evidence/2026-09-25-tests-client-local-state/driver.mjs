import assert from 'node:assert/strict'
import { fork } from 'node:child_process'
import { chmod, chown, mkdir, mkdtemp, realpath, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
const product = await import(pathToFileURL(resolve('packages/frontend/client-local-state/dist/index.js')).href)
const { openClientLocalState } = product
const center = { centerId: '11111111111111111111111111111111', endpoint: 'https://center.example.invalid/', trust: { mode: 'ca' } }
const first = { center, cache: [], login: { presentation: 'test-presentation-a', handle: 'test-handle-a', accountId: 'acc_a' } }
const second = { center, cache: [], login: { presentation: 'test-presentation-b', handle: 'test-handle-b', accountId: 'acc_b' } }
async function reading(s) { const r = await s.read(); assert.equal(r.kind, 'read'); return r.snapshot }
if (process.argv[2] === 'worker') {
  const state = await openClientLocalState({ directory: process.argv[3] })
  const snapshot = await reading(state)
  process.send({ kind: 'ready', storeId: snapshot.storeId })
  process.on('message', async message => {
    if (message.kind === 'replace') {
      const result = await state.compareAndReplace(snapshot.token, message.value, message.operationId)
      process.send({ kind: 'result', result: result.kind })
    } else if (message.kind === 'close') { await state.close(); process.disconnect() }
  })
} else {
  const root = await mkdtemp(join(await realpath(tmpdir()), 'omne-cls-built-'))
  const children = [], states = []
  const directory = join(root, 'state')
  function worker() {
    const child = fork(fileURLToPath(import.meta.url), ['worker', directory], { stdio: ['ignore', 'ignore', 'pipe', 'ipc'] })
    children.push(child)
    const messages = [], waits = []
    let errors = ''
    child.stderr.on('data', chunk => { errors += chunk })
    child.on('message', m => {
      const index = waits.findIndex(w => w.kind === m.kind)
      if (index === -1) messages.push(m)
      else waits.splice(index, 1)[0].resolve(m)
    })
    child.on('exit', code => { for (const w of waits.splice(0)) w.reject(new Error(`child exit ${code}: ${errors}`)) })
    return { child, next(kind) { const index = messages.findIndex(m => m.kind === kind); return index >= 0 ? Promise.resolve(messages.splice(index, 1)[0]) : new Promise((resolve, reject) => waits.push({ kind, resolve, reject })) } }
  }
  try {
    console.log(JSON.stringify({ platform: process.platform, architecture: process.arch, node: process.version }))
    const ws = Array.from({ length: 4 }, worker)
    const starts = await Promise.all(ws.map(w => w.next('ready')))
    assert.equal(new Set(starts.map(x => x.storeId)).size, 1)
    console.log('PASS concurrent initialization: four product processes, one identity')
    ws[0].child.send({ kind: 'replace', value: first, operationId: 'first-contender' })
    ws[1].child.send({ kind: 'replace', value: second, operationId: 'second-contender' })
    const outcomes = await Promise.all([ws[0].next('result'), ws[1].next('result')])
    assert.deepEqual(outcomes.map(o => o.result).sort(), ['conflict', 'installed'])
    console.log('PASS multiprocess CAS: one complete winner')
    for (const w of ws) w.child.send({ kind: 'close' })
    const state = await openClientLocalState({ directory }); states.push(state)
    const selected = await reading(state)
    assert.equal(selected.revision, 1)
    assert.deepEqual(selected.value, outcomes[0].result === 'installed' ? first : second)
    for (const suffix of ['', '-wal', '-shm']) assert.equal((await stat(join(directory, 'client.sqlite' + suffix))).mode & 0o777, 0o600)
    assert.equal((await stat(directory)).mode & 0o777, 0o700)
    console.log('PASS real directory and main/WAL/SHM permissions')
    const old = await reading(state)
    assert.equal((await state.compareAndReplace(old.token, { center, cache: [] }, 'clear')).kind, 'installed')
    assert.equal((await state.compareAndReplace(old.token, first, 'late-result')).kind, 'conflict')
    await state.close()
    const reopened = await openClientLocalState({ directory }); states.push(reopened)
    assert.equal((await reading(reopened)).operationId, 'clear')
    assert.equal((await reading(reopened)).storeId, old.storeId)
    console.log('PASS late-result rejection and reopening persistent identity')
    if (process.getuid() === 0) {
      const wrong = join(root, 'wrong-owner'); await mkdir(wrong, { mode: 0o700 }); await chown(wrong, 1001, 1001)
      await assert.rejects(openClientLocalState({ directory: wrong }), e => e.reason === 'unsafe-path')
      console.log('PASS foreign OS owner rejected (root container fixture)')
    }
    if (process.env.OMNE_CAPACITY_DIRECTORY) {
      const limited = await openClientLocalState({ directory: process.env.OMNE_CAPACITY_DIRECTORY }); states.push(limited)
      const empty = await reading(limited)
      assert.equal((await limited.compareAndReplace(empty.token, first, 'before-enospc')).kind, 'installed')
      const before = await reading(limited)
      const huge = { ...first, center: { ...center, endpoint: 'https://center.example.invalid/' + 'x'.repeat(8 * 1024 * 1024) } }
      assert.deepEqual(await limited.compareAndReplace(before.token, huge, 'actual-tmpfs-full'), { kind: 'unconfirmed' })
      assert.equal((await reading(limited)).operationId, 'before-enospc')
      console.log('PASS actual full 4MiB tmpfs: unconfirmed, prior record preserved')
    }
    await reopened.close()
    await chmod(join(directory, 'client.sqlite'), 0o644)
    await assert.rejects(openClientLocalState({ directory }), e => e.reason === 'unsafe-path')
    console.log('PASS broad main-file permissions rejected without repair')
  } finally {
    await Promise.all(children.map(async child => { if (child.exitCode !== null || child.signalCode !== null) return; const exited = new Promise(r => child.once('exit', r)); child.kill('SIGKILL'); await exited }))
    await Promise.all(states.map(s => s.close()))
    await rm(root, { recursive: true, force: true })
  }
}
