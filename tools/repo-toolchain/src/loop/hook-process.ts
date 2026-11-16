import { spawn, spawnSync, type ChildProcess } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import type { HookReadings } from './hook.ts'

export type ChildMessage =
  | { readonly kind: 'prepared'; readonly commit: string }
  | { readonly kind: 'result'; readonly touched: false }
  | { readonly kind: 'result'; readonly touched: true; readonly readings: HookReadings }

export interface ChildJob {
  readonly root: string
  readonly primaryBranch: string
  readonly home: string
}

export function jobOf(text: string | undefined): ChildJob {
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

export function timeoutMessage(timeoutMs: number, prepared: string | undefined): string {
  const message = `量读数超过 ${timeoutMs / 1000} 秒，已放弃`
  return prepared === undefined
    ? message
    : `${message}；基线 ${prepared.slice(0, 9)} 的读数这次已备好存下，下次收工不再重算`
}

function killTree(child: ChildProcess): void {
  if (child.pid === undefined) return
  try {
    if (process.platform === 'win32')
      spawnSync('taskkill', ['/pid', String(child.pid), '/t', '/f'], {
        stdio: 'ignore',
        windowsHide: true,
      })
    else process.kill(-child.pid, 'SIGKILL')
  } catch {}
}

const STDERR_CHARS = 2000

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
