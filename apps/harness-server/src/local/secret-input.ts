// How `setup` reads the model credential. A terminal gets a hidden prompt (the terminal reader of
// settings-local's secret vault). Any other standard input is read up to the first
// line break or its end, so a person can pipe the key in: `... | harness-server setup`.
// The key never comes from an argument or the environment.
import { SecretInputError, readSecretFromTerminal } from '@omne-harness/settings-local/secrets'

export const CREDENTIAL_PROMPT = 'Model credential (OpenRouter API key, input is hidden): '

/** A piped key longer than this is refused; a key is far shorter. */
const MAX_PIPED_BYTES = 65_536

export type PipedInput = Readonly<{
  on(event: 'data', listener: (chunk: Buffer | string) => void): unknown
  on(event: 'end' | 'error', listener: (error?: unknown) => void): unknown
  off(event: 'data', listener: (chunk: Buffer | string) => void): unknown
  off(event: 'end' | 'error', listener: (error?: unknown) => void): unknown
  pause(): unknown
  resume(): unknown
}>

/** Reads up to the first line break or the end of the input. The line break is not part of the key. */
export function readFirstLine(input: PipedInput): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    let size = 0
    const finish = (settle: () => void): void => {
      input.off('data', onData)
      input.off('end', onEnd)
      input.off('error', onError)
      input.pause()
      settle()
    }
    const line = (): string => {
      const text = Buffer.concat(chunks).toString('utf8')
      const end = text.indexOf('\n')
      return (end === -1 ? text : text.slice(0, end)).replace(/\r$/, '')
    }
    function onData(chunk: Buffer | string): void {
      const bytes = typeof chunk === 'string' ? Buffer.from(chunk, 'utf8') : chunk
      chunks.push(bytes)
      size += bytes.length
      if (bytes.includes(0x0a)) return finish(() => resolve(line()))
      if (size > MAX_PIPED_BYTES) finish(() => reject(new SecretInputError('input-failed')))
    }
    function onEnd(): void {
      finish(() => resolve(line()))
    }
    // The stream error is dropped: it could hold anything, and the reason code says enough.
    function onError(): void {
      finish(() => reject(new SecretInputError('input-failed')))
    }
    input.on('data', onData)
    input.on('end', onEnd)
    input.on('error', onError)
    input.resume()
  })
}

/** The reader of a real process: hidden on a terminal, the first line otherwise. */
export function processSecretReader(
  stdin: NodeJS.ReadStream,
  stderr: NodeJS.WriteStream,
): () => Promise<string> {
  return () =>
    stdin.isTTY === true
      ? readSecretFromTerminal({ input: stdin, output: stderr, prompt: CREDENTIAL_PROMPT })
      : readFirstLine(stdin)
}
