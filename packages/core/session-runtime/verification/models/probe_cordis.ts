import { createRequire } from 'node:module'
import assert from 'node:assert/strict'
const require = createRequire(
  new URL('../../../../core/kernel-basis/package.json', import.meta.url),
)
const { Context } = require('@deepseek-ai/cordis')
const { version } = require('@deepseek-ai/cordis/package.json')
const p = (name, apply, inject) => ({ name, apply, ...(inject ? { inject } : {}) })
const a = new Context(),
  b = new Context(),
  root = new Context()
const events = []
let stopped = false,
  resolved = false,
  releaseExecution
const actual = new Promise(r => {
  releaseExecution = () => {
    resolved = true
    r('original-result')
  }
})
const original = {
  id: 'original-call',
  wait: () => actual,
  release: () => {},
  cancel: () => {
    stopped = true
  },
}
const observations = {
  version,
  scope: 'primitive Context/bridge/owned-handle probe, not actual Session/provider integration',
}
const fb = await b.plugin(p('session-b', ctx => ctx.on('work', () => events.push('b'))))
const fa = await a.plugin(p('session-a', ctx => ctx.on('work', () => events.push('a'))))
a.emit('work')
assert.deepEqual(events, ['a'])
await fa.dispose()
b.emit('work')
assert.deepEqual(events, ['a', 'b'])
let runs = 0,
  releases = 0,
  handles = []
const consumer = await root.plugin(
  p(
    'agent-consumer',
    ctx => {
      runs++
      const handle = ctx.get('shared').acquire()
      handles.push(handle)
      ctx.effect(() => () => {
        releases++
        handle.release()
      })
    },
    ['shared'],
  ),
)
assert.equal(runs, 0)
const one = await root.plugin(
  p('provider-one', ctx => ctx.provide('shared', { acquire: () => original })),
)
assert.equal(runs, 1)
await one.dispose()
assert.equal(releases, 1)
assert.equal(stopped, false)
assert.equal(resolved, false)
const two = await root.plugin(
  p('provider-two', ctx => ctx.provide('shared', { acquire: () => original })),
)
assert.equal(runs, 2)
assert.equal(handles[0].id, handles[1].id)
let failed = false
try {
  await a.plugin(
    p('session-a-fault', () => {
      throw new Error('scope-fault')
    }),
  )
} catch {
  failed = true
}
assert.equal(failed, true)
b.emit('work')
assert.deepEqual(events, ['a', 'b', 'b'])
releaseExecution()
assert.equal(await handles[1].wait(), 'original-result')
await consumer.dispose()
await two.dispose()
await fb.dispose()
assert.equal(stopped, false)
Object.assign(observations, {
  isolated_events: true,
  withdraw_a_keeps_b: true,
  fault_a_keeps_b: true,
  inject_runs: runs,
  old_handle_releases: releases,
  original_call: original.id,
  execution_was_not_cancelled: !stopped,
})
process.stdout.write(JSON.stringify(observations) + '\n')
