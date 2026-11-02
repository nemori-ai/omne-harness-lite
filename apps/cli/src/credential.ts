import type { CredentialRead } from './cli-types.ts'

/** The part of a Node input stream the reader uses. A terminal adds `isTTY` and `setRawMode`. */
export interface CredentialInput {
  isTTY?: boolean
  setRawMode?: (mode: boolean) => unknown
  setEncoding(encoding: BufferEncoding): unknown
  on(event: 'data', listener: (chunk: string) => void): unknown
  on(event: 'end' | 'close', listener: () => void): unknown
  off(event: 'data', listener: (chunk: string) => void): unknown
  off(event: 'end' | 'close', listener: () => void): unknown
  pause(): unknown
  resume(): unknown
  [Symbol.asyncIterator](): AsyncIterator<string | Buffer>
}

export interface CredentialEdit {
  readonly text: string
  /** Set when the chunk ended the entry: `enter` accepts what was typed, `cancel` drops it. */
  readonly end: 'enter' | 'cancel' | undefined
}

/**
 * Applies one chunk of raw terminal input to the credential typed so far. Backspace removes the
 * last character, Enter and Ctrl-D accept the entry, and Ctrl-C cancels it. Whatever follows the
 * end of the entry in the same chunk is ignored.
 */
export function editCredential(current: string, chunk: string): CredentialEdit {
  let text = current
  for (const character of chunk) {
    if (character === '\r' || character === '\n' || character === '\u0004')
      return { text, end: 'enter' }
    if (character === '\u0003') return { text, end: 'cancel' }
    if (character === '\u007f' || character === '\b') text = Array.from(text).slice(0, -1).join('')
    else text += character
  }
  return { text, end: undefined }
}

const noEcho: CredentialRead = {
  kind: 'failure',
  message: 'omne: cannot read the credential without echo\n',
}
const cancelled: CredentialRead = {
  kind: 'failure',
  message: 'omne: credential entry cancelled\n',
}

function readHidden(
  input: CredentialInput,
  setRawMode: (mode: boolean) => unknown,
  prompt: (text: string) => void,
): Promise<CredentialRead> {
  prompt('Credential: ')
  input.setEncoding('utf8')
  setRawMode(true)
  return new Promise(resolve => {
    let typed = ''
    const finish = (read: CredentialRead): void => {
      input.off('data', onData)
      input.off('end', onEnd)
      setRawMode(false)
      input.pause()
      prompt('\n')
      resolve(read)
    }
    const onData = (chunk: string): void => {
      const edit = editCredential(typed, chunk)
      typed = edit.text
      if (edit.end === 'enter') finish({ kind: 'credential', value: typed })
      else if (edit.end === 'cancel') finish(cancelled)
    }
    const onEnd = (): void => finish({ kind: 'credential', value: typed })
    input.on('data', onData)
    input.on('end', onEnd)
    input.resume()
  })
}

async function readLine(input: CredentialInput): Promise<string> {
  input.setEncoding('utf8')
  let text = ''
  for await (const chunk of input) {
    text += String(chunk)
    const end = text.indexOf('\n')
    if (end !== -1) {
      text = text.slice(0, end)
      break
    }
  }
  return text.endsWith('\r') ? text.slice(0, -1) : text
}

/**
 * Reads the account credential. On a terminal it prompts through `prompt` and reads without echo,
 * and it fails when the terminal cannot turn echo off. It never falls back to an echoed read. From
 * a pipe it reads up to the first newline or the end of input.
 */
export async function readCredential(
  input: CredentialInput,
  prompt: (text: string) => void,
): Promise<CredentialRead> {
  if (input.isTTY !== true) return { kind: 'credential', value: await readLine(input) }
  const { setRawMode } = input
  if (setRawMode === undefined) return noEcho
  return readHidden(input, mode => setRawMode.call(input, mode), prompt)
}
