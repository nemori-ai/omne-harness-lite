// 收工钩子量读数的线程：先只跑 git 看这次变更碰没碰产品源码，碰了再量。
// 量的过程是同步的，放在线程里主线程才能按时限终止它；结果的形状见 hook-thread.ts 的 `WorkerResult`。
import { parentPort, workerData } from 'node:worker_threads'
import { readMetricsConfig } from '../metrics/config.ts'
import { readLoopConfig } from './config.ts'
import { measureForHook, touchedBase } from './hook-measure.ts'
import type { WorkerResult } from './hook-thread.ts'

const job: unknown = workerData
if (
  typeof job !== 'object' ||
  job === null ||
  !('root' in job) ||
  typeof job.root !== 'string' ||
  !('primaryBranch' in job) ||
  typeof job.primaryBranch !== 'string'
)
  throw new Error('量读数的线程要 {root, primaryBranch}')
const base = touchedBase(job.root, job.primaryBranch)
const result: WorkerResult =
  base === undefined
    ? { touched: false }
    : {
        touched: true,
        readings: measureForHook(job.root, base, readLoopConfig(), readMetricsConfig()),
      }
parentPort?.postMessage(result)
