import { PassThrough, Readable } from 'node:stream'
import { editCredential, readCredential, type CredentialInput } from '@omne-harness/cli'
import { describe, expect, it } from 'vitest'

describe('editCredential', () => {
  it('collects characters and finishes at Enter', () => {
    expect(editCredential('', 'abc\r')).toEqual({ text: 'abc', end: 'enter' })
    expect(editCredential('ab', 'c\n')).toEqual({ text: 'abc', end: 'enter' })
  })

  it('removes the last character on Backspace and ignores one at the start', () => {
    expect(editCredential('', 'ab\x7f\x7f\x7fc')).toEqual({ text: 'c', end: undefined })
    expect(editCredential('ab', '\b')).toEqual({ text: 'a', end: undefined })
  })

  it('ignores what a paste puts after the Enter', () => {
    expect(editCredential('', 'ab\rcd')).toEqual({ text: 'ab', end: 'enter' })
  })

  it('cancels at Ctrl-C and ends at Ctrl-D', () => {
    expect(editCredential('ab', 'c\x03')).toEqual({ text: 'abc', end: 'cancel' })
    expect(editCredential('ab', '\x04')).toEqual({ text: 'ab', end: 'enter' })
  })

  it('keeps a multi-byte character whole', () => {
    expect(editCredential('', '密码\x7f码\r')).toEqual({ text: '密码', end: 'enter' })
  })
})

function piped(...chunks: (string | Buffer)[]): CredentialInput {
  return Readable.from(chunks, { objectMode: false }) as CredentialInput
}

describe('readCredential from a pipe', () => {
  const noPrompt = () => {
    throw new Error('a pipe has no prompt')
  }

  it.each([
    ['one line', ['secret\n'], 'secret'],
    ['a line with CRLF', ['secret\r\n'], 'secret'],
    ['text up to the first newline only', ['secret\nrest\n'], 'secret'],
    ['text without a newline', ['secret'], 'secret'],
    ['a line split over chunks', ['sec', 'ret\n'], 'secret'],
    ['empty input', [], ''],
    ['a bare newline', ['\n'], ''],
  ])('reads %s', async (_name, chunks, expected) => {
    expect(await readCredential(piped(...chunks), noPrompt)).toEqual({
      kind: 'credential',
      value: expected,
    })
  })

  it('decodes a multi-byte character split between chunks', async () => {
    const bytes = Buffer.from('密码\n', 'utf8')
    const read = await readCredential(piped(bytes.subarray(0, 4), bytes.subarray(4)), noPrompt)
    expect(read).toEqual({ kind: 'credential', value: '密码' })
  })
})

function terminal(setRawMode?: (mode: boolean) => unknown): PassThrough & CredentialInput {
  const stream = new PassThrough() as PassThrough & CredentialInput
  stream.isTTY = true
  if (setRawMode !== undefined) stream.setRawMode = setRawMode
  return stream
}

describe('readCredential from a terminal', () => {
  it('refuses to read when the terminal cannot turn echo off', async () => {
    const prompts: string[] = []
    const read = await readCredential(terminal(), text => prompts.push(text))
    expect(read).toEqual({
      kind: 'failure',
      message: 'omne: cannot read the credential without echo\n',
    })
    expect(prompts).toEqual([])
  })

  it('prompts, reads in raw mode without echoing, and restores the mode', async () => {
    const modes: boolean[] = []
    const prompts: string[] = []
    const stream = terminal(mode => modes.push(mode))
    const pending = readCredential(stream, text => prompts.push(text))
    stream.write('hunter2')
    stream.write('\x7f')
    stream.write('3\r')
    expect(await pending).toEqual({ kind: 'credential', value: 'hunter3' })
    expect(modes).toEqual([true, false])
    // Only the prompt and the closing newline are written: no typed character is echoed.
    expect(prompts).toEqual(['Credential: ', '\n'])
    expect(prompts.join('')).not.toContain('hunter')
  })

  it('fails and restores the mode when the user cancels', async () => {
    const modes: boolean[] = []
    const stream = terminal(mode => modes.push(mode))
    const pending = readCredential(stream, () => {})
    stream.write('ab\x03')
    const read = await pending
    expect(read.kind).toBe('failure')
    expect(modes).toEqual([true, false])
  })
})
