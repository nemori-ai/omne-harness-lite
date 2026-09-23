// 进程形态（architecture「拓扑与进程模型」：建包时定）：两条子命令。
//   keygen <dir>  一次性生成两对部署密钥，写四份 0600 PEM；标准输出给出四个 `_FILE` 变量与路径（不含密钥内容）。
//   serve         从环境变量起治理中心；SIGTERM／SIGINT ⇒ 逆序撤除 ⇒ 撤完退出 0，撤除总超时 ⇒ 退出 1；启动失败 ⇒ 退出 1。
// 启动失败与撤除的结构化记录由 boot() 写进标准错误流（JSONL）；本模块只决定退出码。
import { boot } from './boot.ts'
import { generateKeyFiles } from './keys.ts'

export const EXIT = { ok: 0, failed: 1, usage: 2 } as const

export interface MainIo {
  readonly stdout: (line: string) => void
  readonly stderr: (line: string) => void
  /** 等到一个停机信号。 */
  readonly shutdownSignal: () => Promise<string>
}

const processIo: MainIo = {
  stdout: line => void process.stdout.write(line),
  stderr: line => void process.stderr.write(line),
  shutdownSignal: () =>
    new Promise(resolve => {
      const stop = (signal: string) => {
        process.off('SIGTERM', stop)
        process.off('SIGINT', stop)
        resolve(signal)
      }
      process.on('SIGTERM', stop)
      process.on('SIGINT', stop)
    }),
}

const USAGE = 'usage: tenancy-host keygen <directory> | tenancy-host serve\n'

export async function main(argv: readonly string[], io: MainIo = processIo): Promise<number> {
  const [command, ...rest] = argv
  if (command === 'keygen') {
    const [directory] = rest
    if (directory === undefined || rest.length !== 1) {
      io.stderr(USAGE)
      return EXIT.usage
    }
    try {
      const files = await generateKeyFiles(directory)
      io.stdout(`${JSON.stringify({ event: 'keys-generated', files })}\n`)
      return EXIT.ok
    } catch (error) {
      const name = error instanceof Error ? error.name : typeof error
      const message = error instanceof Error ? error.message : 'non-error value thrown'
      io.stderr(`${JSON.stringify({ event: 'keygen-failed', errorType: name, message })}\n`)
      return EXIT.failed
    }
  }
  if (command === 'serve' && rest.length === 0) {
    // 先登记信号：启动途中收到的停机信号不丢，在 boot() 结束后按顺序撤除
    const signal = io.shutdownSignal()
    let host
    try {
      host = await boot()
    } catch {
      return EXIT.failed
    }
    await signal
    const disposal = await host.dispose()
    return disposal.complete ? EXIT.ok : EXIT.failed
  }
  io.stderr(USAGE)
  return EXIT.usage
}
