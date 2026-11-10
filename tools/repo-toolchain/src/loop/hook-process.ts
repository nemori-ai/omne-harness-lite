// 在子进程里量收工钩子的读数，带时限。本模块很轻：TypeScript 解析器只在子进程里加载，主进程不加载。
// 用子进程而不用 worker 线程：量的过程里有同步的子进程调用（dependency-cruiser 一次要几十秒），
// 线程卡在那里时 terminate 与主进程退出都要等它返回；子进程连同它起的进程可以按时限整组杀掉。
import { spawn, spawnSync, type ChildProcess } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import type { HookReadings } from './hook.ts'

/**
 * 子进程发回的消息。`prepared`：BASE 一侧的架构观测这次没有缓存，已算好存进回路目录（之后还会发结果）；
 * `result`：没碰产品源码，或碰了且量出的读数。
 */
export type ChildMessage =
  | { readonly kind: 'prepared'; readonly commit: string }
  | { readonly kind: 'result'; readonly touched: false }
  | { readonly kind: 'result'; readonly touched: true; readonly readings: HookReadings }

/** 子进程的输入，经命令行的一个 JSON 参数传过去。 */
export interface ChildJob {
  readonly root: string
  readonly primaryBranch: string
  readonly home: string
}

/** 超时的说明；这次已把基线读数备好存下的，说明下次不再重算。 */
export function timeoutMessage(timeoutMs: number, prepared: string | undefined): string {
  const message = `量读数超过 ${timeoutMs / 1000} 秒，已放弃`
  return prepared === undefined
    ? message
    : `${message}；基线 ${prepared.slice(0, 9)} 的架构读数这次已备好存下，下次收工不再重算`
}

/** 连同它起的进程一起杀掉：POSIX 上它自成一个进程组，Windows 上按进程树。 */
function killTree(child: ChildProcess): void {
  if (child.pid === undefined) return
  try {
    if (process.platform === 'win32')
      spawnSync('taskkill', ['/pid', String(child.pid), '/t', '/f'], {
        stdio: 'ignore',
        windowsHide: true,
      })
    else process.kill(-child.pid, 'SIGKILL')
  } catch {
    // 已经退出了。
  }
}

/** 错误输出最多留这么多个字符，子进程没给结果就退出时附在原因里。 */
const STDERR_CHARS = 2000

/**
 * 跑 `script`（参数是 `job` 的 JSON），等它发回 `result`。超过时限就整组杀掉，并以超时拒绝。
 * 测试拿替身脚本直接调它。
 */
export function measureInProcess(
  script: string,
  job: unknown,
  timeoutMs: number,
): Promise<HookReadings | undefined> {
  return new Promise((done, fail) => {
    const child = spawn(process.execPath, [script, JSON.stringify(job)], {
      stdio: ['ignore', 'ignore', 'pipe', 'ipc'],
      serialization: 'advanced',
      detached: process.platform !== 'win32',
      windowsHide: true,
    })
    let prepared: string | undefined
    let stderr = ''
    let settled = false
    const settle = (finish: () => void) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      finish()
    }
    const timer = setTimeout(() => {
      settle(() => fail(new Error(timeoutMessage(timeoutMs, prepared))))
      killTree(child)
    }, timeoutMs)
    child.stderr?.setEncoding('utf8').on('data', (chunk: string) => {
      stderr = (stderr + chunk).slice(-STDERR_CHARS)
    })
    child.on('message', (message: ChildMessage) => {
      if (message.kind === 'prepared') prepared = message.commit
      else settle(() => done(message.touched ? message.readings : undefined))
    })
    child.once('error', error => settle(() => fail(error)))
    child.once('exit', (code, signal) =>
      settle(() =>
        fail(
          new Error(
            `量读数的子进程没给结果就退出了（${signal ?? code}）${stderr === '' ? '' : `：${stderr.trim()}`}`,
          ),
        ),
      ),
    )
  })
}

/** 碰了产品源码 → 读数；没碰 → undefined。`home` 是回路目录，BASE 一侧的架构观测按提交缓存在那里。 */
export function measureInChild(
  root: string,
  primaryBranch: string,
  timeoutMs: number,
  home: string,
): Promise<HookReadings | undefined> {
  const script = fileURLToPath(
    new URL(`./hook-child.${import.meta.url.endsWith('.ts') ? 'ts' : 'js'}`, import.meta.url),
  )
  const job: ChildJob = { root, primaryBranch, home }
  return measureInProcess(script, job, timeoutMs)
}
