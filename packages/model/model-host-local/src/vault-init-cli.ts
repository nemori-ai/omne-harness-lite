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

type LineStep = 'line-end' | 'cancel' | 'continue'

/** The character after ESC decides the kind of control sequence; anything else ends it at once. */
const INTRODUCERS: Readonly<Record<string, Escape>> = { '[': 'sequence', O: 'single-shift' }

const FIRST_PRINTABLE = 0x20
const SEQUENCE_FINAL_FIRST = 0x40
const SEQUENCE_FINAL_LAST = 0x7e

// A sequence that is open swallows the character, and ESC opens one: control sequences (arrow keys
// and the like) are skipped here, so they never end up in the key.
function nextEscape(state: Escape, char: string): Escape {
  if (state === 'sequence') return isSequenceFinal(char) ? 'none' : 'sequence'
  if (state === 'single-shift') return 'none'
  if (state === 'introduced') return INTRODUCERS[char] ?? 'none'
  return char === ESC ? 'introduced' : 'none'
}

function isSequenceFinal(char: string): boolean {
  const code = char.charCodeAt(0)
  return code >= SEQUENCE_FINAL_FIRST && code <= SEQUENCE_FINAL_LAST
}

/** The keys that end or cancel the line, as opposed to those that edit it. */
const LINE_KEYS: Readonly<Record<string, LineStep>> = {
  '\r': 'line-end',
  '\n': 'line-end',
  '\u0003': 'cancel',
}

function lineAction(char: string, hasText: boolean): LineStep | undefined {
  const key = LINE_KEYS[char]
  if (key !== undefined) return key
  if (char !== '\u0004') return undefined
  return hasText ? 'continue' : 'cancel'
}

function erases(char: string): boolean {
  return char === '\u007f' || char === '\b'
}

function printable(char: string): boolean {
  return char.charCodeAt(0) >= FIRST_PRINTABLE
}

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
    const consume = (char: string): LineStep => {
      if (escape !== 'none') {
        escape = nextEscape(escape, char)
        return 'continue'
      }
      if (char === ESC) {
        escape = 'introduced'
        return 'continue'
      }
      const line = lineAction(char, typed.length > 0)
      if (line !== undefined) return line
      if (erases(char)) typed.pop()
      else if (printable(char)) typed.push(char)
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

const HELP_FLAGS: ReadonlySet<string> = new Set(['--help', '-h'])
const PATH_FLAG = '--path'
const PATH_PREFIX = `${PATH_FLAG}=`

/** One argument and, for `--path`, the value that follows it and whether it consumed the next one. */
type Step =
  | Readonly<{ kind: 'help' }>
  | Readonly<{ kind: 'path'; value: string | undefined; consumed: boolean }>
  | Readonly<{ kind: 'refused'; reason: ArgumentFailure }>

/** Reads the value of a `--path` argument: inline after `=`, else the next argument when it is not an option. */
function pathStep(argument: string, next: string | undefined): Step {
  if (argument !== PATH_FLAG) {
    return { kind: 'path', value: argument.slice(PATH_PREFIX.length), consumed: false }
  }
  const follows = next !== undefined && !next.startsWith('--')
  return { kind: 'path', value: follows ? next : undefined, consumed: follows }
}

function stepAt(argument: string, next: string | undefined): Step {
  if (HELP_FLAGS.has(argument)) return { kind: 'help' }
  if (argument === PATH_FLAG || argument.startsWith(PATH_PREFIX)) return pathStep(argument, next)
  // A refused argument is named, never echoed: it may be the key itself.
  return { kind: 'refused', reason: secretName(argument) ? 'secret-in-argv' : 'argument-unknown' }
}

function secretName(argument: string): boolean {
  return SECRET_NAME.test(argument.split('=')[0] ?? '')
}

/** What the arguments have said so far. The first refusal wins; the run reports only that one. */
type Draft = {
  path: string | undefined
  help: boolean
  refused: ArgumentFailure | undefined
}

function apply(draft: Draft, step: Step): void {
  if (step.kind === 'help') {
    draft.help = true
    return
  }
  if (step.kind === 'refused') {
    draft.refused ??= step.reason
    return
  }
  if (step.value === undefined) {
    draft.refused ??= 'argument-missing'
    return
  }
  if (draft.path !== undefined) {
    draft.refused ??= 'argument-duplicate'
    return
  }
  draft.path = step.value
}

/** Reads the arguments. A refused argument is never echoed: it may be the key itself. */
function parseArguments(argv: readonly string[]): Parsed {
  const draft: Draft = { path: undefined, help: false, refused: undefined }
  for (let index = 0; index < argv.length; index++) {
    const step = stepAt(argv[index] ?? '', argv[index + 1])
    apply(draft, step)
    if (step.kind === 'path' && step.consumed) index++
  }
  if (draft.refused !== undefined) return { kind: 'refused', reason: draft.refused }
  if (draft.help) return { kind: 'help' }
  if (draft.path === undefined) return { kind: 'refused', reason: 'argument-missing' }
  return { kind: 'run', path: draft.path }
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
