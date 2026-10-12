import { expect, test } from 'vitest'
import { parseLoginStatePresentation } from '../src/index.ts'

test('the public parser counts Unicode scalar values and rejects malformed bearer text', () => {
  const maximum = '🔑'.repeat(1024)
  expect(parseLoginStatePresentation(maximum)).toEqual({ ok: maximum })
  for (const raw of ['', ' abc', 'abc ', '\ud800', maximum + 'x', 42, undefined]) {
    const parsed = parseLoginStatePresentation(raw)
    expect('invalidInput' in parsed).toBe(true)
    if ('invalidInput' in parsed && typeof raw === 'string' && raw.length > 10) {
      expect(parsed.invalidInput).not.toContain(raw)
    }
  }
})
