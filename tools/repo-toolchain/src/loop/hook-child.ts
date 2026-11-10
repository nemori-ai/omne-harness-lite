// 收工钩子量读数的子进程：先只跑 git 看这次变更碰没碰产品源码，碰了再量。
// 量的过程是同步的，放在子进程里主进程才能按时限整组终止它；输入与发回的消息见 hook-process.ts。
import { readMetricsConfig } from '../metrics/config.ts'
import { cachedBaselineReader } from './baseline-cache.ts'
import { readLoopConfig } from './config.ts'
import { measureForHook, touchedBase } from './hook-measure.ts'
import type { ChildJob, ChildMessage } from './hook-process.ts'

function jobOf(text: string | undefined): ChildJob {
  const job: unknown = JSON.parse(text ?? 'null')
  if (
    typeof job !== 'object' ||
    job === null ||
    !('root' in job) ||
    typeof job.root !== 'string' ||
    !('primaryBranch' in job) ||
    typeof job.primaryBranch !== 'string' ||
    !('home' in job) ||
    typeof job.home !== 'string'
  )
    throw new Error('量读数的子进程要 {root, primaryBranch, home}')
  return { root: job.root, primaryBranch: job.primaryBranch, home: job.home }
}

const send = (message: ChildMessage, then: (error: Error | null) => void = () => {}) => {
  if (process.send === undefined)
    throw new Error('量读数的子进程要由 hook-process.ts 起，带消息通道')
  process.send(message, then)
}

const job = jobOf(process.argv[2])
const base = touchedBase(job.root, job.primaryBranch)
let result: ChildMessage
if (base === undefined) result = { kind: 'result', touched: false }
else {
  const config = readLoopConfig()
  const readBaseline = cachedBaselineReader(job.home, config.sensors.architecture, {
    onPrepared: commit => send({ kind: 'prepared', commit }),
  })
  result = {
    kind: 'result',
    touched: true,
    readings: measureForHook(job.root, base, config, readMetricsConfig(), readBaseline),
  }
}
// 发完就退出：消息通道开着时进程不会自己结束。
send(result, () => process.exit(0))
