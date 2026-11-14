import { StringDecoder } from 'node:string_decoder'
import type { ReadStream } from 'node:tty'
import { SecretInputError } from './input.ts'

export type TerminalInput = Pick<
  ReadStream,
  'isTTY' | 'isRaw' | 'setRawMode' | 'on' | 'off' | 'resume' | 'pause'
>

export type TextSink = Readonly<{ write(text: string): unknown }>

export type ReadSecretOptions = Readonly<{
  input: TerminalInput
  output: TextSink
  prompt: string
  signal?: AbortSignal
}>

const ESC = '\u001b'

type Escape = 'none' | 'introduced' | 'sequence' | 'single-shift'

type LineStep = 'line-end' | 'cancel' | 'continue'

const INTRODUCERS: Readonly<Record<string, Escape>> = { '[': 'sequence', O: 'single-shift' }

const FIRST_PRINTABLE = 0x20
const SEQUENCE_FINAL_FIRST = 0x40
const SEQUENCE_FINAL_LAST = 0x7e

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

export function readSecretFromTerminal(options: ReadSecretOptions): Promise<string> {
  const { input, output, signal, prompt } = options
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
      } catch {}
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
    const onFailed = (): void => finish(() => reject(new SecretInputError('input-failed')))

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
    output.write(prompt)
    input.on('data', onData)
    input.on('end', onClosed)
    input.on('close', onClosed)
    input.on('error', onFailed)
    input.resume()
  })
}
