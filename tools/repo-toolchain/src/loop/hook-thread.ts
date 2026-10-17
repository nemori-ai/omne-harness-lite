// 在 worker 线程里量收工钩子的读数，带时限。本模块很轻：TypeScript 解析器只在线程里加载一次，
// 主线程不加载。
import { Worker } from 'node:worker_threads'
import type { HookReadings } from './hook.ts'

/** 线程发回的结果：没碰产品源码，或碰了且量出的读数。 */
export type WorkerResult =
  | { readonly touched: false }
  | { readonly touched: true; readonly readings: HookReadings }

/** 碰了产品源码 → 读数；没碰 → undefined。超过时限就终止线程并以超时拒绝。 */
export function measureInWorker(
  root: string,
  primaryBranch: string,
  timeoutMs: number,
): Promise<HookReadings | undefined> {
  return new Promise((done, fail) => {
    const worker = new Worker(
      new URL(`./hook-worker.${import.meta.url.endsWith('.ts') ? 'ts' : 'js'}`, import.meta.url),
      {
        workerData: { root, primaryBranch },
      },
    )
    const timer = setTimeout(() => {
      fail(new Error(`量读数超过 ${timeoutMs / 1000} 秒，已放弃`))
      worker.terminate().catch(() => {
        // 已经按超时拒绝了；线程停不停得下来不改变结果，进程退出时它也随之结束。
      })
    }, timeoutMs)
    // 先到的那个定结果；之后的 exit 再调 fail 不起作用。
    worker.once('message', (result: WorkerResult) => {
      clearTimeout(timer)
      done(result.touched ? result.readings : undefined)
    })
    worker.once('error', error => {
      clearTimeout(timer)
      fail(error)
    })
    worker.once('exit', code => {
      clearTimeout(timer)
      fail(new Error(`量读数的线程没给结果就退出了（${code}）`))
    })
  })
}
