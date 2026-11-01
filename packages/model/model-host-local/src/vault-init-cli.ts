// The command line shell of the vault initialization command: arguments, the terminal and the exit
// code. It is run once by a person on the host and is not exported from the root entry:
//
//   node --experimental-strip-types src/vault-init-cli.ts --path <路径>
//
// The key is read from the terminal with the echo off. It never comes from an argument or the
// environment, and the shell prints one line: the built path, or a reason code.
import { StringDecoder } from 'node:string_decoder'
import type { ReadStream } from 'node:tty'
import { SecretInputError, initVault, type VaultInitDeps } from './vault-init.ts'

export type TerminalInput = Pick<
  ReadStream,
  'isTTY' | 'isRaw' | 'setRawMode' | 'on' | 'off' | 'resume' | 'pause'
>

export type TextSink = Readonly<{ write(text: string): unknown }>

export type ReadSecretOptions = Readonly<{
  input: TerminalInput
  /** Receives the prompt and the line break after the input; the typed characters are never written. */
  output: TextSink
  /** Gives up the read, as a signal of the process does. */
  signal?: AbortSignal
}>

const PROMPT = '请输入 OpenRouter 密钥（输入不会显示），按回车结束：'

const ESC = '\u001b'

type Escape = 'none' | 'introduced' | 'sequence' | 'single-shift'

/**
 * Reads one line from a terminal with the echo off. The terminal goes back to the mode it had when
 * the line ends, when the person cancels, when the stream ends or fails, when the signal fires, and
 * when the process exits while the read is open. An input that is not a terminal is refused before
 * the mode, the prompt or any listener is touched.
 */
export function readSecretFromTerminal(options: ReadSecretOptions): Promise<string> {
  const { input, output, signal } = options
  if (signal?.aborted) return Promise.reject(new SecretInputError('input-cancelled'))
  if (input.isTTY !== true || typeof input.setRawMode !== 'function') {
    return Promise.reject(new SecretInputError('input-not-terminal'))
  }
  return new Promise<string>((resolve, reject) => {
    const wasRaw = input.isRaw === true
    try {
      input.setRawMode(true)
    } catch {
      reject(new SecretInputError('input-failed'))
      return
    }
    const decoder = new StringDecoder('utf8')
    const typed: string[] = []
    let escape: Escape = 'none'
    let finished = false

    const restore = (): void => {
      try {
        input.setRawMode(wasRaw)
      } catch {
        // The terminal may already be gone; there is nothing left to restore.
      }
    }
    const finish = (settle: () => void): void => {
      if (finished) return
      finished = true
      input.off('data', onData)
      input.off('end', onClosed)
      input.off('close', onClosed)
      input.off('error', onFailed)
      signal?.removeEventListener('abort', onClosed)
      process.off('exit', restore)
      restore()
      input.pause()
      output.write('\n')
      settle()
    }
    const cancel = (): void => finish(() => reject(new SecretInputError('input-cancelled')))
    const onClosed = cancel
    // The error of the stream is dropped: it could be anything, and the reason code says enough.
    const onFailed = (): void => finish(() => reject(new SecretInputError('input-failed')))

    // Control sequences (arrow keys and the like) are skipped, so they do not end up in the key.
    const consume = (char: string): 'line-end' | 'cancel' | 'continue' => {
      if (escape === 'introduced') {
        escape = char === '[' ? 'sequence' : char === 'O' ? 'single-shift' : 'none'
        return 'continue'
      }
      if (escape === 'single-shift') {
        escape = 'none'
        return 'continue'
      }
      if (escape === 'sequence') {
        const code = char.charCodeAt(0)
        if (code >= 0x40 && code <= 0x7e) escape = 'none'
        return 'continue'
      }
      if (char === ESC) {
        escape = 'introduced'
        return 'continue'
      }
      if (char === '\r' || char === '\n') return 'line-end'
      if (char === '\u0003') return 'cancel'
      if (char === '\u0004') return typed.length === 0 ? 'cancel' : 'continue'
      if (char === '\u007f' || char === '\b') {
        typed.pop()
        return 'continue'
      }
      if (char.charCodeAt(0) >= 0x20) typed.push(char)
      return 'continue'
    }
    function onData(chunk: Buffer | string): void {
      const text = typeof chunk === 'string' ? chunk : decoder.write(chunk)
      for (const char of text) {
        const step = consume(char)
        if (step === 'line-end') return finish(() => resolve(typed.join('')))
        if (step === 'cancel') return cancel()
      }
    }

    process.once('exit', restore)
    signal?.addEventListener('abort', onClosed, { once: true })
    output.write(PROMPT)
    input.on('data', onData)
    input.on('end', onClosed)
    input.on('close', onClosed)
    input.on('error', onFailed)
    input.resume()
  })
}

