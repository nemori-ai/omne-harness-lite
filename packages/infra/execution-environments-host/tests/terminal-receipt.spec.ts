import { expect, test } from 'vitest'
import { createTerminalReceipt } from '../src/terminal-receipt.ts'

const id = '03a6ec10-56cd-4fdc-8146-e59e613603dd'
const prefix = Buffer.from(`\x1b]777;omne;${id};`)
const marker = Buffer.concat([prefix, Buffer.from('7\x07')])
const ordinary = Buffer.concat([
  Buffer.from('partial\r\n\x1b[31m红\x1b[0m\x1b]777;omne;other;0\x07'),
  Buffer.from([0, 4, 255]),
])
const bytes = Buffer.concat([ordinary, marker])

test('ordinary output reaches its reader before any completion receipt', () => {
  const output: Buffer[] = [],
    codes: number[] = []
  const parser = createTerminalReceipt(
    id,
    data => output.push(data),
    code => codes.push(code),
  )
  const chunk = Buffer.alloc(262144, 120)
  parser.feed(chunk)
  expect(Buffer.concat(output)).toEqual(chunk)
  expect(codes).toEqual([])
  // Only the suffix of this partial private prefix may remain pending.
  parser.feed(Buffer.concat([Buffer.from('ready:'), prefix.subarray(0, 12)]))
  expect(Buffer.concat(output).subarray(chunk.length).toString()).toBe('ready:')
  parser.feed(Buffer.concat([prefix.subarray(12), Buffer.from('0\x07')]))
  expect(codes).toEqual([0])
  expect(Buffer.concat(output)).toEqual(Buffer.concat([chunk, Buffer.from('ready:')]))
})

test('an unterminated private receipt stays bounded at the exact byte limit', () => {
  const parser = createTerminalReceipt(
    id,
    () => {},
    () => {
      throw new Error('Unexpected completion')
    },
  )
  expect(() =>
    parser.feed(Buffer.concat([prefix, Buffer.alloc(16384 - prefix.length, 57)])),
  ).not.toThrow()
  expect(() => parser.feed(Buffer.from('9'))).toThrow('Terminal receipt too large')
})

test.each([0, 255])('both valid exit boundaries complete: %s', code => {
  const completed: number[] = []
  const parser = createTerminalReceipt(
    id,
    () => {},
    value => completed.push(value),
  )
  parser.feed(Buffer.concat([prefix, Buffer.from(`${code}\x07`)]))
  expect(completed).toEqual([code])
})

test('all fragmentation positions preserve raw ordinary bytes and exclude private metadata', () => {
  for (let split = 0; split <= bytes.length; split++) {
    const output: Buffer[] = [],
      codes: number[] = []
    const parser = createTerminalReceipt(
      id,
      data => output.push(data),
      code => codes.push(code),
    )
    parser.feed(bytes.subarray(0, split))
    parser.feed(bytes.subarray(split))
    expect(Buffer.concat(output)).toEqual(ordinary)
    expect(codes).toEqual([7])
    expect(() => parser.feed(marker)).toThrow('Data after')
  }
})
test.each(['-1', '256', '01', '7x', '', '9'.repeat(16384)])(
  'invalid or oversized private completion cannot become exit success: %s',
  code => {
    const completed: number[] = []
    const parser = createTerminalReceipt(
      id,
      () => {},
      value => completed.push(value),
    )
    expect(() => parser.feed(Buffer.concat([prefix, Buffer.from(code + '\x07')]))).toThrow()
    expect(completed).toEqual([])
  },
)
test('high-bit bytes cannot alias ASCII exit digits; receipt trailing bytes reject before publish', () => {
  for (const value of [Buffer.from([0xb7, 7]), Buffer.from('7\x07extra')]) {
    const completed: number[] = []
    const parser = createTerminalReceipt(
      id,
      () => {},
      code => completed.push(code),
    )
    expect(() => parser.feed(Buffer.concat([prefix, value]))).toThrow()
    expect(completed).toEqual([])
  }
})
