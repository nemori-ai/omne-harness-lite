import { readFile } from 'node:fs/promises'
import { performance } from 'node:perf_hooks'
import { setTimeout as sleep } from 'node:timers/promises'
import { createAcceptanceApplication } from '@omne-harness-lite/model-invocation-minimal-demo'

const [file, checkpoint] = process.argv.slice(2)
const values = JSON.parse(await readFile(file, 'utf8'))
const config = { ...values, wait: { ...values.wait, monotonicNow: () => performance.now(), sleep } }
function crash(point) {
  process.stdout.write(JSON.stringify({ point, pid: process.pid }) + '\n', () =>
    process.kill(process.pid, 'SIGKILL'),
  )
  return new Promise(() => {})
}
const app = createAcceptanceApplication(config, {
  diagnostics: { record() {} },
  hooks: {
    beforeConfirm: () => (checkpoint === 'beforeConfirm' ? crash('beforeConfirm') : undefined),
    beforeReplica: () => (checkpoint === 'afterManifest' ? crash('afterManifest') : undefined),
  },
})
try {
  await app.ready
  await app.close()
  process.exitCode = 2
} catch {
  await app.close()
  process.exitCode = 1
}