export type ArgumentFailure =
  | 'argument-missing'
  | 'argument-duplicate'
  | 'argument-unknown'
  /** An argument that looks as if it would carry the key. */
  | 'secret-in-argv'

type Parsed =
  | Readonly<{ kind: 'help' }>
  | Readonly<{ kind: 'run'; path: string }>
  | Readonly<{ kind: 'refused'; reason: ArgumentFailure }>

const SECRET_NAME = /secret|key|token|passw|credential/i

/** Reads the arguments. A refused argument is never echoed: it may be the key itself. */
function parseArguments(argv: readonly string[]): Parsed {
  let path: string | undefined
  let help = false
  let refused: ArgumentFailure | undefined
  const refuse = (reason: ArgumentFailure): void => {
    refused ??= reason
  }
  for (let index = 0; index < argv.length; index++) {
    const argument = argv[index] ?? ''
    if (argument === '--help' || argument === '-h') {
      help = true
    } else if (argument === '--path' || argument.startsWith('--path=')) {
      let value: string | undefined
      if (argument === '--path') {
        const next = argv[index + 1]
        if (next !== undefined && !next.startsWith('--')) {
          value = next
          index++
        }
      } else {
        value = argument.slice('--path='.length)
      }
      if (value === undefined) refuse('argument-missing')
      else if (path !== undefined) refuse('argument-duplicate')
      else path = value
    } else if (SECRET_NAME.test(argument.split('=')[0] ?? '')) {
      refuse('secret-in-argv')
    } else {
      refuse('argument-unknown')
    }
  }
  if (refused !== undefined) return { kind: 'refused', reason: refused }
  if (help) return { kind: 'help' }
  if (path === undefined) return { kind: 'refused', reason: 'argument-missing' }
  return { kind: 'run', path }
}

const USAGE = `用法：node --experimental-strip-types src/vault-init-cli.ts --path <路径>

在 <路径> 新建本地保管库，把从终端读入的密钥写成工厂秘密。由人在宿主上运行一次。

  --path <路径>   保管库文件。必须位于当前用户目录之下，且路径上没有任何文件。
  -h, --help      打印本说明。

密钥只从终端读入（输入不显示），不经命令行参数或环境变量。标准输入不是终端时拒绝。
成功时标准输出一行“已建立：<路径>”，退出码 0；失败时标准错误一行“失败：<原因代码>”，
退出码 1（运行失败）或 2（参数不对）。
`

export type CliIo = Readonly<{
  stdin: TerminalInput
  stdout: TextSink
  stderr: TextSink
  signal?: AbortSignal
  deps?: Omit<VaultInitDeps, 'readSecret'>
}>

/** Runs the command and returns the exit code. */
export async function runVaultInitCli(argv: readonly string[], io: CliIo): Promise<number> {
  const parsed = parseArguments(argv)
  if (parsed.kind === 'help') {
    io.stdout.write(USAGE)
    return 0
  }
  if (parsed.kind === 'refused') {
    io.stderr.write(`失败：${parsed.reason}\n`)
    return 2
  }
  const result = await initVault(parsed.path, {
    ...io.deps,
    readSecret: () =>
      readSecretFromTerminal({
        input: io.stdin,
        output: io.stderr,
        ...(io.signal === undefined ? {} : { signal: io.signal }),
      }),
  })
  if (result.ok) {
    io.stdout.write(`已建立：${result.path}\n`)
    return 0
  }
  io.stderr.write(`失败：${result.reason}\n`)
  return 1
}

if (import.meta.main) {
  const controller = new AbortController()
  const signals =
    process.platform === 'win32'
      ? ['SIGINT', 'SIGBREAK', 'SIGHUP']
      : ['SIGINT', 'SIGTERM', 'SIGHUP']
  for (const name of signals) process.once(name, () => controller.abort())
  process.exitCode = await runVaultInitCli(process.argv.slice(2), {
    stdin: process.stdin,
    stdout: process.stdout,
    stderr: process.stderr,
    signal: controller.signal,
  })
}
