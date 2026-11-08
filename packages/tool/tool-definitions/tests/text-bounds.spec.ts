import { execFileSync } from 'node:child_process'
import { expect, it } from 'vitest'
import { bounded, TextWindow } from '../src/text.ts'

function verify(text: string, output: string, maximum: number) {
  expect(Buffer.byteLength(output)).toBeLessThanOrEqual(maximum)
  const marker = /\n\[tool truncated bytes (\d+)\.\.(\d+) of (\d+)\]\n/u.exec(output)
  if (marker === null) throw new Error('The output has no byte-range marker')
  const head = output.slice(0, marker.index)
  const tail = output.slice(marker.index + marker[0].length)
  const start = Number(marker[1])
  const end = Number(marker[2])
  const original = Buffer.from(text)
  expect(Number(marker[3])).toBe(original.length)
  expect(start).toBe(Buffer.byteLength(head))
  expect(end).toBe(original.length - Buffer.byteLength(tail))
  expect(start).toBeLessThan(end)
  expect(Buffer.from(head)).toEqual(original.subarray(0, start))
  expect(Buffer.from(tail)).toEqual(original.subarray(end))
  expect(head.length).toBeGreaterThan(0)
  expect(tail.length).toBeGreaterThan(0)
}

it.each([512, 1024, 32768])('includes the complete range marker in a %i-byte budget', maximum => {
  const text = 'x'.repeat(100_000)
  verify(text, bounded(text, maximum), maximum)
  const window = new TextWindow(maximum)
  window.append(text.slice(0, 5000))
  window.append(text.slice(5000))
  verify(text, window.render(maximum), maximum)
})

it('preserves exact UTF-8 head and tail across different header alignments', () => {
  for (let header = 0; header < 8; header++) {
    const text = `${'h'.repeat(header)}\n${'中文🙂'.repeat(4000)}\ntail`
    verify(text, bounded(text, 1024), 1024)
    const window = new TextWindow(1024)
    window.append(text)
    verify(text, window.render(1024), 1024)
  }
})

it('preserves fitting text and keeps tiny fallback output inside its bound', () => {
  expect(bounded('中文🙂', 10)).toBe('中文🙂')
  for (const maximum of [0, 1, 8, 16]) {
    expect(Buffer.byteLength(bounded('中文🙂'.repeat(100), maximum))).toBeLessThanOrEqual(maximum)
    const window = new TextWindow(maximum)
    window.append('中文🙂'.repeat(100))
    expect(Buffer.byteLength(window.render(maximum))).toBeLessThanOrEqual(maximum)
  }
})

it('processes five MiB of streamed text within a bounded child-process deadline', () => {
  const source = new URL('../src/text.ts', import.meta.url).href
  const script = `
    import { TextWindow } from ${JSON.stringify(source)};
    const window = new TextWindow(8 * 1024 * 1024);
    window.append('W3-BEGIN\\n');
    for (let bytes = 0; bytes < 5 * 1024 * 1024; bytes += 16384) window.append('x'.repeat(16384));
    window.append('\\nW3-END\\n');
    process.stdout.write(window.render(65536));
  `
  const output = execFileSync(
    process.execPath,
    ['--experimental-strip-types', '--input-type=module', '--eval', script],
    { encoding: 'utf8', timeout: 5000, maxBuffer: 128 * 1024 },
  )
  expect(output).toContain('W3-BEGIN')
  expect(output).toContain('W3-END')
  verify(`W3-BEGIN\n${'x'.repeat(5 * 1024 * 1024)}\nW3-END\n`, output, 65536)
})

it('keeps exact UTF-8 ranges when a small window rolls across mixed-width chunks', () => {
  const units = ['a', '中', '🙂', 'é', '\n', '𝄞']
  let state = 17
  for (const capacity of [128, 257, 1024]) {
    let original = ''
    const window = new TextWindow(capacity)
    for (let index = 0; index < 80; index++) {
      state = (state * 1664525 + 1013904223) >>> 0
      const chunk = units[state % units.length]!.repeat(3 + (state % 71))
      original += chunk
      window.append(chunk)
      const actual = window.render(capacity)
      if (Buffer.byteLength(original) <= capacity) expect(actual).toBe(original)
      else verify(original, actual, capacity)
    }
  }
})
