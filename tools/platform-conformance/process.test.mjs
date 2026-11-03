import assert from 'node:assert/strict'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { test } from 'node:test'
import { setTimeout as delay } from 'node:timers/promises'
import { execute } from './process.mjs'

test('timeout and cancellation kill the owned descendant before it can write', async t => {
  const base = resolve(
    process.env.PLATFORM_CONFORMANCE_TEST_TMP ?? 'tmp/line-m2-toolchain/w2/platform',
  )
  mkdirSync(base, { recursive: true })
  const dir = mkdtempSync(join(base, 'tree-'))
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  const script = join(dir, 'parent.mjs')
  writeFileSync(
    script,
    `import {spawn} from 'node:child_process'; import {writeFileSync} from 'node:fs';
const child=spawn(process.execPath,['-e', 'setTimeout(()=>require("node:fs").writeFileSync(process.argv[1],"escaped"),1200)',process.argv[2]],{stdio:'ignore',detached:true});
writeFileSync(process.argv[3],String(child.pid)); setInterval(()=>{},1000);`,
  )
  for (const method of ['timeout', 'cancelled']) {
    const escaped = join(dir, `${method}.escaped`)
    const pidFile = join(dir, `${method}.pid`)
    const controller = new AbortController()
    const resultPromise = execute([process.execPath, script, escaped, pidFile], {
      timeoutMs: method === 'timeout' ? 500 : 5000,
      signal: controller.signal,
    })
    if (method === 'cancelled') {
      await delay(500)
      controller.abort()
    }
    const result = await resultPromise
    assert.equal(result.interrupted, method)
    assert.ok(existsSync(pidFile), 'descendant must start before the timeout or cancellation')
    const pid = Number(readFileSync(pidFile, 'utf8'))
    await delay(1500)
    assert.equal(existsSync(escaped), false, `descendant ${pid} survived ${method}`)
    assert.throws(
      () => process.kill(pid, 0),
      error => error.code === 'ESRCH',
    )
  }
})
