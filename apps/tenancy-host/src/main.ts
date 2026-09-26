// 进程形态（architecture「拓扑与进程模型」：建包时定）：服务、部署密钥和本机维护命令。
//   keygen <dir>  一次性生成两对部署密钥，写四份 0600 PEM；标准输出给出四个 `_FILE` 变量与路径（不含密钥内容）。
//   serve         从环境变量起治理中心；SIGTERM／SIGINT ⇒ 逆序撤除 ⇒ 撤完退出 0，30秒仅诊断继续等；收场未确认或启动失败 ⇒ 退出 1。
// 启动失败与撤除的结构化记录由 boot() 写进标准错误流（JSONL）；本模块只决定退出码。

export const EXIT = { ok: 0, failed: 1, usage: 64 } as const

export interface MainIo {
  readonly stdout: (line: string) => void | Promise<void>
  readonly stderr: (line: string) => void | Promise<void>
  /** 等到一个停机信号。 */
  readonly shutdownSignal: () => Promise<string>
  readonly releaseShutdownSignal?: () => void
}

function createProcessIo(): MainIo {
  let release = () => {}
  return {
    stdout: line =>
      new Promise<void>((resolve, reject) =>
        process.stdout.write(line, error => (error ? reject(error) : resolve())),
      ),
    stderr: line =>
      new Promise<void>((resolve, reject) =>
        process.stderr.write(line, error => (error ? reject(error) : resolve())),
      ),
    shutdownSignal: () =>
      new Promise(resolve => {
        const stop = (signal: string) => {
          release()
          resolve(signal)
        }
        release = () => {
          process.off('SIGTERM', stop)
          process.off('SIGINT', stop)
        }
        process.on('SIGTERM', stop)
        process.on('SIGINT', stop)
      }),
    releaseShutdownSignal: () => release(),
  }
}

const USAGE =
  'usage: tenancy-host keygen <directory> | serve | ops --socket-dir <absolute> full-health|backup [--only-if-due]|backup-status | verify --source <absolute> --work-dir <absolute> | restore-isolated --source <absolute> --target <new-absolute-directory> --work-dir <absolute>\n'

export async function main(
  argv: readonly string[],
  io: MainIo = createProcessIo(),
): Promise<number> {
  const [command, ...rest] = argv
  if (command === 'keygen') {
    const [directory] = rest
    if (directory === undefined || rest.length !== 1) {
      await io.stderr(USAGE)
      return EXIT.usage
    }
    try {
      const { generateKeyFiles } = await import('./keys.ts')
      const files = await generateKeyFiles(directory)
      await io.stdout(`${JSON.stringify({ event: 'keys-generated', files })}\n`)
      return EXIT.ok
    } catch (error) {
      const name = error instanceof Error ? error.name : typeof error
      const message = error instanceof Error ? error.message : 'non-error value thrown'
      await io.stderr(`${JSON.stringify({ event: 'keygen-failed', errorType: name, message })}\n`)
      return EXIT.failed
    }
  }
  if (command === 'serve' && rest.length === 0) {
    const signal = io.shutdownSignal()
    try {
      const { boot } = await import('./boot.ts')
      const host = await boot()
      await signal
      const disposal = await host.dispose()
      return disposal.complete ? EXIT.ok : EXIT.failed
    } catch {
      return EXIT.failed
    } finally {
      io.releaseShutdownSignal?.()
    }
  }
  if (command === 'ops' || command === 'verify' || command === 'restore-isolated') {
    const { parseMaintenanceCommand, runMaintenanceCommand } =
      await import('./maintenance-command.ts')
    const parsed = parseMaintenanceCommand(argv)
    if (parsed === undefined) {
      await io.stderr(USAGE)
      return EXIT.usage
    }
    const abort = new AbortController()
    const signal = io.shutdownSignal()
    void signal.then(
      () => abort.abort(),
      () => abort.abort(),
    )
    try {
      return await runMaintenanceCommand(parsed, io, abort.signal)
    } finally {
      io.releaseShutdownSignal?.()
    }
  }
  await io.stderr(USAGE)
  return EXIT.usage
}
