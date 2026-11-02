import assert from 'node:assert/strict'
import test from 'node:test'
import { observeTree } from './posix-tree.mjs'

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
    deadlineMs: 1,
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
    snapshot: () => rows,
    signal: () => {},
    pause: async () => {},
    deadlineMs: 1,
  })
  const result = await tree.cleanup()
  assert.equal(result.state, 'incomplete')
  assert.equal(result.processes[0].state, 'running')
})
