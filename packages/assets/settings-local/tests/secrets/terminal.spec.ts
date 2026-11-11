// Reading a secret from a terminal with the echo off: the raw mode and its restoration, the line
// editing keys, the control sequences that are skipped, and the ways a read gives up.
import { EventEmitter } from 'node:events'
import { inspect } from 'node:util'
import { describe, expect, it, vi } from 'vitest'
import {
  SecretInputError,
  readSecretFromTerminal,
  type TerminalInput,
} from '../../src/secrets/index.ts'

const SECRET = `${'sk-'}or-v1-SYNTHETIC-${'Q7'.repeat(24)}`
const PROMPT = 'Secret (input is hidden): '

class FakeTerminal extends EventEmitter {
  isTTY: boolean
  isRaw = false
  readonly rawCalls: boolean[] = []
  paused = false

  constructor(isTTY = true) {
    super()
    this.isTTY = isTTY
  }

  setRawMode(mode: boolean): this {
    this.isRaw = mode
    this.rawCalls.push(mode)
    return this
  }

  resume(): this {
    this.paused = false
    return this
  }

  pause(): this {
    this.paused = true
    return this
  }

  type(...chunks: (string | Uint8Array)[]): void {
    for (const chunk of chunks)
      this.emit('data', typeof chunk === 'string' ? Buffer.from(chunk) : chunk)
  }
}

function terminal(input: FakeTerminal): TerminalInput {
  return input as unknown as TerminalInput
}

function sink() {
  const parts: string[] = []
  return { write: (text: string) => (parts.push(text), true), text: () => parts.join('') }
}

async function listening(input: FakeTerminal): Promise<void> {
  await vi.waitFor(() => expect(input.listenerCount('data')).toBeGreaterThan(0))
}

function leaks(...values: unknown[]): boolean {
  return values.some(value =>
    (typeof value === 'string' ? value : inspect(value, { depth: null })).includes(SECRET),
  )
}

const read = (input: FakeTerminal, over: { signal?: AbortSignal } = {}) =>
  readSecretFromTerminal({ input: terminal(input), output: sink(), prompt: PROMPT, ...over })

describe('reading the secret from a terminal', () => {
  it('refuses an input that is not a terminal, without raw mode, a prompt or a listener', async () => {
    const input = new FakeTerminal(false)
    const output = sink()
    await expect(
      readSecretFromTerminal({ input: terminal(input), output, prompt: PROMPT }),
    ).rejects.toMatchObject({ reason: 'input-not-terminal' })
    expect(input.rawCalls).toEqual([])
    expect(output.text()).toBe('')
    expect(input.listenerCount('data')).toBe(0)
  })

  it('writes the prompt, reads with the echo off and puts the terminal back when the line ends', async () => {
    const input = new FakeTerminal()
    const output = sink()
    const reading = readSecretFromTerminal({ input: terminal(input), output, prompt: PROMPT })
    await listening(input)
    expect(input.isRaw).toBe(true)
    expect(output.text()).toBe(PROMPT)
    input.type(SECRET.slice(0, 10), SECRET.slice(10), '\r')
    await expect(reading).resolves.toBe(SECRET)
    expect(input.rawCalls).toEqual([true, false])
    expect(input.isRaw).toBe(false)
    expect(input.paused).toBe(true)
    expect(input.listenerCount('data')).toBe(0)
    expect(output.text()).toBe(`${PROMPT}\n`)
    expect(leaks(output.text())).toBe(false)
  })

  it('restores the raw mode that was set before it started', async () => {
    const input = new FakeTerminal()
    input.isRaw = true
    const reading = read(input)
    await listening(input)
    input.type('abc\n')
    await reading
    expect(input.rawCalls).toEqual([true, true])
    expect(input.isRaw).toBe(true)
  })

  it('applies backspace, ignores arrow keys and other control keys, and stops at the first line end', async () => {
    const input = new FakeTerminal()
    const reading = read(input)
    await listening(input)
    // CSI (`ESC [ A`), SS3 (`ESC O C`), a stray ESC before a printable character, and a CSI whose
    // parameters run on before its final byte.
    input.type('abX\u007f', 'c\u001b[A\u001bOC\u001bxd\u001b[1;5Ce\r', 'ignored after the line end')
    await expect(reading).resolves.toBe('abcde')
  })

  it('keeps a multi-byte character that arrives in two chunks', async () => {
    const input = new FakeTerminal()
    const reading = read(input)
    await listening(input)
    const bytes = Buffer.from('密钥\r')
    input.type(bytes.subarray(0, 4), bytes.subarray(4))
    await expect(reading).resolves.toBe('密钥')
  })

  it.each([
    ['Ctrl-C', (input: FakeTerminal) => input.type('abc\u0003')],
    ['Ctrl-D on an empty line', (input: FakeTerminal) => input.type('\u0004')],
    ['the end of the input', (input: FakeTerminal) => input.emit('end')],
    ['a stream error', (input: FakeTerminal) => input.emit('error', new Error(SECRET))],
  ])('gives up on %s and puts the terminal back', async (_name, stop) => {
    const input = new FakeTerminal()
    const reading = read(input)
    await listening(input)
    stop(input)
    const failure = await reading.then(
      () => undefined,
      (error: unknown) => error,
    )
    expect(failure).toBeInstanceOf(SecretInputError)
    expect(leaks(failure)).toBe(false)
    expect(input.rawCalls).toEqual([true, false])
    expect(input.listenerCount('data')).toBe(0)
  })

  it('gives up when the abort signal fires, and puts the terminal back', async () => {
    const input = new FakeTerminal()
    const controller = new AbortController()
    const reading = read(input, { signal: controller.signal })
    await listening(input)
    input.type('abc')
    controller.abort()
    await expect(reading).rejects.toMatchObject({ reason: 'input-cancelled' })
    expect(input.rawCalls).toEqual([true, false])
  })

  it('does not enter raw mode for a signal that has already fired', async () => {
    const input = new FakeTerminal()
    await expect(read(input, { signal: AbortSignal.abort() })).rejects.toMatchObject({
      reason: 'input-cancelled',
    })
    expect(input.rawCalls).toEqual([])
  })

  it('puts the terminal back on the exit of the process when the read is still open', async () => {
    const input = new FakeTerminal()
    const before = process.listenerCount('exit')
    const reading = read(input)
    await listening(input)
    expect(process.listenerCount('exit')).toBe(before + 1)
    input.type('\r')
    await reading
    expect(process.listenerCount('exit')).toBe(before)
  })
})
