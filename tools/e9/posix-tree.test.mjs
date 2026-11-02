import assert from 'node:assert/strict'
import test from 'node:test'
import { observeTree } from './posix-tree.mjs'
import { setTimeout as sleep } from 'node:timers/promises'
import { performance } from 'node:perf_hooks'

test('cleanup without a spawn identity never adopts the current PID owner', async () => {
  const rows = [
    { pid: 101, parent: 1, identity: 'reused-root', state: 'S' },
    { pid: 102, parent: 101, identity: 'unrelated-child', state: 'S' },
  ]
  const sent = []
  const result = await observeTree(101, {
    snapshot: () => rows,
    signal: (pid, name) => sent.push({ pid, name }),
    deadlineMs: 10,
  }).cleanup()
  assert.deepEqual(sent, [])
  assert.equal(result.state, 'incomplete')
  assert.equal(result.unobservedDescendants, 'unknown')
})

test('a spawn identity cannot authorize the reused root or its descendants at cleanup', async () => {
  const root = { pid: 101, parent: 1, identity: 'original-root', state: 'S' }
  const rows = [
    { ...root, identity: 'reused-root' },
    { pid: 102, parent: 101, identity: 'unrelated-child', state: 'S' },
  ]
  const sent = []
  const result = await observeTree(101, {
    root,
    snapshot: () => rows,
    signal: (pid, name) => sent.push({ pid, name }),
    deadlineMs: 10,
  }).cleanup()
  assert.deepEqual(sent, [])
  assert.equal(result.state, 'incomplete')
  assert.equal(result.unobservedDescendants, 'unknown')
})

for (const fault of ['snapshot', 'deadline']) {
  test(`${fault} failure during cleanup leaves no process frozen by the observer`, async () => {
    const root = { pid: 101, parent: 1, identity: 'root', state: 'S' }
    const rows = new Map([
      [101, { ...root }],
      [102, { pid: 102, parent: 101, identity: 'child', state: 'S' }],
    ])
    const started = performance.now()
    let snapshots = 0
    const result = await observeTree(101, {
      root,
      deadlineMs: 50,
      snapshot: () => {
        if (++snapshots === 4) {
          if (fault === 'snapshot') throw new Error('snapshot unavailable')
          while (performance.now() - started < 60) {
            /* exhaust the cleanup budget */
          }
        }
        return [...rows.values()].map(row => ({ ...row }))
      },
      signal: (pid, name) => {
        if (name === 'SIGSTOP') rows.get(pid).state = 'T'
        if (name === 'SIGCONT') rows.get(pid).state = 'S'
        if (name === 'SIGKILL') rows.delete(pid)
      },
    }).cleanup()
    assert.ok(
      [...rows.values()].every(row => row.state !== 'T'),
      'observer left a frozen process',
    )
    assert.equal(result.state, 'incomplete')
    assert.ok(result.errors.length > 0)
    assert.ok(performance.now() - started < 1000)
  })
}

test('normal measurement performs no process scans or periodic tracking', async () => {
  let scans = 0
  const tree = observeTree(101, {
    root: { pid: 101, parent: 1, identity: 'root-start', state: 'S' },
    snapshot: () => {
      scans++
      return [{ pid: 101, parent: 1, identity: 'root-start', state: 'Z' }]
    },
  })
  assert.equal(scans, 0)
  await sleep(150)
  assert.equal(scans, 0)
  assert.equal((await tree.cleanup()).state, 'observed-stopped')
})

test('a vanished root leaves descendant ownership unknown', async () => {
  const tree = observeTree(101, {
    root: { pid: 101, parent: 1, identity: 'root-start', state: 'S' },
    snapshot: () => [{ pid: 102, parent: 1, identity: 'orphan', state: 'S' }],
    signal: () => assert.fail('unowned process signalled'),
  })
  const result = await tree.cleanup()
  assert.equal(result.state, 'incomplete')
  assert.match(JSON.stringify(result.errors), /root.*unavailable/)
})

test('cleanup caps discovered identities and error records', async () => {
  const rows = Array.from({ length: 10 }, (_, index) => ({
    pid: 101 + index,
    parent: index === 0 ? 1 : 101,
    identity: String(index),
    state: 'S',
  }))
  const tree = observeTree(101, {
    root: rows[0],
    snapshot: () => rows,
    signal: () => {
      throw new Error('refused')
    },
    pause: async () => {},
    deadlineMs: 1,
    maxProcesses: 3,
    maxErrors: 2,
  })
  const result = await tree.cleanup()
  assert.equal(result.state, 'incomplete')
  assert.ok(result.processes.length <= 3)
  assert.ok(result.errors.length <= 2)
  assert.ok(result.omittedErrors > 0)
})

function fixture({ reused = false, failSignal = false, failSnapshot = false } = {}) {
  const rows = new Map([
    [101, { pid: 101, parent: 1, identity: 'root-start', state: 'S' }],
    [102, { pid: 102, parent: 101, identity: 'detached-start', state: 'S' }],
    [103, { pid: 103, parent: 102, identity: 'grandchild-start', state: 'S' }],
    [999, { pid: 999, parent: 1, identity: 'unrelated-start', state: 'S' }],
  ])
  const signals = []
  let samples = 0
  const tree = observeTree(101, {
    root: rows.get(101),
    deadlineMs: 100,
    pause: async () => {},
    snapshot: () => {
      if (failSnapshot) throw new Error('snapshot unavailable')
      if (reused && samples++ > 0) {
        rows.set(102, { pid: 102, parent: 1, identity: 'new-owner', state: 'S' })
      }
      return [...rows.values()]
    },
    signal: (pid, signal) => {
      signals.push({ pid, signal })
      if (failSignal && pid === 102) throw new Error('permission denied')
      if (signal === 'SIGKILL') {
        // The root has group 101; detached 102 and its child have group 102.
        if (pid === -101) rows.delete(101)
        else rows.delete(pid)
      }
    },
  })
  return { tree, rows, signals }
}

test('POSIX ownership traversal cleans detached descendants and leaves unrelated processes', async () => {
  const { tree, rows, signals } = fixture()
  const result = await tree.cleanup()
  assert.equal(result.state, 'observed-stopped')
  assert.deepEqual([...rows.keys()], [999])
  assert.deepEqual(
    signals.filter(item => item.signal === 'SIGKILL').map(item => item.pid),
    [103, 102, 101],
  )
  assert.equal(result.processes.length, 3)
})

test('PID reuse never transfers ownership to the new process', async () => {
  const { tree, rows, signals } = fixture({ reused: true })
  const result = await tree.cleanup()
  assert.equal(result.state, 'observed-stopped')
  assert.ok(rows.has(102))
  assert.ok(!signals.some(item => item.pid === 102))
})

test('failed discovery or signals remain incomplete even when the root is gone', async () => {
  for (const failure of [{ failSignal: true }, { failSnapshot: true }]) {
    const { tree } = fixture(failure)
    const result = await tree.cleanup()
    assert.equal(result.state, 'incomplete')
    assert.equal(result.exitCode, 1)
    assert.ok(result.errors.length > 0)
  }
})

test('sending signals without observing termination does not report cleanup success', async () => {
  const rows = [{ pid: 101, parent: 1, identity: 'root-start', state: 'S' }]
  const tree = observeTree(101, {
    root: rows[0],
    snapshot: () => rows,
    signal: () => {},
    pause: async () => {},
    deadlineMs: 1,
  })
  const result = await tree.cleanup()
  assert.equal(result.state, 'incomplete')
  assert.equal(result.processes[0].state, 'running')
})
