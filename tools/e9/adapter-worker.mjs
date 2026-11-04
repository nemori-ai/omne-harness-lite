import { appendFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { driveRounds } from './driver.mjs'
import { normalizeEvents } from './events.mjs'

const [modulePath, root, out, timeout] = process.argv.slice(2)
writeFileSync(join(out, 'events.jsonl'), '')
const controller = new AbortController()
const timer = setTimeout(
  () => controller.abort(new Error('adapter total timeout')),
  Number(timeout),
)
const aborted = new Promise((_, reject) =>
  controller.signal.addEventListener('abort', () => reject(controller.signal.reason), {
    once: true,
  }),
)
const wait = promise => Promise.race([promise, aborted])
process.once('SIGTERM', () => controller.abort(new Error('SIGTERM')))
process.once('SIGINT', () => controller.abort(new Error('SIGINT')))
const observations = []
let adapter
let workload
let firstError
let runId
let plannedRounds
try {
  const module = await import(pathToFileURL(modulePath).href)
  workload = module.workload
  if (
    !workload ||
    !['product', 'synthetic'].includes(workload.kind) ||
    typeof workload.definition !== 'string' ||
    !workload.definition.trim()
  )
    throw new Error('adapter must export workload kind and definition')
  if (typeof module.open !== 'function') throw new Error('adapter must export open(context)')
  adapter = await wait(module.open({ root, out, abortSignal: controller.signal }))
  if (typeof adapter?.nextRound !== 'function' || typeof adapter.close !== 'function')
    throw new Error('adapter requires nextRound and close')
  // 短跑由适配器声明计划轮数；缺窗由判定记等件，不会冒充完整的 200 轮。
  plannedRounds = adapter.plannedRounds ?? 200
  await driveRounds(
    async round => {
      const events = await wait(adapter.nextRound(round))
      appendFileSync(
        join(out, 'events.jsonl'),
        (Array.isArray(events)
          ? events.map(event => JSON.stringify(event)).join('\n')
          : JSON.stringify(events)) + '\n',
      )
      const row = normalizeEvents(events, round, workload, runId)
      runId = row.runId
      return row
    },
    row => appendFileSync(join(out, 'progress.jsonl'), JSON.stringify(row) + '\n'),
    plannedRounds,
  )
} catch (error) {
  firstError = error.message
  observations.push({ state: 'fail', reason: 'adapter execution failed', error: firstError })
} finally {
  if (typeof adapter?.close === 'function') {
    try {
      await adapter.close()
    } catch (error) {
      observations.push({ state: 'fail', reason: 'adapter close failed', error: error.message })
      firstError ??= error.message
    }
  }
  writeFileSync(
    join(out, 'adapter-result.json'),
    JSON.stringify({ workload, plannedRounds, observations, firstError }, null, 2) + '\n',
  )
  clearTimeout(timer)
}
process.exitCode = firstError ? 1 : 0
