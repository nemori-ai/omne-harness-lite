// 测试级装载入口：在同一进程里以 `serve` 模式跑一棵树，看到 `startup-result` 后发起计划停止，返回全部记录。
// 行闭包用它只装本行与它依赖的替身：`plugins` 替代 `./cordis` 导出，`entryObjects` 替代 `src/entry/index.ts`。
// 用法见 `docs/real-mode.md`「测试级装载入口」。
import { mkdtempSync, realpathSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  runServe,
  type RunServeOptions,
  type S0Record,
  type ServeResult,
} from '../../../src/run.ts'

export type ServeOnceOptions = Omit<
  RunServeOptions,
  'write' | 'stderr' | 'stop' | 'stateRoot' | 'readinessTimeoutMs' | 'shutdownDeadlineMs'
> &
  Readonly<{
    readinessTimeoutMs?: number
    shutdownDeadlineMs?: number
    /** 默认 true：看到 `startup-result` 就请求停止。false 时由调用方经 `stop` 请求。 */
    stopAfterStartup?: boolean
    stop?: AbortSignal
  }>

export type ServeRun = Readonly<{
  result: ServeResult
  records: readonly S0Record[]
  stderr: readonly string[]
  of(kind: string): S0Record[]
  startup: S0Record
  tree(id: string): S0Record | undefined
  state(id: string): S0Record | undefined
}>

export async function serveOnce(options: ServeOnceOptions): Promise<ServeRun> {
  const { readinessTimeoutMs, shutdownDeadlineMs, stopAfterStartup, stop, ...rest } = options
  const stateRoot = realpathSync(mkdtempSync(join(tmpdir(), 'serve-fixture-')))
  const controller = new AbortController()
  const records: S0Record[] = []
  const stderr: string[] = []
  const signal = stop ?? controller.signal
  try {
    const result = await runServe({
      ...rest,
      stateRoot,
      readinessTimeoutMs: readinessTimeoutMs ?? 5000,
      shutdownDeadlineMs: shutdownDeadlineMs ?? 2000,
      stop: signal,
      write: record => {
        records.push(record)
        if (record.kind === 'startup-result' && stopAfterStartup !== false)
          controller.abort('test: startup seen')
      },
      stderr: line => stderr.push(line),
    })
    const of = (kind: string) => records.filter(record => record.kind === kind)
    const byId = (kind: string, id: string) => of(kind).find(record => record['id'] === id)
    return {
      result,
      records,
      stderr,
      of,
      startup: of('startup-result')[0] ?? { kind: 'absent' },
      tree: id => byId('tree', id),
      state: id => byId('row-state', id),
    }
  } finally {
    rmSync(stateRoot, { recursive: true, force: true })
  }
}
