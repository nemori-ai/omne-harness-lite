// The piped credential reader of `setup`: the first line, without its line break.
import { PassThrough, Readable } from 'node:stream'
import { describe, expect, it } from 'vitest'
import { SecretInputError } from '@omne-harness/model-host-local/vault'
import { readFirstLine } from '../../src/local/secret-input.ts'

describe('readFirstLine', () => {
  it.each([
    ['a line and more', ['abc\ndef\n'], 'abc'],
    ['a CRLF line', ['abc\r\n'], 'abc'],
    ['no line break before the end', ['ab', 'c'], 'abc'],
    ['an empty input', [], ''],
    ['a line split over chunks', ['a', 'b', 'c\nx'], 'abc'],
  ])('%s', async (_name, chunks, line) => {
    expect(await readFirstLine(Readable.from(chunks.map(chunk => Buffer.from(chunk))))).toBe(line)
  })

  it('gives up on an input far longer than a key', async () => {
    const input = new PassThrough()
    const read = readFirstLine(input)
    input.write(Buffer.alloc(70_000, 0x61))
    await expect(read).rejects.toBeInstanceOf(SecretInputError)
  })
})
